import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)


async def ensure_users_columns(engine: AsyncEngine):
    """
    Minimal bootstrap migrations (no Alembic).
    Safe for existing DB: uses IF NOT EXISTS.
    """

    async with engine.begin() as conn:
        # users.photo_url
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512);"))
        except Exception:
            logger.exception("bootstrap migration failed: users.photo_url")

        # users.near_account_id + index
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS near_account_id VARCHAR(128);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_near_account_id ON users (near_account_id);"))
        except Exception:
            logger.exception("bootstrap migration failed: users.near_account_id")

        # users.created_at (nullable, ok)
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;"))
        except Exception:
            logger.exception("bootstrap migration failed: users.created_at")