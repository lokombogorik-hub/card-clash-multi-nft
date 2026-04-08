# backend/scripts/reset_ratings.py
import asyncio
from sqlalchemy import update
from database.session import get_session
from database.models.user import User

async def reset_ratings():
    async for session in get_session():
        await session.execute(
            update(User)
            .where(User.elo_rating == 1000)
            .values(elo_rating=0)
        )
        await session.commit()
        print("✅ Ratings reset to 0")
        break

if __name__ == "__main__":
    asyncio.run(reset_ratings())