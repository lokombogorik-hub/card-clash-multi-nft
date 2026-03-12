# backend/routers/matchmaking.py
from fastapi import APIRouter, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory storage
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}


class JoinQueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 300


def get_user_id_from_token(authorization: str = None) -> str:
    """Extract user ID from JWT token"""
    if not authorization:
        return None

    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            if user_id:
                return str(user_id)
    except Exception as e:
        print(f"[Matchmaking] Token decode error: {e}")

    return None


def get_user_deck(user_id: str) -> List[Dict]:
    """Get user's deck from storage"""
    from routers.decks import _decks_storage

    print(f"[Matchmaking] Looking for deck, user_id={user_id}")
    print(f"[Matchmaking] Available decks: {list(_decks_storage.keys())}")

    # Try user-specific deck first
    deck = _decks_storage.get(user_id, {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Found deck for {user_id}: {len(deck)} cards")
        return deck

    # Fallback to default_user
    deck = _decks_storage.get("default_user", {}).get("full_cards", [])
    if deck and len(deck) == 5:
        print(f"[Matchmaking] Using default_user deck: {len(deck)} cards")
        return deck

    print(f"[Matchmaking] No deck found for {user_id}")
    return []


def calculate_elo_range(wait_time_seconds: float, max_diff: int = 300) -> int:
    """ELO range based on wait time"""
    if wait_time_seconds < 10:
        return max_diff
    elif wait_time_seconds < 30:
        return max_diff + 100
    elif wait_time_seconds < 60:
        return max_diff + 200
    return 500


def find_opponent(user_id: str, user_elo: int, max_elo_diff: int) -> Optional[str]:
    """Find matching opponent in queue"""
    now = datetime.utcnow()

    for queue_user_id, queue_data in list(matchmaking_queue.items()):
        if queue_user_id == user_id:
            continue
        if queue_data.get("match_id"):
            continue

        wait_time = (now - queue_data.get("joined_at", now)).total_seconds()
        opponent_elo = queue_data.get("elo", 1000)

        elo_range = calculate_elo_range(wait_time, max_elo_diff)

        if abs(user_elo - opponent_elo) <= elo_range:
            return queue_user_id

    return None


@router.post("/join_queue")
async def join_queue(
        request: JoinQueueRequest,
        authorization: str = Header(None)
):
    """Join matchmaking queue"""

    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization required"
        )

    # Check if user has a deck
    user_deck = get_user_deck(user_id)
    if not user_deck or len(user_deck) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No deck saved. Select 5 cards first."
        )

    user_elo = 1000
    max_elo_diff = request.max_elo_diff or 300

    # Check if user already in queue with a match
    if user_id in matchmaking_queue:
        queue_entry = matchmaking_queue[user_id]
        if queue_entry.get("match_id"):
            match_id = queue_entry["match_id"]
            match_data = active_matches.get(match_id)
            if match_data:
                del matchmaking_queue[user_id]
                opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data[
                    "player1_id"]
                return {
                    "status": "matched",
                    "match_id": match_id,
                    "opponent_id": opponent_id,
                    "message": "Match found!"
                }
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

    # Try to find opponent
    opponent_id = find_opponent(user_id, user_elo, max_elo_diff)

    if opponent_id and opponent_id in matchmaking_queue:
        match_id = str(uuid.uuid4())
        now = datetime.utcnow()

        opponent_deck = get_user_deck(opponent_id)

        match_data = {
            "match_id": match_id,
            "player1_id": user_id,
            "player2_id": opponent_id,
            "player1_deck": user_deck,
            "player2_deck": opponent_deck,
            "status": "active",
            "created_at": now.isoformat(),
            "current_round": 0,
            "player1_score": 0,
            "player2_score": 0,
        }

        active_matches[match_id] = match_data
        matchmaking_queue[opponent_id]["match_id"] = match_id

        if user_id in matchmaking_queue:
            del matchmaking_queue[user_id]

        print(f"[Matchmaking] Match created: {match_id} | {user_id} vs {opponent_id}")

        return {
            "status": "matched",
            "match_id": match_id,
            "opponent_id": opponent_id,
            "message": "Match found!"
        }

    # Add to queue
    if user_id not in matchmaking_queue:
        matchmaking_queue[user_id] = {
            "user_id": user_id,
            "elo": user_elo,
            "deck": user_deck,
            "joined_at": datetime.utcnow(),
            "last_poll": datetime.utcnow(),
            "match_id": None
        }
        print(f"[Matchmaking] User {user_id} joined queue. Size: {len(matchmaking_queue)}")

    position = list(matchmaking_queue.keys()).index(user_id) + 1

    return {
        "status": "searching",
        "position": position,
        "queue_size": len(matchmaking_queue),
        "message": f"Searching... ({len(matchmaking_queue)} in queue)"
    }


@router.post("/leave_queue")
async def leave_queue(authorization: str = Header(None)):
    """Leave matchmaking queue"""

    user_id = get_user_id_from_token(authorization)
    if user_id and user_id in matchmaking_queue:
        del matchmaking_queue[user_id]
        print(f"[Matchmaking] User {user_id} left queue")

    return {"success": True, "message": "Left queue"}


@router.get("/queue_status")
async def get_queue_status(authorization: str = Header(None)):
    """Check queue status"""

    user_id = get_user_id_from_token(authorization)
    if not user_id or user_id not in matchmaking_queue:
        return {"status": "not_in_queue"}

    queue_entry = matchmaking_queue[user_id]

    if queue_entry.get("match_id"):
        match_id = queue_entry["match_id"]
        match_data = active_matches.get(match_id)
        if match_data:
            opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]
            return {"status": "matched", "match_id": match_id, "opponent_id": opponent_id}

    return {"status": "searching", "queue_size": len(matchmaking_queue)}


@router.get("/queue-info")
async def get_queue_info():
    """Debug endpoint"""
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
        "users_in_queue": list(matchmaking_queue.keys())
    }