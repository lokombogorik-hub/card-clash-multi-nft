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
            logger.info("✅ users.photo_url column ensured")
        except Exception:
            logger.exception("bootstrap migration failed: users.photo_url")

        # users.near_account_id + index
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS near_account_id VARCHAR(128);"))
            await conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_near_account_id ON users (near_account_id);"))
            logger.info("✅ users.near_account_id column + index ensured")
        except Exception:
            logger.exception("bootstrap migration failed: users.near_account_id")

        # users.created_at (nullable, ok)
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;"))
            logger.info("✅ users.created_at column ensured")
        except Exception:
            logger.exception("bootstrap migration failed: users.created_at")

        # PvP statistics columns
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS elo_rating INTEGER DEFAULT 1200;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS pvp_wins INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS pvp_losses INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS pvp_forfeits INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS experience INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_matches INTEGER DEFAULT 0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS win_streak INTEGER DEFAULT 0;"))
            logger.info("✅ PvP statistics columns ensured")
        except Exception:
            logger.exception("bootstrap migration failed: PvP stats")

        # Economy columns
        try:
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spent_near REAL DEFAULT 0.0;"))
            await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_earned_near REAL DEFAULT 0.0;"))
            logger.info("✅ Economy columns ensured")
        except Exception:
            logger.exception("bootstrap migration failed: economy stats")

    logger.info("🎉 All bootstrap migrations completed")