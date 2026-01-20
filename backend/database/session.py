import os
import hashlib

from sqlalchemy.engine.url import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _pw_fingerprint(pw: str | None) -> str:
    if not pw:
        return "none"
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()[:12]


def _build_database_url() -> str:
    """
    Приоритет:
    1) DATABASE_URL если задан
    2) PG* переменные (Railway): PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
    """
    raw = (os.getenv("DATABASE_URL", "") or "").strip()
    if raw:
        return raw

    pghost = (os.getenv("PGHOST", "") or "").strip()
    pgport = (os.getenv("PGPORT", "") or "5432").strip()
    pgdb = (os.getenv("PGDATABASE", "") or "").strip()
    pguser = (os.getenv("PGUSER", "") or "").strip()
    pgpass = (os.getenv("PGPASSWORD", "") or "").strip()

    if not (pghost and pgdb and pguser and pgpass):
        raise RuntimeError("DATABASE_URL is not set and PG* variables are incomplete")

    return f"postgresql://{pguser}:{pgpass}@{pghost}:{pgport}/{pgdb}"


DATABASE_URL = _build_database_url()
url = make_url(DATABASE_URL)

# Если sslmode не задан — добавим require (Railway public proxy обычно требует SSL)
raw_query = dict(url.query)
sslmode = (raw_query.get("sslmode") or "").lower()
if not sslmode:
    url = url.set(query={**raw_query, "sslmode": "require"})

# Нормализуем драйвер на psycopg
if url.drivername in ("postgres", "postgresql", "postgresql+psycopg2", "postgresql+asyncpg"):
    url = url.set(drivername="postgresql+psycopg")

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
    print("[DB_DEBUG] password_sha256_12 =", _pw_fingerprint(url.password))
    print("[DB_DEBUG] query_keys =", list(dict(url.query).keys()))

engine = create_async_engine(
    str(url),
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session