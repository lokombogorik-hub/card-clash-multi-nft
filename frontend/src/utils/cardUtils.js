// frontend/src/utils/cardUtils.js
// Единая детерминированная логика для stats, elements, rarity
// Используется в Inventory.jsx, Game.jsx и везде где нужны карты

/**
 * Простой детерминированный хеш из строки
 */
export function hashString(str) {
    if (!str) return 0;
    let hash = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        const char = s.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

/**
 * Извлекает числовой ID из token_id
 */
export function extractNumericId(tokenId) {
    if (!tokenId) return 0;
    const str = String(tokenId);
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : hashString(str);
}

/**
 * Определяет rarity по token_id детерминированно
 */
export function getRarityFromTokenId(tokenId, totalSupply = 1000) {
    const numId = extractNumericId(tokenId);
    const position = numId % totalSupply;
    const percent = (position / totalSupply) * 100;

    if (percent < 25) return 'legendary';
    if (percent < 50) return 'epic';
    if (percent < 75) return 'rare';
    return 'common';
}

/**
 * Возвращает множитель статов по rarity
 */
export function getStatMultiplier(rarity) {
    switch (rarity) {
        case 'legendary': return { base: 7, variance: 3 };
        case 'epic': return { base: 5, variance: 4 };
        case 'rare': return { base: 3, variance: 4 };
        case 'common':
        default: return { base: 1, variance: 5 };
    }
}

/**
 * Генерирует детерминированные статы по token_id (1-10 scale for TT)
 */
export function generateStats(tokenId) {
    const rarity = getRarityFromTokenId(tokenId);
    const { base, variance } = getStatMultiplier(rarity);

    const hash1 = hashString(tokenId + '_top');
    const hash2 = hashString(tokenId + '_right');
    const hash3 = hashString(tokenId + '_bottom');
    const hash4 = hashString(tokenId + '_left');

    return {
        top: Math.min(10, Math.max(1, base + (hash1 % variance))),
        right: Math.min(10, Math.max(1, base + (hash2 % variance))),
        bottom: Math.min(10, Math.max(1, base + (hash3 % variance))),
        left: Math.min(10, Math.max(1, base + (hash4 % variance))),
    };
}

/**
 * Список стихий
 */
export const ELEMENTS = ['Earth', 'Fire', 'Water', 'Poison', 'Holy', 'Thunder', 'Wind', 'Ice'];

/**
 * Генерирует детерминированную стихию по token_id
 */
export function generateElement(tokenId) {
    const hash = hashString(tokenId + '_element');
    // ~70% chance to have element
    if ((hash % 100) > 70) return null;
    return ELEMENTS[hash % ELEMENTS.length];
}

/**
 * Emoji для стихии
 */
export const ELEM_ICON = {
    Earth: '🪨',
    Fire: '🔥',
    Water: '💧',
    Poison: '☠️',
    Holy: '✨',
    Thunder: '⚡',
    Wind: '🌪️',
    Ice: '❄️',
};

export function getElementEmoji(element) {
    return ELEM_ICON[element] || '';
}

/**
 * Цвет для стихии
 */
export function getElementColor(element) {
    switch (element) {
        case 'Fire': return '#ff6b35';
        case 'Water': return '#4dabf7';
        case 'Earth': return '#8b7355';
        case 'Wind': return '#a0d8ef';
        case 'Thunder': return '#ffd43b';
        case 'Ice': return '#74c0fc';
        case 'Poison': return '#9c36b5';
        case 'Holy': return '#fff3bf';
        default: return '#888888';
    }
}

/**
 * Rank label
 */
export function getRankLabel(rarity) {
    switch (rarity) {
        case 'legendary': return 'L';
        case 'epic': return 'E';
        case 'rare': return 'R';
        case 'common':
        default: return 'C';
    }
}

/**
 * Конвертирует NFT объект в игровую карту (TT format)
 */
export function nftToCard(nft, idx = 0) {
    if (!nft) return null;

    const tokenId = nft.token_id || nft.tokenId || nft.id || `nft_${idx}_${Date.now()}`;
    const metadata = nft.metadata || {};

    // Пробуем взять stats/element из metadata.extra или nft напрямую
    let values = null;
    let element = null;

    // Check nft direct properties first
    if (nft.values && typeof nft.values === 'object') {
        values = nft.values;
    }
    if (nft.element) {
        element = nft.element;
    }

    // Then check metadata.extra
    if (metadata.extra) {
        try {
            const extra = typeof metadata.extra === 'string'
                ? JSON.parse(metadata.extra)
                : metadata.extra;
            if (extra.values) values = extra.values;
            if (extra.stats) values = extra.stats;
            if (extra.element) element = extra.element;
        } catch (e) {
            // ignore
        }
    }

    // Generate deterministically if not found
    if (!values) {
        values = generateStats(tokenId);
    }
    if (element === null || element === undefined) {
        element = generateElement(tokenId);
    }

    const rarity = nft.rarity || nft.rank || getRarityFromTokenId(tokenId);
    const rankLabel = getRankLabel(rarity);

    // Image URL
    let imageUrl = nft.imageUrl || nft.image || metadata.media || metadata.image || '';

    // Proxy IPFS/Arweave
    if (imageUrl) {
        if (imageUrl.startsWith('ipfs://')) {
            const cid = imageUrl.replace('ipfs://', '');
            imageUrl = `/api/proxy/image?url=${encodeURIComponent(`https://ipfs.io/ipfs/${cid}`)}`;
        } else if (imageUrl.includes('arweave.net') || imageUrl.includes('ipfs.io')) {
            imageUrl = `/api/proxy/image?url=${encodeURIComponent(imageUrl)}`;
        }
    }

    return {
        id: tokenId,
        token_id: tokenId,
        owner: nft.owner || 'player',
        name: metadata.title || metadata.name || nft.name || `Card #${tokenId}`,
        imageUrl: imageUrl,
        image: imageUrl,
        values: values,
        rarity: rarity,
        rank: rarity,
        rankLabel: rankLabel,
        element: element,
        placeKey: 0,
        captureKey: 0,
        contract_id: nft.contract_id || nft.contractId,
        nftData: nft,
    };
}

/**
 * Конвертирует массив NFT в массив карт
 */
export function nftsToCards(nfts, owner = 'player') {
    if (!Array.isArray(nfts)) return [];
    return nfts
        .map((nft, idx) => {
            const card = nftToCard(nft, idx);
            if (card) card.owner = owner;
            return card;
        })
        .filter(Boolean);
}

/**
 * Клонирует колоду для руки игрока
 */
export function cloneDeckToHand(deck, owner) {
    return deck.map((c) => ({ ...c, owner, placeKey: 0, captureKey: 0 }));
}