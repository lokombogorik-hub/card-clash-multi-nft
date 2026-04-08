import json

# Загружаем ваш nft.json (тот что вы скачали через API)
with open("nft.json", encoding="utf-8") as f:
    all_nfts = json.load(f)

# Создаём словарь token_id -> rank
rank_map = {}
for nft in all_nfts:
    token_id = nft["id"]
    rank = nft["rank"]
    rank_map[token_id] = rank

# Сохраняем в frontend/src/data/
with open("frontend/src/data/nft-ranks.json", "w", encoding="utf-8") as f:
    json.dump(rank_map, f, ensure_ascii=False, indent=2)

print(f"✅ Создан frontend/src/data/nft-ranks.json с {len(rank_map)} записями")