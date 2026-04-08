import asyncio
import asyncpg


async def reset_ratings():
    # 👇 ВСТАВЬТЕ СВОЙ DATABASE_URL СЮДА
    DATABASE_URL = "postgres://avnadmin:AVNS_KjbS0fjvoupvzIsjOQN@pg-5d05d7a-lokombogorik-e51a.h.aivencloud.com:13140/defaultdb?sslmode=require"

    # Конвертируем URL для asyncpg
    db_url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    print("🔄 Connecting to database...")

    try:
        conn = await asyncpg.connect(db_url)
        print("✅ Connected!")

        # Обновляем пользователей
        result = await conn.execute(
            "UPDATE users SET elo_rating = 0 WHERE elo_rating = 1000"
        )
        updated = int(result.split()[-1]) if "UPDATE" in result else 0

        # Меняем default
        await conn.execute(
            "ALTER TABLE users ALTER COLUMN elo_rating SET DEFAULT 0"
        )

        # Проверяем
        zero_count = await conn.fetchval(
            "SELECT COUNT(*) FROM users WHERE elo_rating = 0"
        )
        total_count = await conn.fetchval("SELECT COUNT(*) FROM users")

        print(f"\n✅ Updated {updated} users (1000 → 0)")
        print(f"✅ Users with rating 0: {zero_count}/{total_count}")
        print(f"✅ Default changed to 0\n")

        await conn.close()

    except Exception as e:
        print(f"\n❌ Error: {e}\n")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(reset_ratings())