from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from database.session import get_db
from database.models.user import User
from utils.rating import get_rank_by_rating, get_progress_to_next_rank, RANKS

router = APIRouter(tags=["users"])

JWT_SECRET = os.getenv("JWT_SECRET", "cardclash-secret-key-change-me")
JWT_ALGORITHM = "HS256"


def _decode_token(token_str: str) -> dict:
    try:
        import jwt as pyjwt
        return pyjwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        pass
    try:
        from jose import jwt as jose_jwt
        return jose_jwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        pass
    raise HTTPException(401, "Invalid token (decode failed)")


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, "Missing token")

    token = auth[7:]
    payload = _decode_token(token)

    user_id = payload.get("user_id") or payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token payload")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(404, "User not found")

    return user


@router.get("/users/me")
async def get_me(current_user: User = Depends(get_current_user)):
    rating = getattr(current_user, "elo_rating", 1000) or 1000
    pvp_wins = getattr(current_user, "pvp_wins", 0) or 0
    pvp_losses = getattr(current_user, "pvp_losses", 0) or 0
    wins = getattr(current_user, "wins", 0) or 0
    losses = getattr(current_user, "losses", 0) or 0
    total_matches = getattr(current_user, "total_matches", 0) or 0
    nfts_count = getattr(current_user, "nfts_count", 0) or 0

    rank_info = get_rank_by_rating(rating)
    progress = get_progress_to_next_rank(rating)

    total_pvp = pvp_wins + pvp_losses
    win_rate = round(pvp_wins / total_pvp * 100) if total_pvp > 0 else 0

    return {
        "id": current_user.id,
        "username": getattr(current_user, "username", None),
        "first_name": getattr(current_user, "first_name", None),
        "last_name": getattr(current_user, "last_name", None),
        "photo_url": getattr(current_user, "photo_url", None),
        "near_account_id": getattr(current_user, "near_account_id", None),

        # Rating
        "elo_rating": rating,
        "rank": rank_info["name"],
        "rank_icon": rank_info["icon"],
        "rank_min": rank_info["min"],
        "rank_max": rank_info["max"],

        # Progress bar
        "progress_to_next": progress["progress_percent"],
        "points_to_next": progress["points_to_next"],
        "next_rank": progress["next_rank"]["name"] if progress["next_rank"] else None,

        # Stats
        "total_matches": total_matches,
        "wins": wins,
        "losses": losses,
        "pvp_wins": pvp_wins,
        "pvp_losses": pvp_losses,
        "win_rate": win_rate,
        "nfts_count": nfts_count,

        # All ranks for UI
        "all_ranks": RANKS,
    }