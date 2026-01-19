from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router
from routers.mock_nfts import router as mock_nfts_router

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
    return {"status": "ok", "build": "v6-api-prefix"}

# ВАЖНО: auth/users/ws монтируем под /api, чтобы фронт мог дергать /api/auth/telegram
app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(websocket_router, prefix="/api")

# ВАЖНО: mock_nfts_router УЖЕ имеет prefix="/api" внутри, поэтому без дополнительного prefix
app.include_router(mock_nfts_router)