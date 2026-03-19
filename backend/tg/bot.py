import requests
import time

TOKEN = "8201762688:AAE2E0AjbTKfBa9ad8NE89BZDir8qv9mZxc"
API_URL = f"https://api.telegram.org/bot{TOKEN}"

WEBAPP_URL = "https://card-clash-multi-nft.vercel.app"


def send_message(chat_id, text, keyboard=None):
    data = {
        "chat_id": chat_id,
        "text": text,
        "reply_markup": keyboard
    }
    requests.post(f"{API_URL}/sendMessage", json=data)


def main():
    last_update_id = 0
    print("🤖 Telegram bot started")

    while True:
        response = requests.get(
            f"{API_URL}/getUpdates",
            params={"offset": last_update_id + 1, "timeout": 30}
        ).json()

        for update in response.get("result", []):
            last_update_id = update["update_id"]

            if "message" not in update:
                continue

            chat_id = update["message"]["chat"]["id"]
            text = update["message"].get("text", "")

            if text == "/start":
                keyboard = {
                    "keyboard": [[{
                        "text": "▶ Играть",
                        "web_app": {"url": WEBAPP_URL}
                    }]],
                    "resize_keyboard": True
                }

                send_message(
                    chat_id,
                    "🎮 Card Clash\nНажми «Играть», чтобы начать",
                    keyboard
                )

        time.sleep(1)


if __name__ == "__main__":
    main()
