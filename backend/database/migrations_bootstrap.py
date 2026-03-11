import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def ensure_users_columns(engine):
    """Add missing columns to users table if they don't exist."""
    if engine is None:
        logger.warning("No engine provided for migrations")
        return

    columns_to_add = [
        ("photo_url", "VARCHAR(500)", "NULL"),
        ("near_account_id", "VARCHAR(255)", "NULL"),
        ("total_matches", "INTEGER", "0"),
        ("wins", "INTEGER", "0"),
        ("losses", "INTEGER", "0"),
        ("elo_rating", "INTEGER", "1000"),
        ("nfts_count", "INTEGER", "0"),
    ]

    try:
        async with engine.begin() as conn:
            # First check if table exists
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
            ))
            table_exists = result.scalar()

            if not table_exists:
                logger.info("Users table does not exist yet, skipping column migrations")
                return

            for column_name, column_type, default_value in columns_to_add:
                try:
                    # Check if column exists
                    check_sql = text(f"""
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns 
                            WHERE table_name = 'users' AND column_name = '{column_name}'
                        )
                    """)
                    result = await conn.execute(check_sql)
                    column_exists = result.scalar()

                    if not column_exists:
                        # Add column
                        if default_value == "NULL":
                            add_sql = text(f"ALTER TABLE users ADD COLUMN {column_name} {column_type}")
                        else:
                            add_sql = text(
                                f"ALTER TABLE users ADD COLUMN {column_name} {column_type} DEFAULT {default_value}")
                        await conn.execute(add_sql)
                        logger.info(f"Added column: {column_name}")
                    else:
                        logger.debug(f"Column already exists: {column_name}")

                except Exception as e:
                    logger.warning(f"Error adding column {column_name}: {e}")

        logger.info("Users columns migration complete")
    except Exception as e:
        logger.exception(f"Migration failed: {e}")