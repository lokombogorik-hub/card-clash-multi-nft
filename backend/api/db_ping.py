from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from database.session import get_db

router = APIRouter(prefix="/db", tags=["db"])

@router.get("/ping")
async def db_ping(db: AsyncSession = Depends(get_db)):
    v = await db.scalar(text("select 1"))
    return {"ok": True, "value": v}

@router.get("/whoami")
async def db_whoami(db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("select inet_server_addr(), inet_server_port(), current_database(), current_user"))).first()
    return {
        "server_addr": str(row[0]),
        "server_port": row[1],
        "db": row[2],
        "user": row[3],
    }