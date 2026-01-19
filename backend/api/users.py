from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt, JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from utils.config import settings
from database.session import get_db
from database.models.user import User

router = APIRouter(prefix="/users", tags=["users"])
bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    cred: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = cred.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
        sub = payload.get("sub")
        if not sub:
            raise HTTPException(401, "invalid token")
        user_id = int(sub)
    except (JWTError, ValueError):
        raise HTTPException(401, "invalid token")

    # Пытаемся взять пользователя из БД
    try:
        res = await db.execute(select(User).where(User.id == user_id))
        user = res.scalar_one_or_none()
    except Exception:
        # База недоступна — создаём временного пользователя в памяти.
        user = User(
            id=user_id,
            username=f"tg_{user_id}",
            first_name=None,
            last_name=None,
        )

    if not user:
        raise HTTPException(401, "user not found")

    return user


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "username": user.username,
        "firstName": user.first_name,
        "lastName": user.last_name,
    }