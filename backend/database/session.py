import os
import ssl
import logging

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import URL, make_url

logger = logging.getLogger("db")

DATABASE_URL = (os.getenv("DATABASE_URL", "") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

url: URL = make_url(DATABASE_URL)

# Печатаем URL без пароля, чтобы в Render logs было видно host/db/user
logger.warning("DB URL (password hidden): %s", url.render_as_string(hide_password=True))
logger.warning(
    "DB meta: driver=%s user=%s host=%s db=%s password_len=%s query_keys=%s",
    url.drivername,
    url.username,
    url.host,
    url.database,
    (len(url.password) if url.password else 0),
    list(dict(url.query).keys()),
)

# Всегда используем asyncpg
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2"):
    url = url.set(drivername="postgresql+asyncpg")

# libpq-параметры (channel_binding и т.п.) asyncpg не понимает — чистим query,
# но SSL включаем по sslmode
raw_query = dict(url.query)
sslmode = (raw_query.get("sslmode") or "").lower()

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full"):
    connect_args["ssl"] = ssl.create_default_context()

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