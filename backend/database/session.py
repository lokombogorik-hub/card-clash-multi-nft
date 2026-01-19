import os

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import URL, make_url

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

# Используем psycopg (как в локальном тесте), а не asyncpg
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2", "postgresql+asyncpg"):
    url = url.set(drivername="postgresql+psycopg")

# ВАЖНО: не вычищаем query, оставляем ?sslmode=require и т.п.
# psycopg понимает sslmode сам (как твой локальный тест)

engine = create_async_engine(
    str(url),
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session