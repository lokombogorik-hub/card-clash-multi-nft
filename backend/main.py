# backend/main.py

from fastapi import FastAPI
import uvicorn

from config import (
    DEBUG,
    SERVER_HOST,
    SERVER_PORT,
    PROJECT_NAME
)

from api.rest_api import router as api_router

# Создаём сервер
app = FastAPI(title=PROJECT_NAME)

# Подключаем API
app.include_router(api_router, prefix="/api")


@app.get("/")
def root():
    return {
        "message": "Backend is running!",
        "project": PROJECT_NAME,
        "debug": DEBUG
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVER_HOST,
        port=SERVER_PORT,
        reload=DEBUG
    )
