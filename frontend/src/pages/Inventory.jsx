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

function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 10000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;
    if (pct <= 25) return { key: "legendary", border: "#7c3aed", glow: "rgba(124,58,237,0.60)", min: 4, max: 9, elemChance: 0.9 };
    if (pct <= 50) return { key: "epic", border: "#a78bfa", glow: "rgba(167,139,250,0.55)", min: 3, max: 9, elemChance: 0.8 };
    if (pct <= 75) return { key: "rare", border: "#f97316", glow: "rgba(249,115,22,0.55)", min: 2, max: 8, elemChance: 0.7 };
    return { key: "common", border: "#22c55e", glow: "rgba(34,197,94,0.50)", min: 1, max: 7, elemChance: 0.6 };
}

function genStats(tokenId, rarity) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var seed = num;
    var next = function () {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed;
    };
    var rnd = function (lo, hi) {
        return lo + (next() % (hi - lo + 1));
    };
    var min = rarity.min;
    var max = rarity.max;
    return {
        top: rnd(min, max),
        right: rnd(min, max),
        bottom: rnd(min, max),
        left: rnd(min, max)
    };
}

function genElement(tokenId, rarity) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var seed = num * 7919 + 104729;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    var chance = (seed % 100) / 100;
    var elemChance = rarity ? rarity.elemChance : 0.7;
    if (chance < elemChance) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var elemIdx = seed % ELEMENTS.length;
        return ELEMENTS[elemIdx];
    }
    return null;
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
    var element = nft.element || null;
    var r = nft.rarity || getRarityFromTokenId(nft.tokenId, 10000);

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

    // Размеры ромба относительно ширины карты
    // Ромб: 28% ширины карты, квадратный
    // Центр ромба: left 6% + 14% = 20% от левого края
    // Числа позиционируются относительно центра ромба

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
            {/* Art layer */}
            <div className="inv-card-art-full">
                <NftImage
                    src={nft.imageUrl}
                    originalSrc={nft.originalImageUrl}
                    alt={nft.name || ""}
                    cacheKey={k}
                />
            </div>

            {/* Element pill — top right */}
            {element && (
                <div
                    className="inv-card-elem-pill"
                    title={element}
                    style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        zIndex: 20,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                        padding: "3px 7px",
                        borderRadius: 999,
                        background: "rgba(0,0,0,0.85)",
                        border: "1px solid rgba(255,255,255,0.25)",
                        pointerEvents: "none"
                    }}
                >
                    <span
                        className="inv-card-elem-ic"
                        style={{
                            fontSize: 16,
                            lineHeight: 1,
                            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.8))"
                        }}
                    >
                        {ELEM_ICON[element]}
                    </span>
                </div>
            )}

            {/* TT Badge Container — содержит ромб и все 4 числа */}
            <div
                className="inv-tt-container"
                style={{
                    position: "absolute",
                    top: 6,
                    left: 6,
                    // Размер контейнера = размер ромба (квадрат)
                    width: "clamp(32px, 28%, 48px)",
                    height: "clamp(32px, 28%, 48px)",
                    zIndex: 10,
                    pointerEvents: "none"
                }}
            >
                {/* Ромб (повёрнутый квадрат) */}
                <div
                    className="inv-tt-badge"
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.85)",
                        transform: "rotate(45deg)",
                        borderRadius: 4,
                        border: "1px solid rgba(255,255,255,0.15)"
                    }}
                />

                {/* Числа — позиционируются относительно центра контейнера */}
                {/* TOP — сверху по центру */}
                <span
                    style={{
                        position: "absolute",
                        top: "2%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 15,
                        fontSize: "clamp(8px, 1.8vw, 11px)",
                        fontWeight: 900,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,1)",
                        lineHeight: 1
                    }}
                >
                    {stats.top}
                </span>

                {/* LEFT — слева по центру */}
                <span
                    style={{
                        position: "absolute",
                        top: "50%",
                        left: "2%",
                        transform: "translateY(-50%)",
                        zIndex: 15,
                        fontSize: "clamp(8px, 1.8vw, 11px)",
                        fontWeight: 900,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,1)",
                        lineHeight: 1
                    }}
                >
                    {stats.left}
                </span>

                {/* RIGHT — справа по центру */}
                <span
                    style={{
                        position: "absolute",
                        top: "50%",
                        right: "2%",
                        transform: "translateY(-50%)",
                        zIndex: 15,
                        fontSize: "clamp(8px, 1.8vw, 11px)",
                        fontWeight: 900,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,1)",
                        lineHeight: 1
                    }}
                >
                    {stats.right}
                </span>

                {/* BOTTOM — снизу по центру */}
                <span
                    style={{
                        position: "absolute",
                        bottom: "2%",
                        left: "50%",
                        transform: "translateX(-50%)",
                        zIndex: 15,
                        fontSize: "clamp(8px, 1.8vw, 11px)",
                        fontWeight: 900,
                        color: "#fff",
                        textShadow: "0 1px 3px rgba(0,0,0,1)",
                        lineHeight: 1
                    }}
                >
                    {stats.bottom}
                </span>
            </div>

            {/* Pick badge */}
            {isSelected && (
                <div
                    className="inv-pick-badge"
                    style={{
                        position: "absolute",
                        right: 6,
                        bottom: 6,
                        width: "clamp(28px, 22%, 40px)",
                        height: "clamp(28px, 22%, 40px)",
                        borderRadius: 999,
                        zIndex: 25,
                        padding: 0,
                        display: "grid",
                        placeItems: "center",
                        background: "conic-gradient(from 90deg, rgba(120,200,255,1), rgba(255,61,242,0.75), rgba(120,200,255,1))",
                        boxShadow: "0 0 16px rgba(120,200,255,0.5)"
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: 2,
                            borderRadius: 999,
                            background: "rgba(0,0,0,0.75)",
                            border: "1px solid rgba(255,255,255,0.2)"
                        }}
                    />
                    <div
                        style={{
                            position: "relative",
                            zIndex: 1,
                            fontWeight: 1000,
                            fontSize: "clamp(10px, 2vw, 14px)",
                            lineHeight: 1,
                            color: "#fff",
                            textShadow: "0 2px 6px rgba(0,0,0,0.9)"
                        }}
                    >
                        ✓
                    </div>
                    <div
                        style={{
                            position: "absolute",
                            bottom: "15%",
                            left: "50%",
                            transform: "translateX(-50%)",
                            zIndex: 1,
                            fontWeight: 900,
                            fontSize: "clamp(7px, 1.5vw, 10px)",
                            lineHeight: 1,
                            color: "rgba(255,255,255,0.95)",
                            textShadow: "0 1px 4px rgba(0,0,0,0.9)"
                        }}
                    >
                        {pickNo}
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
                            var extra = safeParse(t.metadata ? t.metadata.extra : null);
                            var r = getRarityFromTokenId(t.token_id, 10000);
                            var st = (extra && extra.stats && typeof extra.stats.top === "number")
                                ? extra.stats
                                : genStats(t.token_id, r);
                            var elem = (extra && extra.element)
                                ? extra.element
                                : genElement(t.token_id, r);

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
            var result = await apiFetch("/api/decks/active", {
                token: token,
                method: "PUT",
                body: JSON.stringify({
                    cards: selectedArr,
                    full_cards: selectedNfts
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