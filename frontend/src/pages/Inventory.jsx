import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../libs/nearNft";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return n.chain + ":" + n.contractId + ":" + n.tokenId;
    if (n.token_id) return "near::" + n.token_id;
    return "mock:" + (n.id || Math.random().toString(36).slice(2));
}

var ELEM_ICON = { Earth: "🪨", Fire: "🔥", Water: "💧", Poison: "☠️", Holy: "✨", Thunder: "⚡", Wind: "🌪️", Ice: "❄️" };

function getRarityFromTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 10000;
    var num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var percent = (num / totalSupply) * 100;
    if (percent <= 25) return { key: "legendary", border: "#7c3aed", glow: "rgba(124,58,237,0.60)", min: 4, max: 9 };
    if (percent <= 50) return { key: "epic", border: "#a78bfa", glow: "rgba(167,139,250,0.55)", min: 3, max: 9 };
    if (percent <= 75) return { key: "rare", border: "#f97316", glow: "rgba(249,115,22,0.55)", min: 2, max: 8 };
    return { key: "common", border: "#22c55e", glow: "rgba(34,197,94,0.50)", min: 1, max: 7 };
}

function generateStats(tokenId, rarity) {
    var seed = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var min = rarity.min;
    var max = rarity.max;
    var rnd = function () {
        seed = (seed * 9301 + 49297) % 233280;
        return min + Math.floor((seed / 233280) * (max - min + 1));
    };
    return { top: rnd(), right: rnd(), bottom: rnd(), left: rnd() };
}

function safeJsonParse(s) {
    try {
        if (!s) return null;
        if (typeof s === "object") return s;
        return JSON.parse(String(s));
    } catch (e) { return null; }
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

    useEffect(function () {
        if (!token) return;
        var alive = true;

        (async function () {
            setLoading(true);
            setError("");
            setSource("");

            try {
                try {
                    var deckRes = await apiFetch("/api/decks/active", { token: token });
                    if (alive && deckRes && Array.isArray(deckRes.cards)) {
                        setSelected(new Set(deckRes.cards.slice(0, 5)));
                    }
                } catch (e) { }
                if (!alive) return;

                var items = [];

                if (connected && accountId && nftContractId) {
                    console.log("[Inventory] Loading from chain:", nftContractId, accountId);
                    try {
                        var tokens = await nearNftTokensForOwner(nftContractId, accountId);
                        console.log("[Inventory] Got", tokens.length, "tokens");

                        items = tokens.map(function (t) {
                            var extra = safeJsonParse(t.metadata ? t.metadata.extra : null);
                            var rarity = getRarityFromTokenId(t.token_id, 10000);
                            var stats = (extra && extra.stats && extra.stats.top != null) ? extra.stats : generateStats(t.token_id, rarity);
                            var imageUrl = (t.metadata && t.metadata.media) ? t.metadata.media : "";

                            return {
                                key: "near:" + nftContractId + ":" + t.token_id,
                                chain: "near",
                                contractId: nftContractId,
                                tokenId: t.token_id,
                                token_id: t.token_id,
                                name: (t.metadata && t.metadata.title) ? t.metadata.title : "Card #" + t.token_id,
                                imageUrl: imageUrl,
                                stats: stats,
                                element: (extra && extra.element) ? extra.element : null,
                                rarity: rarity,
                            };
                        });

                        setSource(items.length > 0 ? "✅ Blockchain (" + items.length + " NFTs)" : "⚠️ 0 NFTs found");
                    } catch (e) {
                        console.error("[Inventory] Chain error:", e);
                        setSource("❌ " + (e.message || e));
                    }
                }

                if (items.length === 0 && !connected) {
                    try {
                        var mockRes = await apiFetch("/api/nfts/my", { token: token });
                        items = Array.isArray(mockRes.items) ? mockRes.items : [];
                        if (items.length > 0) setSource("Demo cards");
                    } catch (e) { }
                }

                if (!alive) return;
                setNfts(items);
            } catch (e) {
                if (!alive) return;
                setError(e.message || "Failed to load");
            } finally {
                if (alive) setLoading(false);
            }
        })();

        return function () { alive = false; };
    }, [token, accountId, connected, nftContractId]);

    var toggle = function (k) {
        setSelected(function (prev) {
            var next = new Set(prev);
            if (next.has(k)) { next.delete(k); }
            else {
                if (next.size >= 5) return next;
                next.add(k);
            }
            return next;
        });
    };

    var clear = function () { setSelected(new Set()); };

    var saveDeck = async function () {
        if (selected.size !== 5) return;
        setSaving(true);
        try {
            await apiFetch("/api/decks/active", { token: token, method: "PUT", body: JSON.stringify({ cards: selectedArr }) });
            setSaving(false);
            onDeckReady?.();
        } catch (e) {
            setError(e.message || "Save failed");
            setSaving(false);
        }
    };

    var onCardPointerDown = function (e) {
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

    return (
        <div className="page inventory-page">
            <div className="inv-header">
                <h2 className="inv-title"><span className="inv-title-icon">🎴</span>Deck Builder</h2>
                <div className="inv-subtitle">Выбери 5 карт для боя • {selected.size}/5</div>
            </div>

            {connected && accountId ? (
                <div className="inv-info-box">
                    <div className="inv-info-label">🔗 {accountId.length > 20 ? accountId.slice(0, 10) + "…" + accountId.slice(-6) : accountId}</div>
                    {nftContractId && <div className="inv-info-value">Collection: {nftContractId}</div>}
                    {source && <div className="inv-info-value" style={{ marginTop: 4, color: source.startsWith("✅") ? "#22c55e" : source.startsWith("❌") ? "#ff6b6b" : "#f59e0b" }}>{source}</div>}
                </div>
            ) : null}

            {error && <div className="inv-error">⚠️ {error}</div>}
            {!token && <div className="inv-loading"><div className="inv-loading-spinner" /><div>Ожидание авторизации…</div></div>}
            {loading && <div className="inv-loading"><div className="inv-loading-spinner" /><div>Загрузка NFT из {nftContractId || "backend"}…</div></div>}

            {!loading && nfts.length === 0 && token && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">{connected ? "NFT не найдены в " + (nftContractId || "кошельке") : "Подключи кошелёк на главной"}</div>
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
                        var r = n.rarity || getRarityFromTokenId(n.tokenId || n.token_id, 10000);

                        return (
                            <button key={k} type="button" onPointerDown={onCardPointerDown}
                                onClick={function () { toggle(k); }}
                                className={"inv-card-game" + (isSel ? " is-selected" : "")}
                                title={k + " [" + r.key + "]"}
                                style={{ "--i": idx, "--rank": r.border, "--rankGlow": r.glow }}>
                                <div className="inv-card-art-full">
                                    <img src={n.imageUrl || "/cards/card.jpg"} alt={n.name || ""} draggable="false" loading="lazy"
                                        onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }} />
                                </div>
                                {element && <div className="inv-card-elem-pill" title={element}><span className="inv-card-elem-ic">{ELEM_ICON[element] || element}</span></div>}
                                <div className="inv-tt-badge" />
                                <span className="inv-tt-num top">{stats.top}</span>
                                <span className="inv-tt-num left">{stats.left}</span>
                                <span className="inv-tt-num right">{stats.right}</span>
                                <span className="inv-tt-num bottom">{stats.bottom}</span>
                                {isSel ? (
                                    <div className="inv-pick-badge"><div className="inv-pick-badge-inner"><div className="inv-pick-check">✓</div><div className="inv-pick-no">{pickNo}</div></div></div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-actions">
                    <button className="inv-btn inv-btn-secondary" onClick={clear} disabled={!selected.size || saving}>Очистить ({selected.size})</button>
                    <button className="inv-btn inv-btn-primary" disabled={selected.size !== 5 || saving} onClick={saveDeck}>
                        {saving ? "Сохранение..." : "Сохранить (" + selected.size + "/5)"}
                    </button>
                </div>
            )}

            {nfts.length > 0 && selected.size === 5 ? <div className="inv-hint">✅ Колода готова!</div> : null}
        </div>
    );
}