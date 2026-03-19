class DeckBuilder:
    """Система создания колод из NFT разных сетей"""

    def __init__(self, user_id):
        self.user_id = user_id
        self.max_deck_size = 10  # Как в Triple
        self.max_duplicates = 3  # Максимум 3 одинаковые карты

    async def get_user_collection(self, wallet_addresses):
        """Получить ВСЕ NFT пользователя из всех сетей"""
        collection = []

        # 1. Bunny NFTs (NEAR)
        bunny_nfts = await self.get_bunny_nfts(wallet_addresses.get('near'))
        collection.extend(bunny_nfts)

        # 2. Ethereum/Polygon NFTs (ERC721)
        eth_nfts = await self.get_ethereum_nfts(wallet_addresses.get('ethereum'))
        collection.extend(eth_nfts)

        # 3. Solana NFTs
        solana_nfts = await self.get_solana_nfts(wallet_addresses.get('solana'))
        collection.extend(solana_nfts)

        # 4. Tezos NFTs
        tezos_nfts = await self.get_tezos_nfts(wallet_addresses.get('tezos'))
        collection.extend(tezos_nfts)

        return self.convert_to_game_cards(collection)

    def convert_to_game_cards(self, nfts):
        """Конвертировать NFT в игровые карты"""
        game_cards = []

        for nft in nfts:
            card = {
                'id': f"{nft['chain']}_{nft['contract']}_{nft['token_id']}",
                'name': nft['name'],
                'image_url': nft['image'],
                'animated_url': nft.get('animation_url'),
                'chain': nft['chain'],  # NEAR, Ethereum, etc.
                'collection': nft['collection_name'],
                'rarity': self.calculate_rarity(nft),
                'element': self.determine_element(nft),
                'stats': self.calculate_stats(nft),
                'abilities': self.extract_abilities(nft),
                'is_favorite': False,
                'in_deck': False
            }
            game_cards.append(card)

        return game_cards

    async def save_user_deck(self, deck_name, card_ids, rules_compatibility):
        """Сохранение колоды пользователя"""
        # Проверка валидности колоды
        if not self.validate_deck(card_ids):
            raise ValueError("Некорректная колода")

        # Проверка совместимости с правилами
        if not self.check_rules_compatibility(card_ids, rules_compatibility):
            raise ValueError("Колода не соответствует выбранным правилам")

        # Сохранение в БД
        deck = UserDeck(
            user_id=self.user_id,
            name=deck_name,
            card_ids=card_ids,
            rules=rules_compatibility,
            created_at=datetime.now()
        )

        return await deck.save()

    def validate_deck(self, card_ids):
        """Проверка колоды на соответствие правилам"""
        if len(card_ids) > self.max_deck_size:
            return False

        # Проверка дубликатов
        from collections import Counter
        counts = Counter(card_ids)
        if any(count > self.max_duplicates for count in counts.values()):
            return False

        # Проверка совместимости сетей (если нужно)
        if not self.check_chain_compatibility(card_ids):
            return False

        return True