import os
import logging
import hashlib
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


def _strip_wrapping_quotes(s: str) -> str:
    s = (s or "").strip()
    if len(s) >= 2 and ((s[0] == s[-1] == '"') or (s[0] == s[-1] == "'")):
        return s[1:-1].strip()
    return s


def _fp_secret(secret: str) -> str:
    if secret is None:
        return "none"
    sec = str(secret)
    h = hashlib.sha256(sec.encode("utf-8", errors="ignore")).hexdigest()[:10]
    return f"len={len(sec)} sha256[:10]={h}"


def _normalize_database_url(raw: str) -> str:
    """
    - Fix postgres:// -> postgresql://
    - Force async driver:
        psycopg if installed else asyncpg
    - Keep query params (sslmode=require etc.)
    """
    url = _strip_wrapping_quotes(raw)
    if not url:
        return ""

    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    try:
        u = make_url(url)
    except ArgumentError:
        logger.exception("Invalid DATABASE_URL (parse failed)")
        return ""

    driver = "postgresql+psycopg" if _has_module("psycopg") else "postgresql+asyncpg"

    if u.drivername in ("postgres", "postgresql", "postgresql+psycopg", "postgresql+asyncpg"):
        u = u.set(drivername=driver)

    # Log safe fingerprint (NO password)
    try:
        logger.info(
            "DB URL parsed: driver=%s user=%s host=%s port=%s db=%s password_fp={%s} query=%s",
            u.drivername,
            u.username,
            u.host,
            u.port,
            u.database,
            _fp_secret(u.password or ""),
            dict(u.query or {}),
        )
    except Exception:
        logger.exception("DB URL fingerprint log failed")

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
        logger.info("DB engine created")
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