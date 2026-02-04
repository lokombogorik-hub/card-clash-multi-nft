import os
import logging
from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

logger = logging.getLogger(__name__)


def _has_module(name: str) -> bool:
    try:
        __import__(name)
        return True
    except Exception:
        return False


def _strip_wrapping_quotes(s: str) -> str:
    s = (s or "").strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1].strip()
    return s


def _inject_driver(url: str, driver: str) -> str:
    """
    Convert:
      postgresql://... -> postgresql+<driver>://...
      postgres://...   -> postgresql+<driver>://...   (also fixes dialect)

    This does NOT parse URL and does NOT touch password encoding.
    """
    u = (url or "").strip()
    if not u:
        return ""

    u = _strip_wrapping_quotes(u)

    # fix heroku-style scheme
    if u.startswith("postgres://"):
        u = "postgresql://" + u[len("postgres://") :]

    # already has explicit driver
    if u.startswith("postgresql+"):
        return u

    if u.startswith("postgresql://"):
        return "postgresql+" + driver + "://" + u[len("postgresql://") :]

    # unknown / unsupported scheme
    return u


DATABASE_URL_RAW = os.getenv("DATABASE_URL", "")
driver = "psycopg" if _has_module("psycopg") else "asyncpg"
ASYNC_DATABASE_URL = _inject_driver(DATABASE_URL_RAW, driver)

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
        logger.info("DB engine created (driver=%s)", driver)
    except Exception:
        logger.exception("DB engine init failed; service will still run with DB disabled")
        engine = None
        AsyncSessionLocal = None
else:
    logger.warning("DATABASE_URL empty; DB disabled")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    if AsyncSessionLocal is None:
        raise RuntimeError("Database is not configured or failed to initialize")
    async with AsyncSessionLocal() as session:
        yield session


# ----------------------------------------------------------------------
# Compatibility alias (used by some routers)
# Railway logs show routers importing: from database.session import get_db
# Keep get_session() as canonical, but expose get_db() to avoid crashes.
# ----------------------------------------------------------------------
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async for s in get_session():
        yield s