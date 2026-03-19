import logging
from sqlalchemy import text

logger = logging.getLogger(__name__)


async def ensure_users_columns(engine):
    """Add missing columns to users table."""
    if engine is None:
        return

    columns = [
        ("photo_url", "VARCHAR(500)", "NULL"),
        ("near_account_id", "VARCHAR(255)", "NULL"),
        ("total_matches", "INTEGER", "0"),
        ("wins", "INTEGER", "0"),
        ("losses", "INTEGER", "0"),
        ("elo_rating", "INTEGER", "1000"),
        ("nfts_count", "INTEGER", "0"),
        ("pvp_wins", "INTEGER", "0"),
        ("pvp_losses", "INTEGER", "0"),
        ("rank", "VARCHAR(50)", "NULL"),
        ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),
        ("updated_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),

    ]

    try:
        async with engine.begin() as conn:
            # Check if users table exists
            result = await conn.execute(text(
                "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users')"
            ))
            if not result.scalar():
                return

            for col_name, col_type, default in columns:
                try:
                    check = await conn.execute(text(f"""
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns 
                            WHERE table_name = 'users' AND column_name = '{col_name}'
                        )
                    """))
                    if not check.scalar():
                        if default == "NULL":
                            await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
                        else:
                            await conn.execute(
                                text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type} DEFAULT {default}"))
                        logger.info(f"Added column: {col_name}")
                except Exception as e:
                    logger.warning(f"Column {col_name}: {e}")

        logger.info("Users migration complete")
    except Exception as e:
        logger.exception(f"Migration failed: {e}")


async def ensure_all_tables(engine):
    """Create all required tables."""
    if engine is None:
        return

    try:
        async with engine.begin() as conn:
            # Create user_decks table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_decks (
                    id SERIAL PRIMARY KEY,
                    user_id BIGINT NOT NULL,
                    cards_json TEXT DEFAULT '[]',
                    card_keys TEXT DEFAULT '[]',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))

            # Create index
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_user_decks_user_id ON user_decks(user_id)
            """))

            # Create pvp_matches table
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pvp_matches (
                    id VARCHAR(64) PRIMARY KEY,
                    player1_id BIGINT NOT NULL,
                    player2_id BIGINT,
                    player1_deck_json TEXT,
                    player2_deck_json TEXT,
                    player1_elo INTEGER DEFAULT 1000,
                    player2_elo INTEGER DEFAULT 1000,
                    status VARCHAR(20) DEFAULT 'waiting',
                    winner_id BIGINT,
                    loser_id BIGINT,
                    player1_rounds INTEGER DEFAULT 0,
                    player2_rounds INTEGER DEFAULT 0,
                    elo_change INTEGER DEFAULT 0,
                    claimed_nft_contract VARCHAR(255),
                    claimed_nft_token_id VARCHAR(255),
                    claim_tx_hash VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    finished_at TIMESTAMP
                )
            """))

            # Create indexes
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_player1 ON pvp_matches(player1_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_player2 ON pvp_matches(player2_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_status ON pvp_matches(status)
            """))

        logger.info("All tables ensured")
    except Exception as e:
        logger.exception(f"Table creation failed: {e}")