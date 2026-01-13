from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.session import get_db
from database.models.user import User
from tg.webapp import verify_init_data, extract_user
from utils.security import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/telegram")
async def auth_telegram(payload: dict, db: AsyncSession = Depends(get_db)):
    init_data = payload.get("initData")
    if not init_data:
        raise HTTPException(400, "initData is required")

    try:
        verified = verify_init_data(init_data)
        tg_user = extract_user(verified)
    except Exception as e:
        raise HTTPException(401, f"Telegram initData invalid: {e}")

    res = await db.execute(select(User).where(User.id == tg_user.id))
    user = res.scalar_one_or_none()

    if not user:
        user = User(
            id=tg_user.id,
            username=tg_user.username,
            first_name=tg_user.first_name,
            last_name=tg_user.last_name,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    else:
        user.username = tg_user.username
        user.first_name = tg_user.first_name
        user.last_name = tg_user.last_name
        await db.commit()

    token = create_access_token(sub=str(user.id))
    return {"accessToken": token}