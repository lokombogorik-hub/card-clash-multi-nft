from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()


class NFTCard(Base):
    """Модель NFT карты"""
    __tablename__ = "nft_cards"

    id = Column(Integer, primary_key=True, index=True)
    token_id = Column(String, unique=True, index=True)
    owner_address = Column(String, index=True, nullable=False)

    # Статистика карты
    name = Column(String, nullable=False)
    top_value = Column(Integer, nullable=False)
    right_value = Column(Integer, nullable=False)
    bottom_value = Column(Integer, nullable=False)
    left_value = Column(Integer, nullable=False)
    element = Column(String, default="none")
    rarity = Column(String, default="common")

    # Блокчейн информация
    network = Column(String, nullable=False)  # near, ethereum, polygon, etc.
    collection = Column(String, nullable=False)
    contract_address = Column(String)

    # Игровая статистика
    games_played = Column(Integer, default=0)
    wins_with_card = Column(Integer, default=0)

    # Метаданные
    metadata = Column(JSON, default={})
    image_url = Column(String)

    def to_dict(self):
        return {
            "id": self.id,
            "token_id": self.token_id,
            "owner_address": self.owner_address,
            "name": self.name,
            "stats": {
                "top": self.top_value,
                "right": self.right_value,
                "bottom": self.bottom_value,
                "left": self.left_value
            },
            "element": self.element,
            "rarity": self.rarity,
            "network": self.network,
            "collection": self.collection,
            "games_played": self.games_played,
            "win_rate": (self.wins_with_card / self.games_played * 100) if self.games_played > 0 else 0,
            "image_url": self.image_url,
            "metadata": self.metadata
        }