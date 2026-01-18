import os
import ssl
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.engine.url import make_url

DATABASE_URL = os.getenv("DATABASE_URL", "")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set")

# SQLAlchemy + asyncpg НЕ понимает ?sslmode=require (это параметр для psycopg).
# Поэтому вырезаем sslmode из query и включаем SSL через connect_args["ssl"].
url = make_url(DATABASE_URL)
query = dict(url.query)

sslmode = (query.pop("sslmode", None) or "").lower()

connect_args = {}
if sslmode in ("require", "verify-ca", "verify-full"):
    # default SSL context (обычно хватает для Neon/Render)
    connect_args["ssl"] = ssl.create_default_context()

# обновляем URL без sslmode
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