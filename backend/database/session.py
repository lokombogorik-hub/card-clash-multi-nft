import os
import logging
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.engine.url import make_url
from sqlalchemy.exc import ArgumentError

logger = logging.getLogger(__name__)


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _normalize_database_url(raw: str) -> str:
    """
    Fix Aiven/Railway/Heroku style:
      postgres://...  -> postgresql://...

    Then enforce async driver:
      postgresql://... -> postgresql+psycopg://... (preferred)
      fallback: postgresql+asyncpg://... if psycopg missing
    """
    url = (raw or "").strip()
    if not url:
        return ""

    # Fix the exact error you posted: dialect "postgres" doesn't exist in SQLAlchemy
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    try:
        u = make_url(url)
    except ArgumentError:
        logger.exception("Invalid DATABASE_URL")
        return ""

    # Pick driver
    use_psycopg = _has_module("psycopg")
    driver = "postgresql+psycopg" if use_psycopg else "postgresql+asyncpg"

    # Normalize driver name
    if u.drivername in ("postgres", "postgresql", "postgresql+psycopg", "postgresql+asyncpg"):
        u = u.set(drivername=driver)

    return str(u)


DATABASE_URL = os.getenv("DATABASE_URL", "")
ASYNC_DATABASE_URL = _normalize_database_url(DATABASE_URL)

engine = None
AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = None

if ASYNC_DATABASE_URL:
    try:
        engine = create_async_engine(
            ASYNC_DATABASE_URL,
            echo=False,
            pool_pre_ping=True,
        )
        AsyncSessionLocal = async_sessionmaker(
            bind=engine,
            expire_on_commit=False,
            class_=AsyncSession,
        )
        logger.info("DB engine created: %s", ASYNC_DATABASE_URL.split("@")[0] + "@***")
    except Exception:
        logger.exception("DB engine init failed; service will still run with DB disabled")
        engine = None
        AsyncSessionLocal = None
else:
    logger.warning("DATABASE_URL empty/invalid; DB disabled")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("Database is not configured or failed to initialize")
    async with AsyncSessionLocal() as session:
        yield session