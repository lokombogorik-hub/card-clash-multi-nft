# backend/telegram/bot_core.py

from config import TELEGRAM_BOT_TOKEN


def run_bot():
    """
    ВРЕМЕННЫЙ минимальный Telegram-бот.

    Сейчас он:
    - НЕ подключается к Telegram API
    - НЕ использует библиотеки
    - просто показывает, что система готова
    """

    print("🤖 Telegram bot stub is running")
    print("🔑 Bot token loaded:")
    print(TELEGRAM_BOT_TOKEN)
    print("✅ Telegram module is ready (logic will be added later)")

    # Чтобы программа не закрывалась сразу
    while True:
        pass
