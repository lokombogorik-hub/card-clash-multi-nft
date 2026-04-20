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
        ("elo_rating", "INTEGER", "0"),
        ("nfts_count", "INTEGER", "0"),
        ("pvp_wins", "INTEGER", "0"),
        ("pvp_losses", "INTEGER", "0"),
        ("rank", "VARCHAR(50)", "NULL"),
        ("created_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),
        ("updated_at", "TIMESTAMP", "CURRENT_TIMESTAMP"),
    ]

    try:
        async with engine.begin() as conn:
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
    """Create all required tables and add missing columns."""
    if engine is None:
        return

    try:
        async with engine.begin() as conn:

            # ── user_decks ─────────────────────────────────────────────
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_decks (
                    id SERIAL PRIMARY KEY,
                    user_id VARCHAR(64) NOT NULL UNIQUE,
                    cards JSON DEFAULT '[]',
                    full_cards JSON DEFAULT '[]',
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_user_decks_user_id ON user_decks(user_id)
            """))

            # ── pvp_matches ────────────────────────────────────────────
            # Создаю таблицу если нет (с новой структурой)
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pvp_matches (
                    id VARCHAR(64) PRIMARY KEY,
                    player1_id VARCHAR(64) NOT NULL,
                    player2_id VARCHAR(64),
                    status VARCHAR(20) DEFAULT 'waiting',
                    winner VARCHAR(64),
                    mode VARCHAR(20) DEFAULT 'pvp',
                    player1_deck JSON DEFAULT '[]',
                    player2_deck JSON DEFAULT '[]',
                    board JSON DEFAULT '[]',
                    board_elements JSON DEFAULT '[]',
                    current_turn VARCHAR(64),
                    player1_hand JSON DEFAULT '[]',
                    player2_hand JSON DEFAULT '[]',
                    moves_count INTEGER DEFAULT 0,
                    player1_escrow_confirmed BOOLEAN DEFAULT FALSE,
                    player2_escrow_confirmed BOOLEAN DEFAULT FALSE,
                    player1_near_wallet VARCHAR(255),
                    player2_near_wallet VARCHAR(255),
                    player1_escrow_tx VARCHAR(255),
                    player2_escrow_tx VARCHAR(255),
                    escrow_locked BOOLEAN DEFAULT FALSE,
                    escrow_timeout_at TIMESTAMP,
                    claimed BOOLEAN DEFAULT FALSE,
                    claimed_token_id VARCHAR(255),
                    claimed_at TIMESTAMP,
                    refunded BOOLEAN DEFAULT FALSE,
                    refunded_at TIMESTAMP,
                    player1_ready BOOLEAN DEFAULT FALSE,
                    player2_ready BOOLEAN DEFAULT FALSE,
                    game_started_at TIMESTAMP,
                    cancelled_at TIMESTAMP,
                    cancelled_reason VARCHAR(255),
                    finished_at TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))

            # ── Добавляю колонки если таблица уже существует со старой структурой ──
            pvp_columns = [
                ("winner",                   "VARCHAR(64)",  "NULL"),
                ("mode",                     "VARCHAR(20)",  "'pvp'"),
                ("player1_deck",             "JSON",         "NULL"),
                ("player2_deck",             "JSON",         "NULL"),
                ("board",                    "JSON",         "NULL"),
                ("board_elements",           "JSON",         "NULL"),
                ("current_turn",             "VARCHAR(64)",  "NULL"),
                ("player1_hand",             "JSON",         "NULL"),
                ("player2_hand",             "JSON",         "NULL"),
                ("moves_count",              "INTEGER",      "0"),
                ("player1_escrow_confirmed", "BOOLEAN",      "FALSE"),
                ("player2_escrow_confirmed", "BOOLEAN",      "FALSE"),
                ("player1_near_wallet",      "VARCHAR(255)", "NULL"),
                ("player2_near_wallet",      "VARCHAR(255)", "NULL"),
                ("player1_escrow_tx",        "VARCHAR(255)", "NULL"),
                ("player2_escrow_tx",        "VARCHAR(255)", "NULL"),
                ("escrow_locked",            "BOOLEAN",      "FALSE"),
                ("escrow_timeout_at",        "TIMESTAMP",    "NULL"),
                ("claimed",                  "BOOLEAN",      "FALSE"),
                ("claimed_token_id",         "VARCHAR(255)", "NULL"),
                ("claimed_at",               "TIMESTAMP",    "NULL"),
                ("refunded",                 "BOOLEAN",      "FALSE"),
                ("refunded_at",              "TIMESTAMP",    "NULL"),
                ("player1_ready",            "BOOLEAN",      "FALSE"),
                ("player2_ready",            "BOOLEAN",      "FALSE"),
                ("game_started_at",          "TIMESTAMP",    "NULL"),
                ("cancelled_at",             "TIMESTAMP",    "NULL"),
                ("cancelled_reason",         "VARCHAR(255)", "NULL"),
                ("finished_at",              "TIMESTAMP",    "NULL"),
            ]

            for col_name, col_type, default in pvp_columns:
                try:
                    check = await conn.execute(text(f"""
                        SELECT EXISTS (
                            SELECT FROM information_schema.columns
                            WHERE table_name = 'pvp_matches' AND column_name = '{col_name}'
                        )
                    """))
                    if not check.scalar():
                        if default == "NULL":
                            await conn.execute(text(
                                f"ALTER TABLE pvp_matches ADD COLUMN {col_name} {col_type}"
                            ))
                        else:
                            await conn.execute(text(
                                f"ALTER TABLE pvp_matches ADD COLUMN {col_name} {col_type} DEFAULT {default}"
                            ))
                        logger.info(f"[pvp_matches] Added column: {col_name}")
                except Exception as e:
                    logger.warning(f"[pvp_matches] Column {col_name}: {e}")

            # ── Индексы для pvp_matches ────────────────────────────────
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_player1 ON pvp_matches(player1_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_player2 ON pvp_matches(player2_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_pvp_matches_status ON pvp_matches(status)
            """))

            # ── match_deposits ─────────────────────────────────────────
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS match_deposits (
                    id SERIAL PRIMARY KEY,
                    match_id VARCHAR(64) NOT NULL,
                    player_id VARCHAR(64) NOT NULL,
                    token_id VARCHAR(255) NOT NULL,
                    nft_contract_id VARCHAR(255),
                    near_wallet VARCHAR(255),
                    image VARCHAR(500),
                    refunded BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_match_deposits_match_id ON match_deposits(match_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_match_deposits_player_id ON match_deposits(player_id)
            """))

        logger.info("All tables ensured")
    except Exception as e:
        logger.exception(f"Table creation failed: {e}")