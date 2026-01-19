from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Абсолютные импорты (БЕЗ точек!)
from api.auth import router as auth_router
from api.users import router as users_router
from api.websocket import router as websocket_router
from routers.mock_nfts import router as mock_nfts_router

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check (это ОК — не дублирует include_router)
@app.get("/health")
async def health():
    return {"status": "ok", "build": "v5-ws-fix"}

# Подключаем роутеры (ВАЖНО: только include_router, без дублей @app.get для тех же путей)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(websocket_router)
app.include_router(mock_nfts_router)