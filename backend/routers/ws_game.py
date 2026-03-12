# backend/routers/ws_game.py
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

    state = {
        "match_id": match_id,
        "player1_id": player1_id,
        "player2_id": player2_id,
        "player1_deck": player1_deck,
        "player2_deck": player2_deck,
        "player1_hand": list(range(len(player1_deck))),  # indices of cards in hand
        "player2_hand": list(range(len(player2_deck))),
        "board": [None] * 9,  # 3x3 grid
        "board_elements": board_elements,
        "current_turn": first_player,  # who moves now
        "status": "active",
        "winner": None,
        "player1_ready": False,
        "player2_ready": False,
        "moves_count": 0,
        "created_at": datetime.utcnow().isoformat(),
    }

    print(f"[WS] Init state: player1={player1_id}, player2={player2_id}, first_turn={first_player}")
    print(f"[WS] Player1 deck: {len(player1_deck)} cards, Player2 deck: {len(player2_deck)} cards")

    return state


def get_neighbors(idx: int) -> List[Dict]:
    """Get neighboring cells with direction info"""
    x = idx % 3
    y = idx // 3

    neighbors = []
    # top
    if y > 0:
        neighbors.append({"idx": idx - 3, "my_side": "top", "their_side": "bottom"})
    # right
    if x < 2:
        neighbors.append({"idx": idx + 1, "my_side": "right", "their_side": "left"})
    # bottom
    if y < 2:
        neighbors.append({"idx": idx + 3, "my_side": "bottom", "their_side": "top"})
    # left
    if x > 0:
        neighbors.append({"idx": idx - 1, "my_side": "left", "their_side": "right"})

    return neighbors


def resolve_placement(state: Dict, cell_idx: int, card: Dict, player_id: str) -> List[int]:
    """Place card and resolve captures. Returns list of captured cell indices."""
    board = state["board"]
    board_elements = state["board_elements"]

    # Place the card
    card_on_board = {
        **card,
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
            continue  # already mine

        my_side = neighbor["my_side"]
        their_side = neighbor["their_side"]

        # Get values - handle both 'values' and 'stats' formats
        card_values = card.get("values") or card.get("stats") or {}
        n_card_values = n_card.get("values") or n_card.get("stats") or {}

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

        # Compare
        if my_value > their_value:
            # Capture!
            board[n_idx]["owner"] = player_id
            captured.append(n_idx)

    return captured


def check_game_over(state: Dict) -> Optional[str]:
    """Check if game is over, return winner player_id or None"""
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


async def broadcast_to_match(match_id: str, message: Dict, exclude_player: str = None):
    """Send message to all players in match"""
    if match_id not in match_connections:
        return

    for player_id, ws in list(match_connections[match_id].items()):
        if exclude_player and player_id == exclude_player:
            continue
        try:
            await ws.send_json(message)
        except Exception as e:
            print(f"[WS] Error sending to {player_id}: {e}")


async def send_game_state(match_id: str, player_id: str = None):
    """Send current game state to player(s)"""
    if match_id not in match_states:
        print(f"[WS] send_game_state: match {match_id} not in match_states")
        return

    state = match_states[match_id]

    if player_id:
        # Send to specific player with their hand
        if match_id not in match_connections:
            print(f"[WS] send_game_state: match {match_id} not in match_connections")
            return
        if player_id not in match_connections[match_id]:
            print(f"[WS] send_game_state: player {player_id} not in connections")
            return

        ws = match_connections[match_id][player_id]

        # Determine player's hand
        if player_id == state["player1_id"]:
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

        try:
            await ws.send_json(message)
            print(f"[WS] Sent game_state to {player_id}, hand={len(your_hand)} cards")
        except Exception as e:
            print(f"[WS] Error sending state to {player_id}: {e}")
    else:
        # Broadcast to all (each gets their own hand)
        for pid in [state["player1_id"], state["player2_id"]]:
            await send_game_state(match_id, pid)


@router.websocket("/ws/match/{match_id}")
async def websocket_match(websocket: WebSocket, match_id: str):
    """WebSocket endpoint for real-time PvP match"""

    await websocket.accept()
    print(f"[WS] WebSocket accepted for match {match_id}")

    player_id = None

    try:
        # Wait for auth message
        print(f"[WS] Waiting for auth message...")
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=10.0)
        print(f"[WS] Received auth data: {auth_data.get('type')}")

        if auth_data.get("type") != "auth":
            await websocket.send_json({"type": "error", "message": "Expected auth message"})
            await websocket.close()
            return

        token = auth_data.get("token")
        if not token:
            await websocket.send_json({"type": "error", "message": "No token provided"})
            await websocket.close()
            return

        # Decode token
        try:
            from utils.security import decode_access_token
            payload = decode_access_token(token)
            player_id = str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
            print(f"[WS] Token decoded, player_id={player_id}")
        except Exception as e:
            print(f"[WS] Token decode error: {e}")
            await websocket.send_json({"type": "error", "message": f"Invalid token: {e}"})
            await websocket.close()
            return

        if not player_id:
            await websocket.send_json({"type": "error", "message": "Could not identify player"})
            await websocket.close()
            return

        print(f"[WS] Player {player_id} connecting to match {match_id}")

        # Get match data
        from routers.matchmaking import active_matches

        if match_id not in active_matches:
            print(f"[WS] Match {match_id} not found in active_matches")
            await websocket.send_json({"type": "error", "message": "Match not found"})
            await websocket.close()
            return

        match_data = active_matches[match_id]
        print(f"[WS] Match data: player1={match_data.get('player1_id')}, player2={match_data.get('player2_id')}")

        # Verify player is participant
        if player_id not in [match_data["player1_id"], match_data["player2_id"]]:
            print(f"[WS] Player {player_id} not a participant")
            await websocket.send_json({"type": "error", "message": "Not a participant"})
            await websocket.close()
            return

        # Initialize connection storage
        if match_id not in match_connections:
            match_connections[match_id] = {}

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

        # Send connected confirmation
        await websocket.send_json({
            "type": "connected",
            "match_id": match_id,
            "player_id": player_id,
            "you_are": "player1" if player_id == state["player1_id"] else "player2",
        })
        print(f"[WS] Sent 'connected' to {player_id}")

        # Notify opponent
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
                data = await websocket.receive_json()
                msg_type = data.get("type")
                print(f"[WS] Received from {player_id}: {msg_type}")

                if msg_type == "play_card":
                    # Player plays a card
                    card_index = data.get("card_index")  # index in hand
                    cell_index = data.get("cell_index")  # 0-8 board position

                    print(f"[WS] play_card: card_index={card_index}, cell_index={cell_index}")

                    # Validate turn
                    if state["current_turn"] != player_id:
                        print(f"[WS] Not player's turn: current={state['current_turn']}, player={player_id}")
                        await websocket.send_json({
                            "type": "error",
                            "message": "Not your turn"
                        })
                        continue

                    # Validate cell is empty
                    if state["board"][cell_index] is not None:
                        await websocket.send_json({
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
                        await websocket.send_json({
                            "type": "error",
                            "message": "Invalid card index"
                        })
                        continue

                    # Get the card
                    deck_idx = hand[card_index]
                    card = deck[deck_idx]

                    print(f"[WS] Playing card: {card.get('name', card.get('id'))}")

                    # Remove from hand
                    hand.pop(card_index)

                    # Place card and resolve captures
                    captured = resolve_placement(state, cell_index, card, player_id)

                    state["moves_count"] += 1

                    print(f"[WS] Card placed, captured={captured}")

                    # Broadcast the move
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

                    # Send updated state to both
                    await send_game_state(match_id)

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "get_state":
                    await send_game_state(match_id, player_id)

            except Exception as e:
                print(f"[WS] Error processing message: {e}")
                traceback.print_exc()
                break

    except WebSocketDisconnect:
        print(f"[WS] Player {player_id} disconnected from match {match_id}")

    except asyncio.TimeoutError:
        print(f"[WS] Auth timeout for match {match_id}")
        try:
            await websocket.close()
        except:
            pass
        return

    except Exception as e:
        print(f"[WS] Error in match {match_id}: {e}")
        traceback.print_exc()

    finally:
        # Cleanup connection
        if player_id and match_id in match_connections:
            if player_id in match_connections[match_id]:
                del match_connections[match_id][player_id]
                print(f"[WS] Removed {player_id} from connections")

            # Set reconnect deadline
            if match_id in match_states and match_states[match_id].get("status") == "active":
                if match_id not in reconnect_deadlines:
                    reconnect_deadlines[match_id] = {}

                reconnect_deadlines[match_id][player_id] = datetime.utcnow() + timedelta(
                    seconds=RECONNECT_TIMEOUT_SECONDS)

                # Notify opponent
                try:
                    await broadcast_to_match(match_id, {
                        "type": "player_disconnected",
                        "player_id": player_id,
                        "reconnect_deadline": reconnect_deadlines[match_id][player_id].isoformat(),
                    })
                except:
                    pass

            # Cleanup empty match connections
            if match_id in match_connections and not match_connections[match_id]:
                del match_connections[match_id]