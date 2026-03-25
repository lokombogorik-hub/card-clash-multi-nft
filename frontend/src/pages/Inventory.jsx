import { useEffect, useMemo, useState, useCallback, useRef, memo } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner, isIpfsUrl, ipfsGatewayUrl, GATEWAY_COUNT } from "../libs/nearNft";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return n.chain + ":" + n.contractId + ":" + n.tokenId;
    if (n.token_id) return "near::" + n.token_id;
    return "mock:" + (n.id || Math.random().toString(36).slice(2));
}

var ELEM_ICON = {
    Earth: "🌍", Fire: "🔥", Water: "💧", Poison: "☠️",
    Holy: "✨", Thunder: "⚡", Wind: "🌪️", Ice: "❄️"
};

var ELEM_COLOR = {
    Earth: { bg: "rgba(139,69,19,0.25)", border: "rgba(139,90,43,0.6)", text: "#d4a574" },
    Fire: { bg: "rgba(239,68,68,0.25)", border: "rgba(239,68,68,0.6)", text: "#ff6b6b" },
    Water: { bg: "rgba(59,130,246,0.25)", border: "rgba(59,130,246,0.6)", text: "#60a5fa" },
    Poison: { bg: "rgba(34,197,94,0.25)", border: "rgba(34,197,94,0.6)", text: "#4ade80" },
    Holy: { bg: "rgba(250,204,21,0.25)", border: "rgba(250,204,21,0.6)", text: "#fcd34d" },
    Thunder: { bg: "rgba(234,179,8,0.25)", border: "rgba(234,179,8,0.6)", text: "#facc15" },
    Wind: { bg: "rgba(148,163,184,0.25)", border: "rgba(148,163,184,0.6)", text: "#94a3b8" },
    Ice: { bg: "rgba(56,189,248,0.25)", border: "rgba(56,189,248,0.6)", text: "#38bdf8" }
};

var ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"];

function hashCode(str) {
    var hash = 0, str2 = String(str);
    for (var i = 0; i < str2.length; i++) {
        hash = ((hash << 5) - hash) + str2.charCodeAt(i);
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
    return hashCode(String(tokenId) + "_" + String(salt || "default"));
}

function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 2000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;
    if (pct <= 10) return { key: "legendary", label: "Legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 6, max: 9 };
    if (pct <= 30) return { key: "epic", label: "Epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    if (pct <= 60) return { key: "rare", label: "Rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    return { key: "common", label: "Common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
}

function getStoredCardData(tokenId) {
    try {
        var stored = localStorage.getItem("cc_card_" + String(tokenId));
        if (stored) return JSON.parse(stored);
    } catch (e) { }
    return null;
}

function storeCardData(tokenId, data) {
    try { localStorage.setItem("cc_card_" + String(tokenId), JSON.stringify(data)); } catch (e) { }
}

function genStats(tokenId, rarity) {
    var stored = getStoredCardData(tokenId);
    if (stored && stored.stats && typeof stored.stats.top === "number") {
        var s = stored.stats;
        if (s.top <= 9 && s.right <= 9 && s.bottom <= 9 && s.left <= 9) return s;
    }
    var rng = mulberry32(createSeed(tokenId, "stats_v4"));
    var min = Math.max(1, rarity.min), max = Math.min(9, rarity.max);
    var stats = {
        top: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        right: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        bottom: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min)),
        left: Math.min(9, Math.max(1, Math.floor(rng() * (max - min + 1)) + min))
    };
    var data = stored || {};
    data.stats = stats;
    storeCardData(tokenId, data);
    return stats;
}

function genElement(tokenId) {
    var stored = getStoredCardData(tokenId);
    if (stored && stored.element) return stored.element;
    var rng = mulberry32(createSeed(tokenId, "element_v3"));
    var element = ELEMENTS[Math.floor(rng() * ELEMENTS.length)];
    var data = stored || {};
    data.element = element;
    storeCardData(tokenId, data);
    return element;
}

var nftCache = { accountId: null, items: [], timestamp: 0 };

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

/* ─── Карточка ────────────────────────────────────────────────── */
var InventoryCard = memo(function InventoryCard({ nft, isSelected, pickNo, onToggle, index }) {
    var k = useMemo(function () { return nftKey(nft); }, [nft]);

    var stats = useMemo(function () {
        var s = nft.stats || { top: 5, right: 5, bottom: 5, left: 5 };
        return {
            top: Math.min(9, Math.max(1, s.top || 5)),
            right: Math.min(9, Math.max(1, s.right || 5)),
            bottom: Math.min(9, Math.max(1, s.bottom || 5)),
            left: Math.min(9, Math.max(1, s.left || 5))
        };
    }, [nft.stats]);

    var element = useMemo(function () {
        if (nft.element) return nft.element;
        return genElement(nft.tokenId || nft.token_id || nft.id || k);
    }, [nft.element, nft.tokenId, nft.token_id, nft.id, k]);

    var rarity = useMemo(function () {
        return nft.rarity || getRarityFromTokenId(nft.tokenId, 2000);
    }, [nft.rarity, nft.tokenId]);

    var elemColors = ELEM_COLOR[element] || ELEM_COLOR.Water;

    var handleClick = useCallback(function () { onToggle(k); }, [onToggle, k]);

    var totalPower = stats.top + stats.right + stats.bottom + stats.left;

    return (
        <button
            type="button"
            onClick={handleClick}
            className={
                "inv-card-game" +
                (isSelected ? " is-selected" : "") +
                " rarity-" + rarity.key
            }
            style={{
                "--rank": rarity.border,
                "--rankGlow": rarity.glow,
                "--elem-bg": elemColors.bg,
                "--elem-border": elemColors.border,
                "--elem-text": elemColors.text,
                "--enter-delay": (index % 20) * 40 + "ms"
            }}
        >
            {/* Голографический оверлей для legendary/epic */}
            {(rarity.key === "legendary" || rarity.key === "epic") && (
                <div className="inv-card-holo-overlay" />
            )}

            <div className="inv-card-art-full">
                <NftImage
                    src={nft.imageUrl}
                    originalSrc={nft.originalImageUrl}
                    alt={nft.name || ""}
                    cacheKey={k}
                />
            </div>

            {/* Элемент бейдж */}
            <div className="inv-card-elem-pill" title={element}>
                <span className="inv-card-elem-ic">{ELEM_ICON[element] || "🔮"}</span>
            </div>

            {/* Rarity индикатор */}
            <div className={"inv-card-rarity-dot rarity-" + rarity.key} title={rarity.label || rarity.key} />

            {/* Стат-ромб */}
            <div className="inv-tt-badge">
                <span className="inv-tt-num top">{stats.top}</span>
                <span className="inv-tt-num left">{stats.left}</span>
                <span className="inv-tt-num right">{stats.right}</span>
                <span className="inv-tt-num bottom">{stats.bottom}</span>
            </div>

            {/* Суммарная сила */}
            <div className="inv-card-power">
                <span className="inv-card-power-val">{totalPower}</span>
            </div>

            {/* Имя карты */}
            <div className="inv-card-name-strip">
                <span className="inv-card-name-text">{nft.name || "Card"}</span>
            </div>

            {/* Бейдж выбора */}
            {isSelected && (
                <div className="inv-pick-badge">
                    <span className="inv-pick-no">{pickNo}</span>
                    <span className="inv-pick-check">✓</span>
                </div>
            )}

            {/* Selection overlay */}
            <div className="inv-card-select-overlay" />
        </button>
    );
}, function (prev, next) {
    return (
        prev.isSelected === next.isSelected &&
        prev.pickNo === next.pickNo &&
        prev.index === next.index &&
        nftKey(prev.nft) === nftKey(next.nft)
    );
});

/* ─── Превью выбранной карты в dock ─────────────────────────── */
function DeckSlot({ nft, index, onRemove }) {
    var element = nft ? (nft.element || genElement(nft.tokenId || nft.token_id || "")) : null;
    var elemColors = element ? (ELEM_COLOR[element] || ELEM_COLOR.Water) : null;

    return (
        <div
            className={"inv-deck-slot" + (nft ? " filled" : "")}
            style={nft ? { "--slot-border": elemColors.border } : {}}
            onClick={nft ? function () { onRemove(nftKey(nft)); } : undefined}
        >
            {nft ? (
                <>
                    <NftImage
                        src={nft.imageUrl}
                        originalSrc={nft.originalImageUrl}
                        alt={nft.name || ""}
                        cacheKey={nftKey(nft) + "_slot"}
                    />
                    <div className="inv-deck-slot-num">{index + 1}</div>
                </>
            ) : (
                <div className="inv-deck-slot-empty">
                    <span>{index + 1}</span>
                </div>
            )}
        </div>
    );
}

/* ─── Основной компонент ─────────────────────────────────────── */
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
    var [filterElement, setFilterElement] = useState("all");
    var [sortBy, setSortBy] = useState("default");

    var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

    var selectedArr = useMemo(function () { return Array.from(selected); }, [selected]);

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

    // Фильтрация и сортировка
    var displayNfts = useMemo(function () {
        var filtered = nfts;
        if (filterElement !== "all") {
            filtered = nfts.filter(function (n) {
                var elem = n.element || genElement(n.tokenId || n.token_id || "");
                return elem === filterElement;
            });
        }

        if (sortBy === "power") {
            filtered = filtered.slice().sort(function (a, b) {
                var sa = a.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                var sb = b.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                return (sb.top + sb.right + sb.bottom + sb.left) - (sa.top + sa.right + sa.bottom + sa.left);
            });
        } else if (sortBy === "rarity") {
            var rarityOrder = { legendary: 0, epic: 1, rare: 2, common: 3 };
            filtered = filtered.slice().sort(function (a, b) {
                var ra = (a.rarity && a.rarity.key) || "common";
                var rb = (b.rarity && b.rarity.key) || "common";
                return (rarityOrder[ra] || 3) - (rarityOrder[rb] || 3);
            });
        }

        return filtered;
    }, [nfts, filterElement, sortBy]);

    // Deck power
    var deckPower = useMemo(function () {
        return selectedNfts.reduce(function (sum, n) {
            var s = n.stats || { top: 5, right: 5, bottom: 5, left: 5 };
            return sum + s.top + s.right + s.bottom + s.left;
        }, 0);
    }, [selectedNfts]);

    useEffect(function () {
        var handleVisibilityChange = function () {
            if (document.visibilityState === 'visible' && connected && accountId) {
                if (nftCache.timestamp && (Date.now() - nftCache.timestamp) > 10000) {
                    nftCache.timestamp = 0;
                    setRefreshKey(function (k) { return k + 1; });
                }
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return function () { document.removeEventListener('visibilitychange', handleVisibilityChange); };
    }, [connected, accountId]);

    var forceRefresh = useCallback(function () {
        invalidateNftCache();
        setRefreshKey(function (k) { return k + 1; });
    }, []);

    useEffect(function () {
        if (!token) return;
        var now = Date.now();
        var cacheValid = nftCache.accountId === accountId && nftCache.items.length > 0 && (now - nftCache.timestamp) < 60000;
        if (cacheValid) {
            setNfts(nftCache.items);
            setSource("✅ " + nftCache.items.length + " NFTs (cached)");
            return;
        }
        var alive = true;
        (async function () {
            setLoading(true); setError(""); setSource("");
            try {
                var items = [];
                if (connected && accountId && nftContractId) {
                    try {
                        var tokens = await nearNftTokensForOwner(nftContractId, accountId);
                        items = tokens.map(function (t) {
                            var r = getRarityFromTokenId(t.token_id, 2000);
                            var st = genStats(t.token_id, r);
                            var elem = genElement(t.token_id);
                            return {
                                key: "near:" + nftContractId + ":" + t.token_id,
                                chain: "near", contractId: nftContractId,
                                tokenId: t.token_id, token_id: t.token_id,
                                name: (t.metadata && t.metadata.title) || ("Card #" + t.token_id),
                                imageUrl: (t.metadata && t.metadata.media) || "",
                                originalImageUrl: (t.metadata && t.metadata.originalMedia) || "",
                                stats: st, element: elem, rarity: r,
                                rank: r.key, rankLabel: r.key[0].toUpperCase(),
                            };
                        });
                        nftCache.accountId = accountId;
                        nftCache.items = items;
                        nftCache.timestamp = Date.now();
                        setSource(items.length > 0 ? "✅ " + items.length + " NFTs" : "⚠️ 0 NFTs");
                    } catch (e) { setSource("❌ " + (e.message || e)); }
                }
                if (items.length === 0 && !connected) setSource("Подключи кошелёк для загрузки NFT");
                if (!alive) return;
                setNfts(items);
            } catch (e) {
                if (!alive) return;
                setError(e.message || "Error");
            } finally { if (alive) setLoading(false); }
        })();
        return function () { alive = false; };
    }, [token, accountId, connected, nftContractId, refreshKey]);

    var toggle = useCallback(function (k) {
        setSelected(function (prev) {
            var next = new Set(prev);
            if (next.has(k)) { next.delete(k); }
            else { if (next.size >= 5) return prev; next.add(k); }
            return next;
        });
    }, []);

    var saveDeck = useCallback(async function () {
        if (selected.size !== 5 || selectedNfts.length !== 5) return;
        setSaving(true); setError("");
        try {
            var cardsPayload = selectedNfts.map(function (nft) {
                var elem = nft.element || genElement(nft.tokenId || nft.token_id || nft.id);
                var safeStats = {
                    top: Math.min(9, Math.max(1, (nft.stats && nft.stats.top) || 5)),
                    right: Math.min(9, Math.max(1, (nft.stats && nft.stats.right) || 5)),
                    bottom: Math.min(9, Math.max(1, (nft.stats && nft.stats.bottom) || 5)),
                    left: Math.min(9, Math.max(1, (nft.stats && nft.stats.left) || 5))
                };
                return {
                    id: nft.key || nft.tokenId || nft.token_id,
                    token_id: nft.tokenId || nft.token_id,
                    name: nft.name, imageUrl: nft.imageUrl, image: nft.imageUrl,
                    rarity: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    rank: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    element: elem, values: safeStats, stats: safeStats,
                    contract_id: nft.contractId
                };
            });
            var result = await apiFetch("/api/decks/save", {
                token: token, method: "POST",
                body: JSON.stringify({ cards: selectedArr, full_cards: cardsPayload })
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

    var resetSelection = useCallback(function () { setSelected(new Set()); }, []);

    return (
        <div className="page inventory-page">
            {/* Заголовок */}
            <div className="inv-header">
                <h2 className="inv-title">
                    <span className="inv-title-icon">⚔️</span>
                    Собери колоду
                </h2>
                <div className="inv-subtitle">
                    Выбери 5 карт для битвы
                </div>
            </div>

            {/* Deck dock — превью 5 слотов */}
            <div className="inv-deck-dock">
                <div className="inv-deck-slots">
                    {[0, 1, 2, 3, 4].map(function (i) {
                        return (
                            <DeckSlot
                                key={i}
                                nft={selectedNfts[i] || null}
                                index={i}
                                onRemove={toggle}
                            />
                        );
                    })}
                </div>
                <div className="inv-deck-info">
                    <div className="inv-deck-counter">
                        <span className={"inv-deck-count" + (selected.size === 5 ? " complete" : "")}>
                            {selected.size}
                        </span>
                        <span className="inv-deck-count-sep">/</span>
                        <span className="inv-deck-count-total">5</span>
                    </div>
                    {deckPower > 0 && (
                        <div className="inv-deck-power">
                            ⚡ {deckPower}
                        </div>
                    )}
                </div>
            </div>

            {/* Кошелёк и статус */}
            {connected && accountId ? (
                <div className="inv-wallet-bar">
                    <div className="inv-wallet-addr">
                        <span className="inv-wallet-dot" />
                        {accountId.length > 24 ? accountId.slice(0, 12) + "…" + accountId.slice(-8) : accountId}
                    </div>
                    <button className="inv-btn-ghost" onClick={forceRefresh} disabled={loading}>
                        🔄
                    </button>
                    {source && (
                        <div className={
                            "inv-wallet-status" +
                            (source.startsWith("✅") ? " ok" : source.startsWith("❌") ? " err" : " warn")
                        }>
                            {source}
                        </div>
                    )}
                </div>
            ) : (
                <div className="inv-wallet-bar disconnected">
                    <span className="inv-wallet-dot off" />
                    Подключи кошелёк на главной
                </div>
            )}

            {error && <div className="inv-error">⚠️ {error}</div>}

            {/* Фильтры */}
            {nfts.length > 0 && (
                <div className="inv-filters">
                    <div className="inv-filter-group">
                        <button
                            className={"inv-filter-btn" + (filterElement === "all" ? " active" : "")}
                            onClick={function () { setFilterElement("all"); }}
                        >
                            Все
                        </button>
                        {ELEMENTS.map(function (el) {
                            return (
                                <button
                                    key={el}
                                    className={"inv-filter-btn elem" + (filterElement === el ? " active" : "")}
                                    onClick={function () { setFilterElement(el); }}
                                    title={el}
                                >
                                    {ELEM_ICON[el]}
                                </button>
                            );
                        })}
                    </div>
                    <div className="inv-sort-group">
                        <select
                            className="inv-sort-select"
                            value={sortBy}
                            onChange={function (e) { setSortBy(e.target.value); }}
                        >
                            <option value="default">По умолчанию</option>
                            <option value="power">По силе ↓</option>
                            <option value="rarity">По редкости ↓</option>
                        </select>
                    </div>
                </div>
            )}

            {/* Состояния загрузки */}
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
                        {connected ? "NFT не найдены для " + accountId : "Подключи кошелёк на главной"}
                    </div>
                    {connected && (
                        <button className="inv-btn inv-btn-secondary" onClick={forceRefresh} style={{ marginTop: 16 }}>
                            🔄 Обновить
                        </button>
                    )}
                </div>
            )}

            {/* Сетка карт */}
            {displayNfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {displayNfts.map(function (n, i) {
                        var k = nftKey(n);
                        return (
                            <InventoryCard
                                key={k}
                                nft={n}
                                isSelected={selected.has(k)}
                                pickNo={orderMap.get(k) || 0}
                                onToggle={toggle}
                                index={i}
                            />
                        );
                    })}
                </div>
            )}

            {/* Нижняя панель действий */}
            {nfts.length > 0 && (
                <div className={"inv-actions-bar" + (selected.size === 5 ? " ready" : "")}>
                    <button
                        className="inv-btn inv-btn-secondary"
                        onClick={resetSelection}
                        disabled={!selected.size || saving}
                    >
                        ✕ Сбросить
                    </button>
                    <button
                        className={"inv-btn inv-btn-primary" + (selected.size === 5 ? " pulse-ready" : "")}
                        disabled={selected.size !== 5 || saving}
                        onClick={saveDeck}
                    >
                        {saving
                            ? "⏳ Сохранение..."
                            : selected.size === 5
                                ? "⚔️ В бой!"
                                : "Выбери ещё " + (5 - selected.size)
                        }
                    </button>
                </div>
            )}
        </div>
    );
}