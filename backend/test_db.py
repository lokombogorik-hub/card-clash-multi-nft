import asyncio
import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

async def main():
    engine = create_async_engine(os.environ["DATABASE_URL"])
    async with engine.connect() as conn:
        r = await conn.exec_driver_sql("select 1")
        print("DB:", r.scalar())
    await engine.dispose()

asyncio.run(main())