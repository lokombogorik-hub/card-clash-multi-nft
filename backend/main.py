import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router

from routers.mock_nfts import router as mock_nfts_router

from database.session import engine
from database.models.user import User

# чтобы в Render были видны logger.exception(...) из api/auth.py
logging.basicConfig(level=logging.INFO)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok", "build": "v7-init-db"}

@app.on_event("startup")
async def _startup_init_db():
    # Создаём таблицы, если их ещё нет (для Render/пустой базы)
    async with engine.begin() as conn:
        await conn.run_sync(User.metadata.create_all)

# Роуты auth/users/ws монтируем под /api (чтобы работало /api/auth/telegram)
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")

# mock_nfts_router уже имеет prefix="/api" внутри => без доп. prefix
app.include_router(mock_nfts_router)