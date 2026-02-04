from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional
import time

from database.session import get_db
from database.models.user import User
from api.users import get_current_user

router = APIRouter(prefix="/api/matchmaking", tags=["matchmaking"])

# in-memory очередь (на Railway будет сбрасываться при рестарте/масштабировании — ок для демо)
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
    db: AsyncSession = Depends(get_db),
):
    # если уже в очереди — перезаписываем
    if current_user.id in matchmaking_queue:
        del matchmaking_queue[current_user.id]

    user_elo = int(getattr(current_user, "elo_rating", 1000) or 1000)
    best_match_user_id = None
    min_diff = int(request.max_elo_diff or 200)

    # ищем ближайшего по elo
    for user_id, data in list(matchmaking_queue.items()):
        elo_diff = abs(int(data.get("elo", 0)) - user_elo)
        if elo_diff <= min_diff:
            min_diff = elo_diff
            best_match_user_id = user_id

    if best_match_user_id is not None:
        opponent_id = best_match_user_id
        # убираем оппонента из очереди
        matchmaking_queue.pop(opponent_id, None)

        opponent = await db.get(User, opponent_id)

        # оппонент мог быть удалён/не найден — тогда просто ставим пользователя в очередь
        if opponent is None:
            matchmaking_queue[current_user.id] = {"elo": user_elo, "timestamp": time.time()}
            return {"status": "waiting", "queue_size": len(matchmaking_queue)}

        match_id = f"match_{current_user.id}_{opponent_id}_{int(time.time())}"

        return MatchFound(
            opponent_id=int(opponent.id),
            opponent_username=(opponent.username or "Player"),
            opponent_elo=int(getattr(opponent, "elo_rating", 1000) or 1000),
            match_id=match_id,
        )

    # не нашли — добавляем в очередь
    matchmaking_queue[current_user.id] = {"elo": user_elo, "timestamp": time.time()}
    return {"status": "waiting", "queue_size": len(matchmaking_queue)}


@router.post("/leave_queue")
async def leave_queue(current_user: User = Depends(get_current_user)):
    matchmaking_queue.pop(current_user.id, None)
    return {"status": "left"}


@router.get("/queue_status")
async def queue_status(current_user: User = Depends(get_current_user)):
    return {
        "in_queue": current_user.id in matchmaking_queue,
        "queue_size": len(matchmaking_queue),
        "your_elo": int(getattr(current_user, "elo_rating", 1000) or 1000),
    }