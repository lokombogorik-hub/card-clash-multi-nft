from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from utils.config import settings

import ssl
from sqlalchemy.ext.asyncio import create_async_engine

ssl_ctx = ssl.create_default_context()

engine = create_async_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    connect_args={"ssl": ssl_ctx},  # <-- ВАЖНО для Neon + asyncpg
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session