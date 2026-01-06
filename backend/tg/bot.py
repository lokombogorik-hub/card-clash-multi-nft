from telegram import Update, KeyboardButton, ReplyKeyboardMarkup, WebAppInfo
from telegram.ext import ApplicationBuilder, CommandHandler, ContextTypes

from config import TELEGRAM_BOT_TOKEN


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    play_button = KeyboardButton(
        text="▶ Играть",
        web_app=WebAppInfo(url="http://localhost:5173")
    )

    keyboard = ReplyKeyboardMarkup([[play_button]], resize_keyboard=True)

    await update.message.reply_text(
        "Добро пожаловать в Card Clash!",
        reply_markup=keyboard
    )


def run_bot():
    app = ApplicationBuilder().token(TELEGRAM_BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    print("🤖 Telegram bot started")
    app.run_polling()
