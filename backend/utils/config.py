import os
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # JWT
    JWT_SECRET: str = "dev-secret"
    JWT_ALG: str = "HS256"

    # Telegram bot token (для verify_init_data)
    TELEGRAM_BOT_TOKEN: str = ""

    # DB (делаем НЕ обязательным, потому что на Railway можем собирать из PG*)
    DATABASE_URL: Optional[str] = None


settings = Settings()

# Если DATABASE_URL не задан через env, берём тот, который собрал database.session (из PG*)
if not (settings.DATABASE_URL or "").strip():
    try:
        # локальный импорт, чтобы не ломать порядок загрузки
        from database.session import DATABASE_URL as BUILT_DATABASE_URL  # type: ignore

        settings.DATABASE_URL = BUILT_DATABASE_URL
    except Exception:
        # оставляем None — некоторые части приложения могут работать без БД
        settings.DATABASE_URL = None