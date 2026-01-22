import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tg.webapp import verify_init_data, extract_user
from utils.security import create_access_token

log = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


class TelegramAuthIn(BaseModel):
    initData: str


@router.post("/auth/telegram")
async def auth_telegram(payload: TelegramAuthIn):
    init_data = (payload.initData or "").strip()
    if not init_data:
        raise HTTPException(status_code=400, detail="initData is empty")

    try:
        verified = verify_init_data(init_data)  # returns dict
        user = extract_user(verified)  # TgWebAppUser dataclass
    except Exception as e:
        # важно: не 500, а 401
        log.warning("Telegram initData invalid: %s", str(e))
        raise HTTPException(status_code=401, detail="Telegram initData invalid")

    tg_id = getattr(user, "id", None)
    if not tg_id:
        raise HTTPException(status_code=401, detail="Telegram user not found in initData")

    token = create_access_token({"sub": str(tg_id)})

    return {"accessToken": token, "access_token": token, "token": token}