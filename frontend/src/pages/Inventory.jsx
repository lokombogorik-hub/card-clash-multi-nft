import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner, isIpfsUrl, ipfsGatewayUrl, GATEWAY_COUNT } from "../libs/nearNft";

// Миграция: сбросить старые статы чтобы пересчитать с новой рарностью
(function migrateRarity() {
    try {
        if (localStorage.getItem("cc_rarity_v3")) return;
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].startsWith("cc_card_")) {
                localStorage.removeItem(keys[i]);
            }
        }
        localStorage.setItem("cc_rarity_v3", "1");
    } catch (e) { }
})();

var ACE_VALUE = 10;

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return n.chain + ":" + n.contractId + ":" + n.tokenId;
    if (n.token_id) return "near::" + n.token_id;
    return "mock:" + (n.id || Math.random().toString(36).slice(2));
}

var ELEM_ICON = {
    Earth: "🌍",
    Fire: "🔥",
    Water: "💧",
    Poison: "☠️",
    Holy: "✨",
    Thunder: "⚡",
    Wind: "🌪️",
    Ice: "❄️"
};

var ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"];

function hashCode(str) {
    var hash = 0;
    var str2 = String(str);
    for (var i = 0; i < str2.length; i++) {
        var char = str2.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash);
}

function mulberry32(seed) {
    return function () {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function createSeed(tokenId, salt) {
    var combined = String(tokenId) + "_" + String(salt || "default");
    return hashCode(combined);
}

/* ═══════════════════════════════════════════════════
   RARITY SYSTEM — основана на реальной статистике
   коллекции из 2129 NFT
   ═══════════════════════════════════════════════════ */

// Вес редкости трейта: чем меньше встречается, тем больше очков
// 1/1 уникальные = 100 очков
// Редкие (<2%) = 30 очков  
// Необычные (2-5%) = 10 очков
// Обычные (>5%) = 1 очко
function traitRarityScore(traitType, traitValue) {
    // Все 1/1 уникальные трейты (встречаются 1 раз из 2129)
    var UNIQUE_TRAITS = {
        Background: [
            "Graffiti wall", "Near factory", "Midway park", "Night city",
            "Aristocrat's house", "Old castle", "Necromancer's Abode", "Quiet Sun",
            "Sorcerer Forest", "Dragon spirit", "Apocalypse", "Future",
            "Olympus", "Through the Twilight", "Vampire house", "Ancient ruins", "Ashes"
        ],
        Body: [
            "Grey Stream", "Grayish", "Lunar ash", "Cosmic reflection",
            "Redhead", "Bluish gray", "Ashes of Time", "Dusty obsidian",
            "Purple gray", "Ash Whirlwind", "Warhammer", "Midnight gray",
            "Coal smoke", "Ash gray haze", "Thundercloud", "Cloud smoke",
            "Infernal Violet"
        ],
        Eyes: [
            "Thunderbolt Glow", "Yellow highlights", "Jester's Eyes", "Moon Shadow",
            "Hot eyes", "Ghost eyes", "Necromancer's Eyes", "Sandy",
            "Sorcerer eye", "Ash Phantom", "Volcanic heat", "Shining Stream",
            "Crystal glint", "Omni eye", "Bloody eye", "Legion g", "Amber Ember Eyes"
        ],
        Teeth: [
            "Opal light", "Jester's Teeth", "Reddish glow", "Ghostly blue",
            "Ethereal shine", "Snow-white", "Purple teeth", "Amber spark",
            "Echo of Ashes", "Glint", "Titanium glitter", "Purable white",
            "Vampire fangs", "Salad greens", "Golden Fag"
        ],
        Suits: [
            "Pearl jacket", "Mechanical armor", "Jester's motley", "Venom",
            "Tailcoat suit", "Ghost", "Shadow Necromancer", "Desert nomad",
            "Sorcerer", "Samurai", "Astartes Space Marines", "Dreamer",
            "Zeus", "OmniBlinks", "Vampire", "Cloak of Near legion",
            "Obsidian Chain of Power"
        ],
        Head: [
            "Earflap hat", "Mechanical glasses", "Fool's cap", "Deep Shadow",
            "Hot cylinder", "Transparent wool", "Shadow Necromancer", "Sand cape",
            "Sorcerer hair", "Morning Mist Helmet", "Warhammer helmet",
            "Dreamer's cap", "Golden wreath", "Omni hair", "Corey",
            "Dragon helmet", "Horns of the Abyss"
        ]
    };

    // Редкие трейты (<2% = менее ~43 из 2129)
    var RARE_TRAITS = {
        Background: ["Ruins", "Crypt", "City", "Country evening", "Road forest"],
        Body: [], // все обычные body >= 8.9%
        Eyes: [], // все обычные eyes >= 8.1%
        Teeth: ["Alabaster tone"], // 2 из 2129
        Suits: [
            "Pulsar of Eternity", "Easter costume", "Iron lava", "Farmer's shirt",
            "Mantle Kings", "Lvs", "White Fur Coat", "Smoky ashes",
            "Nightgown", "Hole time"
        ],
        Head: ["Didi"] // 36 из 2129 = 1.7%
    };

    // Необычные (2-5%)
    var UNCOMMON_TRAITS = {
        Background: [
            "Night street", "Radiation", "evening lights", "Meteor shower",
            "Green wall", "Reading room", "Winter forest", "Forest", "Night",
            "Morning forest", "Pixel landscape", "Laboratory", "Golden age",
            "Green ball", "Golden Radiance", "City of Ashes", "Neon diamond",
            "Slanting rain", "Overcast clouds", "Cold morning", "Mountain beach"
        ],
        Body: [],
        Eyes: [],
        Teeth: ["Golden"], // 7.0% — на грани, но ценный трейт
        Suits: [
            "Mechanical", "Pink armor", "Zombie", "Raincoat", "Nike", "LV",
            "Infected", "Jacket", "CC", "Red techno", "Ice armor",
            "Hermes coat", "Bottega Veneta", "Robot", "White roba", "Balenciaga"
        ],
        Head: [
            "Major's cap", "Chef's hat", "Pork", "Fashion glass",
            "Mafia hat", "Crown Kings", "Digital glasses", "Short hairstyle",
            "Biker hairstyle", "Nightcap", "Yellow 75 glasses", "Curly hair",
            "Robocop helmet"
        ]
    };

    var uniqueList = UNIQUE_TRAITS[traitType] || [];
    if (uniqueList.indexOf(traitValue) !== -1) return 100;

    var rareList = RARE_TRAITS[traitType] || [];
    if (rareList.indexOf(traitValue) !== -1) return 30;

    var uncommonList = UNCOMMON_TRAITS[traitType] || [];
    if (uncommonList.indexOf(traitValue) !== -1) return 10;

    return 1; // Common
}

// Подсчёт рарности NFT по сумме очков всех трейтов
function getRarityFromTraits(attributes) {
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
        return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
    }

    var totalScore = 0;
    var hasUnique = false;
    var uniqueCount = 0;

    for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var score = traitRarityScore(attr.trait_type, attr.value);
        totalScore += score;
        if (score === 100) {
            hasUnique = true;
            uniqueCount++;
        }
    }

    // Legendary: 3+ уникальных трейта ИЛИ суммарный скор >= 400
    // (полные 1/1 — все 6 трейтов уникальны = 600 очков)
    if (uniqueCount >= 3 || totalScore >= 400) {
        return { key: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 6, max: 9 };
    }

    // Epic: 1-2 уникальных трейта ИЛИ суммарный скор >= 120
    if (hasUnique || totalScore >= 120) {
        return { key: "epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    }

    // Rare: скор >= 30 (несколько необычных или 1 редкий)
    if (totalScore >= 30) {
        return { key: "rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    }

    // Common: всё остальное
    return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
}

// Fallback если нет метаданных — по token_id (старая логика)
function getRarityFallback(tokenId, totalSupply) {
    totalSupply = totalSupply || 2131;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;

    if (pct <= 5) return { key: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 6, max: 9 };
    if (pct <= 20) return { key: "epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    if (pct <= 50) return { key: "rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
}

/* ═══════════════════════════════════════════════════ */

function getStoredCardData(tokenId) {
    try {
        var key = "cc_card_" + String(tokenId);
        var stored = localStorage.getItem(key);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) { }
    return null;
}

function storeCardData(tokenId, data) {
    try {
        var key = "cc_card_" + String(tokenId);
        localStorage.setItem(key, JSON.stringify(data));
    } catch (e) { }
}

function genStats(tokenId, rarity) {
    var stored = getStoredCardData(tokenId);
    if (stored && stored.stats && typeof stored.stats.top === "number") {
        var s = stored.stats;
        if (s.top <= 10 && s.right <= 10 && s.bottom <= 10 && s.left <= 10 &&
            s.top >= 1 && s.right >= 1 && s.bottom >= 1 && s.left >= 1) {
            return s;
        }
    }

    var seed = createSeed(tokenId, "stats_v4");
    var rng = mulberry32(seed);

    var min = Math.max(1, rarity.min);
    var max = Math.min(9, rarity.max);

    var stats = {
        top: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        right: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        bottom: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        left: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min))
    };

    // Ace для legendary (40%) и epic (15%)
    var aceChance = 0;
    if (rarity.key === "legendary") aceChance = 0.4;
    else if (rarity.key === "epic") aceChance = 0.15;

    if (aceChance > 0) {
        var aceRng = mulberry32(createSeed(tokenId, "ace_v1"));
        if (aceRng() < aceChance) {
            var sides = ["top", "right", "bottom", "left"];
            var aceSide = sides[Math.floor(aceRng() * sides.length)];
            stats[aceSide] = ACE_VALUE;
        }
    }

    var data = stored || {};
    data.stats = stats;
    storeCardData(tokenId, data);

    return stats;
}

function genElement(tokenId) {
    var stored = getStoredCardData(tokenId);
    if (stored && stored.element) {
        return stored.element;
    }

    var seed = createSeed(tokenId, "element_v3");
    var rng = mulberry32(seed);

    var elemIdx = Math.floor(rng() * ELEMENTS.length);
    var element = ELEMENTS[elemIdx];

    var data = stored || {};
    data.element = element;
    storeCardData(tokenId, data);

    return element;
}

function displayStatValue(val) {
    if (val === ACE_VALUE) return "A";
    return val;
}

function statStyle(val) {
    if (val === ACE_VALUE) return { color: "#ffd700", fontWeight: 900, textShadow: "0 0 6px rgba(255,215,0,0.6)" };
    return undefined;
}

var nftCache = {
    accountId: null,
    items: [],
    timestamp: 0
};

export function invalidateNftCache() {
    nftCache.accountId = null;
    nftCache.items = [];
    nftCache.timestamp = 0;
}

var imageCache = new Map();

var NftImage = memo(function NftImage({ src, originalSrc, alt, cacheKey }) {
    var cached = imageCache.get(cacheKey);
    var [loaded, setLoaded] = useState(cached ? true : false);
    var [imgSrc, setImgSrc] = useState(cached ? cached.finalSrc : (src || ""));
    var [failed, setFailed] = useState(false);
    var attemptRef = useRef(0);

    var handleError = useCallback(function () {
        if (attemptRef.current < GATEWAY_COUNT && originalSrc && isIpfsUrl(originalSrc)) {
            setImgSrc(ipfsGatewayUrl(originalSrc, attemptRef.current));
            attemptRef.current++;
        } else {
            setFailed(true);
        }
    }, [originalSrc]);

    var handleLoad = useCallback(function () {
        setLoaded(true);
        imageCache.set(cacheKey, { finalSrc: imgSrc });
    }, [cacheKey, imgSrc]);

    if (failed || !imgSrc) {
        return (
            <div className="inv-card-placeholder">
                <span>🎴</span>
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            alt={alt || ""}
            draggable="false"
            loading="lazy"
            onError={handleError}
            onLoad={handleLoad}
            className={loaded ? "inv-card-img loaded" : "inv-card-img"}
        />
    );
}, function (prev, next) {
    return prev.cacheKey === next.cacheKey;
});

var InventoryCard = memo(function InventoryCard({
    nft,
    isSelected,
    pickNo,
    onToggle
}) {
    var k = useMemo(function () { return nftKey(nft); }, [nft]);

    var stats = useMemo(function () {
        var s = nft.stats || { top: 5, right: 5, bottom: 5, left: 5 };
        return {
            top: s.top === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, s.top || 5)),
            right: s.right === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, s.right || 5)),
            bottom: s.bottom === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, s.bottom || 5)),
            left: s.left === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, s.left || 5))
        };
    }, [nft.stats]);

    var element = useMemo(function () {
        if (nft.element) return nft.element;
        var tokenId = nft.tokenId || nft.token_id || nft.id || k;
        return genElement(tokenId);
    }, [nft.element, nft.tokenId, nft.token_id, nft.id, k]);

    var rarity = useMemo(function () {
        return nft.rarity || getRarityFallback(nft.tokenId, 2131);
    }, [nft.rarity, nft.tokenId]);

    var handleClick = useCallback(function () {
        onToggle(k);
    }, [onToggle, k]);

    return (
        <button
            type="button"
            onClick={handleClick}
            className={"inv-card-game" + (isSelected ? " is-selected" : "")}
            style={{
                "--rank": rarity.border,
                "--rankGlow": rarity.glow
            }}
        >
            <div className="inv-card-art-full">
                <NftImage
                    src={nft.imageUrl}
                    originalSrc={nft.originalImageUrl}
                    alt={nft.name || ""}
                    cacheKey={k}
                />
            </div>

            <div className="inv-card-elem-pill">
                <span className="inv-card-elem-ic">{ELEM_ICON[element] || "🔮"}</span>
            </div>

            <div className="inv-tt-badge">
                <span className="inv-tt-num top" style={statStyle(stats.top)}>
                    {displayStatValue(stats.top)}
                </span>
                <span className="inv-tt-num left" style={statStyle(stats.left)}>
                    {displayStatValue(stats.left)}
                </span>
                <span className="inv-tt-num right" style={statStyle(stats.right)}>
                    {displayStatValue(stats.right)}
                </span>
                <span className="inv-tt-num bottom" style={statStyle(stats.bottom)}>
                    {displayStatValue(stats.bottom)}
                </span>
            </div>

            {isSelected && (
                <div className="inv-pick-badge">
                    <span className="inv-pick-no">{pickNo}</span>
                </div>
            )}
        </button>
    );
}, function (prev, next) {
    return (
        prev.isSelected === next.isSelected &&
        prev.pickNo === next.pickNo &&
        nftKey(prev.nft) === nftKey(next.nft)
    );
});

export default function Inventory({ token, onDeckReady }) {
    var ctx = useWalletConnect();
    var accountId = ctx.accountId;
    var connected = ctx.connected;

    var [loading, setLoading] = useState(false);
    var [nfts, setNfts] = useState([]);
    var [selected, setSelected] = useState(function () { return new Set(); });
    var [error, setError] = useState("");
    var [saving, setSaving] = useState(false);
    var [source, setSource] = useState("");
    var [refreshKey, setRefreshKey] = useState(0);

    var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

    var selectedArr = useMemo(function () {
        return Array.from(selected);
    }, [selected]);

    var orderMap = useMemo(function () {
        var m = new Map();
        selectedArr.forEach(function (k, i) { m.set(k, i + 1); });
        return m;
    }, [selectedArr]);

    var selectedNfts = useMemo(function () {
        return selectedArr.map(function (key) {
            return nfts.find(function (n) { return nftKey(n) === key; });
        }).filter(Boolean);
    }, [selectedArr, nfts]);

    useEffect(function () {
        var handleVisibilityChange = function () {
            if (document.visibilityState === 'visible' && connected && accountId) {
                var now = Date.now();
                if (nftCache.timestamp && (now - nftCache.timestamp) > 10000) {
                    nftCache.timestamp = 0;
                    setRefreshKey(function (k) { return k + 1; });
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return function () {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [connected, accountId]);

    var forceRefresh = useCallback(function () {
        invalidateNftCache();
        setRefreshKey(function (k) { return k + 1; });
    }, []);

    useEffect(function () {
        if (!token) return;

        var now = Date.now();
        var cacheValid = nftCache.accountId === accountId &&
            nftCache.items.length > 0 &&
            (now - nftCache.timestamp) < 60000;

        if (cacheValid) {
            setNfts(nftCache.items);
            setSource("✅ " + nftCache.items.length + " NFTs (cached)");
            return;
        }

        var alive = true;

        (async function () {
            setLoading(true);
            setError("");
            setSource("");

            try {
                var items = [];

                if (connected && accountId && nftContractId) {
                    try {
                        var tokens = await nearNftTokensForOwner(nftContractId, accountId);

                        items = tokens.map(function (t) {
                            // Извлекаем атрибуты из метаданных для рарности
                            var attributes = null;
                            if (t.metadata && t.metadata.extra) {
                                try {
                                    var extra = typeof t.metadata.extra === "string"
                                        ? JSON.parse(t.metadata.extra)
                                        : t.metadata.extra;
                                    if (extra && Array.isArray(extra.attributes)) {
                                        attributes = extra.attributes;
                                    } else if (extra && Array.isArray(extra)) {
                                        attributes = extra;
                                    }
                                } catch (e) { }
                            }
                            // Также проверяем reference метаданные
                            if (!attributes && t.metadata && t.metadata.attributes) {
                                attributes = t.metadata.attributes;
                            }

                            // Определяем рарность по трейтам или fallback по ID
                            var r = attributes
                                ? getRarityFromTraits(attributes)
                                : getRarityFallback(t.token_id, 2131);

                            var st = genStats(t.token_id, r);
                            var elem = genElement(t.token_id);

                            return {
                                key: "near:" + nftContractId + ":" + t.token_id,
                                chain: "near",
                                contractId: nftContractId,
                                tokenId: t.token_id,
                                token_id: t.token_id,
                                name: (t.metadata && t.metadata.title) || ("Card #" + t.token_id),
                                imageUrl: (t.metadata && t.metadata.media) || "",
                                originalImageUrl: (t.metadata && t.metadata.originalMedia) || "",
                                stats: st,
                                element: elem,
                                rarity: r,
                                rank: r.key,
                                rankLabel: r.key[0].toUpperCase(),
                                attributes: attributes,
                            };
                        });

                        nftCache.accountId = accountId;
                        nftCache.items = items;
                        nftCache.timestamp = Date.now();

                        setSource(items.length > 0 ? "✅ " + items.length + " NFTs" : "⚠️ 0 NFTs");
                    } catch (e) {
                        setSource("❌ " + (e.message || e));
                    }
                }

                if (items.length === 0 && !connected) {
                    setSource("Подключи кошелёк для загрузки NFT");
                }

                if (!alive) return;
                setNfts(items);
            } catch (e) {
                if (!alive) return;
                setError(e.message || "Error");
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return function () { alive = false; };
    }, [token, accountId, connected, nftContractId, refreshKey]);

    var toggle = useCallback(function (k) {
        setSelected(function (prev) {
            var next = new Set(prev);
            if (next.has(k)) {
                next.delete(k);
            } else {
                if (next.size >= 5) return prev;
                next.add(k);
            }
            return next;
        });
    }, []);

    var saveDeck = useCallback(async function () {
        if (selected.size !== 5) return;
        if (selectedNfts.length !== 5) return;

        setSaving(true);
        setError("");
        try {
            var cardsPayload = selectedNfts.map(function (nft) {
                var elem = nft.element || genElement(nft.tokenId || nft.token_id || nft.id);
                var rawStats = nft.stats || { top: 5, right: 5, bottom: 5, left: 5 };

                var safeStats = {
                    top: rawStats.top === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, rawStats.top || 5)),
                    right: rawStats.right === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, rawStats.right || 5)),
                    bottom: rawStats.bottom === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, rawStats.bottom || 5)),
                    left: rawStats.left === ACE_VALUE ? ACE_VALUE : Math.min(9, Math.max(1, rawStats.left || 5))
                };

                return {
                    id: nft.key || nft.tokenId || nft.token_id,
                    token_id: nft.tokenId || nft.token_id,
                    name: nft.name,
                    imageUrl: nft.imageUrl,
                    image: nft.imageUrl,
                    rarity: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    rank: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    element: elem,
                    values: safeStats,
                    stats: safeStats,
                    contract_id: nft.contractId
                };
            });

            var result = await apiFetch("/api/decks/save", {
                token: token,
                method: "POST",
                body: JSON.stringify({
                    cards: selectedArr,
                    full_cards: cardsPayload
                })
            });
            console.log("Deck saved:", result);
            setSaving(false);
            onDeckReady?.(selectedNfts);
        } catch (e) {
            console.error("Save deck error:", e);
            setError(e.message || "Save failed");
            setSaving(false);
        }
    }, [selected.size, selectedNfts, selectedArr, token, onDeckReady]);

    var resetSelection = useCallback(function () {
        setSelected(new Set());
    }, []);

    return (
        <div className="page inventory-page">
            <div className="inv-header">
                <h2 className="inv-title">
                    <span className="inv-title-icon">🎴</span>
                    Выбери колоду
                </h2>
                <div className="inv-subtitle">
                    Выбери 5 карт для игры • {selected.size}/5
                </div>
            </div>

            {connected && accountId ? (
                <div className="inv-info-box">
                    <div className="inv-info-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span>🔗 {accountId.length > 20 ? accountId.slice(0, 10) + "…" + accountId.slice(-6) : accountId}</span>
                        <button
                            onClick={forceRefresh}
                            disabled={loading}
                            style={{
                                padding: "4px 10px",
                                fontSize: 11,
                                borderRadius: 8,
                                border: "1px solid rgba(120,200,255,0.3)",
                                background: "rgba(120,200,255,0.1)",
                                color: "#78c8ff",
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.5 : 1,
                            }}
                        >
                            🔄 Обновить
                        </button>
                    </div>
                    {source && (
                        <div
                            className="inv-info-value"
                            style={{
                                marginTop: 4,
                                color: source.startsWith("✅") ? "#22c55e" : source.startsWith("❌") ? "#ff6b6b" : "#f59e0b"
                            }}
                        >
                            {source}
                        </div>
                    )}
                </div>
            ) : (
                <div className="inv-info-box">
                    <div className="inv-info-label" style={{ color: "#f59e0b" }}>
                        ⚠️ Подключи кошелёк на главной
                    </div>
                </div>
            )}

            {error && <div className="inv-error">⚠️ {error}</div>}

            {!token && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Ожидание авторизации…</div>
                </div>
            )}

            {loading && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Загрузка NFT…</div>
                </div>
            )}

            {!loading && nfts.length === 0 && token && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">
                        {connected ? "NFT не найдены для " + accountId : "Подключи кошелёк на главной странице"}
                    </div>
                    {connected && (
                        <button
                            onClick={forceRefresh}
                            style={{
                                marginTop: 16,
                                padding: "10px 20px",
                                fontSize: 14,
                                borderRadius: 10,
                                border: "1px solid rgba(120,200,255,0.4)",
                                background: "rgba(120,200,255,0.15)",
                                color: "#78c8ff",
                                cursor: "pointer",
                            }}
                        >
                            🔄 Обновить
                        </button>
                    )}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map(function (n) {
                        var k = nftKey(n);
                        var isSelected = selected.has(k);
                        var pickNo = orderMap.get(k) || 0;
                        return (
                            <InventoryCard
                                key={k}
                                nft={n}
                                isSelected={isSelected}
                                pickNo={pickNo}
                                onToggle={toggle}
                            />
                        );
                    })}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-actions">
                    <button
                        className="inv-btn inv-btn-secondary"
                        onClick={resetSelection}
                        disabled={!selected.size || saving}
                    >
                        Сбросить
                    </button>
                    <button
                        className="inv-btn inv-btn-primary"
                        disabled={selected.size !== 5 || saving}
                        onClick={saveDeck}
                    >
                        {saving ? "Сохранение..." : selected.size === 5 ? "Играть! →" : "Выбери " + (5 - selected.size) + " карт"}
                    </button>
                </div>
            )}
        </div>
    );
}