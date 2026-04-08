# backend/routers/user.py

from fastapi import APIRouter, HTTPException, Header
from typing import Optional
import logging

from database.session import get_session
from database.models.user import User
from utils.rating import get_rank_by_rating, get_progress_to_next_rank, RANKS
from utils.security import decode_access_token

logger = logging.getLogger(__name__)
router = APIRouter(tags=["user"])


def get_user_id_from_token(authorization: str = None) -> Optional[str]:
    if not authorization:
        return None
    try:
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            user_id = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            if user_id:
                return str(user_id)
    except Exception as e:
        logger.warning(f"Token decode error: {e}")
    return None


@router.get("/api/users/me")
async def get_current_user(authorization: str = Header(None)):
    """Получить данные текущего пользователя с рейтингом"""

    user_id = get_user_id_from_token(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authorization required")

    try:
        async for session in get_session():
            user = await session.get(User, int(user_id))

            if not user:
                raise HTTPException(status_code=404, detail="User not found")

            rating = user.elo_rating or 0
            rank_info = get_rank_by_rating(rating)
            progress = get_progress_to_next_rank(rating)

            total_pvp = (user.pvp_wins or 0) + (user.pvp_losses or 0)
            win_rate = round((user.pvp_wins or 0) / total_pvp * 100) if total_pvp > 0 else 0

            return {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "photo_url": user.photo_url,
                "near_account_id": user.near_account_id,

                # Rating
                "elo_rating": rating,
                "rank": rank_info["name"],
                "rank_icon": rank_info["icon"],
                "rank_min": rank_info["min"],
                "rank_max": rank_info["max"],

                # Progress
                "progress_to_next": progress["progress_percent"],
                "points_to_next": progress["points_to_next"],
                "next_rank": progress["next_rank"]["name"] if progress["next_rank"] else None,

                # Stats
                "total_matches": user.total_matches or 0,
                "wins": user.wins or 0,
                "losses": user.losses or 0,
                "pvp_wins": user.pvp_wins or 0,
                "pvp_losses": user.pvp_losses or 0,
                "win_rate": win_rate,
                "nfts_count": user.nfts_count or 0,

                "all_ranks": RANKS,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Get user error")
        raise HTTPException(status_code=500, detail=str(e))