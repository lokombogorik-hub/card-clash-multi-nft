from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Абсолютные импорты (БЕЗ точек!)
from api.auth import router as auth_router
from api.users import router as users_router
from routers import mock_nfts

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health():
    return {"status": "ok", "build": "v4-clean"}

# Подключаем роутеры
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(websocket_router)
app.include_router(mock_nfts.router)