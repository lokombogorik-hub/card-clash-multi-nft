# backend/config.py

# В каком режиме работает сервер
DEBUG = True


# Порт сервера
SERVER_HOST = "0.0.0.0"
SERVER_PORT = 8000


# Telegram Bot Token (берётся из env, не хардкодим)
import os as _os
TELEGRAM_BOT_TOKEN = _os.getenv("TELEGRAM_BOT_TOKEN", "")


# Название проекта
PROJECT_NAME = "Card Clash Multi NFT"
