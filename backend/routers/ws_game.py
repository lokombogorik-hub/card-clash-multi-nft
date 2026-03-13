from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta
import json
import asyncio
import traceback

router = APIRouter(tags=["websocket"])

# Active connections per match
match_connections: Dict[str, Dict[str, WebSocket]] = {}

# Match game states
match_states: Dict[str, Dict[str, Any]] = {}

# Reconnect deadlines
reconnect_deadlines: Dict[str, Dict[str, datetime]] = {}

RECONNECT_TIMEOUT_SECONDS = 180  # 3 minutes

ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"]

BEATS = {
    "Earth": ["Thunder"],
    "Thunder": ["Water"],
    "Water": ["Fire"],
    "Fire": ["Ice"],
    "Ice": ["Wind"],
    "Wind": ["Poison"],
    "Poison": ["Holy"],
    "Holy": ["Earth"],
}


def clamp(v, a, b):
    return max(a, min(b, v))


def element_bonus(attacker_elem, defender_elem):
    """Calculate element battle bonus"""
    if not attacker_elem or not defender_elem:
        return 0
    if attacker_elem == defender_elem:
        return 1
    if defender_elem in BEATS.get(attacker_elem, []):
        return 1
    if attacker_elem in BEATS.get(defender_elem, []):
        return -1
    return 0


def init_match_state(match_id: str, player1_id: str, player2_id: str,
                     player1_deck: List[Dict], player2_deck: List[Dict]) -> Dict:
    """Initialize a new match state"""
    import random

    # Generate board elements (some cells have elements)
    board_elements = []
    for _ in range(9):
        if random.random() < 0.35:
            board_elements.append(random.choice(ELEMENTS))
        else:
            board_elements.append(None)

    # Randomly choose who goes first
    first_player = random.choice([player1_id, player2_id])

    # Ensure decks have proper structure
    def normalize_deck(deck):
        normalized = []
        for i, card in enumerate(deck):
            if not card:
                continue
            # Ensure values exist
            values = card.get("values") or card.get("stats") or {
                "top": 5, "right": 5, "bottom": 5, "left": 5
            }
            normalized.append({
                **card,
                "values": values,
                "id": card.get("id") or card.get("token_id") or f"card_{i}",
            })
        return normalized

    p1_deck = normalize_deck(player1_deck) if player1_deck else []
    p2_deck = normalize_deck(player2_deck) if player2_deck else []

    # Fill with default cards if needed
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

    print(f"[WS] Init state: player1={player1_id}, player2={player2_id}, first_turn={first_player}")
    print(f"[WS] Player1 deck: {len(p1_deck)} cards, Player2 deck: {len(p2_deck)} cards")

    return state


def get_neighbors(idx: int) -> List[Dict]:
    """Get neighboring cells with direction info"""
    x = idx % 3
    y = idx // 3

    neighbors = []
    if y > 0:
        neighbors.append({"idx": idx - 3, "my_side": "top", "their_side": "bottom"})
    if x < 2:
        neighbors.append({"idx": idx + 1, "my_side": "right", "their_side": "left"})
    if y < 2:
        neighbors.append({"idx": idx + 3, "my_side": "bottom", "their_side": "top"})
    if x > 0:
        neighbors.append({"idx": idx - 1, "my_side": "left", "their_side": "right"})

    return neighbors


def resolve_placement(state: Dict, cell_idx: int, card: Dict, player_id: str) -> List[int]:
    """Place card and resolve captures. Returns list of captured cell indices."""
    board = state["board"]
    board_elements = state["board_elements"]

    # Get card values with fallback
    card_values = card.get("values") or card.get("stats") or {
        "top": 5, "right": 5, "bottom": 5, "left": 5
    }

    # Place the card with complete data
    card_on_board = {
        **card,
        "values": card_values,
        "owner": player_id,
    }
    board[cell_idx] = card_on_board

    captured = []

    # Check each neighbor
    for neighbor in get_neighbors(cell_idx):
        n_idx = neighbor["idx"]
        n_card = board[n_idx]

        if n_card is None:
            continue
        if n_card.get("owner") == player_id:
            continue

        my_side = neighbor["my_side"]
        their_side = neighbor["their_side"]

        n_card_values = n_card.get("values") or n_card.get("stats") or {
            "top": 5, "right": 5, "bottom": 5, "left": 5
        }

        my_value = card_values.get(my_side, 5)
        their_value = n_card_values.get(their_side, 5)

        # Apply board element bonus to my card
        cell_elem = board_elements[cell_idx]
        if cell_elem and card.get("element") == cell_elem:
            my_value = clamp(my_value + 1, 1, 10)
        elif cell_elem and card.get("element") and card.get("element") != cell_elem:
            my_value = clamp(my_value - 1, 1, 10)

        # Apply board element bonus to their card
        n_cell_elem = board_elements[n_idx]
        if n_cell_elem and n_card.get("element") == n_cell_elem:
            their_value = clamp(their_value + 1, 1, 10)
        elif n_cell_elem and n_card.get("element") and n_card.get("element") != n_cell_elem:
            their_value = clamp(their_value - 1, 1, 10)

        # Element battle bonus
        elem_bonus = element_bonus(card.get("element"), n_card.get("element"))
        my_value = clamp(my_value + elem_bonus, 1, 10)

        # Compare and capture
        if my_value > their_value:
            # Create new card object with updated owner
            board[n_idx] = {
                **n_card,
                "owner": player_id,
            }
            captured.append(n_idx)

    return captured


def check_game_over(state: Dict) -> Optional[str]:
    """Check if game is over, return winner player_id or 'draw' or None"""
    board = state["board"]

    # Game over when board is full
    if any(cell is None for cell in board):
        return None

    # Count cards by owner
    p1_count = sum(1 for cell in board if cell and cell.get("owner") == state["player1_id"])
    p2_count = sum(1 for cell in board if cell and cell.get("owner") == state["player2_id"])

    if p1_count > p2_count:
        return state["player1_id"]
    elif p2_count > p1_count:
        return state["player2_id"]
    else:
        return "draw"


async def safe_send_json(ws: WebSocket, message: Dict) -> bool:
    """Safely send JSON message, return True if successful"""
    try:
        await ws.send_json(message)
        return True
    except Exception as e:
        print(f"[WS] Error sending message: {e}")
        return False


async def broadcast_to_match(match_id: str, message: Dict, exclude_player: str = None):
    """Send message to all players in match"""
    if match_id not in match_connections:
        return

    disconnected = []
    for player_id, ws in list(match_connections[match_id].items()):
        if exclude_player and player_id == exclude_player:
            continue
        success = await safe_send_json(ws, message)
        if not success:
            disconnected.append(player_id)

    # Clean up disconnected players
    for pid in disconnected:
        if match_id in match_connections and pid in match_connections[match_id]:
            del match_connections[match_id][pid]
            print(f"[WS] Removed disconnected player {pid} from connections")


async def send_game_state(match_id: str, player_id: str = None):
    """Send current game state to player(s)"""
    if match_id not in match_states:
        print(f"[WS] send_game_state: match {match_id} not in match_states")
        return

    state = match_states[match_id]

    async def send_to_player(pid: str):
        if match_id not in match_connections:
            return
        if pid not in match_connections[match_id]:
            return

        ws = match_connections[match_id][pid]

        # Determine player's hand
        if pid == state["player1_id"]:
            hand_indices = state["player1_hand"]
            deck = state["player1_deck"]
            you_are = "player1"
        else:
            hand_indices = state["player2_hand"]
            deck = state["player2_deck"]
            you_are = "player2"

        # Build hand cards
        your_hand = []
        for i in hand_indices:
            if i < len(deck):
                your_hand.append(deck[i])

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

        success = await safe_send_json(ws, message)
        if success:
            print(f"[WS] Sent game_state to {pid}, hand={len(your_hand)} cards, turn={state['current_turn']}")

    if player_id:
        await send_to_player(player_id)
    else:
        # Send to all connected players
        for pid in [state["player1_id"], state["player2_id"]]:
            await send_to_player(pid)


@router.websocket("/ws/match/{match_id}")
async def websocket_match(websocket: WebSocket, match_id: str):
    """WebSocket endpoint for real-time PvP match"""

    await websocket.accept()
    print(f"[WS] WebSocket accepted for match {match_id}")

    player_id = None
    authenticated = False

    try:
        # Wait for auth message
        print(f"[WS] Waiting for auth message...")
        try:
            auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=15.0)
        except asyncio.TimeoutError:
            print(f"[WS] Auth timeout for match {match_id}")
            await safe_send_json(websocket, {"type": "error", "message": "Auth timeout"})
            await websocket.close(code=1008)
            return

        print(f"[WS] Received auth data: {auth_data.get('type')}")

        if auth_data.get("type") != "auth":
            await safe_send_json(websocket, {"type": "error", "message": "Expected auth message"})
            await websocket.close(code=1008)
            return

        token = auth_data.get("token")
        if not token:
            await safe_send_json(websocket, {"type": "error", "message": "No token provided"})
            await websocket.close(code=1008)
            return

        # Decode token
        try:
            from utils.security import decode_access_token
            payload = decode_access_token(token)
            player_id = str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
            print(f"[WS] Token decoded, player_id={player_id}")
        except Exception as e:
            print(f"[WS] Token decode error: {e}")
            await safe_send_json(websocket, {"type": "error", "message": f"Invalid token"})
            await websocket.close(code=1008)
            return

        if not player_id:
            await safe_send_json(websocket, {"type": "error", "message": "Could not identify player"})
            await websocket.close(code=1008)
            return

        authenticated = True
        print(f"[WS] Player {player_id} authenticated for match {match_id}")

        # Get match data
        from routers.matchmaking import active_matches

        if match_id not in active_matches:
            print(f"[WS] Match {match_id} not found in active_matches")
            await safe_send_json(websocket, {"type": "error", "message": "Match not found"})
            await websocket.close(code=1008)
            return

        match_data = active_matches[match_id]
        print(f"[WS] Match data: player1={match_data.get('player1_id')}, player2={match_data.get('player2_id')}")

        # Verify player is participant
        if player_id not in [match_data["player1_id"], match_data["player2_id"]]:
            print(f"[WS] Player {player_id} not a participant")
            await safe_send_json(websocket, {"type": "error", "message": "Not a participant"})
            await websocket.close(code=1008)
            return

        # Initialize connection storage
        if match_id not in match_connections:
            match_connections[match_id] = {}

        # Close existing connection if any (handle reconnect)
        if player_id in match_connections[match_id]:
            old_ws = match_connections[match_id][player_id]
            try:
                await old_ws.close(code=1000)
            except:
                pass
            print(f"[WS] Closed old connection for {player_id}")

        match_connections[match_id][player_id] = websocket
        print(f"[WS] Player {player_id} added to connections. Total: {len(match_connections[match_id])}")

        # Initialize game state if not exists
        if match_id not in match_states:
            print(f"[WS] Initializing game state for match {match_id}")
            match_states[match_id] = init_match_state(
                match_id=match_id,
                player1_id=match_data["player1_id"],
                player2_id=match_data["player2_id"],
                player1_deck=match_data.get("player1_deck", []),
                player2_deck=match_data.get("player2_deck", []),
            )

        state = match_states[match_id]

        # Mark player as ready
        if player_id == state["player1_id"]:
            state["player1_ready"] = True
        else:
            state["player2_ready"] = True

        print(f"[WS] Player ready: p1={state['player1_ready']}, p2={state['player2_ready']}")

        # Clear reconnect deadline if exists
        if match_id in reconnect_deadlines and player_id in reconnect_deadlines[match_id]:
            del reconnect_deadlines[match_id][player_id]
            print(f"[WS] Cleared reconnect deadline for {player_id}")

        # Send connected confirmation
        await safe_send_json(websocket, {
            "type": "connected",
            "match_id": match_id,
            "player_id": player_id,
            "you_are": "player1" if player_id == state["player1_id"] else "player2",
        })
        print(f"[WS] Sent 'connected' to {player_id}")

        # Notify opponent about reconnection
        await broadcast_to_match(match_id, {
            "type": "player_connected",
            "player_id": player_id,
        }, exclude_player=player_id)

        # Send initial game state
        await send_game_state(match_id, player_id)

        # Check if both ready
        if state["player1_ready"] and state["player2_ready"]:
            print(f"[WS] Both players ready, sending game_start")
            await broadcast_to_match(match_id, {
                "type": "game_start",
                "current_turn": state["current_turn"],
            })

        # Main message loop
        print(f"[WS] Entering message loop for {player_id}")
        while True:
            try:
                # Use timeout to allow periodic checks
                data = await asyncio.wait_for(websocket.receive_json(), timeout=60.0)
                msg_type = data.get("type")
                print(f"[WS] Received from {player_id}: {msg_type}")

                if msg_type == "ping":
                    await safe_send_json(websocket, {"type": "pong"})
                    continue

                if msg_type == "get_state":
                    await send_game_state(match_id, player_id)
                    continue

                if msg_type == "play_card":
                    # Validate game is still active
                    if state["status"] != "active":
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Game is not active"
                        })
                        continue

                    card_index = data.get("card_index")
                    cell_index = data.get("cell_index")

                    print(f"[WS] play_card: card_index={card_index}, cell_index={cell_index}")

                    # Validate turn
                    if state["current_turn"] != player_id:
                        print(f"[WS] Not player's turn: current={state['current_turn']}, player={player_id}")
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Not your turn"
                        })
                        continue

                    # Validate indices
                    if cell_index is None or card_index is None:
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Missing card_index or cell_index"
                        })
                        continue

                    if cell_index < 0 or cell_index > 8:
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Invalid cell index"
                        })
                        continue

                    # Validate cell is empty
                    if state["board"][cell_index] is not None:
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Cell is occupied"
                        })
                        continue

                    # Get player's hand and deck
                    if player_id == state["player1_id"]:
                        hand = state["player1_hand"]
                        deck = state["player1_deck"]
                    else:
                        hand = state["player2_hand"]
                        deck = state["player2_deck"]

                    # Validate card index
                    if card_index < 0 or card_index >= len(hand):
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": f"Invalid card index: {card_index}, hand size: {len(hand)}"
                        })
                        continue

                    # Get the card from deck
                    deck_idx = hand[card_index]
                    if deck_idx >= len(deck):
                        await safe_send_json(websocket, {
                            "type": "error",
                            "message": "Card not found in deck"
                        })
                        continue

                    card = deck[deck_idx].copy()  # Make a copy to avoid mutation issues

                    print(f"[WS] Playing card: {card.get('id', 'unknown')}, values: {card.get('values')}")

                    # Remove from hand
                    hand.pop(card_index)

                    # Place card and resolve captures
                    captured = resolve_placement(state, cell_index, card, player_id)

                    state["moves_count"] += 1

                    print(f"[WS] Card placed at {cell_index}, captured={captured}")

                    # Broadcast the move to both players
                    await broadcast_to_match(match_id, {
                        "type": "card_played",
                        "player_id": player_id,
                        "cell_index": cell_index,
                        "card": card,
                        "captured": captured,
                    })

                    # Check game over
                    winner = check_game_over(state)
                    if winner:
                        state["status"] = "finished"
                        state["winner"] = winner

                        print(f"[WS] Game over! Winner: {winner}")

                        await broadcast_to_match(match_id, {
                            "type": "game_over",
                            "winner": winner,
                            "board": state["board"],
                        })
                    else:
                        # Switch turn
                        if state["current_turn"] == state["player1_id"]:
                            state["current_turn"] = state["player2_id"]
                        else:
                            state["current_turn"] = state["player1_id"]

                        print(f"[WS] Turn switched to {state['current_turn']}")

                        await broadcast_to_match(match_id, {
                            "type": "turn_change",
                            "current_turn": state["current_turn"],
                        })

                    # Send updated state to both players
                    await send_game_state(match_id)

            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({"type": "ping"})
                except:
                    print(f"[WS] Failed to send ping to {player_id}, disconnecting")
                    break

            except WebSocketDisconnect as e:
                print(f"[WS] WebSocketDisconnect in message loop: {e}")
                break

            except json.JSONDecodeError as e:
                print(f"[WS] JSON decode error: {e}")
                await safe_send_json(websocket, {
                    "type": "error",
                    "message": "Invalid JSON"
                })

            except Exception as e:
                print(f"[WS] Error processing message: {e}")
                traceback.print_exc()
                break

    except WebSocketDisconnect as e:
        print(f"[WS] Player {player_id} disconnected from match {match_id}: {e}")

    except Exception as e:
        print(f"[WS] Unexpected error in match {match_id}: {e}")
        traceback.print_exc()

    finally:
        # Cleanup connection
        if player_id and match_id in match_connections:
            if player_id in match_connections[match_id]:
                del match_connections[match_id][player_id]
                print(f"[WS] Removed {player_id} from connections")

            # Set reconnect deadline if game is still active
            if match_id in match_states and match_states[match_id].get("status") == "active":
                if match_id not in reconnect_deadlines:
                    reconnect_deadlines[match_id] = {}

                deadline = datetime.utcnow() + timedelta(seconds=RECONNECT_TIMEOUT_SECONDS)
                reconnect_deadlines[match_id][player_id] = deadline

                print(f"[WS] Set reconnect deadline for {player_id}: {deadline.isoformat()}")

                # Notify opponent
                await broadcast_to_match(match_id, {
                    "type": "player_disconnected",
                    "player_id": player_id,
                    "reconnect_deadline": deadline.isoformat(),
                })

            # Cleanup empty match connections
            if match_id in match_connections and not match_connections[match_id]:
                del match_connections[match_id]
                print(f"[WS] Removed empty connections dict for match {match_id}")

        # Try to close websocket gracefully
        try:
            await websocket.close()
        except:
            pass