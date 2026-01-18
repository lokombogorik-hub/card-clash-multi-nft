import os
import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import URL, make_url

import logging
logger = logging.getLogger("db")

DATABASE_URL = (os.getenv("DATABASE_URL", "") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

url: URL = make_url(DATABASE_URL)

logger.warning("DB URL (password hidden): %s", url.render_as_string(hide_password=True))
logger.warning("DB password_len=%s user=%s host=%s db=%s",
               (len(url.password) if url.password else 0),
               url.username, url.host, url.database)

# Принудительно используем asyncpg (иначе SQLAlchemy попытается psycopg2)
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2"):
    url = url.set(drivername="postgresql+asyncpg")

# В query часто лежат libpq/psycopg параметры: sslmode, channel_binding, options и т.д.
# asyncpg их НЕ понимает -> "unexpected keyword argument ..."
raw_query = dict(url.query)
sslmode = (raw_query.get("sslmode") or "").lower()

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full"):
    connect_args["ssl"] = ssl.create_default_context()

# Полностью убираем query-параметры из DSN
url = url.set(query={})

engine = create_async_engine(
    str(url),
    echo=False,
    pool_pre_ping=True,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session