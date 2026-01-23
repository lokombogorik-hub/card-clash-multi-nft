from __future__ import annotations

import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jose import jwt, JWTError

from utils.config import settings
from database.session import get_session
from database.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])
bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Missing Bearer token")

    token = creds.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="Invalid token: sub missing")

    tg_id = int(sub)

    try:
        async for session in get_session():
            u = await session.get(User, tg_id)
            if u is None:
                u = User(id=tg_id, username=f"tg_{tg_id}")
                session.add(u)
                await session.commit()
            return u
    except Exception:
        logger.exception("DB error in get_current_user, falling back to in-memory user")

    return User(id=tg_id, username=f"tg_{tg_id}")


@router.get("/users/me")
async def users_me(user: User = Depends(get_current_user)):
    return {
        "id": int(user.id),
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "photo_url": user.photo_url,
        "near_account_id": user.near_account_id,
    }