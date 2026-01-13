from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    ENV: str = "dev"

    TELEGRAM_BOT_TOKEN: str

    DATABASE_URL: str  # postgresql+asyncpg://user:pass@host:5432/db

    JWT_SECRET: str
    JWT_ALG: str = "HS256"
    JWT_EXPIRES_MIN: int = 60 * 24 * 30

    CORS_ORIGINS: str = ""
    TG_INITDATA_MAX_AGE_SEC: int = 86400

    def cors_list(self) -> List[str]:
        if not self.CORS_ORIGINS:
            return []
        return [x.strip() for x in self.CORS_ORIGINS.split(",") if x.strip()]

settings = Settings()