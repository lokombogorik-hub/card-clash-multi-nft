from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import json
import asyncio
import traceback

router = APIRouter(tags=["websocket"])

match_connections: Dict[str, Dict[str, WebSocket]] = {}
match_states: Dict[str, Dict[str, Any]] = {}
reconnect_deadlines: Dict[str, Dict[str, datetime]] = {}

# ✅ Locks для защиты от двойного хода
match_locks: Dict[str, asyncio.Lock] = {}

RECONNECT_TIMEOUT_SECONDS = 180

ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]

ACE_VALUE = 10


def clamp(v, a, b):
    return max(a, min(b, v))


def init_match_state(
    match_id: str,
    player1_id: str,
    player2_id: str,
    player1_deck: List[Dict],
    player2_deck: List[Dict]
) -> Dict:
    import random

    board_elements = []
    for _ in range(9):
        if random.random() < 0.35:
            board_elements.append(random.choice(ELEMENTS))
        else:
            board_elements.append(None)

    first_player = random.choice([player1_id, player2_id])

    def normalize_deck(deck):
        normalized = []
        for i, card in enumerate(deck):
            if not card:
                continue
            values = card.get("values") or card.get("stats") or {
                "top": 5, "right": 5, "bottom": 5, "left": 5
            }
            normalized.append({
                **card,
                "values": {
                    "top":    int(values.get("top", 5)),
                    "right":  int(values.get("right", 5)),
                    "bottom": int(values.get("bottom", 5)),
                    "left":   int(values.get("left", 5)),
                },
                "id": card.get("id") or card.get("token_id") or f"card_{i}",
            })
        return normalized

    p1_deck = normalize_deck(player1_deck) if player1_deck else []
    p2_deck = normalize_deck(player2_deck) if player2_deck else []

    while len(p1_deck) < 5:
        p1_deck.append({
            "id": f"default_p1_{len(p1_deck)}",
            "values": {"top": 5, "right": 5, "bottom": 5, "left": 5},
            "element": None,
        })
    while len(p2_deck) < 5:
        p2_deck.append({
            "id": f"default_p2_{len(p2_deck)}",
            "values": {"top": 5, "right": 5, "bottom": 5, "left": 5},
            "element": None,
        })

    state = {
        "match_id": match_id,
        "player1_id": player1_id,
        "player2_id": player2_id,
        "player1_deck": p1_deck,
        "player2_deck": p2_deck,
        "player1_hand": list(range(len(p1_deck))),
        "player2_hand": list(range(len(p2_deck))),
        "board": [None] * 9,
        "board_elements": board_elements,
        "current_turn": first_player,
        "status": "active",
        "winner": None,
        "player1_ready": False,
        "player2_ready": False,
        "moves_count": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    print(f"[WS] Init: p1={player1_id}, p2={player2_id}, first={first_player}")
    return state


def get_neighbors(idx: int) -> List[Dict]:
    x = idx % 3
    y = idx // 3
    neighbors = []
    if y > 0: neighbors.append({"idx": idx - 3, "my_side": "top",    "their_side": "bottom"})
    if x < 2: neighbors.append({"idx": idx + 1, "my_side": "right",  "their_side": "left"})
    if y < 2: neighbors.append({"idx": idx + 3, "my_side": "bottom", "their_side": "top"})
    if x > 0: neighbors.append({"idx": idx - 1, "my_side": "left",   "their_side": "right"})
    return neighbors


def resolve_placement(state: Dict, cell_idx: int, card: Dict, player_id: str) -> List[int]:
    board = state["board"]
    board_elements = state["board_elements"]

    values = card.get("values") or card.get("stats") or {
        "top": 5, "right": 5, "bottom": 5, "left": 5
    }
    normalized_values = {
        "top":    int(values.get("top", 5)),
        "right":  int(values.get("right", 5)),
        "bottom": int(values.get("bottom", 5)),
        "left":   int(values.get("left", 5)),
    }
    card_on_board = {**card, "values": normalized_values, "owner": player_id}
    board[cell_idx] = card_on_board
    captured = []

    for neighbor in get_neighbors(cell_idx):
        n_idx = neighbor["idx"]
        n_card = board[n_idx]

        if n_card is None or n_card.get("owner") == player_id:
            continue

        my_side = neighbor["my_side"]
        their_side = neighbor["their_side"]

        my_base = int((card_on_board.get("values") or {}).get(my_side, 5))
        their_base = int((n_card.get("values") or {}).get(their_side, 5))

        my_cell_elem = board_elements[cell_idx] if cell_idx < len(board_elements) else None
        n_cell_elem = board_elements[n_idx] if n_idx < len(board_elements) else None

        my_card_elem = card_on_board.get("element")
        their_card_elem = n_card.get("element")

        if my_base == ACE_VALUE:
            my_value = ACE_VALUE
        else:
            my_bonus = (+1 if my_card_elem == my_cell_elem else -1) if (my_cell_elem and my_card_elem) else 0
            my_value = clamp(my_base + my_bonus, 1, 9)

        if their_base == ACE_VALUE:
            their_value = ACE_VALUE
        else:
            their_bonus = (+1 if their_card_elem == n_cell_elem else -1) if (n_cell_elem and their_card_elem) else 0
            their_value = clamp(their_base + their_bonus, 1, 9)

        print(f"[WS] cell {cell_idx}→{n_idx}: "
              f"my {my_side}={my_base}→{my_value} "
              f"vs their {their_side}={their_base}→{their_value} "
              f"→ {'CAPTURE ✅' if my_value > their_value else 'NO ❌'}")

        if my_value > their_value:
            board[n_idx] = {**n_card, "owner": player_id}
            captured.append(n_idx)

    return captured


def check_game_over(state: Dict) -> Optional[str]:
    board = state["board"]
    if any(cell is None for cell in board):
        return None

    p1_count = sum(1 for cell in board if cell and cell.get("owner") == state["player1_id"])
    p2_count = sum(1 for cell in board if cell and cell.get("owner") == state["player2_id"])

    if p1_count > p2_count:
        return state["player1_id"]
    elif p2_count > p1_count:
        return state["player2_id"]
    else:
        return state["player1_id"]


async def safe_send_json(ws: WebSocket, message: Dict) -> bool:
    try:
        await ws.send_json(message)
        return True
    except Exception as e:
        print(f"[WS] Error sending: {e}")
        return False


async def broadcast_to_match(match_id: str, message: Dict, exclude_player: str = None):
    if match_id not in match_connections:
        return
    disconnected = []
    for player_id, ws in list(match_connections[match_id].items()):
        if exclude_player and player_id == exclude_player:
            continue
        success = await safe_send_json(ws, message)
        if not success:
            disconnected.append(player_id)
    for pid in disconnected:
        if match_id in match_connections and pid in match_connections[match_id]:
            del match_connections[match_id][pid]


async def send_game_state(match_id: str, player_id: str = None):
    if match_id not in match_states:
        return
    state = match_states[match_id]

    async def send_to_player(pid: str):
        if match_id not in match_connections:
            return
        if pid not in match_connections[match_id]:
            return
        ws = match_connections[match_id][pid]

        if pid == state["player1_id"]:
            hand_indices = state["player1_hand"]
            deck = state["player1_deck"]
            you_are = "player1"
        else:
            hand_indices = state["player2_hand"]
            deck = state["player2_deck"]
            you_are = "player2"

        your_hand = [deck[i] for i in hand_indices if i < len(deck)]

        message = {
            "type": "game_state",
            "state": {
                "match_id": state["match_id"],
                "board": state["board"],
                "board_elements": state["board_elements"],
                "current_turn": state["current_turn"],
                "status": state["status"],
                "winner": state["winner"],
                "player1_id": state["player1_id"],
                "player2_id": state["player2_id"],
                "player1_hand_count": len(state["player1_hand"]),
                "player2_hand_count": len(state["player2_hand"]),
                "moves_count": state["moves_count"],
            },
            "your_hand": your_hand,
            "you_are": you_are,
        }
        await safe_send_json(ws, message)

    if player_id:
        await send_to_player(player_id)
    else:
        for pid in [state["player1_id"], state["player2_id"]]:
            await send_to_player(pid)


async def _save_ws_state_to_db(match_id: str, state: Dict):
    """Сохраняем игровое состояние в БД после каждого хода"""
    try:
        from routers.matchmaking import save_match, get_match
        match_data = await get_match(match_id)
        if match_data:
            match_data["board"] = state["board"]
            match_data["board_elements"] = state["board_elements"]
            match_data["current_turn"] = state["current_turn"]
            match_data["player1_hand"] = state["player1_hand"]
            match_data["player2_hand"] = state["player2_hand"]
            match_data["moves_count"] = state["moves_count"]
            match_data["status"] = state["status"]
            match_data["winner"] = state["winner"]
            match_data["player1_ready"] = state["player1_ready"]
            match_data["player2_ready"] = state["player2_ready"]
            await save_match(match_data)
    except Exception as e:
        print(f"[WS] State save error: {e}")


@router.websocket("/ws/match/{match_id}")
async def websocket_match(websocket: WebSocket, match_id: str):
    await websocket.accept()
    print(f"[WS] Accepted match {match_id}")

    player_id = None

    try:
        # ── Auth ──────────────────────────────────────────────
        try:
            auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=15.0)
        except asyncio.TimeoutError:
            await safe_send_json(websocket, {"type": "error", "message": "Auth timeout"})
            await websocket.close(code=1008)
            return

        if auth_data.get("type") != "auth":
            await safe_send_json(websocket, {"type": "error", "message": "Expected auth"})
            await websocket.close(code=1008)
            return

        token = auth_data.get("token")
        if not token:
            await safe_send_json(websocket, {"type": "error", "message": "No token"})
            await websocket.close(code=1008)
            return

        try:
            from utils.security import decode_access_token
            payload = decode_access_token(token)
            player_id = str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
        except Exception:
            await safe_send_json(websocket, {"type": "error", "message": "Invalid token"})
            await websocket.close(code=1008)
            return

        if not player_id:
            await safe_send_json(websocket, {"type": "error", "message": "No player_id"})
            await websocket.close(code=1008)
            return

        print(f"[WS] Player {player_id} auth OK for match {match_id}")

        # ── Load match ────────────────────────────────────────
        from routers.matchmaking import get_match, save_match

        match_data = await get_match(match_id)
        if not match_data:
            await safe_send_json(websocket, {"type": "error", "message": "Match not found"})
            await websocket.close(code=1008)
            return

        if player_id not in [match_data["player1_id"], match_data["player2_id"]]:
            await safe_send_json(websocket, {"type": "error", "message": "Not a participant"})
            await websocket.close(code=1008)
            return

        # ── Register connection ───────────────────────────────
        if match_id not in match_connections:
            match_connections[match_id] = {}

        if player_id in match_connections[match_id]:
            try:
                await match_connections[match_id][player_id].close(code=1000)
            except Exception:
                pass

        match_connections[match_id][player_id] = websocket

        # ── Create lock for match ─────────────────────────────
        if match_id not in match_locks:
            match_locks[match_id] = asyncio.Lock()

        # ── Init game state ───────────────────────────────────
        if match_id not in match_states:
            # Восстанавливаем из БД если есть прогресс
            if match_data.get("moves_count", 0) > 0 and match_data.get("board"):
                match_states[match_id] = {
                    "match_id": match_id,
                    "player1_id": match_data["player1_id"],
                    "player2_id": match_data["player2_id"],
                    "player1_deck": match_data.get("player1_deck", []),
                    "player2_deck": match_data.get("player2_deck", []),
                    "player1_hand": match_data.get("player1_hand", []),
                    "player2_hand": match_data.get("player2_hand", []),
                    "board": match_data.get("board", [None] * 9),
                    "board_elements": match_data.get("board_elements", []),
                    "current_turn": match_data.get("current_turn", match_data["player1_id"]),
                    "status": match_data.get("status", "active"),
                    "winner": match_data.get("winner"),
                    "player1_ready": match_data.get("player1_ready", False),
                    "player2_ready": match_data.get("player2_ready", False),
                    "moves_count": match_data.get("moves_count", 0),
                    "created_at": match_data.get("created_at", datetime.utcnow().isoformat()),
                }
                print(f"[WS] Restored state from DB for match {match_id}, moves={match_data.get('moves_count')}")
            else:
                match_states[match_id] = init_match_state(
                    match_id=match_id,
                    player1_id=match_data["player1_id"],
                    player2_id=match_data["player2_id"],
                    player1_deck=match_data.get("player1_deck", []),
                    player2_deck=match_data.get("player2_deck", []),
                )

        state = match_states[match_id]

        if player_id == state["player1_id"]:
            state["player1_ready"] = True
        else:
            state["player2_ready"] = True

        # Снимаем deadline реконнекта
        if match_id in reconnect_deadlines and player_id in reconnect_deadlines[match_id]:
            del reconnect_deadlines[match_id][player_id]

        # ── Send initial messages ─────────────────────────────
        await safe_send_json(websocket, {
            "type": "connected",
            "match_id": match_id,
            "player_id": player_id,
            "you_are": "player1" if player_id == state["player1_id"] else "player2",
        })

        await broadcast_to_match(match_id, {
            "type": "player_connected",
            "player_id": player_id,
        }, exclude_player=player_id)

        await send_game_state(match_id, player_id)

        if state["player1_ready"] and state["player2_ready"]:
            await broadcast_to_match(match_id, {
                "type": "game_start",
                "current_turn": state["current_turn"],
            })

        # ── Message loop ──────────────────────────────────────
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
                msg_type = data.get("type")

                if msg_type == "ping":
                    await safe_send_json(websocket, {"type": "pong"})
                    continue

                if msg_type == "pong":
                    continue

                if msg_type == "get_state":
                    await send_game_state(match_id, player_id)
                    continue

                if msg_type == "play_card":
                    # ✅ Lock — только один ход одновременно
                    async with match_locks[match_id]:
                        try:
                            if state["status"] != "active":
                                await safe_send_json(websocket, {"type": "error", "message": "Game not active"})
                                continue

                            card_index = data.get("card_index")
                            cell_index = data.get("cell_index")

                            # ✅ Проверка хода
                            if state["current_turn"] != player_id:
                                await safe_send_json(websocket, {"type": "error", "message": "Not your turn"})
                                continue

                            if cell_index is None or card_index is None:
                                await safe_send_json(websocket, {"type": "error", "message": "Missing indices"})
                                continue

                            if not (0 <= cell_index <= 8):
                                await safe_send_json(websocket, {"type": "error", "message": "Invalid cell"})
                                continue

                            if state["board"][cell_index] is not None:
                                await safe_send_json(websocket, {"type": "error", "message": "Cell occupied"})
                                continue

                            if player_id == state["player1_id"]:
                                hand = state["player1_hand"]
                                deck = state["player1_deck"]
                            else:
                                hand = state["player2_hand"]
                                deck = state["player2_deck"]

                            if not (0 <= card_index < len(hand)):
                                await safe_send_json(websocket, {"type": "error", "message": f"Invalid card_index {card_index}"})
                                continue

                            deck_idx = hand[card_index]
                            if deck_idx >= len(deck):
                                await safe_send_json(websocket, {"type": "error", "message": "Card not found"})
                                continue

                            card = deck[deck_idx].copy()
                            hand.pop(card_index)

                            # ── Resolve move ──────────────────
                            captured = resolve_placement(state, cell_index, card, player_id)
                            state["moves_count"] += 1

                            print(f"[WS] {player_id} played {card.get('id')} at {cell_index}, captured={captured}")

                            # ── Broadcast card_played ─────────
                            await broadcast_to_match(match_id, {
                                "type": "card_played",
                                "player_id": player_id,
                                "cell_index": cell_index,
                                "card": card,
                                "captured": captured,
                            })

                            # ── Check game over ───────────────
                            winner = check_game_over(state)
                            if winner:
                                state["status"] = "finished"
                                state["winner"] = winner
                                print(f"[WS] Game over! Winner: {winner}")

                                # ✅ Сначала game_state, потом game_over
                                await send_game_state(match_id)
                                await broadcast_to_match(match_id, {
                                    "type": "game_over",
                                    "winner": winner,
                                    "board": state["board"],
                                })

                                # Обновляем рейтинг
                                try:
                                    from routers.matches import update_player_ratings
                                    loser = state["player2_id"] if winner == state["player1_id"] else state["player1_id"]
                                    await update_player_ratings(winner_id=winner, loser_id=loser)
                                    print(f"[WS] Rating updated: winner={winner}, loser={loser}")
                                except Exception as re:
                                    print(f"[WS] Rating update error: {re}")

                            else:
                                # ── Switch turn ───────────────
                                state["current_turn"] = (
                                    state["player2_id"]
                                    if state["current_turn"] == state["player1_id"]
                                    else state["player1_id"]
                                )
                                await broadcast_to_match(match_id, {
                                    "type": "turn_change",
                                    "current_turn": state["current_turn"],
                                })
                                await send_game_state(match_id)

                            # ✅ Сохраняем состояние в БД после каждого хода
                            asyncio.create_task(_save_ws_state_to_db(match_id, state))

                        except Exception as play_err:
                            print(f"[WS] play_card error: {play_err}")
                            traceback.print_exc()
                            await safe_send_json(websocket, {
                                "type": "error",
                                "message": f"Move error: {str(play_err)}"
                            })
                            # ✅ continue — НЕ break! Соединение остаётся!
                            continue

            except asyncio.TimeoutError:
                # ✅ Пингуем и продолжаем — НЕ разрываем
                ok = await safe_send_json(websocket, {"type": "ping"})
                if not ok:
                    print(f"[WS] Ping failed for {player_id}")
                    break
                continue

            except WebSocketDisconnect:
                print(f"[WS] Disconnect in loop: {player_id}")
                break

            except json.JSONDecodeError:
                # ✅ Битый JSON — продолжаем
                await safe_send_json(websocket, {"type": "error", "message": "Invalid JSON"})
                continue

            except Exception as e:
                print(f"[WS] Loop error: {e}")
                traceback.print_exc()
                err_str = str(e).lower()
                if any(x in err_str for x in ["connection", "closed", "disconnect", "reset"]):
                    break
                continue

    except WebSocketDisconnect:
        print(f"[WS] Disconnect: {player_id}")
    except Exception as e:
        print(f"[WS] Unexpected error: {e}")
        traceback.print_exc()
    finally:
        if player_id and match_id in match_connections:
            if player_id in match_connections[match_id]:
                del match_connections[match_id][player_id]

            if match_id in match_states and match_states[match_id].get("status") == "active":
                if match_id not in reconnect_deadlines:
                    reconnect_deadlines[match_id] = {}
                deadline = datetime.utcnow() + timedelta(seconds=RECONNECT_TIMEOUT_SECONDS)
                reconnect_deadlines[match_id][player_id] = deadline

                await broadcast_to_match(match_id, {
                    "type": "player_disconnected",
                    "player_id": player_id,
                    "reconnect_deadline": deadline.isoformat(),
                })

            if match_id in match_connections and not match_connections[match_id]:
                del match_connections[match_id]
                # Чистим lock
                if match_id in match_locks:
                    del match_locks[match_id]

        try:
            await websocket.close()
        except Exception:
            pass