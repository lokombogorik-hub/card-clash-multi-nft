import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner, isIpfsUrl, ipfsGatewayUrl, GATEWAY_COUNT } from "../libs/nearNft";

// Миграция: сбросить старые данные для новой системы рарности
(function migrateRarity() {
    try {
        if (localStorage.getItem("cc_rarity_v6_final")) return;
        var keys = Object.keys(localStorage);
        for (var i = 0; i < keys.length; i++) {
            if (keys[i].startsWith("cc_card_")) {
                localStorage.removeItem(keys[i]);
            }
        }
        localStorage.setItem("cc_rarity_v6_final", "1");
    } catch (e) { }
})();

var ACE_VALUE = 10;
var TOTAL_SUPPLY = 2129;

/* ═══════════════════════════════════════════════════
   TRAIT RARITY TABLE — точные проценты из коллекции
   ═══════════════════════════════════════════════════ */
var TRAIT_RARITY = {
    "Background": {
        "Ancient ruins": 0.05, "Apocalypse": 0.05, "Aristocrat's house": 0.05, "Ashes": 0.05,
        "Autumn evening": 2.44, "Black Wall": 2.02, "Blue paints": 2.11, "Blue rings": 2.11,
        "City": 1.32, "City of Ashes": 1.74, "Cold morning": 1.74, "Country evening": 1.46,
        "Cracked ball": 1.97, "Crypt": 1.36, "Dark forest": 1.88, "Darkforest": 1.88,
        "Dragon spirit": 0.05, "Evening field": 2.02, "Evening light": 2.02, "Forest": 1.6,
        "Forest of Oblivion": 1.93, "Future": 0.05, "Gears": 1.88, "Ghost": 1.88,
        "Golden Radiance": 1.69, "Golden age": 1.64, "Graffiti wall": 0.05, "Green ball": 1.64,
        "Green wall": 1.5, "Laboratory": 1.64, "Lake shore": 1.97, "Lunar oblivion": 2.25,
        "Meteor shower": 1.55, "Midway park": 0.05, "Moon": 2.11, "Morning forest": 1.64,
        "Mountain beach": 1.78, "Near factory": 0.05, "Necromancer's Abode": 0.05,
        "Neon circle": 2.11, "Neon city": 1.83, "Neon diamond": 1.74, "Night": 1.6,
        "Night city": 0.05, "Night street": 1.55, "Night trail": 2.58, "Old castle": 0.05,
        "Olympus": 0.05, "Orange canvas": 1.93, "Overcast clouds": 1.74, "Paris": 1.88,
        "Pink bubbles": 2.11, "Pixel landscape": 1.64, "Purple style": 2.02, "Pyramid": 2.25,
        "Quiet Sun": 0.05, "Radiation": 1.55, "Reading room": 1.6, "Road forest": 1.46,
        "Room": 2.54, "Rotten Grove": 1.97, "Ruins": 1.36, "Slanting rain": 1.74,
        "Sorcerer Forest": 0.05, "Spring forest": 2.16, "Street Lanterns": 2.07,
        "Through the Twilight": 0.05, "Twilight": 1.83, "Vampire house": 0.05,
        "Winter forest": 1.6, "evening lights": 1.55,
    },
    "Body": {
        "Ash Whirlwind": 0.05, "Ash gray haze": 0.05, "Ashes of Time": 0.05, "Black": 9.53,
        "Blue": 9.3, "Bluish gray": 0.05, "Cloud smoke": 0.05, "Coal smoke": 0.05,
        "Cosmic reflection": 0.05, "Dusty obsidian": 0.05, "Gray": 9.91, "Grayish": 0.05,
        "Grey Stream": 0.05, "Infernal Violet": 0.05, "Light gray": 8.88, "Lilac": 10.8,
        "Lunar ash": 0.05, "Midnight gray": 0.05, "Orange": 10.29, "Pink": 9.86,
        "Purple gray": 0.05, "Red": 10.33, "Redhead": 0.05, "Salad green": 9.53,
        "Thundercloud": 0.05, "Warhammer": 0.05, "White": 10.76,
    },
    "Eyes": {
        "Amber Ember Eyes": 0.05, "Ash Phantom": 0.05, "Blood": 9.07, "Bloody eye": 0.05,
        "Crystal glint": 0.05, "Ghost eyes": 0.05, "Hi Tech": 8.92, "Honeycombs": 10.29,
        "Hot eyes": 0.05, "Hypnosis": 8.08, "Jester's Eyes": 0.05, "Legion g": 0.05,
        "Moon Shadow": 0.05, "Necromancer's Eyes": 0.05, "Omni eye": 0.05, "Pink": 8.27,
        "Pink glare": 8.97, "Purple": 9.35, "Red": 9.49, "Sandy": 0.05,
        "Shining Stream": 0.05, "Sorcerer eye": 0.05, "Thunderbolt Glow": 0.05,
        "Venom": 9.11, "Volcanic heat": 0.05, "White": 8.97, "Yellow highlights": 0.05,
        "Zombie": 8.69,
    },
    "Head": {
        "Barber Broo": 2.96, "Biker hairstyle": 2.54, "Bogocha glasses": 2.68,
        "Brown fashionable": 2.72, "CC": 2.72, "Cedar": 2.87, "Chef's hat": 2.35,
        "Corey": 0.05, "Crown Kings": 2.49, "Curly hair": 2.63, "Cyber detective hat": 3.62,
        "Cyclops": 3.1, "Deep Shadow": 0.05, "Diamond glasses": 2.82, "Didi": 1.69,
        "Digital glasses": 2.49, "Dir": 2.72, "Dragon helmet": 0.05, "Dreamer's cap": 0.05,
        "Earflap hat": 0.05, "Easter hat": 2.96, "Fashion glass": 2.4, "Fool's cap": 0.05,
        "Goggles": 3.15, "Golden wreath": 0.05, "Hermes": 2.72, "Hockey helmet": 3.05,
        "Horns of the Abyss": 0.05, "Hot cylinder": 0.05, "Jacket hat": 3.62,
        "Lab glasses": 2.68, "Mafia hat": 2.49, "Magnetus helmet": 3.29, "Major's cap": 2.3,
        "Mechanical glasses": 0.05, "Morning Mist Helmet": 0.05, "Neon glasses": 2.77,
        "Nightcap": 2.58, "Omni hair": 0.05, "Pork": 2.35, "Robocop helmet": 2.63,
        "Rose-colored glasses": 2.87, "Sand cape": 0.05, "Shadow Necromancer": 0.05,
        "Sharp visor": 2.68, "Shiny hat": 2.72, "Short hairstyle": 2.49, "Snow goggles": 2.96,
        "Sorcerer hair": 0.05, "Straw hat": 3.48, "Transparent wool": 0.05,
        "Warhammer helmet": 0.05, "Yellow 75 glasses": 2.63,
    },
    "Suits": {
        "Abibas": 1.69, "Astartes Space Marines": 0.05, "Balenci": 2.11, "Balenciaga": 1.41,
        "Belivera raincoat": 1.46, "Biker vest": 1.78, "Bottega Veneta": 1.41, "CC": 1.36,
        "Celine": 1.97, "Cloak of Near legion": 0.05, "Cook": 1.69, "Cyber detective": 1.6,
        "DG": 1.46, "Desert nomad": 0.05, "Didi": 1.64, "Dies": 1.78, "Digital down": 1.46,
        "Doctor": 1.83, "Dreamer": 0.05, "Easter costume": 1.13, "Exo suit": 1.46,
        "Exoskeleton": 1.46, "Farmer's shirt": 1.13, "Fire jacket": 1.64, "Ghost": 0.05,
        "Glamorous puffer": 1.6, "Glitch": 1.69, "Green acid": 1.5, "Green poison": 1.46,
        "Gucci jacket": 1.46, "Hawaiian shirt": 1.5, "Hermes coat": 1.41, "Hockey player": 1.55,
        "Hole time": 1.22, "Ice armor": 1.36, "Infected": 1.32, "Iron captain": 1.5,
        "Iron lava": 1.13, "Jacket": 1.32, "Jester's motley": 0.05, "Jordan": 1.74,
        "Kayvin Klein": 1.64, "LV": 1.32, "Louis Vuitton": 1.5, "Lvs": 1.17, "Mafia": 1.64,
        "Magic costume": 1.5, "Magnetus": 1.6, "Maki": 1.74, "Mantle Kings": 1.13,
        "Mechanical": 1.27, "Mechanical armor": 0.05, "Neon chains": 1.6,
        "Neon windbreaker": 1.55, "Nightgown": 1.22, "Nike": 1.32,
        "Obsidian Chain of Power": 0.05, "OmniBlinks": 0.05, "Peaked cap": 2.02,
        "Pearl jacket": 0.05, "Pink armor": 1.27, "Prada": 1.97, "Pulsar of Eternity": 1.08,
        "Raincoat": 1.32, "Red techno": 1.36, "Robocop": 1.5, "Robot": 1.41, "Saint L": 2.07,
        "Samurai": 0.05, "Samurai Ashigaru": 1.46, "Shadow Necromancer": 0.05,
        "Smoky ashes": 1.17, "Sorcerer": 0.05, "Summer shirt": 1.69, "Tailcoat suit": 0.05,
        "Vampire": 0.05, "Venom": 0.05, "White Fur Coat": 1.17, "White roba": 1.41,
        "Winter coat": 1.78, "Zeus": 0.05, "Zombie": 1.27, "jacket rhinestones": 1.83,
    },
    "Teeth": {
        "Alabaster tone": 0.09, "Amber spark": 0.05, "Echo of Ashes": 0.05,
        "Ethereal shine": 0.05, "Frozen teeth": 8.45, "Ghostly blue": 0.05, "Glint": 0.05,
        "Golden": 7.05, "Golden Fag": 0.05, "Gray": 8.03, "Jester's Teeth": 0.05,
        "Lava": 8.92, "Mechanical": 8.03, "Opal light": 0.05, "Orange": 8.41,
        "Palette": 8.27, "Purable white": 0.05, "Purple teeth": 0.05, "Rainbow": 9.39,
        "Raleigh RR-32": 8.41, "Reddish glow": 0.05, "Runes": 8.45, "Salad greens": 0.05,
        "Snow-white": 0.05, "Stone ruins": 8.45, "Titanium glitter": 0.05,
        "Vampire fangs": 0.05, "White": 7.33,
    },
};

/* ═══════════════════════════════════════════════════
   RARITY SCORE — формула Hotcraft: Σ(1/percentage)
   
   Откалибровано по реальным данным:
   - Ранг 1-3:     score 120+ (все 0.05% трейты)
   - Ранг 57-59:   score ~2.15-2.28
   - Ранг 150-250: score ~1.94-2.04
   - Ранг 700-950: score ~1.58-1.69
   - Ранг 1600+:   score ~1.31-1.40
   
   Пороги:
   - Legendary: score >= 10 (1/1 NFT с уникальными трейтами)
   - Epic:      score >= 1.90 (топ ~300, ранг <300)
   - Rare:      score >= 1.55 (ранг <1000)
   - Common:    score < 1.55 (ранг 1000+)
   ═══════════════════════════════════════════════════ */

function calculateRarityScore(attributes) {
    if (!attributes || !Array.isArray(attributes) || attributes.length === 0) {
        return 0;
    }

    var score = 0;
    for (var i = 0; i < attributes.length; i++) {
        var attr = attributes[i];
        var traitType = attr.trait_type;
        var traitValue = attr.value;

        var percentage = 5; // default для неизвестных
        if (TRAIT_RARITY[traitType] && TRAIT_RARITY[traitType][traitValue] !== undefined) {
            percentage = TRAIT_RARITY[traitType][traitValue];
        }

        if (percentage > 0) {
            score += 1 / percentage;
        }
    }

    return score;
}

function getRarityFromScore(score) {
    // Legendary: 1/1 NFT с супер-редкими трейтами (все 0.05%)
    // Score 120 = все 6 трейтов по 0.05%
    // Score >= 10 = минимум 1-2 трейта 0.05%
    if (score >= 10) {
        return { key: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 7, max: 9 };
    }

    // Epic: топ ~300 (ранг < 300), score ~1.90+
    if (score >= 1.90) {
        return { key: "epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    }

    // Rare: ранг 300-1000, score 1.55-1.90
    if (score >= 1.55) {
        return { key: "rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    }

    // Common: ранг 1000+, score < 1.55
    return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
}

function getRarityFromTraits(attributes) {
    var score = calculateRarityScore(attributes);
    return getRarityFromScore(score);
}

// Fallback если нет атрибутов — по позиции token_id
function getRarityFallback(tokenId) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;

    // Первые ~17 NFT (1-17) — это 1/1 легендарки
    if (num <= 17) {
        return { key: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 7, max: 9 };
    }

    // ~14% Epic (300 NFT)
    if (num <= 320) {
        return { key: "epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    }

    // ~33% Rare (700 NFT)
    if (num <= 1020) {
        return { key: "rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    }

    // Остальные Common
    return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
}

/* ═══════════════════════════════════════════════════ */

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

    var seed = createSeed(tokenId, "stats_v7");
    var rng = mulberry32(seed);

    var min = Math.max(1, rarity.min);
    var max = Math.min(9, rarity.max);

    var stats = {
        top: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        right: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        bottom: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        left: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min))
    };

    // Ace для legendary (50%) и epic (20%)
    var aceChance = 0;
    if (rarity.key === "legendary") aceChance = 0.5;
    else if (rarity.key === "epic") aceChance = 0.2;

    if (aceChance > 0) {
        var aceRng = mulberry32(createSeed(tokenId, "ace_v4"));
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
        return nft.rarity || getRarityFallback(nft.tokenId);
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
                            var attributes = null;
                            if (t.metadata) {
                                if (t.metadata.extra) {
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
                                if (!attributes && t.metadata.attributes) {
                                    attributes = t.metadata.attributes;
                                }
                            }

                            var r = attributes
                                ? getRarityFromTraits(attributes)
                                : getRarityFallback(t.token_id);

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