from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router
from routers.mock_nfts import router as mock_nfts_router

from database.session import engine
from database.models.user import User

import os
import logging

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # stage1
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {"ok": True, "service": "card-clash-backend"}


@app.get("/health")
async def health():
    return {"status": "ok", "build": os.getenv("RAILWAY_GIT_COMMIT_SHA", os.getenv("RENDER_GIT_COMMIT", "dev"))}


app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")  # /api/ws/{game_id}/{player_id}
app.include_router(mock_nfts_router)  # prefix="/api" inside


@app.on_event("startup")
async def startup():
    try:
        async with engine.begin() as conn:
            await conn.run_sync(User.metadata.create_all)
        log.info("DB init OK")
    except Exception as e:
        log.warning(f"DB init failed: {e}")