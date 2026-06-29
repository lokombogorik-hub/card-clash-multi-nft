"""ClashCoin — внутриигровая монета. Начисления/списания + баланс.
Суммы меняю прямо тут, в одном месте."""
from datetime import datetime
from fastapi import APIRouter, Header
from database.session import get_session
from database.models.user import User

router = APIRouter(prefix="/api/coins", tags=["coins"])

# --- сколько начисляем (меняю здесь) ---
WIN_REWARD = 2            # за победу в матче
WIN_DAILY_CAP = 20        # потолок монет за победы в день (от фарма)
CASE_OPEN_REWARD = 5      # за открытие кейса
TOURNAMENT_WIN_REWARD = 200  # за победу в турнире
FRIEND_REWARD = 50        # друг сыграл 3 матча (этап позже)


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


async def add_coins(user_id, amount, capped=False):
    """Начислить монеты. capped=True -> с дневным потолком (для побед)."""
    if not user_id or amount <= 0:
        return
    try:
        async for session in get_session():
            u = await session.get(User, int(user_id))
            if not u:
                break
            if capped:
                today = datetime.utcnow().strftime("%Y-%m-%d")
                if u.coins_day != today:
                    u.coins_day = today
                    u.coins_today = 0
                room = WIN_DAILY_CAP - (u.coins_today or 0)
                if room <= 0:
                    break
                amount = min(amount, room)
                u.coins_today = (u.coins_today or 0) + amount
            u.clash_balance = (u.clash_balance or 0) + int(amount)
            await session.commit()
            break
    except Exception as e:
        print(f"[coins] add error: {e}")


async def spend_coins(user_id, amount) -> bool:
    """Списать монеты. True если хватило и списали."""
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


async def get_balance(user_id) -> int:
    if not user_id:
        return 0
    try:
        async for session in get_session():
            u = await session.get(User, int(user_id))
            return int(u.clash_balance or 0) if u else 0
    except Exception:
        return 0
    return 0


@router.get("/me")
async def my_coins(authorization: str = Header(None)):
    uid = _uid(authorization)
    return {"balance": await get_balance(uid)}
