# backend/routers/matchmaking.py
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
import uuid

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory storage
matchmaking_queue: Dict[str, Dict[str, Any]] = {}
active_matches: Dict[str, Dict[str, Any]] = {}


class JoinQueueRequest(BaseModel):
    mode: str = "pvp"


class QueueResponse(BaseModel):
    status: str
    position: Optional[int] = None
    match_id: Optional[str] = None
    opponent: Optional[Dict[str, Any]] = None
    message: Optional[str] = None


class MatchData(BaseModel):
    match_id: str
    player1_id: str
    player2_id: str
    player1_deck: List[Dict[str, Any]]
    player2_deck: List[Dict[str, Any]]
    status: str
    created_at: str


def calculate_elo_range(wait_time_seconds: float) -> int:
    """ELO range based on wait time"""
    if wait_time_seconds < 10:
        return 100
    elif wait_time_seconds < 30:
        return 200
    elif wait_time_seconds < 60:
        return 300
    else:
        return 500


def find_match(user_id: str, user_elo: int) -> Optional[str]:
    """Find matching opponent"""
    now = datetime.utcnow()

    for queue_user_id, queue_data in matchmaking_queue.items():
        if queue_user_id == user_id:
            continue

        user_wait = (now - queue_data.get("joined_at", now)).total_seconds()
        opponent_elo = queue_data.get("elo", 1000)

        elo_range = calculate_elo_range(user_wait)

        if abs(user_elo - opponent_elo) <= elo_range:
            return queue_user_id

    return None


@router.post("/join", response_model=QueueResponse)
async def join_queue(request: JoinQueueRequest):
    """Join matchmaking queue"""

    # For now, use a simple user ID
    user_id = f"user_{datetime.utcnow().timestamp()}"
    user_elo = 1000

    # Check if already in queue
    for uid in list(matchmaking_queue.keys()):
        if matchmaking_queue[uid].get("match_id"):
            match_id = matchmaking_queue[uid]["match_id"]
            del matchmaking_queue[uid]

            match_data = active_matches.get(match_id)
            if match_data:
                return QueueResponse(
                    status="matched",
                    match_id=match_id,
                    message="Match found!"
                )

    # Try to find a match
    opponent_id = find_match(user_id, user_elo)

    if opponent_id and opponent_id in matchmaking_queue:
        match_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # Get opponent deck from storage
        from routers.decks import _decks_storage
        opponent_deck = _decks_storage.get("default_user", {}).get("full_cards", [])
        player_deck = _decks_storage.get("default_user", {}).get("full_cards", [])

        match_data = {
            "match_id": match_id,
            "player1_id": user_id,
            "player2_id": opponent_id,
            "player1_deck": player_deck,
            "player2_deck": opponent_deck,
            "status": "active",
            "created_at": now.isoformat(),
            "current_round": 0,
            "player1_score": 0,
            "player2_score": 0,
        }

        active_matches[match_id] = match_data

        # Notify opponent
        matchmaking_queue[opponent_id]["match_id"] = match_id

        if opponent_id in matchmaking_queue:
            del matchmaking_queue[opponent_id]

        return QueueResponse(
            status="matched",
            match_id=match_id,
            message="Match found!"
        )

    # Add to queue
    matchmaking_queue[user_id] = {
        "user_id": user_id,
        "elo": user_elo,
        "joined_at": datetime.utcnow(),
        "mode": request.mode,
        "match_id": None
    }

    return QueueResponse(
        status="waiting",
        position=len(matchmaking_queue),
        message=f"Searching for opponent... ({len(matchmaking_queue)} in queue)"
    )


@router.get("/status", response_model=QueueResponse)
async def get_queue_status():
    """Check queue status"""
    return QueueResponse(
        status="not_in_queue",
        message="Not in matchmaking queue"
    )


@router.post("/leave")
async def leave_queue():
    """Leave queue"""
    return {"success": True, "message": "Left queue"}


@router.get("/queue-info")
async def get_queue_info():
    """Debug endpoint"""
    return {
        "queue_size": len(matchmaking_queue),
        "active_matches": len(active_matches),
    }