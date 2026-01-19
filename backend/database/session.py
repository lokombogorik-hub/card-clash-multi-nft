import os
import ssl

from sqlalchemy.engine.url import URL, make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DATABASE_URL = (os.getenv("DATABASE_URL", "") or "").strip()
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

url: URL = make_url(DATABASE_URL)

# ЖЕЛЕЗНЫЙ дебаг: print гарантированно виден в Render logs
if (os.getenv("DB_DEBUG", "") or "").strip() == "1":
    try:
        print("[DB_DEBUG] url =", url.render_as_string(hide_password=True))
    except Exception:
        print("[DB_DEBUG] url = <cannot render>")
    print("[DB_DEBUG] driver =", url.drivername)
    print("[DB_DEBUG] user =", url.username)
    print("[DB_DEBUG] host =", url.host)
    print("[DB_DEBUG] db   =", url.database)
    print("[DB_DEBUG] password_len =", len(url.password or ""))
    print("[DB_DEBUG] query_keys =", list(dict(url.query).keys()))

# Принудительно asyncpg
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2"):
    url = url.set(drivername="postgresql+asyncpg")

# asyncpg не понимает libpq query-параметры (channel_binding и др.) => чистим query
raw_query = dict(url.query)

sslmode = (
    (raw_query.get("sslmode") or "")
    or (os.getenv("DB_SSLMODE") or "")
    or (os.getenv("PGSSLMODE") or "")
).lower()

# Render/managed Postgres часто требует SSL, но DATABASE_URL может прийти без sslmode.
on_render = bool(
    (os.getenv("RENDER") or "").strip()
    or (os.getenv("RENDER_SERVICE_ID") or "").strip()
    or (os.getenv("RENDER_EXTERNAL_URL") or "").strip()
)
if not sslmode and on_render:
    sslmode = "require"

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full"):
    connect_args["ssl"] = ssl.create_default_context()

# убираем query параметры полностью (asyncpg/libpq параметры не нужны)
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