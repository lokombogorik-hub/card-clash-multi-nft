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

# Сколько секунд ждём возврата отвалившегося игрока, прежде чем засчитать
# ему техническое поражение (форфейт). Держим локально, чтобы не плодить
# импорты между роутерами.
RECONNECT_TIMEOUT_SECONDS = 180


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
        # match_id -> {player_id -> asyncio.Task} активные форфейт-таймеры
        self.reconnect_tasks: Dict[str, Dict[str, "asyncio.Task"]] = {}

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
            "rank": str(card.get("rank") or card.get("rarity") or "common"),
            "rankLabel": card.get("rankLabel") or (str(card.get("rank") or card.get("rarity") or "c")[:1].upper()),
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
            # Авторитетно фиксируем результат и НАЧИСЛЯЕМ РЕЙТИНГ на сервере
            # (идемпотентно). Клиентский /finish больше не нужен для очков.
            try:
                from routers.matchmaking import get_match
                from routers.matches import _finalize_match_result
                match_data = await get_match(match_id)
                if match_data:
                    await _finalize_match_result(match_data, winner, reason="normal")
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


    # ── СТАРТ / СОСТОЯНИЕ ──────────────────────────────────────────

    async def send_full_state(self, match_id: str, player_id: str):
        """Отдаём полное состояние партии конкретному игроку
        (используется при коннекте, реконнекте и по запросу get_state)."""
        state = self.match_states.get(match_id)
        if not state:
            return
        pid = str(player_id)
        role = "player1" if pid == state.player1_id else "player2"
        hand = state.get_hand(pid)
        normalized = [self._normalize_card(c, pid) for c in hand]
        await self.send(match_id, pid, {
            "type": "game_state",
            "you_are": role,
            "your_hand": normalized,
            "state": state.to_state_dict(),
        })

    async def try_start_game(self, match_id: str) -> bool:
        """Стартуем партию, если ОБА игрока подключены и эскроу залочен.
        Безопасно вызывать многократно (идемпотентно)."""
        from routers.matchmaking import get_match
        match_data = await get_match(match_id)
        if not match_data or not match_data.get("escrow_locked"):
            return False

        p1_id = str(match_data.get("player1_id") or "")
        p2_id = str(match_data.get("player2_id") or "")
        conns = self.connections.get(match_id, {})
        if p1_id not in conns or p2_id not in conns:
            return False

        if match_id not in self.match_states:
            p1_hand = await _load_player_hand(p1_id, match_data, "player1_deck")
            p2_hand = await _load_player_hand(p2_id, match_data, "player2_deck")

            board_elements = [
                random.choice(self.ELEMENTS) if random.random() < 0.38 else None
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
            self.match_states[match_id] = state
            logger.info("[WS] MatchState created: match=%s first=%s", match_id, first_turn)
        else:
            state = self.match_states[match_id]

        await self.broadcast_all(match_id, {
            "type": "game_start",
            "first_turn": state.current_turn,
        })
        for pid in [p1_id, p2_id]:
            await self.send_full_state(match_id, pid)
        return True

    # ── ДИСКОННЕКТ / ФОРФЕЙТ ───────────────────────────────────────

    async def handle_player_drop(self, match_id: str, player_id: str):
        """Игрок отвалился во время активной партии: уведомляем оппонента
        и запускаем таймер форфейта."""
        state = self.match_states.get(match_id)
        if not state or state.status != "active":
            return
        deadline = datetime.utcnow() + timedelta(seconds=RECONNECT_TIMEOUT_SECONDS)
        await self.broadcast_except(match_id, {
            "type": "player_disconnected",
            "player_id": str(player_id),
            "reconnect_deadline": deadline.isoformat() + "Z",
        }, exclude_id=str(player_id))
        self.schedule_forfeit(match_id, player_id, deadline)

    def schedule_forfeit(self, match_id: str, player_id: str, deadline: datetime):
        self.cancel_forfeit(match_id, player_id)

        async def _runner():
            try:
                delay = (deadline - datetime.utcnow()).total_seconds()
                if delay > 0:
                    await asyncio.sleep(delay)
                await self.resolve_forfeit(match_id, player_id)
            except asyncio.CancelledError:
                pass
            except Exception as e:
                logger.warning("[WS] forfeit runner error: %s", e)

        task = asyncio.create_task(_runner())
        self.reconnect_tasks.setdefault(match_id, {})[str(player_id)] = task

    def cancel_forfeit(self, match_id: str, player_id: str):
        tasks = self.reconnect_tasks.get(match_id)
        if not tasks:
            return
        task = tasks.pop(str(player_id), None)
        if task and not task.done():
            task.cancel()
        if not tasks:
            self.reconnect_tasks.pop(match_id, None)

    async def resolve_forfeit(self, match_id: str, disconnected_id: str):
        """Засчитываем поражение вышедшему: оставшийся игрок побеждает,
        получает рейтинг и право забрать NFT."""
        state = self.match_states.get(match_id)
        if not state or state.status != "active":
            return
        # вдруг игрок успел вернуться за время таймера
        conns = self.connections.get(match_id, {})
        if str(disconnected_id) in conns:
            return

        winner = (
            state.player2_id if str(disconnected_id) == state.player1_id
            else state.player1_id
        )
        state.status = "finished"
        state.winner = winner

        p1_score = sum(1 for c in state.board if c and c.get("owner") == state.player1_id)
        p2_score = sum(1 for c in state.board if c and c.get("owner") == state.player2_id)

        try:
            from routers.matchmaking import get_match
            from routers.matches import _finalize_match_result
            match_data = await get_match(match_id)
            if match_data:
                await _finalize_match_result(match_data, winner, reason="forfeit_disconnect")
        except Exception as e:
            logger.warning("[WS] forfeit finalize error: %s", e)

        await self.broadcast_all(match_id, {
            "type": "game_over",
            "winner": winner,
            "board": state.board,
            "player1_score": p1_score,
            "player2_score": p2_score,
            "reason": "opponent_disconnected",
        })
        logger.info("[WS] forfeit: match=%s winner=%s (dropped=%s)",
                    match_id, winner, disconnected_id)
        self.cancel_forfeit(match_id, disconnected_id)


async def _load_player_hand(player_id: str, match_data: dict, deck_key: str) -> List[dict]:
    """Берём реальную колоду игрока (его NFT): сначала из матча, затем из БД,
    затем из памяти, и лишь в крайнем случае — случайные карты."""
    pid = str(player_id)

    # 1) колода, зафиксированная в матче при матчмейкинге
    deck = match_data.get(deck_key) or []
    if isinstance(deck, list) and len(deck) >= 5:
        return deck[:5]

    # 2) из БД (UserDeck.full_cards)
    try:
        from database.session import get_session
        from routers.decks import _get_deck_from_db
        async for session in get_session():
            d = await _get_deck_from_db(pid, session)
            if d and len(d.get("full_cards") or []) >= 5:
                return d["full_cards"][:5]
            break
    except Exception as e:
        logger.warning("[WS] _load_player_hand DB error: %s", e)

    # 3) из in-memory кэша колод
    try:
        from routers.decks import _decks_storage
        fc = (_decks_storage.get(pid) or {}).get("full_cards") or []
        if len(fc) >= 5:
            return fc[:5]
    except Exception:
        pass

    # 4) запасной вариант — случайная рука (чтобы матч не завис)
    logger.warning("[WS] No real deck for player %s, using random hand", pid)
    return _make_random_hand(pid)


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

        # При (ре)коннекте снимаем форфейт-таймер этого игрока
        ws_manager.cancel_forfeit(match_id, player_id)

        # Если партия УЖЕ идёт — сразу отдаём текущее состояние.
        # Это и есть починка возврата в игру после вылета.
        # (Оппонента о возврате уже уведомил broadcast player_connected выше,
        #  а серверный форфейт-таймер мы сняли через cancel_forfeit.)
        if match_id in ws_manager.match_states:
            await ws_manager.send_full_state(match_id, player_id)

        # Сообщаем, ждём ли ещё лок NFT
        conns = ws_manager.connections.get(match_id, {})
        both_connected = p1_id in conns and p2_id in conns
        if both_connected and not match_data.get("escrow_locked", False):
            await websocket.send_json({
                "type": "waiting_for_escrow",
                "message": "Waiting for both players to lock NFTs",
            })

        # Пытаемся стартовать партию (оба на связи + эскроу залочен).
        # Идемпотентно: если матч уже идёт — ничего не сломает.
        await ws_manager.try_start_game(match_id)

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

            elif msg_type == "get_state":
                # Клиент просит актуальное состояние (после реконнекта)
                await ws_manager.send_full_state(match_id, player_id)

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
            # Если игрок вылетел во время активной партии — уведомляем
            # оппонента и запускаем таймер форфейта.
            try:
                await ws_manager.handle_player_drop(match_id, player_id)
            except Exception as e:
                logger.warning("[WS] handle_player_drop error: %s", e)


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
