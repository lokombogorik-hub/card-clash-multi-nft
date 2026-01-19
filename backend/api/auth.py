import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from database.session import get_db
from database.models.user import User
from tg.webapp import verify_init_data, extract_user
from utils.security import create_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


def _pick(obj: Any, key: str) -> Any:
    """Поддержка extract_user, который может вернуть dict или объект."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _to_int_or_keep(v: Any) -> Any:
    try:
        if isinstance(v, bool):
            return v
        return int(v)
    except Exception:
        return v


@router.post("/telegram")
async def auth_telegram(payload: dict, db: AsyncSession = Depends(get_db)):
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    init_data = payload.get("initData")
    if not init_data:
        raise HTTPException(status_code=400, detail="initData is required")

    # 1) verify + extract (без утечки initData наружу)
    try:
        verified = verify_init_data(init_data)
        tg_user = extract_user(verified)
    except Exception:
        logger.exception("Telegram initData verification/extract failed")
        raise HTTPException(status_code=401, detail="Telegram initData invalid")

    tg_id = _to_int_or_keep(_pick(tg_user, "id"))
    username = _pick(tg_user, "username")
    first_name = _pick(tg_user, "first_name")
    last_name = _pick(tg_user, "last_name")

    if tg_id is None:
        logger.error("extract_user returned user without id: type=%s value=%r",
                     type(tg_user).__name__, tg_user)
        raise HTTPException(status_code=401, detail="Telegram user missing id")

    user: Optional[User] = None

    # 2) Пытаемся upsert в БД, но НЕ валим запрос, если БД недоступна
    try:
        res = await db.execute(select(User).where(User.id == tg_id))
        user = res.scalar_one_or_none()

        if not user:
            user = User(
                id=tg_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        else:
            user.username = username
            user.first_name = first_name
            user.last_name = last_name
            await db.commit()

    except IntegrityError:
        logger.exception("DB integrity error in auth_telegram (likely constraint)")
        if user is None:
            user = User(
                id=tg_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
            )
    except SQLAlchemyError:
        logger.exception("DB SQLAlchemyError in auth_telegram (fallback to stateless)")
        if user is None:
            user = User(
                id=tg_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
            )
    except Exception:
        logger.exception("Unexpected error in auth_telegram (fallback to stateless)")
        if user is None:
            user = User(
                id=tg_id,
                username=username,
                first_name=first_name,
                last_name=last_name,
            )

    if user is None:
        raise HTTPException(status_code=500, detail="Unable to create user")

    # 3) JWT под все варианты фронта
    token = create_access_token(sub=str(user.id))
    return {
        "accessToken": token,
        "access_token": token,
        "token": token,
    }