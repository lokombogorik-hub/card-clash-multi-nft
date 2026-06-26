"""ВРЕМЕННЫЕ эндпоинты для нагрузочного теста боя. Выключены, пока не задан
STRESS_TEST_SECRET. На проде после теста просто убери переменную окружения."""
import os
import uuid
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/_stress", tags=["stress"])

SECRET = os.getenv("STRESS_TEST_SECRET", "").strip()


def _check(secret: str):
    if not SECRET or secret != SECRET:
        raise HTTPException(status_code=404, detail="Not found")


class LoginReq(BaseModel):
    secret: str
    user_id: str


@router.post("/login")
async def stress_login(body: LoginReq):
    _check(body.secret)
    from utils.security import create_access_token
    return {"token": create_access_token({"sub": str(body.user_id)})}


class MatchReq(BaseModel):
    secret: str
    p1: str
    p2: str


@router.post("/match")
async def stress_match(body: MatchReq):
    _check(body.secret)
    from routers.matchmaking import active_matches, _save_match_to_db
    mid = "stress_" + uuid.uuid4().hex[:10]
    md = {
        "match_id": mid,
        "player1_id": str(body.p1), "player2_id": str(body.p2),
        "status": "active",
        "player1_deck": [], "player2_deck": [],
        "board": [None] * 9, "board_elements": [],
        "current_turn": None, "player1_hand": [], "player2_hand": [],
        "player1_escrow_confirmed": True, "player2_escrow_confirmed": True,
        "escrow_locked": True, "mode": "bot",
    }
    active_matches[mid] = md
    await _save_match_to_db(md)
    return {"match_id": mid}


class CleanupReq(BaseModel):
    secret: str


@router.post("/cleanup")
async def stress_cleanup(body: CleanupReq):
    _check(body.secret)
    from sqlalchemy import delete
    from database.session import get_session
    from database.models.pvp_match import PvPMatch
    n = 0
    async for session in get_session():
        res = await session.execute(delete(PvPMatch).where(PvPMatch.id.like("stress_%")))
        await session.commit()
        n = res.rowcount or 0
        break
    # подчистим и из памяти
    try:
        from routers.matchmaking import active_matches
        for mid in [k for k in list(active_matches.keys()) if str(k).startswith("stress_")]:
            active_matches.pop(mid, None)
    except Exception:
        pass
    return {"ok": True, "deleted": n}
