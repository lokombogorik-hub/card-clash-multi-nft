// Единая детерминированная логика для stats, elements, rarity
// Используется в Inventory.jsx, Game.jsx и везде где нужны карты

/**
 * Простой детерминированный хеш из строки
 */
export function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

/**
 * Извлекает числовой ID из token_id
 * Например: "token-123" -> 123, "456" -> 456
 */
export function extractNumericId(tokenId) {
    if (!tokenId) return 0;
    const str = String(tokenId);
    const match = str.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : hashString(str);
}

/**
 * Определяет rarity по token_id детерминированно
 * 0-25% -> legendary, 25-50% -> epic, 50-75% -> rare, 75-100% -> common
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
        case 'legendary': return { base: 70, variance: 25 };
        case 'epic': return { base: 55, variance: 20 };
        case 'rare': return { base: 40, variance: 15 };
        case 'common':
        default: return { base: 25, variance: 15 };
    }
}

/**
 * Генерирует детерминированные статы по token_id
 */
export function generateStats(tokenId) {
    const numId = extractNumericId(tokenId);
    const rarity = getRarityFromTokenId(tokenId);
    const { base, variance } = getStatMultiplier(rarity);

    // Детерминированные вариации на основе token_id
    const hash1 = hashString(tokenId + '_attack');
    const hash2 = hashString(tokenId + '_defense');
    const hash3 = hashString(tokenId + '_speed');

    const attack = base + (hash1 % variance);
    const defense = base + (hash2 % variance);
    const speed = base + (hash3 % variance);

    return {
        attack: Math.min(99, Math.max(1, attack)),
        defense: Math.min(99, Math.max(1, defense)),
        speed: Math.min(99, Math.max(1, speed))
    };
}

/**
 * Список стихий
 */
export const ELEMENTS = ['fire', 'water', 'earth', 'air', 'lightning'];

/**
 * Генерирует детерминированную стихию по token_id
 */
export function generateElement(tokenId) {
    const hash = hashString(tokenId + '_element');
    return ELEMENTS[hash % ELEMENTS.length];
}

/**
 * Возвращает emoji для стихии
 */
export function getElementEmoji(element) {
    switch (element) {
        case 'fire': return '🔥';
        case 'water': return '💧';
        case 'earth': return '🪨';
        case 'air': return '💨';
        case 'lightning': return '⚡';
        default: return '✨';
    }
}

/**
 * Возвращает цвет для стихии
 */
export function getElementColor(element) {
    switch (element) {
        case 'fire': return '#ff6b35';
        case 'water': return '#4dabf7';
        case 'earth': return '#8b7355';
        case 'air': return '#a0d8ef';
        case 'lightning': return '#ffd43b';
        default: return '#888888';
    }
}

/**
 * Возвращает CSS класс для рамки по rarity
 */
export function getRarityClass(rarity) {
    switch (rarity) {
        case 'legendary': return 'card-legendary';
        case 'epic': return 'card-epic';
        case 'rare': return 'card-rare';
        case 'common':
        default: return 'card-common';
    }
}

/**
 * Конвертирует NFT объект в игровую карту
 * Это ГЛАВНАЯ функция — использовать везде!
 */
export function nftToCard(nft) {
    if (!nft) return null;

    const tokenId = nft.token_id || nft.tokenId || `unknown_${Date.now()}`;
    const metadata = nft.metadata || {};

    // Пробую взять stats из metadata.extra
    let stats = null;
    let element = null;

    if (metadata.extra) {
        try {
            const extra = typeof metadata.extra === 'string'
                ? JSON.parse(metadata.extra)
                : metadata.extra;
            if (extra.stats) stats = extra.stats;
            if (extra.element) element = extra.element;
        } catch (e) {
            // ignore parse errors
        }
    }

    // Если нет в metadata — генерируем детерминированно
    if (!stats) {
        stats = generateStats(tokenId);
    }
    if (!element) {
        element = generateElement(tokenId);
    }

    const rarity = getRarityFromTokenId(tokenId);

    // Формируем URL картинки
    let imageUrl = metadata.media || metadata.image || '';

    // Проксируем IPFS и Arweave через backend
    if (imageUrl) {
        if (imageUrl.startsWith('ipfs://')) {
            const cid = imageUrl.replace('ipfs://', '');
            imageUrl = `/api/proxy/image?url=${encodeURIComponent(`https://ipfs.io/ipfs/${cid}`)}`;
        } else if (imageUrl.includes('arweave.net') || imageUrl.includes('ipfs')) {
            imageUrl = `/api/proxy/image?url=${encodeURIComponent(imageUrl)}`;
        }
    }

    return {
        id: tokenId,
        token_id: tokenId,
        name: metadata.title || metadata.name || `Card #${tokenId}`,
        image: imageUrl,
        description: metadata.description || '',
        rarity,
        element,
        stats,
        attack: stats.attack,
        defense: stats.defense,
        speed: stats.speed,
        // Сохраняем оригинальные данные NFT
        contract_id: nft.contract_id || nft.contractId,
        owner_id: nft.owner_id || nft.ownerId,
        metadata
    };
}

/**
 * Конвертирует массив NFT в массив карт
 */
export function nftsToCards(nfts) {
    if (!Array.isArray(nfts)) return [];
    return nfts.map(nft => nftToCard(nft)).filter(Boolean);
}

/**
 * Сравнение карт для боя
 * Возвращает: 1 = card1 wins, -1 = card2 wins, 0 = draw
 */
export function compareCards(card1, card2, attribute) {
    const val1 = card1[attribute] || card1.stats?.[attribute] || 0;
    const val2 = card2[attribute] || card2.stats?.[attribute] || 0;

    // Элементальные бонусы
    const elementBonus1 = getElementBonus(card1.element, card2.element);
    const elementBonus2 = getElementBonus(card2.element, card1.element);

    const final1 = val1 + elementBonus1;
    const final2 = val2 + elementBonus2;

    if (final1 > final2) return 1;
    if (final2 > final1) return -1;
    return 0;
}

/**
 * Бонус стихии в бою
 */
export function getElementBonus(attackerElement, defenderElement) {
    const advantages = {
        fire: 'air',      // огонь > воздух
        water: 'fire',    // вода > огонь
        earth: 'lightning', // земля > молния
        air: 'earth',     // воздух > земля
        lightning: 'water'  // молния > вода
    };

    if (advantages[attackerElement] === defenderElement) {
        return 10; // бонус за преимущество
    }
    return 0;
}