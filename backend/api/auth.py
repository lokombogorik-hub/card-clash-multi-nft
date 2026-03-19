from __future__ import annotations

import logging
from fastapi import APIRouter, HTTPException, Body

from database.session import get_session
from database.models.user import User

from tg.webapp import verify_init_data, extract_user
from utils.security import create_access_token
from utils.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


@router.post("/auth/telegram")
async def auth_telegram(payload: dict = Body(...)):
    init_data = (payload.get("initData") or "").strip()

    if not init_data:
        logger.warning("auth_telegram: initData empty")
        raise HTTPException(status_code=401, detail="Telegram initData is empty (open via Telegram WebApp)")

    logger.info("auth_telegram: initData len=%d bot_token_set=%s", len(init_data), bool(settings.TELEGRAM_BOT_TOKEN))

    try:
        verify_init_data(init_data)
        tg_user = extract_user(init_data)
        if not isinstance(tg_user, dict):
            raise ValueError("extract_user returned non-dict")
    except Exception as e:
        logger.warning("auth_telegram: verify/extract failed: %s", str(e))
        raise HTTPException(status_code=401, detail=f"Invalid Telegram initData: {e}")

    tg_id = tg_user.get("id")
    if not tg_id:
        raise HTTPException(status_code=401, detail="Telegram user id missing")

    username = tg_user.get("username")
    first_name = tg_user.get("first_name")
    last_name = tg_user.get("last_name")
    photo_url = tg_user.get("photo_url")

    try:
        async for session in get_session():
            db_user = await session.get(User, int(tg_id))
            if db_user is None:
                db_user = User(
                    id=int(tg_id),
                    username=username,
                    first_name=first_name,
                    last_name=last_name,
                    photo_url=photo_url,
                )
                session.add(db_user)
            else:
                db_user.username = username
                db_user.first_name = first_name
                db_user.last_name = last_name
                db_user.photo_url = photo_url

            await session.commit()
            break
    except Exception:
        logger.exception("auth_telegram: DB write failed (continuing)")

    token = create_access_token({"sub": str(tg_id)})

    return {"accessToken": token, "access_token": token, "token": token}