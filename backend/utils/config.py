import os
from dataclasses import dataclass


def _get(name: str, default: str = "") -> str:
    return (os.getenv(name, default) or "").strip()


@dataclass(frozen=True)
class Settings:
    # Telegram
    TELEGRAM_BOT_TOKEN: str = _get("TELEGRAM_BOT_TOKEN")
    BOT_TOKEN: str = _get("BOT_TOKEN")
    TG_INITDATA_MAX_AGE_SEC: int = int(_get("TG_INITDATA_MAX_AGE_SEC", "86400"))  # 24h default

    # JWT
    JWT_SECRET: str = _get("JWT_SECRET")
    JWT_ALG: str = _get("JWT_ALG", "HS256")
    JWT_EXPIRES_MIN: int = int(_get("JWT_EXPIRES_MIN", "10080"))  # 7 days default

    # DB
    DATABASE_URL: str = _get("DATABASE_URL")

    @property
    def effective_bot_token(self) -> str:
        return self.TELEGRAM_BOT_TOKEN or self.BOT_TOKEN


settings = Settings()