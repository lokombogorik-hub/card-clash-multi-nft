import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return `${n.chain}:${n.contractId}:${n.tokenId}`;
    if (n.contract_id && n.token_id) return `near:${n.contract_id}:${n.token_id}`;
    return `${n.chain || "mock"}:${n.contractId || "x"}:${n.tokenId || "0"}`;
}

function parseAllowedContracts() {
    const raw = String(import.meta.env.VITE_NEAR_ALLOWED_NFT_CONTRACTS || "").trim();
    if (!raw) return [];
    return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

const ELEM_ICON = {
    Earth: "🟫",
    Fire: "🔥",
    Water: "💧",
    Poison: "☠️",
    Holy: "✨",
    Thunder: "⚡",
    Wind: "🌪️",
    Ice: "❄️",
};

export default function Inventory({ token, onDeckReady }) {
    const [loading, setLoading] = useState(false);
    const [nfts, setNfts] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const allowedContracts = useMemo(() => parseAllowedContracts(), []);
    const allowedSet = useMemo(() => new Set(allowedContracts), [allowedContracts]);

    const selectedArr = useMemo(() => Array.from(selected), [selected]);

    useEffect(() => {
        if (!token) return;

        let alive = true;
        (async () => {
            setLoading(true);
            setError("");

            try {
                const [inv, deck] = await Promise.all([
                    apiFetch("/api/nfts/my", { token }),
                    apiFetch("/api/decks/active", { token }),
                ]);

                if (!alive) return;

                const items = Array.isArray(inv.items) ? inv.items : [];

                const filtered = !allowedContracts.length
                    ? items
                    : items.filter((n) => {
                        const chain = String(n.chain || "").toLowerCase();
                        const cid = String(n.contractId || n.contract_id || "").trim();

                        if (!cid) return true;

                        if (!chain || chain === "near") {
                            return allowedSet.has(cid);
                        }

                        return false;
                    });

                setNfts(filtered);
                setSelected(new Set((deck.cards || []).slice(0, 5)));
            } catch (e) {
                if (!alive) return;
                setError(e.message);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [token, allowedContracts.length, allowedSet]);

    const toggle = (k) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else {
                if (next.size >= 5) return next;
                next.add(k);
            }
            return next;
        });
    };

    const clear = () => setSelected(new Set());

    const saveDeck = async () => {
        try {
            if (selected.size !== 5) return;
            setSaving(true);
            await apiFetch("/api/decks/active", {
                token,
                method: "PUT",
                body: JSON.stringify({ cards: selectedArr }),
            });
            setSaving(false);
            onDeckReady?.();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    return (
        <div className="page inventory-page">
            {/* Header */}
            <div className="inv-header">
                <h2 className="inv-title">
                    <span className="inv-title-icon">🎴</span>
                    Deck Builder
                </h2>
                <div className="inv-subtitle">
                    Выбери 5 карт для боя • {selected.size}/5
                </div>
            </div>

            {/* Allowed contracts info */}
            {allowedContracts.length ? (
                <div className="inv-info-box">
                    <div className="inv-info-label">✨ Разрешённые коллекции (paid placement):</div>
                    <div className="inv-info-value">{allowedContracts.join(", ")}</div>
                </div>
            ) : null}

            {/* Errors */}
            {error && (
                <div className="inv-error">
                    ⚠️ {error}
                </div>
            )}

            {/* Loading */}
            {!token && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Ожидание авторизации Telegram…</div>
                </div>
            )}

            {loading && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Загрузка NFT из инвентаря…</div>
                </div>
            )}

            {/* Empty state */}
            {!loading && nfts.length === 0 && token && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">
                        Купи или получи карты в турнирах, чтобы начать играть
                    </div>
                </div>
            )}

            {/* Grid */}
            {nfts.length > 0 && (
                <div className="inv-grid-modern">
                    {nfts.map((n) => {
                        const k = nftKey(n);
                        const isSel = selected.has(k);

                        return (
                            <button
                                key={k}
                                onClick={() => toggle(k)}
                                className={`inv-card-modern ${isSel ? "is-selected" : ""}`}
                                title={k}
                            >
                                {/* Card art */}
                                <div className="inv-card-art">
                                    <img
                                        src={n.imageUrl || "/cards/card.jpg"}
                                        alt={n.name || `#${n.tokenId || n.token_id}`}
                                        draggable="false"
                                        loading="lazy"
                                        onError={(e) => {
                                            try {
                                                e.currentTarget.src = "/cards/card.jpg";
                                            } catch { }
                                        }}
                                    />
                                </div>

                                {/* Element badge */}
                                {n.element && (
                                    <div className="inv-card-elem" title={n.element}>
                                        {ELEM_ICON[n.element] || n.element}
                                    </div>
                                )}

                                {/* Rank badge */}
                                <div className={`inv-card-rank rank-${n.rank || "common"}`}>
                                    {n.rankLabel || n.rank?.charAt(0).toUpperCase() || "C"}
                                </div>

                                {/* Name */}
                                <div className="inv-card-name">
                                    {n.name || `Card #${n.tokenId || n.token_id || "?"}`}
                                </div>

                                {/* Stats */}
                                <div className="inv-card-stats">
                                    <div className="inv-stat">
                                        <span className="inv-stat-label">↑</span>
                                        <span className="inv-stat-value">{n.stats?.top ?? "-"}</span>
                                    </div>
                                    <div className="inv-stat">
                                        <span className="inv-stat-label">→</span>
                                        <span className="inv-stat-value">{n.stats?.right ?? "-"}</span>
                                    </div>
                                    <div className="inv-stat">
                                        <span className="inv-stat-label">↓</span>
                                        <span className="inv-stat-value">{n.stats?.bottom ?? "-"}</span>
                                    </div>
                                    <div className="inv-stat">
                                        <span className="inv-stat-label">←</span>
                                        <span className="inv-stat-value">{n.stats?.left ?? "-"}</span>
                                    </div>
                                </div>

                                {/* Selection overlay */}
                                {isSel && (
                                    <div className="inv-card-selected-overlay">
                                        <div className="inv-card-selected-check">✓</div>
                                        <div className="inv-card-selected-text">В колоде</div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Actions */}
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
                        {saving ? "Сохранение..." : `Сохранить колоду (${selected.size}/5)`}
                    </button>
                </div>
            )}

            {/* Hint */}
            {nfts.length > 0 && selected.size === 5 && (
                <div className="inv-hint">
                    ✅ Колода готова! Теперь можешь нажать "Play" в главном меню
                </div>
            )}
        </div>
    );
}