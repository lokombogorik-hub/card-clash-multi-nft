import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useWalletStore } from "../store/useWalletStore";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.token_id) return `near:nft.examples.testnet:${n.token_id}`;
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

// Ранг по tokenId (цвет рамки/свечения)
function getRankByTokenId(tokenId, totalSupply = 10000) {
    const num = parseInt(String(tokenId || "0").replace(/\D/g, ""), 10) || 0;
    const percent = (num / totalSupply) * 100;

    if (percent <= 25) return { border: "#7c3aed", glow: "rgba(124, 58, 237, 0.60)" };
    if (percent <= 50) return { border: "#a78bfa", glow: "rgba(167, 139, 250, 0.55)" };
    if (percent <= 75) return { border: "#f97316", glow: "rgba(249, 115, 22, 0.55)" };
    return { border: "#22c55e", glow: "rgba(34, 197, 94, 0.50)" };
}

// Парсим metadata из NFT
function parseNFTMetadata(nft) {
    try {
        // Если есть metadata.extra - парсим его
        const extra = nft.metadata?.extra ?
            (typeof nft.metadata.extra === 'string' ? JSON.parse(nft.metadata.extra) : nft.metadata.extra) :
            {};

        // Генерируем случайные stats если их нет
        const randomStat = () => Math.floor(Math.random() * 6) + 3; // 3-8

        return {
            tokenId: nft.token_id,
            name: nft.metadata?.title || `Card #${nft.token_id}`,
            description: nft.metadata?.description || "Card Clash NFT",
            imageUrl: nft.metadata?.media || `/cards/card${Math.floor(Math.random() * 5) + 1}.jpg`,
            stats: extra.stats || {
                top: extra.top || randomStat(),
                right: extra.right || randomStat(),
                bottom: extra.bottom || randomStat(),
                left: extra.left || randomStat(),
            },
            element: extra.element || ['Fire', 'Water', 'Earth', 'Wind'][Math.floor(Math.random() * 4)],
            rarity: extra.rarity || 'common',
            chain: 'near',
            contractId: 'nft.examples.testnet',
        };
    } catch (e) {
        console.error('Failed to parse NFT metadata:', e);
        return null;
    }
}

export default function Inventory({ token, onDeckReady }) {
    const { isAuthenticated, accountId, nfts: walletNFTs, getUserNFTs } = useWalletStore();
    const [loading, setLoading] = useState(false);
    const [nfts, setNfts] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const allowedContracts = useMemo(() => parseAllowedContracts(), []);
    const allowedSet = useMemo(() => new Set(allowedContracts), [allowedContracts]);

    const selectedArr = useMemo(() => Array.from(selected), [selected]);

    const orderMap = useMemo(() => {
        const m = new Map();
        selectedArr.forEach((k, i) => m.set(k, i + 1));
        return m;
    }, [selectedArr]);

    // Загружаем NFT при монтировании и при изменении аккаунта
    useEffect(() => {
        if (isAuthenticated && accountId) {
            loadNFTs();
        }
    }, [isAuthenticated, accountId]);

    const loadNFTs = async () => {
        setLoading(true);
        setError("");

        try {
            // Загружаем NFT из блокчейна
            await getUserNFTs();

            // Также загружаем активную колоду из backend если есть токен
            if (token) {
                try {
                    const deck = await apiFetch("/api/decks/active", { token });
                    setSelected(new Set((deck.cards || []).slice(0, 5)));
                } catch (e) {
                    console.error('Failed to load deck:', e);
                }
            }
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    // Конвертируем NFT из wallet в формат для отображения
    useEffect(() => {
        const parsed = walletNFTs
            .map(parseNFTMetadata)
            .filter(Boolean);

        const filtered = !allowedContracts.length
            ? parsed
            : parsed.filter((n) => {
                const cid = String(n.contractId || "").trim();
                return !cid || allowedSet.has(cid);
            });

        setNfts(filtered);
    }, [walletNFTs, allowedContracts.length, allowedSet]);

    const toggle = (k) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else {
                if (next.size >= 5) {
                    try {
                        window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("error");
                    } catch { }
                    return next;
                }
                next.add(k);
                try {
                    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
                } catch { }
            }
            return next;
        });
    };

    const clear = () => setSelected(new Set());

    const saveDeck = async () => {
        try {
            if (selected.size !== 5) return;
            setSaving(true);

            if (token) {
                await apiFetch("/api/decks/active", {
                    token,
                    method: "PUT",
                    body: JSON.stringify({ cards: selectedArr }),
                });
            }

            setSaving(false);
            onDeckReady?.();
        } catch (e) {
            setError(e.message);
            setSaving(false);
        }
    };

    const onCardPointerDown = (e) => {
        const el = e.currentTarget;
        const rect = el.getBoundingClientRect();
        const cx = (e.clientX ?? rect.left + rect.width / 2) - rect.left;
        const cy = (e.clientY ?? rect.top + rect.height / 2) - rect.top;

        const x = Math.max(0, Math.min(100, (cx / rect.width) * 100));
        const y = Math.max(0, Math.min(100, (cy / rect.height) * 100));

        el.style.setProperty("--px", `${x}%`);
        el.style.setProperty("--py", `${y}%`);

        el.classList.remove("is-tapping");
        void el.offsetWidth;
        el.classList.add("is-tapping");

        window.setTimeout(() => {
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
                <div className="inv-subtitle">Выбери 5 карт для боя • {selected.size}/5</div>
            </div>

            {isAuthenticated && accountId && (
                <div className="inv-info-box">
                    <div className="inv-info-label">🔗 NEAR Account:</div>
                    <div className="inv-info-value">{accountId}</div>
                </div>
            )}

            {allowedContracts.length ? (
                <div className="inv-info-box">
                    <div className="inv-info-label">✨ Разрешённые коллекции (paid placement):</div>
                    <div className="inv-info-value">{allowedContracts.join(", ")}</div>
                </div>
            ) : null}

            {error && <div className="inv-error">⚠️ {error}</div>}

            {!isAuthenticated && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Подключи HOT Wallet на главной странице</div>
                </div>
            )}

            {loading && (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <div>Загрузка NFT из блокчейна NEAR…</div>
                </div>
            )}

            {!loading && nfts.length === 0 && isAuthenticated && (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📭</div>
                    <div className="inv-empty-title">Нет NFT карт</div>
                    <div className="inv-empty-text">Купи карты в Маркете или получи в турнирах</div>
                    <button
                        className="inv-btn inv-btn-primary"
                        onClick={loadNFTs}
                        style={{ marginTop: '1rem' }}
                    >
                        Обновить
                    </button>
                </div>
            )}

            {nfts.length > 0 && (
                <div className="inv-grid-game-style">
                    {nfts.map((n, idx) => {
                        const k = nftKey(n);
                        const isSel = selected.has(k);
                        const pickNo = orderMap.get(k) || 0;

                        const stats = n.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                        const element = n.element || null;

                        const rank = getRankByTokenId(n.tokenId, 10000);

                        return (
                            <button
                                key={k}
                                type="button"
                                onPointerDown={onCardPointerDown}
                                onClick={() => toggle(k)}
                                className={`inv-card-game ${isSel ? "is-selected" : ""}`}
                                title={k}
                                style={{
                                    ["--i"]: idx,
                                    ["--rank"]: rank.border,
                                    ["--rankGlow"]: rank.glow,
                                }}
                            >
                                <div className="inv-card-art-full">
                                    <img
                                        src={n.imageUrl || "/cards/card.jpg"}
                                        alt={n.name || `#${n.tokenId}`}
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

                                {isSel ? (
                                    <div className="inv-pick-badge" aria-label={`Selected ${pickNo}/5`}>
                                        <div className="inv-pick-badge-inner">
                                            <div className="inv-pick-check">✓</div>
                                            <div className="inv-pick-no">{pickNo}</div>
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
                        onClick={loadNFTs}
                        disabled={loading}
                    >
                        🔄 Обновить
                    </button>

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

            {nfts.length > 0 && selected.size === 5 ? (
                <div className="inv-hint">✅ Колода готова! Теперь можешь нажать "Play" в главном меню</div>
            ) : null}
        </div>
    );
}