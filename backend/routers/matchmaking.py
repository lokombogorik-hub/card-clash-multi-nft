from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from backend.database.session import get_db
from backend.database.models.user import User
from backend.api.users import get_current_user
from pydantic import BaseModel
from typing import Optional
import time

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

matchmaking_queue = {}


class QueueRequest(BaseModel):
    max_elo_diff: Optional[int] = 200


class MatchFound(BaseModel):
    opponent_id: int
    opponent_username: str
    opponent_elo: int
    match_id: str


@router.post("/join_queue")
async def join_queue(
        request: QueueRequest,
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db)
):
    if current_user.id in matchmaking_queue:
        del matchmaking_queue[current_user.id]

    user_elo = current_user.elo_rating
    best_match = None
    min_diff = request.max_elo_diff

    for user_id, data in matchmaking_queue.items():
        elo_diff = abs(data["elo"] - user_elo)
        if elo_diff <= min_diff:
            min_diff = elo_diff
            best_match = user_id

    if best_match:
        opponent_id = best_match
        del matchmaking_queue[opponent_id]
        opponent = await db.get(User, opponent_id)
        match_id = f"match_{current_user.id}_{opponent_id}_{int(time.time())}"
        return MatchFound(
            opponent_id=opponent.id,
            opponent_username=opponent.username or "Player",
            opponent_elo=opponent.elo_rating,
            match_id=match_id
        )
    else:
        matchmaking_queue[current_user.id] = {
            "elo": user_elo,
            "timestamp": time.time()
        }
        return {"status": "waiting", "queue_size": len(matchmaking_queue)}


@router.post("/leave_queue")
async def leave_queue(current_user: User = Depends(get_current_user)):
    if current_user.id in matchmaking_queue:
        del matchmaking_queue[current_user.id]
    return {"status": "left"}


@router.get("/queue_status")
async def queue_status(current_user: User = Depends(get_current_user)):
    return {
        "in_queue": current_user.id in matchmaking_queue,
        "queue_size": len(matchmaking_queue),
        "your_elo": current_user.elo_rating
    }