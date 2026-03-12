from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from typing import Optional, List
import logging
import json
import uuid
import asyncio
from datetime import datetime

from database.session import get_session
from database.models.user import User
from database.models.deck import UserDeck
from database.models.pvp_match import PvPMatch
from sqlalchemy import select, and_, or_
from utils.security import decode_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# In-memory queue for fast matching
matchmaking_queue = {}  # user_id -> {elo, timestamp, ...}


class JoinQueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 300


class MatchResponse(BaseModel):
    status: str
    match_id: Optional[str] = None
    opponent_id: Optional[int] = None
    opponent_name: Optional[str] = None
    opponent_elo: Optional[int] = None
    your_elo: Optional[int] = None


def get_user_id_from_token(authorization: Optional[str]) -> int:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.replace("Bearer ", "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty token")
    try:
        payload = decode_access_token(token)
        return int(payload.get("sub", 0))
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


def calculate_elo_change(winner_elo: int, loser_elo: int, k: int = 32) -> int:
    """Calculate ELO rating change."""
    expected_winner = 1 / (1 + 10 ** ((loser_elo - winner_elo) / 400))
    change = int(k * (1 - expected_winner))
    return max(1, min(change, 50))  # Clamp between 1 and 50


@router.post("/join_queue")
async def join_queue(
        req: JoinQueueRequest,
        authorization: Optional[str] = Header(None)
):
    """Join PvP matchmaking queue."""
    user_id = get_user_id_from_token(authorization)
    max_elo_diff = req.max_elo_diff or 300

    async for session in get_session():
        # Get user
        user = await session.get(User, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        user_elo = user.elo_rating or 1000

        # Check if user has a deck
        deck_result = await session.execute(
            select(UserDeck).where(UserDeck.user_id == user_id)
        )
        deck = deck_result.scalar_one_or_none()
        if not deck:
            raise HTTPException(status_code=400, detail="No deck saved. Select 5 cards first.")

        try:
            cards = json.loads(deck.cards_json) if deck.cards_json else []
            if len(cards) != 5:
                raise HTTPException(status_code=400, detail="Deck must have 5 cards")
        except:
            raise HTTPException(status_code=400, detail="Invalid deck data")

        # Check for existing waiting match
        existing = await session.execute(
            select(PvPMatch).where(
                and_(
                    PvPMatch.player1_id == user_id,
                    PvPMatch.status == "waiting"
                )
            )
        )
        existing_match = existing.scalar_one_or_none()
        if existing_match:
            # Cancel old waiting match
            existing_match.status = "cancelled"
            await session.commit()

        # Try to find opponent in queue
        best_opponent_id = None
        best_elo_diff = float('inf')

        for opp_id, opp_data in list(matchmaking_queue.items()):
            if opp_id == user_id:
                continue

            opp_elo = opp_data.get("elo", 1000)
            elo_diff = abs(user_elo - opp_elo)

            # Check ELO range (use wider range as time passes)
            if elo_diff <= max_elo_diff and elo_diff < best_elo_diff:
                best_opponent_id = opp_id
                best_elo_diff = elo_diff

        if best_opponent_id:
            # Found opponent! Create match
            opponent_data = matchmaking_queue.pop(best_opponent_id, None)
            matchmaking_queue.pop(user_id, None)  # Remove self if in queue

            opponent = await session.get(User, best_opponent_id)
            if not opponent:
                raise HTTPException(status_code=500, detail="Opponent disappeared")

            # Get opponent's deck
            opp_deck_result = await session.execute(
                select(UserDeck).where(UserDeck.user_id == best_opponent_id)
            )
            opp_deck = opp_deck_result.scalar_one_or_none()

            match_id = str(uuid.uuid4())[:16]

            new_match = PvPMatch(
                id=match_id,
                player1_id=best_opponent_id,  # First in queue
                player2_id=user_id,
                player1_deck_json=opp_deck.cards_json if opp_deck else "[]",
                player2_deck_json=deck.cards_json,
                player1_elo=opponent.elo_rating or 1000,
                player2_elo=user_elo,
                status="in_progress"
            )
            session.add(new_match)
            await session.commit()

            return MatchResponse(
                status="matched",
                match_id=match_id,
                opponent_id=best_opponent_id,
                opponent_name=opponent.username or opponent.first_name or f"Player {best_opponent_id}",
                opponent_elo=opponent.elo_rating or 1000,
                your_elo=user_elo
            )

        # No opponent found, add to queue
        matchmaking_queue[user_id] = {
            "elo": user_elo,
            "timestamp": datetime.utcnow().timestamp(),
            "max_elo_diff": max_elo_diff
        }

        return MatchResponse(
            status="searching",
            your_elo=user_elo
        )


@router.post("/leave_queue")
async def leave_queue(authorization: Optional[str] = Header(None)):
    """Leave matchmaking queue."""
    user_id = get_user_id_from_token(authorization)
    matchmaking_queue.pop(user_id, None)
    return {"status": "left"}


@router.get("/queue_status")
async def queue_status(authorization: Optional[str] = Header(None)):
    """Get current queue status."""
    user_id = get_user_id_from_token(authorization)
    in_queue = user_id in matchmaking_queue
    queue_size = len(matchmaking_queue)
    return {
        "in_queue": in_queue,
        "queue_size": queue_size,
        "your_data": matchmaking_queue.get(user_id)
    }