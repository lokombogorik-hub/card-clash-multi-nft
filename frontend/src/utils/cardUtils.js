export var ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"];

export var ELEM_ICON = {
    Earth: "🪨",
    Fire: "🔥",
    Water: "💧",
    Poison: "☠️",
    Holy: "✨",
    Thunder: "⚡",
    Wind: "🌪️",
    Ice: "❄️",
};

export var RANKS = [
    { key: "common", label: "C", weight: 50, min: 1, max: 7, elemChance: 0.7 },
    { key: "rare", label: "R", weight: 30, min: 2, max: 8, elemChance: 0.75 },
    { key: "epic", label: "E", weight: 15, min: 3, max: 9, elemChance: 0.8 },
    { key: "legendary", label: "L", weight: 5, min: 4, max: 10, elemChance: 0.85 },
];

/**
 * Get rarity based on token_id
 * Lower token numbers = rarer
 */
export function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 10000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;

    if (pct <= 25) return RANKS[3]; // legendary
    if (pct <= 50) return RANKS[2]; // epic
    if (pct <= 75) return RANKS[1]; // rare
    return RANKS[0]; // common
}

/**
 * Deterministic stats generation based on token_id
 * Same token_id will ALWAYS produce same stats
 */
export function genStats(tokenId, rarity) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;

    // LCG for deterministic random
    var seed = num;
    var next = function () {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
    };

    var rnd = function (lo, hi) {
        return lo + (next() % (hi - lo + 1));
    };

    var r = rarity || getRarityFromTokenId(tokenId);
    var min = r.min;
    var max = r.max;

    return {
        top: rnd(min, max),
        right: rnd(min, max),
        bottom: rnd(min, max),
        left: rnd(min, max)
    };
}

/**
 * Deterministic element generation based on token_id
 * Same token_id will ALWAYS have same element (or null)
 */
export function genElement(tokenId, rarity) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var r = rarity || getRarityFromTokenId(tokenId);

    // Different seed offset for element
    var seed = num * 7919 + 104729;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    var chance = (seed % 100) / 100;

    if (chance < r.elemChance) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var elemIdx = seed % ELEMENTS.length;
        return ELEMENTS[elemIdx];
    }

    return null;
}

/**
 * Convert NFT data to game card format
 * Ensures stats and element are always present
 */
export function nftToCard(nft, idx, owner) {
    owner = owner || "player";

    var tokenId = nft.tokenId || nft.token_id || String(idx);
    var r = nft.rarity || getRarityFromTokenId(tokenId);

    // Use existing stats/element or generate deterministically
    var stats = (nft.stats && typeof nft.stats.top === "number")
        ? nft.stats
        : genStats(tokenId, r);

    var element = nft.element || genElement(tokenId, r);

    return {
        id: nft.key || nft.tokenId || "nft_" + idx,
        owner: owner,
        values: stats,
        imageUrl: nft.imageUrl || "/cards/card.jpg",
        rank: r.key,
        rankLabel: r.label,
        element: element,
        placeKey: 0,
        captureKey: 0,
        nftData: nft,
    };
}