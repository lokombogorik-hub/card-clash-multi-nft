import hashlib
import logging
import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tg.webapp import verify_init_data, extract_user
from utils.security import create_access_token

log = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


class TelegramAuthIn(BaseModel):
    initData: str


def _sha256(s: str) -> str:
    return hashlib.sha256((s or "").encode("utf-8")).hexdigest()


def _bot_token_fingerprint() -> Dict[str, Any]:
    tok = os.getenv("BOT_TOKEN", "") or ""
    return {
        "bot_token_len": len(tok),
        "bot_token_sha256": _sha256(tok) if tok else "",
        "bot_token_suffix": tok[-6:] if len(tok) >= 6 else tok,
    }


def _debug_enabled() -> bool:
    v = (os.getenv("AUTH_DEBUG", "") or "").lower().strip()
    return v in ("1", "true", "yes", "on")


@router.get("/auth/debug")
async def auth_debug():
    """
    Включать только временно через AUTH_DEBUG=1.
    Никаких секретов не возвращаем, только fingerprints.
    """
    if not _debug_enabled():
        raise HTTPException(status_code=404, detail="Not found")

    return {
        "ok": True,
        "auth_debug": True,
        "bot": _bot_token_fingerprint(),
        "env": {
            "has_bot_token": bool(os.getenv("BOT_TOKEN")),
            "jwt_alg": os.getenv("JWT_ALG", ""),
        },
    }


@router.post("/auth/telegram")
async def auth_telegram(payload: TelegramAuthIn):
    init_data = payload.initData or ""
    if not init_data:
        raise HTTPException(status_code=400, detail="initData is empty")

    bot_fp = _bot_token_fingerprint()

    try:
        verify_init_data(init_data)  # uses BOT_TOKEN inside tg.webapp
    except Exception as e:
        # DIAG (safe)
        if _debug_enabled():
            log.warning(
                "Telegram initData invalid. err=%s init_len=%s init_sha=%s bot=%s",
                str(e),
                len(init_data),
                _sha256(init_data),
                bot_fp,
            )
        raise HTTPException(status_code=401, detail="Telegram initData invalid")

    user = extract_user(init_data) or {}
    tg_id = user.get("id")
    if not tg_id:
        raise HTTPException(status_code=401, detail="Telegram user not found in initData")

    token = create_access_token({"sub": str(tg_id)})

    # фронт ожидает любой из ключей
    return {"accessToken": token, "access_token": token, "token": token}