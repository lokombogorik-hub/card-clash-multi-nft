class EthereumProvider(BlockchainProvider):
    """Провайдер для Ethereum/Polygon"""

    async def get_nfts_for_wallet(self, wallet_address: str) -> List[Dict]:
        # Используем Alchemy API или Moralis
        import aiohttp

        url = f"https://eth-mainnet.g.alchemy.com/nft/v2/{API_KEY}/getNFTs"
        params = {
            'owner': wallet_address,
            'withMetadata': 'true'
        }

        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                data = await response.json()

                nfts = []
                for nft in data.get('ownedNfts', []):
                    game_card = self.convert_erc721_to_card(nft)
                    nfts.append(game_card)

                return nfts

    def convert_erc721_to_card(self, erc721_nft: Dict) -> Dict:
        """Конвертировать ERC721 NFT в игровую карту"""
        return {
            'chain': 'ethereum',
            'contract': erc721_nft['contract']['address'],
            'token_id': erc721_nft['id']['tokenId'],
            'name': erc721_nft['metadata'].get('name', 'Unnamed'),
            'image_url': self.fix_ipfs_url(erc721_nft['metadata'].get('image')),
            'attributes': erc721_nft['metadata'].get('attributes', []),
            'collection': erc721_nft['contract'].get('name', 'Unknown'),
            'symbol': erc721_nft['contract'].get('symbol', '')
        }
