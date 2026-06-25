"""Простой онлайн-счётчик (in-memory). Игрок «онлайн», если пинговал за
последние WINDOW секунд. Работает на одном инстансе Railway."""
from fastapi import APIRouter, Header
from typing import Optional
import time

router = APIRouter(prefix="/api", tags=["presence"])

WINDOW = 60  # секунд: считаем онлайн, если пинг был за это время
_seen = {}   # uid -> last_ts


def _uid(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    try:
        from utils.security import decode_access_token
        token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        payload = decode_access_token(token)
        if payload:
            uid = payload.get("sub") or payload.get("user_id") or payload.get("telegram_id")
            return str(uid) if uid else None
    except Exception:
        pass
    return None


def _online_count(now: Optional[float] = None) -> int:
    now = now or time.time()
    return sum(1 for v in _seen.values() if now - v <= WINDOW)


@router.post("/presence/ping")
async def presence_ping(authorization: Optional[str] = Header(None)):
    now = time.time()
    uid = _uid(authorization)
    if uid:
        _seen[uid] = now
    # лёгкая чистка, чтобы словарь не рос
    if len(_seen) > 5000:
        for k, v in list(_seen.items()):
            if now - v > WINDOW:
                _seen.pop(k, None)
    return {"online": _online_count(now)}


@router.get("/online")
async def online():
    return {"online": _online_count()}
