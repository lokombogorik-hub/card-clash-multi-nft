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
    Earth: "🪨",
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

function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 2000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;

    if (pct <= 10) return { key: "legendary", border: "#ffd700", glow: "rgba(255,215,0,0.60)", min: 6, max: 9 };
    if (pct <= 30) return { key: "epic", border: "#a855f7", glow: "rgba(168,85,247,0.55)", min: 5, max: 9 };
    if (pct <= 60) return { key: "rare", border: "#3b82f6", glow: "rgba(59,130,246,0.55)", min: 3, max: 7 };
    return { key: "common", border: "#6b7280", glow: "rgba(107,114,128,0.50)", min: 1, max: 5 };
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
        return stored.stats;
    }

    var seed = createSeed(tokenId, "stats_v3");
    var rng = mulberry32(seed);

    var min = rarity.min;
    var max = rarity.max;

    if (max > 9) max = 9;
    if (min < 1) min = 1;

    var stats = {
        top: Math.floor(rng() * (max - min + 1)) + min,
        right: Math.floor(rng() * (max - min + 1)) + min,
        bottom: Math.floor(rng() * (max - min + 1)) + min,
        left: Math.floor(rng() * (max - min + 1)) + min
    };

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

function safeParse(s) {
    try {
        if (!s) return null;
        if (typeof s === "object") return s;
        return JSON.parse(String(s));
    } catch (e) {
        return null;
    }
}

var nftCache = {
    accountId: null,
    items: [],
    timestamp: 0
};

var imageCache = new Map();

var NftImage = memo(function NftImage({ src, originalSrc, alt, cacheKey }) {
    var cached = imageCache.get(cacheKey);

    var [stage, setStage] = useState(cached ? cached.stage : 0);
    var [loaded, setLoaded] = useState(cached ? cached.loaded : false);
    var [finalSrc, setFinalSrc] = useState(cached ? cached.finalSrc : (src || ""));
    var mountedRef = useRef(true);
    var timerRef = useRef(null);

    useEffect(function () {
        mountedRef.current = true;
        return function () {
            mountedRef.current = false;
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, []);

    useEffect(function () {
        if (cached && cached.loaded && cached.finalSrc) {
            setStage(cached.stage);
            setLoaded(true);
            setFinalSrc(cached.finalSrc);
        }
    }, [cacheKey]);

    var currentSrc = useMemo(function () {
        if (loaded && finalSrc) return finalSrc;
        if (stage === 0) return src || "";
        if (stage === -1) return "";
        if (!originalSrc || !isIpfsUrl(originalSrc)) return "";
        var gwIdx = stage - 1;
        if (gwIdx >= GATEWAY_COUNT) return "";
        return ipfsGatewayUrl(originalSrc, gwIdx);
    }, [src, originalSrc, stage, loaded, finalSrc]);

    var handleError = useCallback(function () {
        if (!mountedRef.current) return;
        if (stage === 0) {
            if (originalSrc && isIpfsUrl(originalSrc)) {
                timerRef.current = setTimeout(function () {
                    if (mountedRef.current) setStage(1);
                }, 100);
            } else {
                setStage(-1);
            }
            return;
        }
        if (stage >= 1) {
            var nextGw = stage;
            if (nextGw < GATEWAY_COUNT) {
                timerRef.current = setTimeout(function () {
                    if (mountedRef.current) setStage(nextGw + 1);
                }, 200);
            } else {
                setStage(-1);
            }
        }
    }, [stage, originalSrc]);

    var handleLoad = useCallback(function (e) {
        if (!mountedRef.current) return;
        var loadedUrl = e.target.src;
        setLoaded(true);
        setFinalSrc(loadedUrl);
        imageCache.set(cacheKey, { stage: stage, loaded: true, finalSrc: loadedUrl });
    }, [cacheKey, stage]);

    if (stage === -1 || !currentSrc) {
        return (
            <div style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(135deg, #2d1b4e 0%, #1a0f2e 100%)",
                borderRadius: "inherit"
            }}>
                <span style={{ fontSize: 32, opacity: 0.5 }}>🎴</span>
            </div>
        );
    }

    return (
        <>
            {!loaded && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(30,20,50,0.8)",
                    borderRadius: "inherit",
                    zIndex: 1
                }}>
                    <div className="inv-loading-spinner" style={{ width: 20, height: 20 }} />
                </div>
            )}
            <img
                src={currentSrc}
                alt={alt || ""}
                draggable="false"
                onError={handleError}
                onLoad={handleLoad}
                style={{
                    opacity: loaded ? 1 : 0,
                    transition: "opacity 0.3s",
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center",
                    borderRadius: "inherit"
                }}
            />
        </>
    );
});

var InventoryCard = memo(function InventoryCard({
    nft,
    isSelected,
    pickNo,
    onToggle,
    index
}) {
    var k = nftKey(nft);
    var stats = nft.stats || { top: 5, right: 5, bottom: 5, left: 5 };

    var element = nft.element;
    if (!element) {
        var tokenId = nft.tokenId || nft.token_id || nft.id || k;
        element = genElement(tokenId);
    }

    var r = nft.rarity || getRarityFromTokenId(nft.tokenId, 2000);

    var onPD = function (e) {
        var el = e.currentTarget;
        var rect = el.getBoundingClientRect();
        var cx = (e.clientX !== undefined ? e.clientX : rect.left + rect.width / 2) - rect.left;
        var cy = (e.clientY !== undefined ? e.clientY : rect.top + rect.height / 2) - rect.top;
        el.style.setProperty("--px", Math.max(0, Math.min(100, (cx / rect.width) * 100)) + "%");
        el.style.setProperty("--py", Math.max(0, Math.min(100, (cy / rect.height) * 100)) + "%");
        el.classList.remove("is-tapping");
        void el.offsetWidth;
        el.classList.add("is-tapping");
        setTimeout(function () { el.classList.remove("is-tapping"); }, 520);
    };

    var handleClick = useCallback(function () {
        onToggle(k);
    }, [onToggle, k]);

    return (
        <button
            key={k}
            type="button"
            onPointerDown={onPD}
            onClick={handleClick}
            className={"inv-card-game" + (isSelected ? " is-selected" : "")}
            title={nft.name}
            style={{
                "--i": index,
                "--rank": r.border,
                "--rankGlow": r.glow
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

            <div className="inv-tt-badge" />
            <span className="inv-tt-num top">{stats.top}</span>
            <span className="inv-tt-num left">{stats.left}</span>
            <span className="inv-tt-num right">{stats.right}</span>
            <span className="inv-tt-num bottom">{stats.bottom}</span>

            {isSelected && (
                <div className="inv-pick-badge">
                    <div className="inv-pick-badge-inner">
                        <span className="inv-pick-check">✓</span>
                        <span className="inv-pick-no">{pickNo}</span>
                    </div>
                </div>
            )}
        </button>
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
                            var r = getRarityFromTokenId(t.token_id, 2000);
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
    }, [token, accountId, connected, nftContractId]);

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

    var saveDeck = async function () {
        if (selected.size !== 5) return;
        if (selectedNfts.length !== 5) return;

        setSaving(true);
        setError("");
        try {
            var cardsPayload = selectedNfts.map(function (nft) {
                var elem = nft.element;
                if (!elem) {
                    var tid = nft.tokenId || nft.token_id || nft.id;
                    elem = genElement(tid);
                }

                return {
                    id: nft.key || nft.tokenId || nft.token_id,
                    token_id: nft.tokenId || nft.token_id,
                    name: nft.name,
                    imageUrl: nft.imageUrl,
                    image: nft.imageUrl,
                    rarity: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    rank: nft.rank || (nft.rarity && nft.rarity.key) || "common",
                    element: elem,
                    values: nft.stats,
                    stats: nft.stats,
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
    };

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
                    <div className="inv-info-label">
                        🔗 {accountId.length > 20 ? accountId.slice(0, 10) + "…" + accountId.slice(-6) : accountId}
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
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map(function (n, idx) {
                        var k = nftKey(n);
                        return (
                            <InventoryCard
                                key={k}
                                nft={n}
                                isSelected={selected.has(k)}
                                pickNo={orderMap.get(k) || 0}
                                onToggle={toggle}
                                index={idx}
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