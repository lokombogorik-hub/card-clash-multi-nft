import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner, isIpfsUrl, ipfsGatewayUrl, GATEWAY_COUNT } from "../libs/nearNft";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return n.chain + ":" + n.contractId + ":" + n.tokenId;
    if (n.token_id) return "near::" + n.token_id;
    return "mock:" + (n.id || Math.random().toString(36).slice(2));
}

var ELEM_ICON = { Earth: "🪨", Fire: "🔥", Water: "💧", Poison: "☠️", Holy: "✨", Thunder: "⚡", Wind: "🌪️", Ice: "❄️" };
var ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"];

function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 10000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var pct = (num / totalSupply) * 100;
    if (pct <= 25) return { key: "legendary", border: "#7c3aed", glow: "rgba(124,58,237,0.60)", min: 4, max: 9 };
    if (pct <= 50) return { key: "epic", border: "#a78bfa", glow: "rgba(167,139,250,0.55)", min: 3, max: 9 };
    if (pct <= 75) return { key: "rare", border: "#f97316", glow: "rgba(249,115,22,0.55)", min: 2, max: 8 };
    return { key: "common", border: "#22c55e", glow: "rgba(34,197,94,0.50)", min: 1, max: 7 };
}

/**
 * Deterministic stats generation based on token_id
 * Same token_id will ALWAYS produce same stats
 */
function genStats(tokenId, rarity) {
    // Use token_id as seed for deterministic random
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;

    // LCG (Linear Congruential Generator) for deterministic "random"
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

/**
 * Deterministic element generation based on token_id
 * Same token_id will ALWAYS have same element (or null)
 * ~70% chance to have an element
 */
function genElement(tokenId) {
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;

    // Different seed offset for element vs stats
    var seed = num * 7919 + 104729; // Prime numbers for different distribution
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;

    var chance = (seed % 100) / 100;

    if (chance < 0.7) {
        // Has element
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        var elemIdx = seed % ELEMENTS.length;
        return ELEMENTS[elemIdx];
    }

    return null; // No element
}

function safeParse(s) {
    try { if (!s) return null; if (typeof s === "object") return s; return JSON.parse(String(s)); }
    catch (e) { return null; }
}

function NftImage({ src, originalSrc, alt, tokenId }) {
    var [stage, setStage] = useState(0);
    var [loaded, setLoaded] = useState(false);
    var [errorMsg, setErrorMsg] = useState("");
    var timerRef = useRef(null);

    var currentSrc = useMemo(function () {
        if (stage === 0) return src || "";
        if (stage === -1) return "";
        if (!originalSrc || !isIpfsUrl(originalSrc)) return "";
        var gwIdx = stage - 1;
        if (gwIdx >= GATEWAY_COUNT) return "";
        return ipfsGatewayUrl(originalSrc, gwIdx);
    }, [src, originalSrc, stage]);

    useEffect(function () {
        setStage(0);
        setLoaded(false);
        setErrorMsg("");
        if (timerRef.current) clearTimeout(timerRef.current);
    }, [src]);

    useEffect(function () {
        return function () { if (timerRef.current) clearTimeout(timerRef.current); };
    }, []);

    var handleError = useCallback(function (e) {
        var msg = "stage" + stage + " failed";
        setErrorMsg(msg);

        if (stage === 0) {
            if (originalSrc && isIpfsUrl(originalSrc)) {
                timerRef.current = setTimeout(function () { setStage(1); }, 100);
            } else {
                setStage(-1);
            }
            return;
        }
        if (stage >= 1) {
            var nextGw = stage;
            if (nextGw < GATEWAY_COUNT) {
                timerRef.current = setTimeout(function () { setStage(nextGw + 1); }, 200);
            } else {
                setStage(-1);
            }
        }
    }, [stage, originalSrc]);

    var handleLoad = useCallback(function () {
        setLoaded(true);
        setErrorMsg("");
    }, []);

    if (stage === -1 || !currentSrc) {
        return (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(30,20,50,0.8)", borderRadius: 8, padding: 4 }}>
                <span style={{ fontSize: 24 }}>🎴</span>
                <span style={{ fontSize: 8, color: "#f66", marginTop: 2 }}>{errorMsg || "failed"}</span>
            </div>
        );
    }

    return (
        <>
            {!loaded && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(30,20,50,0.6)", borderRadius: 8, zIndex: 1 }}>
                    <div className="inv-loading-spinner" style={{ width: 24, height: 24 }} />
                </div>
            )}
            <img
                src={currentSrc}
                alt={alt || ""}
                draggable="false"
                loading="eager"
                onError={handleError}
                onLoad={handleLoad}
                style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.3s", width: "100%", height: "100%", objectFit: "cover" }}
            />
        </>
    );
}

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
        var alive = true;

        (async function () {
            setLoading(true);
            setError("");
            setSource("");
            setSelected(new Set());

            try {
                var items = [];

                if (connected && accountId && nftContractId) {
                    try {
                        var tokens = await nearNftTokensForOwner(nftContractId, accountId);

                        items = tokens.map(function (t) {
                            var extra = safeParse(t.metadata ? t.metadata.extra : null);
                            var r = getRarityFromTokenId(t.token_id, 10000);

                            // Use extra stats/element if available from NFT metadata
                            // Otherwise generate deterministically from token_id
                            var st = (extra && extra.stats && typeof extra.stats.top === "number")
                                ? extra.stats
                                : genStats(t.token_id, r);

                            var elem = (extra && extra.element)
                                ? extra.element
                                : genElement(t.token_id);

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

    var toggle = function (k) {
        setSelected(function (prev) {
            var next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else { if (next.size >= 5) return next; next.add(k); }
            return next;
        });
    };

    var saveDeck = async function () {
        if (selected.size !== 5) return;
        if (selectedNfts.length !== 5) return;

        setSaving(true);
        setError("");
        try {
            await apiFetch("/api/decks/active", {
                token: token,
                method: "PUT",
                body: JSON.stringify({
                    cards: selectedArr,
                    full_cards: selectedNfts
                })
            });
            setSaving(false);
            onDeckReady?.(selectedNfts);
        } catch (e) {
            setError(e.message || "Save failed");
            setSaving(false);
        }
    };

    var onPD = function (e) {
        var el = e.currentTarget, rect = el.getBoundingClientRect();
        var cx = (e.clientX !== undefined ? e.clientX : rect.left + rect.width / 2) - rect.left;
        var cy = (e.clientY !== undefined ? e.clientY : rect.top + rect.height / 2) - rect.top;
        el.style.setProperty("--px", Math.max(0, Math.min(100, (cx / rect.width) * 100)) + "%");
        el.style.setProperty("--py", Math.max(0, Math.min(100, (cy / rect.height) * 100)) + "%");
        el.classList.remove("is-tapping"); void el.offsetWidth; el.classList.add("is-tapping");
        setTimeout(function () { el.classList.remove("is-tapping"); }, 520);
    };

    return (
        <div className="page inventory-page">
            <div className="inv-header">
                <h2 className="inv-title"><span className="inv-title-icon">🎴</span>Выбери колоду</h2>
                <div className="inv-subtitle">Выбери 5 карт для игры • {selected.size}/5</div>
            </div>

            {connected && accountId ? (
                <div className="inv-info-box">
                    <div className="inv-info-label">🔗 {accountId.length > 20 ? accountId.slice(0, 10) + "…" + accountId.slice(-6) : accountId}</div>
                    {source && <div className="inv-info-value" style={{ marginTop: 4, color: source.startsWith("✅") ? "#22c55e" : source.startsWith("❌") ? "#ff6b6b" : "#f59e0b" }}>{source}</div>}
                </div>
            ) : (
                <div className="inv-info-box">
                    <div className="inv-info-label" style={{ color: "#f59e0b" }}>⚠️ Подключи кошелёк на главной</div>
                </div>
            )}

            {error && <div className="inv-error">⚠️ {error}</div>}
            {!token && <div className="inv-loading"><div className="inv-loading-spinner" /><div>Ожидание авторизации…</div></div>}
            {loading && <div className="inv-loading"><div className="inv-loading-spinner" /><div>Загрузка NFT…</div></div>}

            {!loading && nfts.length === 0 && token && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">{connected ? "NFT не найдены для " + accountId : "Подключи кошелёк на главной странице"}</div>
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map(function (n, idx) {
                        var k = nftKey(n);
                        var isSel = selected.has(k);
                        var pickNo = orderMap.get(k) || 0;
                        var stats = n.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                        var element = n.element || null;
                        var r = n.rarity || getRarityFromTokenId(n.tokenId, 10000);

                        return (
                            <button key={k} type="button" onPointerDown={onPD} onClick={function () { toggle(k); }}
                                className={"inv-card-game" + (isSel ? " is-selected" : "")} title={n.name}
                                style={{ "--i": idx, "--rank": r.border, "--rankGlow": r.glow }}>
                                <div className="inv-card-art-full">
                                    <NftImage
                                        src={n.imageUrl}
                                        originalSrc={n.originalImageUrl}
                                        alt={n.name || ""}
                                        tokenId={n.tokenId}
                                    />
                                </div>
                                {element && <div className="inv-card-elem-pill" title={element}><span className="inv-card-elem-ic">{ELEM_ICON[element] || element}</span></div>}
                                <div className="inv-tt-badge" />
                                <span className="inv-tt-num top">{stats.top}</span>
                                <span className="inv-tt-num left">{stats.left}</span>
                                <span className="inv-tt-num right">{stats.right}</span>
                                <span className="inv-tt-num bottom">{stats.bottom}</span>
                                {isSel ? (<div className="inv-pick-badge"><div className="inv-pick-badge-inner"><div className="inv-pick-check">✓</div><div className="inv-pick-no">{pickNo}</div></div></div>) : null}
                            </button>
                        );
                    })}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-actions">
                    <button className="inv-btn inv-btn-secondary" onClick={function () { setSelected(new Set()); }} disabled={!selected.size || saving}>
                        Сбросить
                    </button>
                    <button className="inv-btn inv-btn-primary" disabled={selected.size !== 5 || saving} onClick={saveDeck}>
                        {saving ? "Сохранение..." : selected.size === 5 ? "Играть! →" : "Выбери " + (5 - selected.size) + " карт"}
                    </button>
                </div>
            )}
        </div>
    );
}