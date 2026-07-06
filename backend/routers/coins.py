"""ClashCoin — внутриигровая монета. Начисления/списания, баланс, буст ×2.
Суммы меняю тут, сверху."""
import os
from datetime import datetime, timedelta
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel
from database.session import get_session
from database.models.user import User

router = APIRouter(prefix="/api/coins", tags=["coins"])

# --- сколько начисляем (меняю здесь) ---
WIN_REWARD = 2
WIN_DAILY_CAP = 20
CASE_OPEN_REWARD = 5
TOURNAMENT_WIN_REWARD = 200
FRIEND_REWARD = 50
BOOST_PRICE_NEAR = 1.0
BOOST_HOURS = 24

TREASURY = os.getenv("TREASURY_WALLET", "retardo-s.near")

# Очередь всплывашек для наград, начисленных в фоне (турнир, неделя):
# копим по user_id, отдаём и чистим при следующем опросе /api/coins/me.
# Хватает на один процесс (Railway hobby) — этого достаточно на текущем масштабе.
_pending = {}


def queue_notify(user_id, amount, reason):
    if not user_id or amount <= 0:
        return
    _pending.setdefault(str(user_id), []).append({"amount": int(amount), "reason": reason})


def _uid(authorization):
    if not authorization:
        return None
    try:
        from utils.security import decode_access_token
        t = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
        p = decode_access_token(t)
        if p:
            return str(p.get("sub") or p.get("user_id") or p.get("telegram_id") or "")
    except Exception:
        pass
    return None


def boost_active(u):
    return bool(u and u.boost_until and u.boost_until > datetime.utcnow())


def boost_mult(u):
    return 2 if boost_active(u) else 1


async def add_coins(user_id, amount, capped=False, notify_reason=None):
    """Начислить монеты (с учётом ×2 буста). capped=True -> дневной потолок (победы).
    notify_reason -> положить всплывашку в очередь (для фоновых наград).
    Возвращает реально начисленную сумму."""
    if not user_id or amount <= 0:
        return 0
    awarded = 0
    try:
        async for session in get_session():
            u = await session.get(User, int(user_id))
            if not u:
                break
            mult = boost_mult(u)
            amt = amount * mult
            if capped:
                today = datetime.utcnow().strftime("%Y-%m-%d")
                if u.coins_day != today:
                    u.coins_day = today
                    u.coins_today = 0
                room = (WIN_DAILY_CAP * mult) - (u.coins_today or 0)
                if room <= 0:
                    break
                amt = min(amt, room)
                u.coins_today = (u.coins_today or 0) + amt
            u.clash_balance = (u.clash_balance or 0) + amt
            awarded = amt
            await session.commit()
            break
    except Exception as e:
        print(f"[coins] add error: {e}")
    if awarded > 0 and notify_reason:
        queue_notify(user_id, awarded, notify_reason)
    return awarded


async def spend_coins(user_id, amount) -> bool:
    if amount <= 0:
        return True
    try:
        async for session in get_session():
            u = await session.get(User, int(user_id))
            if not u or (u.clash_balance or 0) < amount:
                return False
            u.clash_balance = (u.clash_balance or 0) - int(amount)
            await session.commit()
            return True
    except Exception as e:
        print(f"[coins] spend error: {e}")
    return False


async def _me(user_id):
    if not user_id:
        return None
    try:
        async for session in get_session():
            return await session.get(User, int(user_id))
    except Exception:
        return None
    return None


@router.get("/me")
async def my_coins(authorization: str = Header(None)):
    uid = _uid(authorization)
    u = await _me(uid)
    notify = _pending.pop(str(uid), []) if uid else []
    return {
        "balance": int(u.clash_balance or 0) if u else 0,
        "boost_active": boost_active(u) if u else False,
        "boost_until": (u.boost_until.isoformat() + "Z") if (u and u.boost_until) else None,
        "notify": notify,
    }


class AdminGrantReq(BaseModel):
    secret: str
    amount: int
    near_account: str | None = None
    user_id: str | None = None


@router.post("/admin_grant")
async def admin_grant(body: AdminGrantReq):
    """Разовое начисление монет вручную (например, возврат за баг). Защищено
    секретом из env ADMIN_GRANT_SECRET. После использования секрет убрать."""
    secret = os.getenv("ADMIN_GRANT_SECRET", "")
    if not secret or body.secret != secret:
        raise HTTPException(status_code=403, detail="forbidden")
    if body.amount == 0:
        raise HTTPException(status_code=400, detail="amount required")
    try:
        async for session in get_session():
            u = None
            if body.user_id:
                u = await session.get(User, int(body.user_id))
            elif body.near_account:
                from sqlalchemy import select
                acc = body.near_account.strip().lower()
                u = (await session.execute(
                    select(User).where(User.near_account_id == acc)
                )).scalar_one_or_none()
            if not u:
                raise HTTPException(status_code=404, detail="user not found")
            u.clash_balance = (u.clash_balance or 0) + int(body.amount)
            await session.commit()
            return {"ok": True, "user_id": str(u.id), "balance": int(u.clash_balance or 0)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class BoostReq(BaseModel):
    tx_hash: str
    near_account: str


@router.post("/boost")
async def buy_boost(body: BoostReq, authorization: str = Header(None)):
    """Купить буст ×2 на 24ч за 1 NEAR (проверяем оплату on-chain)."""
    uid = _uid(authorization)
    if not uid:
        raise HTTPException(status_code=401, detail="Auth required")

    if not body.tx_hash or len(body.tx_hash) < 10:
        raise HTTPException(status_code=400, detail="Invalid tx_hash")

    if os.getenv("CASE_PAYMENT_VERIFY", "1") == "1":
        from routers.cases import verify_case_payment, used_tx_hashes
        # Одна оплата = один буст: защита от повторного использования tx.
        if body.tx_hash in used_tx_hashes:
            raise HTTPException(status_code=400, detail="Transaction already used")
        min_yocto = int(BOOST_PRICE_NEAR * (10 ** 24) * 0.99)
        ok, reason = await verify_case_payment(body.tx_hash, body.near_account.strip(), TREASURY, min_yocto)
        if not ok:
            raise HTTPException(status_code=402, detail=f"Оплата не подтверждена: {reason}")
        used_tx_hashes.add(body.tx_hash)

    try:
        async for session in get_session():
            u = await session.get(User, int(uid))
            if not u:
                raise HTTPException(status_code=404, detail="User not found")
            base = u.boost_until if (u.boost_until and u.boost_until > datetime.utcnow()) else datetime.utcnow()
            u.boost_until = base + timedelta(hours=BOOST_HOURS)
            await session.commit()
            return {"ok": True, "boost_until": u.boost_until.isoformat() + "Z"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
