import logging
import os

from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

log = logging.getLogger(__name__)


def _normalize_database_url(raw: str) -> str:
    """
    Normalizes DATABASE_URL for:
    - SQLAlchemy async + psycopg3: postgresql+psycopg://
    - Aiven/Neon SSL (require / verify-full + sslrootcert)
    - pooler/pgbouncer: prepare_threshold=0
    """
    if not raw:
        return raw

    url = raw.strip()

    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]

    # Force psycopg3 dialect if user provided plain postgresql://
    if url.startswith("postgresql://") and "postgresql+psycopg://" not in url and "postgresql+asyncpg://" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    try:
        u = make_url(url)
        host = (u.host or "").lower()
        q = dict(u.query or {})

        # Default SSL for managed DBs if not set
        if "sslmode" not in q:
            if host.endswith(".aivencloud.com") or host.endswith(".neon.tech"):
                q["sslmode"] = "require"

        # If Aiven requires verify-full and you provide CA cert path
        sslrootcert = os.getenv("PG_SSLROOTCERT", "").strip()
        if q.get("sslmode") == "verify-full" and sslrootcert and "sslrootcert" not in q:
            q["sslrootcert"] = sslrootcert

        # pooler/pgbouncer prepared statements issue
        if ("pooler" in host or "pgbouncer" in host) and "prepare_threshold" not in q:
            q["prepare_threshold"] = "0"

        url = u.set(query=q).render_as_string(hide_password=False)

        log.info(
            "DB url parsed: host=%s db=%s user=%s sslmode=%s sslrootcert=%s",
            u.host,
            u.database,
            u.username,
            q.get("sslmode"),
            ("set" if q.get("sslrootcert") else "none"),
        )
    except Exception as e:
        log.warning("Failed to normalize DATABASE_URL (will use raw). err=%s", e)

    return url


RAW_DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
DATABASE_URL = _normalize_database_url(RAW_DATABASE_URL)

_ENGINE_KW = dict(echo=False, pool_pre_ping=True)

# If using pooler, disable SQLAlchemy pooling
if "pooler" in DATABASE_URL or "pgbouncer" in DATABASE_URL:
    _ENGINE_KW["poolclass"] = NullPool

engine = create_async_engine(DATABASE_URL, **_ENGINE_KW)

AsyncSessionLocal = async_sessionmaker(
    engine, expire_on_commit=False, class_=AsyncSession
)


async def get_session() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session