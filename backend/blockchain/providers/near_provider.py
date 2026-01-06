import json
import aiohttp
from typing import List
from .base_provider import BaseBlockchainProvider, NFT


class NEARProvider(BaseBlockchainProvider):
    """Провайдер для NEAR"""

    def __init__(self, network: str = "testnet"):
        rpc_url = "https://rpc.testnet.near.org"
        super().__init__(network, rpc_url)
        self.headers = {"Content-Type": "application/json"}

    async def connect(self):
        """Подключение к NEAR"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "jsonrpc": "2.0",
                    "id": "dontcare",
                    "method": "status",
                    "params": []
                }
                async with session.post(self.rpc_url, json=payload, headers=self.headers) as response:
                    if response.status == 200:
                        self.connected = True
                        print(f"✅ Подключено к NEAR {self.network}")
                    else:
                        print(f"❌ Ошибка подключения к NEAR: {response.status}")
        except Exception as e:
            print(f"❌ Ошибка подключения к NEAR: {e}")

    async def get_balance(self, address: str) -> float:
        """Получить баланс в NEAR"""
        try:
            async with aiohttp.ClientSession() as session:
                payload = {
                    "jsonrpc": "2.0",
                    "id": "dontcare",
                    "method": "query",
                    "params": {
                        "request_type": "view_account",
                        "finality": "final",
                        "account_id": address
                    }
                }
                async with session.post(self.rpc_url, json=payload, headers=self.headers) as response:
                    data = await response.json()
                    if "result" in data:
                        balance = int(data["result"]["amount"]) / 10 ** 24
                        return balance
                    return 0.0
        except Exception as e:
            print(f"❌ Ошибка получения баланса: {e}")
            return 0.0

    async def get_nfts(self, address: str) -> List[NFT]:
        """Получить NFT с стандартного NEAR NFT контракта"""
        nfts = []

        try:
            # Пример для Paras NFT контракта
            contract_id = "x.paras.near"

            async with aiohttp.ClientSession() as session:
                payload = {
                    "jsonrpc": "2.0",
                    "id": "dontcare",
                    "method": "query",
                    "params": {
                        "request_type": "call_function",
                        "finality": "final",
                        "account_id": contract_id,
                        "method_name": "nft_tokens_for_owner",
                        "args_base64": json.dumps({"account_id": address}).encode('utf-8').hex()
                    }
                }

                async with session.post(self.rpc_url, json=payload, headers=self.headers) as response:
                    data = await response.json()

                    if "result" in data and "result" in data["result"]:
                        nft_data = json.loads(bytes(data["result"]["result"]).decode('utf-8'))

                        for nft in nft_data:
                            nfts.append(NFT(
                                token_id=nft.get("token_id", ""),
                                owner=address,
                                metadata=nft.get("metadata", {}),
                                collection="paras",
                                network="near"
                            ))

        except Exception as e:
            print(f"❌ Ошибка получения NFT: {e}")

        # Для демо возвращаем фейковые NFT
        if not nfts:
            nfts = self._get_demo_nfts(address)

        return nfts

    def _get_demo_nfts(self, address: str) -> List[NFT]:
        """Генерация демо NFT для тестирования"""
        from game.mechanics.card import CardGenerator

        demo_nfts = []
        card_data = CardGenerator.generate_starter_deck(address, "near")

        for i, card in enumerate(card_data):
            demo_nfts.append(NFT(
                token_id=card["id"],
                owner=address,
                metadata={
                    "name": card["name"],
                    "description": f"Triple Triad Card - {card['element']} element",
                    "attributes": {
                        "top": card["top"],
                        "right": card["right"],
                        "bottom": card["bottom"],
                        "left": card["left"],
                        "element": card["element"],
                        "rarity": card["rarity"],
                        "total_power": card["total_power"]
                    }
                },
                collection="bunny",
                network="near"
            ))

        return demo_nfts

    async def transfer_nft(self, from_address: str, to_address: str, token_id: str) -> bool:
        """Демо-версия передачи NFT"""
        print(f"🔄 Демо: Передача NFT {token_id} от {from_address} к {to_address}")
        return True

    async def mint_card(self, to_address: str, card_data: Dict) -> str:
        """Демо-версия минта карты"""
        print(f"🎨 Демо: Минт карты для {to_address}")
        return f"near_demo_{to_address}_{card_data.get('name', 'card')}"