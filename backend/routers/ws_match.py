from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Optional
import logging
import json
import random
import asyncio
from datetime import datetime, timedelta
import sys

logger = logging.getLogger(__name__)
router = APIRouter(tags=["websocket"])


class MatchState:
    def __init__(
            self,
            match_id: str,
            player1_id: str,
            player2_id: str,
            player1_hand: list,
            player2_hand: list,
            board_elements: list,
            first_turn: str,
    ):
        self.match_id = match_id
        self.player1_id = str(player1_id)
        self.player2_id = str(player2_id)
        self.board: List[Optional[dict]] = [None] * 9
        self.board_elements: List[Optional[str]] = board_elements
        self.player1_hand: List[dict] = player1_hand
        self.player2_hand: List[dict] = player2_hand
        self.current_turn: str = str(first_turn)
        self.status: str = "active"
        self.winner: Optional[str] = None
        self.moves_count: int = 0

    def get_hand(self, player_id: str) -> list:
        if str(player_id) == self.player1_id:
            return self.player1_hand
        return self.player2_hand

    def remove_from_hand(self, player_id: str, card_index: int):
        hand = self.get_hand(player_id)
        if 0 <= card_index < len(hand):
            hand.pop(card_index)

    def to_state_dict(self) -> dict:
        return {
            "match_id": self.match_id,
            "player1_id": self.player1_id,
            "player2_id": self.player2_id,
            "board": self.board,
            "board_elements": self.board_elements,
            "current_turn": self.current_turn,
            "status": self.status,
            "winner": self.winner,
            "player1_hand_count": len(self.player1_hand),
            "player2_hand_count": len(self.player2_hand),
            "moves_count": self.moves_count,
        }


class WSManager:
    ACE_VALUE = 10
    ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]

    def __init__(self):
        self.connections: Dict[str, Dict[str, WebSocket]] = {}
        self.match_states: Dict[str, MatchState] = {}

    async def connect(self, ws: WebSocket, match_id: str, player_id: str):
        if match_id not in self.connections:
            self.connections[match_id] = {}
        self.connections[match_id][str(player_id)] = ws

    def disconnect(self, match_id: str, player_id: str):
        player_id = str(player_id)
        if match_id in self.connections:
            self.connections[match_id].pop(player_id, None)
            if not self.connections[match_id]:
                del self.connections[match_id]

    async def send(self, match_id: str, player_id: str, data: dict):
        ws = self.connections.get(match_id, {}).get(str(player_id))
        if not ws:
            return
        try:
            await ws.send_json(data)
        except Exception as e:
            logger.warning("[WS] send error player=%s: %s", player_id, e)
            self.disconnect(match_id, str(player_id))

    async def broadcast_all(self, match_id: str, data: dict):
        conns = dict(self.connections.get(match_id, {}))
        for pid, ws in conns.items():
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(match_id, pid)

    async def broadcast_except(self, match_id: str, data: dict, exclude_id: str):
        conns = dict(self.connections.get(match_id, {}))
        for pid, ws in conns.items():
            if pid == str(exclude_id):
                continue
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(match_id, pid)

    def _get_neighbors(self, idx: int) -> list:
        x = idx % 3
        y = idx // 3
        dirs = [
            (0, -1, "top", "bottom"),
            (1, 0, "right", "left"),
            (0, 1, "bottom", "top"),
            (-1, 0, "left", "right"),
        ]
        result = []
        for dx, dy, a, b in dirs:
            nx, ny = x + dx, y + dy
            if 0 <= nx <= 2 and 0 <= ny <= 2:
                result.append({"ni": ny * 3 + nx, "a": a, "b": b})
        return result

    def _safe_val(self, raw) -> int:
        try:
            v = int(raw)
            return max(1, min(self.ACE_VALUE, v))
        except (TypeError, ValueError):
            return 5

    def _effective_val(self, base: int, card_elem: Optional[str],
                       cell_elem: Optional[str]) -> int:
        if base == self.ACE_VALUE:
            return self.ACE_VALUE
        if cell_elem:
            bonus = +1 if card_elem == cell_elem else -1
        else:
            bonus = 0
        return max(1, min(9, base + bonus))

    def _normalize_card(self, card: dict, owner: str) -> dict:
        raw = card.get("values") or card.get("stats") or {}
        values = {
            "top": self._safe_val(raw.get("top", 5)),
            "right": self._safe_val(raw.get("right", 5)),
            "bottom": self._safe_val(raw.get("bottom", 5)),
            "left": self._safe_val(raw.get("left", 5)),
        }
        elem = card.get("element")
        if not elem or elem not in self.ELEMENTS:
            card_id = str(card.get("id") or card.get("token_id") or "x")
            h = sum(ord(c) for c in card_id)
            elem = self.ELEMENTS[h % len(self.ELEMENTS)]

        return {
            "id": card.get("id") or card.get("token_id") or f"card_{random.randint(1000, 9999)}",
            "token_id": card.get("token_id") or card.get("id") or "",
            "owner": str(owner),
            "values": values,
            "element": elem,
            "rank": card.get("rank") or card.get("rarity") or "common",
            "rankLabel": card.get("rankLabel") or (card.get("rank") or "c")[0].upper(),
            "imageUrl": card.get("imageUrl") or card.get("image") or "",
            "image": card.get("imageUrl") or card.get("image") or "",
        }

    def _resolve_placement(
            self,
            placed_idx: int,
            board: List[Optional[dict]],
            board_elems: List[Optional[str]],
            placed_card: dict,
    ) -> List[int]:
        flipped = []
        placed_owner = placed_card["owner"]
        placed_elem = placed_card.get("element")
        placed_cell_elem = board_elems[placed_idx] if placed_idx < len(board_elems) else None

        for nb in self._get_neighbors(placed_idx):
            ni = nb["ni"]
            a = nb["a"]
            b = nb["b"]

            target = board[ni]
            if not target:
                continue
            if target.get("owner") == placed_owner:
                continue

            attack_base = self._safe_val(placed_card["values"].get(a, 5))
            defend_base = self._safe_val(target["values"].get(b, 5))

            target_cell_elem = board_elems[ni] if ni < len(board_elems) else None
            target_elem = target.get("element")

            attack_val = self._effective_val(attack_base, placed_elem, placed_cell_elem)
            defend_val = self._effective_val(defend_base, target_elem, target_cell_elem)

            if attack_val > defend_val:
                board[ni] = {**target, "owner": placed_owner}
                flipped.append(ni)

        return flipped

    def _check_game_over(self, state: MatchState) -> Optional[str]:
        if any(cell is None for cell in state.board):
            return None

        p1 = sum(1 for c in state.board if c and c.get("owner") == state.player1_id)
        p2 = sum(1 for c in state.board if c and c.get("owner") == state.player2_id)

        if p1 > p2:
            return state.player1_id
        if p2 > p1:
            return state.player2_id
        return state.player1_id

    async def handle_play_card(
            self,
            match_id: str,
            player_id: str,
            card_index: int,
            cell_index: int,
            ws: WebSocket,
    ):
        player_id = str(player_id)
        state = self.match_states.get(match_id)
        if not state:
            await ws.send_json({"type": "error", "message": "Match state not found"})
            return

        if state.status != "active":
            await ws.send_json({"type": "error", "message": "Game is already over"})
            return

        if state.current_turn != player_id:
            await ws.send_json({"type": "error", "message": "Not your turn"})
            return

        if not (0 <= cell_index <= 8):
            await ws.send_json({"type": "error", "message": "Invalid cell_index"})
            return

        if state.board[cell_index] is not None:
            await ws.send_json({"type": "error", "message": "Cell is occupied"})
            return

        hand = state.get_hand(player_id)
        if not (0 <= card_index < len(hand)):
            await ws.send_json({
                "type": "error",
                "message": f"Invalid card_index {card_index}, hand size={len(hand)}"
            })
            return

        raw_card = hand[card_index]
        placed_card = self._normalize_card(raw_card, player_id)
        state.board[cell_index] = placed_card
        captured = self._resolve_placement(
            cell_index, state.board, state.board_elements, placed_card
        )
        state.remove_from_hand(player_id, card_index)
        state.moves_count += 1

        next_turn = (
            state.player2_id
            if state.current_turn == state.player1_id
            else state.player1_id
        )
        state.current_turn = next_turn

        winner = self._check_game_over(state)
        if winner:
            state.status = "finished"
            state.winner = winner
            try:
                from routers.matchmaking import get_match, save_match
                match_data = await get_match(match_id)
                if match_data:
                    match_data["status"] = "finished"
                    match_data["winner"] = winner
                    await save_match(match_data)
            except Exception as e:
                logger.warning("[WS] Could not persist match result: %s", e)

        await self.broadcast_all(match_id, {
            "type": "card_played",
            "player_id": player_id,
            "cell_index": cell_index,
            "card": placed_card,
            "captured": captured,
        })

        if state.status == "active":
            await self.broadcast_all(match_id, {
                "type": "turn_change",
                "current_turn": next_turn,
            })

        if state.status == "finished":
            p1_score = sum(1 for c in state.board if c and c.get("owner") == state.player1_id)
            p2_score = sum(1 for c in state.board if c and c.get("owner") == state.player2_id)

            await self.broadcast_all(match_id, {
                "type": "game_over",
                "winner": state.winner,
                "board": state.board,
                "player1_score": p1_score,
                "player2_score": p2_score,
            })
            logger.info("[WS] game_over match=%s winner=%s %d:%d",
                        match_id, state.winner, p1_score, p2_score)


ws_manager = WSManager()


@router.websocket("/ws/match/{match_id}")
async def ws_match_endpoint(websocket: WebSocket, match_id: str):
    await websocket.accept()

    # DEBUG
    print(f"\n{'=' * 80}", file=sys.stderr)
    print(f"[WS DEBUG] NEW WS connection to match {match_id}", file=sys.stderr)
    print(f"[WS DEBUG] Time: {datetime.utcnow()}", file=sys.stderr)
    print(f"{'=' * 80}\n", file=sys.stderr)

    player_id: Optional[str] = None

    try:
        # AUTH
        try:
            raw = await websocket.receive_text()
            auth_msg = json.loads(raw)
        except Exception:
            await websocket.send_json({"type": "error", "message": "Expected JSON auth message"})
            await websocket.close(1008)
            return

        if auth_msg.get("type") != "auth":
            await websocket.send_json({"type": "error", "message": "First message must be auth"})
            await websocket.close(1008)
            return

        token = (auth_msg.get("token") or "").strip()
        if not token:
            await websocket.send_json({"type": "error", "message": "Token missing"})
            await websocket.close(1008)
            return

        try:
            from utils.security import decode_access_token
            payload = decode_access_token(token)
            player_id = str(
                payload.get("sub") or
                payload.get("user_id") or
                payload.get("telegram_id") or ""
            )
            if not player_id or player_id == "None":
                raise ValueError("Empty player_id from token")
        except Exception as e:
            await websocket.send_json({"type": "error", "message": f"Unauthorized: {e}"})
            await websocket.close(1008)
            return

        print(f"[WS DEBUG] Player {player_id} authenticated", file=sys.stderr)

        # GET MATCH
        try:
            from routers.matchmaking import get_match
            match_data = await get_match(match_id)
        except Exception as e:
            logger.error("[WS] get_match error: %s", e)
            match_data = None

        if not match_data:
            await websocket.send_json({"type": "error", "message": "Match not found"})
            await websocket.close(1008)
            return

        p1_id = str(match_data.get("player1_id") or "")
        p2_id = str(match_data.get("player2_id") or "")

        if player_id not in (p1_id, p2_id):
            await websocket.send_json({"type": "error", "message": "You are not in this match"})
            await websocket.close(1008)
            return

        you_are = "player1" if player_id == p1_id else "player2"

        # REGISTER CONNECTION
        await ws_manager.connect(websocket, match_id, player_id)

        # SEND connected
        await websocket.send_json({
            "type": "connected",
            "you_are": you_are,
            "player_id": player_id,
            "match_id": match_id,
        })

        # NOTIFY OTHER PLAYER
        await ws_manager.broadcast_except(match_id, {
            "type": "player_connected",
            "player_id": player_id,
        }, exclude_id=player_id)

        # CHECK IF SHOULD START
        conns = ws_manager.connections.get(match_id, {})
        both_connected = p1_id in conns and p2_id in conns
        escrow_locked = match_data.get("escrow_locked", False)

        # DEBUG
        print(f"\n[WS DEBUG] CHECK START CONDITIONS:", file=sys.stderr)
        print(f"  match_id: {match_id}", file=sys.stderr)
        print(f"  both_connected: {both_connected}", file=sys.stderr)
        print(f"  escrow_locked: {escrow_locked}", file=sys.stderr)
        print(f"  p1_escrow: {match_data.get('player1_escrow_confirmed')}", file=sys.stderr)
        print(f"  p2_escrow: {match_data.get('player2_escrow_confirmed')}", file=sys.stderr)
        print(f"  match_status: {match_data.get('status')}", file=sys.stderr)
        print(f"  connections: {list(conns.keys())}", file=sys.stderr)
        print(f"", file=sys.stderr)

        if both_connected and not escrow_locked:
            await websocket.send_json({
                "type": "waiting_for_escrow",
                "message": "Waiting for both players to lock NFTs",
            })
            print(f"[WS DEBUG] Sent waiting_for_escrow", file=sys.stderr)

        if both_connected and escrow_locked:
            print(f"[WS DEBUG] STARTING GAME!", file=sys.stderr)

            if match_id not in ws_manager.match_states:
                try:
                    from routers.decks import _decks_storage
                    p1_deck_data = _decks_storage.get(p1_id) or {}
                    p2_deck_data = _decks_storage.get(p2_id) or {}
                    p1_hand = p1_deck_data.get("full_cards") or []
                    p2_hand = p2_deck_data.get("full_cards") or []
                except Exception as e:
                    logger.warning("[WS] Could not load decks: %s", e)
                    p1_hand, p2_hand = [], []

                if len(p1_hand) < 5:
                    p1_hand = _make_random_hand(p1_id)
                if len(p2_hand) < 5:
                    p2_hand = _make_random_hand(p2_id)

                elements = WSManager.ELEMENTS
                board_elements = [
                    random.choice(elements) if random.random() < 0.38 else None
                    for _ in range(9)
                ]

                first_turn = random.choice([p1_id, p2_id])

                state = MatchState(
                    match_id=match_id,
                    player1_id=p1_id,
                    player2_id=p2_id,
                    player1_hand=p1_hand[:5],
                    player2_hand=p2_hand[:5],
                    board_elements=board_elements,
                    first_turn=first_turn,
                )
                ws_manager.match_states[match_id] = state
                logger.info("[WS] MatchState created: match=%s first=%s", match_id, first_turn)
            else:
                state = ws_manager.match_states[match_id]

            await ws_manager.broadcast_all(match_id, {
                "type": "game_start",
                "first_turn": state.current_turn,
            })

            for pid in [p1_id, p2_id]:
                role = "player1" if pid == p1_id else "player2"
                hand = state.get_hand(pid)
                normalized_hand = [
                    ws_manager._normalize_card(c, pid) for c in hand
                ]
                await ws_manager.send(match_id, pid, {
                    "type": "game_state",
                    "you_are": role,
                    "your_hand": normalized_hand,
                    "state": state.to_state_dict(),
                })

            print(f"[WS DEBUG] Game started successfully", file=sys.stderr)

        # MAIN LOOP
        while True:
            try:
                raw = await websocket.receive_text()
            except WebSocketDisconnect:
                break

            try:
                data = json.loads(raw)
            except Exception:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "pong":
                pass

            elif msg_type == "play_card":
                try:
                    card_index = int(data["card_index"])
                    cell_index = int(data["cell_index"])
                except (KeyError, TypeError, ValueError):
                    await websocket.send_json({
                        "type": "error",
                        "message": "play_card requires integer card_index and cell_index",
                    })
                    continue

                await ws_manager.handle_play_card(
                    match_id, player_id, card_index, cell_index, websocket
                )

            else:
                logger.debug("[WS] Unknown msg type=%s from player=%s", msg_type, player_id)

    except WebSocketDisconnect:
        logger.info("[WS] Disconnected: player=%s match=%s", player_id, match_id)
    except Exception as e:
        logger.exception("[WS] Unexpected error: player=%s match=%s: %s", player_id, match_id, e)
    finally:
        if player_id:
            ws_manager.disconnect(match_id, player_id)
            logger.info("[WS] Cleaned up: player=%s match=%s", player_id, match_id)


def _make_random_hand(owner_id: str) -> List[dict]:
    ELEMENTS = WSManager.ELEMENTS
    RANKS = [
        {"key": "common", "min": 1, "max": 5, "ace": 0.0, "w": 30},
        {"key": "rare", "min": 2, "max": 7, "ace": 0.0, "w": 35},
        {"key": "epic", "min": 3, "max": 8, "ace": 0.20, "w": 25},
        {"key": "legendary", "min": 4, "max": 9, "ace": 0.50, "w": 10},
    ]
    IMAGES = [f"/cards/card{'' if i == 0 else i}.jpg" for i in range(10)]
    ACE = 10

    cards = []
    for i in range(5):
        rank = random.choices(RANKS, weights=[r["w"] for r in RANKS], k=1)[0]
        lo, hi = rank["min"], rank["max"]
        values = {
            "top": random.randint(lo, hi),
            "right": random.randint(lo, hi),
            "bottom": random.randint(lo, hi),
            "left": random.randint(lo, hi),
        }
        if rank["ace"] > 0 and random.random() < rank["ace"]:
            values[random.choice(list(values))] = ACE

        img = random.choice(IMAGES)
        cards.append({
            "id": f"rnd_{owner_id}_{i}_{random.randint(1000, 9999)}",
            "token_id": f"rnd_{i}",
            "owner": str(owner_id),
            "values": values,
            "stats": values,
            "element": random.choice(ELEMENTS),
            "rank": rank["key"],
            "rankLabel": rank["key"][0].upper(),
            "imageUrl": img,
            "image": img,
        })
    return cards