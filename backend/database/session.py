import os
import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import URL, make_url

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

url: URL = make_url(DATABASE_URL)

# 1) Принудительно используем asyncpg (иначе SQLAlchemy попытается psycopg2)
# Возможные варианты из хостингов: postgres://, postgresql://
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2"):
    url = url.set(drivername="postgresql+asyncpg")

# 2) asyncpg НЕ понимает ?sslmode=require (это параметр psycopg2).
# Вырезаем sslmode из query и передаем SSL через connect_args["ssl"]
query = dict(url.query)
sslmode = (query.pop("sslmode", None) or "").lower()

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full"):
    connect_args["ssl"] = ssl.create_default_context()

url = url.set(query=query)

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