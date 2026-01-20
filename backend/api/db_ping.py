from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database.session import get_db

router = APIRouter(prefix="/db", tags=["db"])

@router.get("/ping")
async def db_ping(db: AsyncSession = Depends(get_db)):
    v = await db.scalar(text("select 1"))
    return {"ok": True, "value": v}