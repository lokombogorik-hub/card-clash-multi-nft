import logging
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes

# Настройка логирования
logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s', level=logging.INFO)

TOKEN = "8201762688:AAE2E0AjbTKfBa9ad8NE89BZDir8qv9mZxc"


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Когда пользователь пишет /start"""
    keyboard = [
        [InlineKeyboardButton("🎮 Играть", callback_data="play")],
        [InlineKeyboardButton("🃏 Колода", callback_data="deck")],
        [InlineKeyboardButton("📊 Статистика", callback_data="stats")]
    ]

    await update.message.reply_text(
        f"Привет {update.effective_user.first_name}! 👋\n\n"
        "Добро пожаловать в Card Clash NFT!\n\n"
        "Выберите действие:",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


async def play_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /play"""
    await update.message.reply_text(
        "🎮 *Доступные режимы:*\n\n"
        "• 🤖 Против ИИ\n"
        "• 👥 PvP с другом\n"
        "• 🏆 Турниры\n\n"
        "Выберите режим:",
        parse_mode="Markdown"
    )


async def button_click(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Когда нажимают на кнопку"""
    query = update.callback_query
    await query.answer()  

    if query.data == "play":
        await query.edit_message_text(
            text="✅ Запускаем игру...\n\n"
                 "В тестовом режиме игра работает в упрощенном виде.\n"
                 "Для полной версии нужно настроить WebApp.",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("🔄 Назад", callback_data="back")
            ]])
        )
    elif query.data == "deck":
        await query.edit_message_text(
            text="🎴 *Ваша колода:*\n\n"
                 "1. ⚔️ Воин (5/3/4/2)\n"
                 "2. 🛡️ Защитник (2/5/2/5)\n"
                 "3. 🔥 Маг (8/1/1/8)\n"
                 "4. 💧 Водяной (3/4/5/3)\n\n"
                 "Всего карт: 4/10",
            parse_mode="Markdown"
        )
    elif query.data == "back":
        await start(update, context)


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Команда /help"""
    await update.message.reply_text(
        "🆘 *Помощь*\n\n"
        "/start - Начать\n"
        "/play - Играть\n"
        "/test - Тестовая игра\n"
        "/help - Помощь\n\n"
        "📞 Поддержка: @ваш_аккаунт",
        parse_mode="Markdown"
    )


async def test_game(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Тестовая игра в чате"""
    board = """
⚔️ *ТЕСТОВАЯ ИГРА*

Ваше поле:
🃏 [ ] [ ] [ ]
[ ] [ ] [ ]
[ ] [ ] [ ]

Ваша рука:
1. ⚔️ Воин (5/3/4/2)
2. 🛡️ Защитник (2/5/2/5)

Выберите карту и позицию:
"""

    keyboard = [
        [
            InlineKeyboardButton("⚔️ A1", callback_data="card1_A1"),
            InlineKeyboardButton("⚔️ A2", callback_data="card1_A2"),
            InlineKeyboardButton("⚔️ A3", callback_data="card1_A3")
        ],
        [
            InlineKeyboardButton("🛡️ B1", callback_data="card2_B1"),
            InlineKeyboardButton("🛡️ B2", callback_data="card2_B2"),
            InlineKeyboardButton("🛡️ B3", callback_data="card2_B3")
        ]
    ]

    await update.message.reply_text(
        board,
        parse_mode="Markdown",
        reply_markup=InlineKeyboardMarkup(keyboard)
    )


def main():
    """Запуск бота"""
    # Создаем приложение
    app = Application.builder().token(TOKEN).build()

    # Добавляем обработчики команд
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("play", play_command))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(CommandHandler("test", test_game))

    # Обработчик кнопок
    app.add_handler(CallbackQueryHandler(button_click))

    # Запускаем
    print("🤖 Бот запущен! Откройте Telegram и найдите своего бота")
    print("🔗 Или перейдите по ссылке: https://t.me/ваш_бот_юзернейм")
    app.run_polling()


if __name__ == "__main__":
    main()
