import os
import logging
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    create_async_engine,
    async_sessionmaker,
    AsyncSession,
)
from sqlalchemy.engine.url import make_url

logger = logging.getLogger(__name__)


def _make_async_database_url(url: str) -> str:
    """
    Accepts:
      - postgresql://...
      - postgresql+asyncpg://...
    Returns asyncpg url.
    """
    u = make_url(url)
    if u.drivername == "postgresql":
        u = u.set(drivername="postgresql+asyncpg")
    return str(u)


DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
ASYNC_DATABASE_URL = _make_async_database_url(DATABASE_URL) if DATABASE_URL else ""

engine = create_async_engine(
    ASYNC_DATABASE_URL,
    echo=False,
    pool_pre_ping=True,
) if ASYNC_DATABASE_URL else None

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
) if engine else None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("Database is not configured: DATABASE_URL is empty")
    async with AsyncSessionLocal() as session:
        yield session