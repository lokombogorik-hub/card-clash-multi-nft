from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import os

from .models.user import User
from .models.nft_card import NFTCard
from .models.user_deck import UserDeck
from config import settings

# Базовый класс для моделей
Base = declarative_base()

# Создание движка базы данных
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
)

# Создание сессии
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Session:
    """Получить сессию базы данных"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Инициализация базы данных"""
    # Импортируем все модели
    from .models import user, nft_card, user_deck

    # Создаем таблицы
    Base.metadata.create_all(bind=engine)
    print("✅ База данных инициализирована")

    # Создаем демо-данные
    create_demo_data()


def create_demo_data():
    """Создание демо-данных для тестирования"""
    from game.mechanics.card import CardGenerator

    db = SessionLocal()
    try:
        # Проверяем, есть ли уже демо-пользователь
        demo_user = db.query(User).filter(User.wallet_address == "demo.near").first()

        if not demo_user:
            # Создаем демо-пользователя
            demo_user = User(
                wallet_address="demo.near",
                username="DemoPlayer",
                elo_rating=1200,
                total_games=50,
                wins=30,
                losses=15,
                draws=5
            )
            db.add(demo_user)
            db.commit()

            # Создаем демо-карты
            cards = CardGenerator.generate_starter_deck("demo.near", "near")

            for card_data in cards:
                nft_card = NFTCard(
                    token_id=card_data["id"],
                    owner_address="demo.near",
                    name=card_data["name"],
                    top_value=card_data["top"],
                    right_value=card_data["right"],
                    bottom_value=card_data["bottom"],
                    left_value=card_data["left"],
                    element=card_data["element"],
                    rarity=card_data["rarity"],
                    network="near",
                    collection="bunny",
                    image_url=card_data["image_url"],
                    metadata={
                        "description": f"Triple Triad Card - {card_data['element']} element",
                        "attributes": card_data
                    }
                )
                db.add(nft_card)

            # Создаем демо-колоду
            demo_deck = UserDeck(
                user_id=demo_user.id,
                name="Стартовая колода",
                card_ids=[f"near_starter_{i}" for i in range(10)],
                created_at="2024-01-01"
            )
            db.add(demo_deck)

            db.commit()
            print("✅ Демо-данные созданы")

    except Exception as e:
        print(f"❌ Ошибка создания демо-данных: {e}")
        db.rollback()
    finally:
        db.close()