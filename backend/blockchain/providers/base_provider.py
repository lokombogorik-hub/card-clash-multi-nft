from abc import ABC, abstractmethod
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class NFT:
    token_id: str
    owner: str
    metadata: Dict
    collection: str
    network: str


class BaseBlockchainProvider(ABC):
    """Базовый класс провайдера блокчейна"""

    def __init__(self, network: str, rpc_url: str):
        self.network = network
        self.rpc_url = rpc_url
        self.connected = False

    @abstractmethod
    async def connect(self):
        """Подключение к сети"""
        pass

    @abstractmethod
    async def get_balance(self, address: str) -> float:
        """Получить баланс"""
        pass

    @abstractmethod
    async def get_nfts(self, address: str) -> List[NFT]:
        """Получить NFT пользователя"""
        pass

    @abstractmethod
    async def transfer_nft(self, from_address: str, to_address: str, token_id: str) -> bool:
        """Передать NFT"""
        pass

    @abstractmethod
    async def mint_card(self, to_address: str, card_data: Dict) -> str:
        """Выпустить новую карту"""
        pass