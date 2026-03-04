import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../libs/nearNft";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.token_id) return n.token_id;
    if (n.tokenId) return n.tokenId;
    if (n.contract_id && n.token_id)
        return "near:" + n.contract_id + ":" + n.token_id;
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
    Ice: "❄️",
};

function getRankByTokenId(tokenId, totalSupply) {
    totalSupply = totalSupply || 10000;
    var num =
        parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    var percent = (num / totalSupply) * 100;
    if (percent <= 25)
        return {
            border: "#7c3aed",
            glow: "rgba(124, 58, 237, 0.60)",
        };
    if (percent <= 50)
        return {
            border: "#a78bfa",
            glow: "rgba(167, 139, 250, 0.55)",
        };
    if (percent <= 75)
        return {
            border: "#f97316",
            glow: "rgba(249, 115, 22, 0.55)",
        };
    return { border: "#22c55e", glow: "rgba(34, 197, 94, 0.50)" };
}

export default function Inventory({ token, onDeckReady }) {
    var { accountId, connected } = useWalletConnect();

    var [loading, setLoading] = useState(false);
    var [nfts, setNfts] = useState([]);
    var [selected, setSelected] = useState(function () {
        return new Set();
    });
    var [error, setError] = useState("");
    var [saving, setSaving] = useState(false);

    var nftContractId = (
        import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || ""
    ).trim();

    var selectedArr = useMemo(
        function () {
            return Array.from(selected);
        },
        [selected]
    );

    var orderMap = useMemo(
        function () {
            var m = new Map();
            selectedArr.forEach(function (k, i) {
                m.set(k, i + 1);
            });
            return m;
        },
        [selectedArr]
    );

    useEffect(
        function () {
            if (!token) return;
            var alive = true;

            (async function () {
                setLoading(true);
                setError("");

                try {
                    // Load active deck
                    var deckRes = null;
                    try {
                        deckRes = await apiFetch("/api/decks/active", {
                            token: token,
                        });
                    } catch (e) {
                        // ignore
                    }

                    if (!alive) return;

                    if (deckRes && Array.isArray(deckRes.cards)) {
                        setSelected(new Set(deckRes.cards.slice(0, 5)));
                    }

                    // Load NFTs
                    var items = [];

                    // Try blockchain first
                    if (connected && accountId && nftContractId) {
                        try {
                            var nearItems = await nearNftTokensForOwner(
                                nftContractId,
                                accountId
                            );
                            items = nearItems.map(function (t) {
                                var extra = null;
                                try {
                                    if (t.metadata && t.metadata.extra) {
                                        extra = JSON.parse(t.metadata.extra);
                                    }
                                } catch (e) {
                                    // ignore
                                }
                                return {
                                    key:
                                        "near:" +
                                        nftContractId +
                                        ":" +
                                        t.token_id,
                                    token_id: t.token_id,
                                    tokenId: t.token_id,
                                    chain: "near",
                                    contractId: nftContractId,
                                    name:
                                        (t.metadata && t.metadata.title) ||
                                        "Card #" + t.token_id,
                                    imageUrl:
                                        (t.metadata && t.metadata.media) ||
                                        "/cards/card.jpg",
                                    stats: extra || {
                                        top: 5,
                                        right: 5,
                                        bottom: 5,
                                        left: 5,
                                    },
                                    element:
                                        extra && extra.element
                                            ? extra.element
                                            : null,
                                };
                            });
                        } catch (e) {
                            console.warn(
                                "[Inventory] blockchain NFT fetch failed:",
                                e
                            );
                        }
                    }

                    // Fallback to mock NFTs from backend
                    if (items.length === 0) {
                        try {
                            var mockRes = await apiFetch("/api/nfts/my", {
                                token: token,
                            });
                            items = Array.isArray(mockRes.items)
                                ? mockRes.items
                                : [];
                        } catch (e) {
                            // ignore
                        }
                    }

                    if (!alive) return;
                    setNfts(items);
                } catch (e) {
                    if (!alive) return;
                    setError(e.message || "Failed to load inventory");
                } finally {
                    if (alive) setLoading(false);
                }
            })();

            return function () {
                alive = false;
            };
        },
        [token, accountId, connected, nftContractId]
    );

    var toggle = function (k) {
        setSelected(function (prev) {
            var next = new Set(prev);
            if (next.has(k)) {
                next.delete(k);
            } else {
                if (next.size >= 5) {
                    try {
                        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(
                            "error"
                        );
                    } catch (e) { }
                    return next;
                }
                next.add(k);
                try {
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(
                        "light"
                    );
                } catch (e) { }
            }
            return next;
        });
    };

    var clear = function () {
        setSelected(new Set());
    };

    var saveDeck = async function () {
        if (selected.size !== 5) return;
        setSaving(true);
        try {
            await apiFetch("/api/decks/active", {
                token: token,
                method: "PUT",
                body: JSON.stringify({ cards: selectedArr }),
            });
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
        var cx =
            (e.clientX !== undefined
                ? e.clientX
                : rect.left + rect.width / 2) - rect.left;
        var cy =
            (e.clientY !== undefined
                ? e.clientY
                : rect.top + rect.height / 2) - rect.top;
        var x = Math.max(0, Math.min(100, (cx / rect.width) * 100));
        var y = Math.max(0, Math.min(100, (cy / rect.height) * 100));
        el.style.setProperty("--px", x + "%");
        el.style.setProperty("--py", y + "%");
        el.classList.remove("is-tapping");
        void el.offsetWidth;
        el.classList.add("is-tapping");
        window.setTimeout(function () {
            el.classList.remove("is-tapping");
        }, 520);
    };

    return (
        <div className="page inventory-page">
            <div className="inv-header">
                <h2 className="inv-title">
                    <span className="inv-title-icon">🎴</span>
                    Deck Builder
                </h2>
                <div className="inv-subtitle">
                    Выбери 5 карт для боя • {selected.size}/5
                </div>
            </div>

            {connected && accountId && nftContractId && (
                <div className="inv-info-box">
                    <div className="inv-info-label">
                        🔗 Loading NFTs from blockchain:
                    </div>
                    <div className="inv-info-value">
                        {nftContractId} → {accountId}
                    </div>
                </div>
            )}

            {error && <div className="inv-error">⚠️ {error}</div>}

            {!token && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Ожидание авторизации Telegram…</div>
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
                        Купи или получи карты в турнирах, чтобы начать играть
                    </div>
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map(function (n, idx) {
                        var k = nftKey(n);
                        var isSel = selected.has(k);
                        var pickNo = orderMap.get(k) || 0;
                        var stats = n.stats || {
                            top: 5,
                            right: 5,
                            bottom: 5,
                            left: 5,
                        };
                        var element = n.element || null;
                        var rank = getRankByTokenId(
                            n.tokenId || n.token_id,
                            10000
                        );

                        return (
                            <button
                                key={k}
                                type="button"
                                onPointerDown={onCardPointerDown}
                                onClick={function () {
                                    toggle(k);
                                }}
                                className={
                                    "inv-card-game" +
                                    (isSel ? " is-selected" : "")
                                }
                                title={k}
                                style={{
                                    "--i": idx,
                                    "--rank": rank.border,
                                    "--rankGlow": rank.glow,
                                }}
                            >
                                <div className="inv-card-art-full">
                                    <img
                                        src={
                                            n.imageUrl || "/cards/card.jpg"
                                        }
                                        alt={
                                            n.name ||
                                            "#" +
                                            (n.tokenId || n.token_id)
                                        }
                                        draggable="false"
                                        loading="lazy"
                                        onError={function (e) {
                                            try {
                                                e.currentTarget.src =
                                                    "/cards/card.jpg";
                                            } catch (err) { }
                                        }}
                                    />
                                </div>

                                {element && (
                                    <div
                                        className="inv-card-elem-pill"
                                        title={element}
                                    >
                                        <span className="inv-card-elem-ic">
                                            {ELEM_ICON[element] || element}
                                        </span>
                                    </div>
                                )}

                                <div className="inv-tt-badge" />
                                <span className="inv-tt-num top">
                                    {stats.top}
                                </span>
                                <span className="inv-tt-num left">
                                    {stats.left}
                                </span>
                                <span className="inv-tt-num right">
                                    {stats.right}
                                </span>
                                <span className="inv-tt-num bottom">
                                    {stats.bottom}
                                </span>

                                {isSel ? (
                                    <div
                                        className="inv-pick-badge"
                                        aria-label={
                                            "Selected " + pickNo + "/5"
                                        }
                                    >
                                        <div className="inv-pick-badge-inner">
                                            <div className="inv-pick-check">
                                                ✓
                                            </div>
                                            <div className="inv-pick-no">
                                                {pickNo}
                                            </div>
                                        </div>
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-actions">
                    <button
                        className="inv-btn inv-btn-secondary"
                        onClick={clear}
                        disabled={!selected.size || saving}
                    >
                        Очистить ({selected.size})
                    </button>

                    <button
                        className="inv-btn inv-btn-primary"
                        disabled={selected.size !== 5 || saving}
                        onClick={saveDeck}
                    >
                        {saving
                            ? "Сохранение..."
                            : "Сохранить колоду (" +
                            selected.size +
                            "/5)"}
                    </button>
                </div>
            )}

            {nfts.length > 0 && selected.size === 5 ? (
                <div className="inv-hint">
                    ✅ Колода готова! Теперь можешь нажать "Play" в главном
                    меню
                </div>
            ) : null}
        </div>
    );
}