import ssl
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from utils.config import settings


def _normalize_db_url(url: str) -> str:
    """
    Render/Neon часто дают строку вида:
      postgresql://user:pass@host/db?sslmode=require
    Но для SQLAlchemy async нам нужен драйвер asyncpg:
      postgresql+asyncpg://...
    """
    if not url:
        return url

    if url.startswith("postgresql+asyncpg://"):
        return url

    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://") :]

    if url.startswith("postgres://"):
        # иногда встречается короткая форма
        return "postgresql+asyncpg://" + url[len("postgres://") :]

    return url


db_url = _normalize_db_url(settings.DATABASE_URL)

# SSL для Neon
ssl_ctx = ssl.create_default_context()

engine = create_async_engine(
    db_url,
    pool_pre_ping=True,
    connect_args={"ssl": ssl_ctx},
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with SessionLocal() as session:
        yield session