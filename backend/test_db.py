import asyncio
import os
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text

DATABASE_URL = os.getenv("DATABASE_URL", "")


def fix_url(url):
    url = url.strip().strip('"').strip("'")
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        try:
            import psycopg
            return "postgresql+psycopg://" + url[len("postgresql://"):]
        except:
            return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


async def main():
    url = fix_url(DATABASE_URL)
    if not url:
        print("ERROR: DATABASE_URL not set")
        return

    print(f"Connecting to: {url[:50]}...")

    engine = create_async_engine(url, echo=False)
    async with engine.begin() as conn:
        # Смотрим текущее состояние
        result = await conn.execute(text(
            "SELECT id, username, elo_rating, wins, losses FROM users ORDER BY elo_rating DESC LIMIT 20"
        ))
        rows = result.fetchall()
        print(f"\nCurrent users ({len(rows)}):")
        for row in rows:
            print(f"  id={row[0]} username={row[1]} rating={row[2]} wins={row[3]} losses={row[4]}")

        # Сбрасываем рейтинг 1000 у тех кто не играл
        result2 = await conn.execute(text(
            "UPDATE users SET elo_rating = 0 WHERE elo_rating = 1000 AND wins = 0 AND losses = 0"
        ))
        print(f"\nFixed {result2.rowcount} users (reset 1000 → 0)")

        # Проверяем после
        result3 = await conn.execute(text(
            "SELECT id, username, elo_rating, wins, losses FROM users ORDER BY elo_rating DESC LIMIT 20"
        ))
        rows3 = result3.fetchall()
        print(f"\nAfter fix:")
        for row in rows3:
            print(f"  id={row[0]} username={row[1]} rating={row[2]} wins={row[3]} losses={row[4]}")

    await engine.dispose()
    print("\nDone!")


asyncio.run(main())