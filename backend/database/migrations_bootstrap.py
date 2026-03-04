import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)

COLUMNS_TO_ADD = [
    ("near_account_id", "VARCHAR"),
    ("total_matches", "INTEGER DEFAULT 0"),
    ("wins", "INTEGER DEFAULT 0"),
    ("losses", "INTEGER DEFAULT 0"),
    ("elo_rating", "INTEGER DEFAULT 1000"),
    ("nfts_count", "INTEGER DEFAULT 0"),
    ("username", "VARCHAR"),
    ("first_name", "VARCHAR"),
    ("last_name", "VARCHAR"),
]


async def ensure_users_columns(engine):
    if engine is None:
        return

    async with engine.begin() as conn:
        for col_name, col_type in COLUMNS_TO_ADD:
            try:
                await conn.execute(
                    text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
                )
                logger.info(f"Added column users.{col_name}")
            except Exception:
                pass