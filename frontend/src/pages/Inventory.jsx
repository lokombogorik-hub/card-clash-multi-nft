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
    Earth: "🪨",
    Fire: "🔥",
    Water: "💧",
    Poison: "☠️",
    Holy: "✨",
    Thunder: "⚡",
    Wind: "🌪️",
    Ice: "❄️",
};

// Ранг по номеру токена (используется для border/glow)
// Важно: label не рисуем (ты просил убрать буквы), только цвет.
function getRankByTokenId(tokenId, totalSupply = 10000) {
    const num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    const percent = (num / totalSupply) * 100;

    if (percent <= 25) return { border: "#7c3aed", glow: "rgba(124, 58, 237, 0.55)" };     // dark purple
    if (percent <= 50) return { border: "#a78bfa", glow: "rgba(167, 139, 250, 0.50)" };     // light purple
    if (percent <= 75) return { border: "#f97316", glow: "rgba(249, 115, 22, 0.50)" };      // orange
    return { border: "#22c55e", glow: "rgba(34, 197, 94, 0.45)" };                           // green
}

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
            <div className="inv-header">
                <h2 className="inv-title">
                    <span className="inv-title-icon">🎴</span>
                    Deck Builder
                </h2>
                <div className="inv-subtitle">Выбери 5 карт для боя • {selected.size}/5</div>
            </div>

            {allowedContracts.length ? (
                <div className="inv-info-box">
                    <div className="inv-info-label">✨ Разрешённые коллекции (paid placement):</div>
                    <div className="inv-info-value">{allowedContracts.join(", ")}</div>
                </div>
            ) : null}

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
                    <div>Загрузка NFT из инвентаря…</div>
                </div>
            )}

            {!loading && nfts.length === 0 && token && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">Купи или получи карты в турнирах, чтобы начать играть</div>
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map((n, idx) => {
                        const k = nftKey(n);
                        const isSel = selected.has(k);

                        const stats = n.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                        const element = n.element || null;

                        const rank = getRankByTokenId(n.tokenId || n.token_id, 10000);

                        return (
                            <button
                                key={k}
                                onClick={() => toggle(k)}
                                className={`inv-card-game ${isSel ? "is-selected" : ""}`}
                                title={k}
                                style={{
                                    borderColor: rank.border,
                                    boxShadow: isSel
                                        ? `0 0 28px ${rank.glow}, inset 0 0 26px ${rank.glow}`
                                        : `0 6px 18px rgba(0,0,0,0.45)`,
                                    ["--i"]: idx,
                                }}
                            >
                                <div className="inv-card-art-full">
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

                                {element && (
                                    <div className="inv-card-elem-pill" title={element}>
                                        <span className="inv-card-elem-ic">{ELEM_ICON[element] || element}</span>
                                    </div>
                                )}

                                <div className="inv-tt-badge" />
                                <span className="inv-tt-num top">{stats.top}</span>
                                <span className="inv-tt-num left">{stats.left}</span>
                                <span className="inv-tt-num right">{stats.right}</span>
                                <span className="inv-tt-num bottom">{stats.bottom}</span>

                                {isSel && (
                                    <div className="inv-card-selected-overlay">
                                        <div className="inv-card-selected-check">✓</div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-actions">
                    <button className="inv-btn inv-btn-secondary" onClick={clear} disabled={!selected.size || saving}>
                        Очистить ({selected.size})
                    </button>

                    <button className="inv-btn inv-btn-primary" disabled={selected.size !== 5 || saving} onClick={saveDeck}>
                        {saving ? "Сохранение..." : `Сохранить колоду (${selected.size}/5)`}
                    </button>
                </div>
            )}

            {nfts.length > 0 && selected.size === 5 && <div className="inv-hint">✅ Колода готова! Теперь можешь нажать "Play" в главном меню</div>}
        </div>
    );
}