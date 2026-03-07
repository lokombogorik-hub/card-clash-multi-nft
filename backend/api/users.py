from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os

from database.session import get_db
from database.models.user import User

router = APIRouter(tags=["users"])

JWT_SECRET = os.getenv("JWT_SECRET", "cardclash-secret-key-change-me")
JWT_ALGORITHM = "HS256"


def _decode_token(token_str: str) -> dict:
    """Try PyJWT first (import jwt), fallback to python-jose."""
    # PyJWT
    try:
        import jwt as pyjwt
        return pyjwt.decode(token_str, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        pass

    # python-jose
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
    return {
        "id": current_user.id,
        "username": getattr(current_user, "username", None),
        "first_name": getattr(current_user, "first_name", None),
        "last_name": getattr(current_user, "last_name", None),
        "near_account_id": getattr(current_user, "near_account_id", None),
        "total_matches": getattr(current_user, "total_matches", 0) or 0,
        "wins": getattr(current_user, "wins", 0) or 0,
        "losses": getattr(current_user, "losses", 0) or 0,
        "elo_rating": getattr(current_user, "elo_rating", 1000) or 1000,
        "nfts_count": getattr(current_user, "nfts_count", 0) or 0,
    }