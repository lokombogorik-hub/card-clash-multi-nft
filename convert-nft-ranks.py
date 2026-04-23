import json

# nft.json
with open("nft.json", encoding="utf-8") as f:
    all_nfts = json.load(f)

# Словарь
rank_map = {}
for nft in all_nfts:
    token_id = nft["id"]
    rank = nft["rank"]
    rank_map[token_id] = rank

with open("frontend/src/data/nft-ranks.json", "w", encoding="utf-8") as f:
    json.dump(rank_map, f, ensure_ascii=False, indent=2)

print(f"✅ Создан frontend/src/data/nft-ranks.json с {len(rank_map)} записями")