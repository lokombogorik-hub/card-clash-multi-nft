import logging
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from database.models.user import User
from utils.config import settings

log = logging.getLogger(__name__)

router = APIRouter(tags=["users"])
bearer = HTTPBearer(auto_error=False)


def _decode_jwt(token: str) -> dict:
    if not settings.JWT_SECRET:
        raise HTTPException(status_code=500, detail="JWT_SECRET is not set")

    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid token")


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> User:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = _decode_jwt(creds.credentials)
    sub = payload.get("sub")
    if not sub:
        raise HTTPException(status_code=401, detail="invalid token")

    # Важно: tg_id может быть большим, но у нас User.id int.
    # Для Stage1 используем tg_id как id.
    try:
        user_id = int(sub)
    except Exception:
        raise HTTPException(status_code=401, detail="invalid token")

    # DB может быть недоступна — делаем in-memory fallback
    try:
        # если у вас есть реальная БД модель/сессия — можно тут доставать пользователя
        # но сейчас stage1 достаточно in-memory
        return User(id=user_id, username=f"tg_{user_id}")
    except Exception as e:
        log.warning("DB user lookup failed (fallback). err=%s", e)
        return User(id=user_id, username=f"tg_{user_id}")


@router.get("/users/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": getattr(user, "username", None),
    }