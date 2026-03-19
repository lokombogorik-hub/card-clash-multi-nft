from typing import Dict
from .base_provider import BaseBlockchainProvider
from .near_provider import NEARProvider
from .ethereum_provider import EthereumProvider
from .solana_provider import SolanaProvider
from .tezos_provider import TezosProvider


class BlockchainProviderFactory:
    """Фабрика блокчейн-провайдеров"""

    _providers: Dict[str, BaseBlockchainProvider] = {}

    def __init__(self):
        self._initialize_providers()

    def _initialize_providers(self):
        """Инициализация всех провайдеров"""
        self._providers = {
            "near": NEARProvider("testnet"),
            "ethereum": EthereumProvider("sepolia"),
            "polygon": EthereumProvider("mumbai"),  # Используем Ethereum провайдер для Polygon
            "solana": SolanaProvider("devnet"),
            "tezos": TezosProvider("ghostnet")
        }

    async def initialize_all_providers(self):
        """Подключение всех провайдеров"""
        for name, provider in self._providers.items():
            await provider.connect()

    def get_provider(self, network: str) -> BaseBlockchainProvider:
        """Получить провайдер по названию сети"""
        provider = self._providers.get(network.lower())
        if not provider:
            raise ValueError(f"Провайдер для сети {network} не найден")
        return provider

    def get_all_providers(self) -> Dict[str, BaseBlockchainProvider]:
        """Получить все провайдеры"""
        return self._providers