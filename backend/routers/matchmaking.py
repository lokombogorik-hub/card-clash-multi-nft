# backend/routers/matchmaking.py
from fastapi import APIRouter, Depends, HTTPException, status, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import uuid

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory storage
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}


class JoinQueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 300


class QueueResponse(BaseModel):
    status: str
    position: Optional[int] = None
    match_id: Optional[str] = None
    opponent_id: Optional[str] = None
    message: Optional[str] = None


def get_user_id_from_token(authorization: str = None) -> str:
    """Extract user ID from JWT token"""
    if not authorization:
        return None

    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            return str(payload.get("sub") or payload.get("user_id") or payload.get("telegram_id"))
    except Exception as e:
        print(f"[Matchmaking] Token decode error: {e}")

    return None


def calculate_elo_range(wait_time_seconds: float, max_diff: int = 300) -> int:
    """ELO range based on wait time"""
    base = max_diff
    if wait_time_seconds < 10:
        return base
    elif wait_time_seconds < 30:
        return base + 100
    elif wait_time_seconds < 60:
        return base + 200
    else:
        return 500


def find_opponent(user_id: str, user_elo: int, max_elo_diff: int) -> Optional[str]:
    """Find matching opponent in queue"""
    now = datetime.utcnow()

    for queue_user_id, queue_data in list(matchmaking_queue.items()):
        if queue_user_id == user_id:
            continue

        # Check if already matched
        if queue_data.get("match_id"):
            continue

        wait_time = (now - queue_data.get("joined_at", now)).total_seconds()
        opponent_elo = queue_data.get("elo", 1000)

        elo_range = calculate_elo_range(wait_time, max_elo_diff)

        if abs(user_elo - opponent_elo) <= elo_range:
            return queue_user_id

    return None


def get_user_deck(user_id: str) -> List[Dict]:
    """Get user's deck from storage"""
    from routers.decks import _decks_storage

    # Try user-specific deck first
    deck = _decks_storage.get(user_id, {}).get("full_cards", [])
    if deck:
        return deck

    # Fallback to default_user
    deck = _decks_storage.get("default_user", {}).get("full_cards", [])
    return deck


@router.post("/join_queue")
async def join_queue(
        request: JoinQueueRequest,
        authorization: str = Header(None)
):
    """Join matchmaking queue - called by frontend"""

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

    user_elo = 1000  # TODO: get from user profile
    max_elo_diff = request.max_elo_diff or 300

    # Check if user already in queue and has a match
    if user_id in matchmaking_queue:
        queue_entry = matchmaking_queue[user_id]
        if queue_entry.get("match_id"):
            match_id = queue_entry["match_id"]
            match_data = active_matches.get(match_id)
            if match_data:
                # Remove from queue
                del matchmaking_queue[user_id]

                opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data[
                    "player1_id"]

                return {
                    "status": "matched",
                    "match_id": match_id,
                    "opponent_id": opponent_id,
                    "message": "Match found!"
                }

        # Update last poll time
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

    # Try to find opponent
    opponent_id = find_opponent(user_id, user_elo, max_elo_diff)

    if opponent_id and opponent_id in matchmaking_queue:
        # Found a match!
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

        # Notify opponent (set match_id in their queue entry)
        matchmaking_queue[opponent_id]["match_id"] = match_id

        # Remove current user from queue
        if user_id in matchmaking_queue:
            del matchmaking_queue[user_id]

        print(f"[Matchmaking] Match created: {match_id} | {user_id} vs {opponent_id}")

        return {
            "status": "matched",
            "match_id": match_id,
            "opponent_id": opponent_id,
            "message": "Match found!"
        }

    # No opponent found - add/update in queue
    if user_id not in matchmaking_queue:
        matchmaking_queue[user_id] = {
            "user_id": user_id,
            "elo": user_elo,
            "deck": user_deck,
            "joined_at": datetime.utcnow(),
            "last_poll": datetime.utcnow(),
            "match_id": None
        }
        print(f"[Matchmaking] User {user_id} joined queue. Queue size: {len(matchmaking_queue)}")
    else:
        matchmaking_queue[user_id]["last_poll"] = datetime.utcnow()

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
    if not user_id:
        return {"success": True, "message": "Not in queue"}

    if user_id in matchmaking_queue:
        del matchmaking_queue[user_id]
        print(f"[Matchmaking] User {user_id} left queue. Queue size: {len(matchmaking_queue)}")

    return {"success": True, "message": "Left queue"}


@router.get("/queue_status")
async def get_queue_status(authorization: str = Header(None)):
    """Check current queue status"""

    user_id = get_user_id_from_token(authorization)
    if not user_id:
        return {"status": "not_authenticated"}

    if user_id not in matchmaking_queue:
        return {"status": "not_in_queue"}

    queue_entry = matchmaking_queue[user_id]

    if queue_entry.get("match_id"):
        match_id = queue_entry["match_id"]
        match_data = active_matches.get(match_id)
        if match_data:
            opponent_id = match_data["player2_id"] if match_data["player1_id"] == user_id else match_data["player1_id"]
            return {
                "status": "matched",
                "match_id": match_id,
                "opponent_id": opponent_id
            }

    position = list(matchmaking_queue.keys()).index(user_id) + 1
    return {
        "status": "searching",
        "position": position,
        "queue_size": len(matchmaking_queue)
    }


# Keep old endpoints for compatibility
@router.post("/join")
async def join_queue_legacy(request: JoinQueueRequest = None):
    """Legacy endpoint"""
    return {
        "status": "waiting",
        "position": len(matchmaking_queue) + 1,
        "message": "Use /join_queue with authorization"
    }


@router.post("/leave")
async def leave_queue_legacy():
    """Legacy endpoint"""
    return {"success": True, "message": "Left queue"}


@router.get("/status")
async def get_status_legacy():
    """Legacy endpoint"""
    return {"status": "not_in_queue"}


@router.get("/queue-info")
async def get_queue_info():
    """Debug endpoint - queue info"""
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
        "users_in_queue": list(matchmaking_queue.keys())
    }