import { useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: 0.01,
        displayPrice: "1 Card",
        image: "/ui/case-starter.png",
        video: "/ui/case-starter.mp4", // видео с чёрным фоном
        rarity: "common",
        description: "1 random card",
        type: "single"
    },
    {
        id: "premium",
        name: "Premium Case",
        price: 0.01,
        displayPrice: "5 Cards",
        image: "/ui/case-premium.png",
        video: "/ui/case-premium.mp4",
        rarity: "rare",
        description: "5 random cards pack",
        type: "pack"
    },
    {
        id: "legendary",
        name: "Legendary Case",
        price: 0.01,
        displayPrice: "5 Epic Cards",
        image: "/ui/case-legendary.png",
        video: "/ui/case-legendary.mp4",
        rarity: "epic",
        description: "5 Epic cards guaranteed",
        type: "pack"
    },
    {
        id: "ultimate",
        name: "Ultimate Case",
        price: 0.01,
        displayPrice: "5 Legendary",
        image: "/ui/case-ultimate.png",
        video: "/ui/case-ultimate.mp4",
        rarity: "legendary",
        description: "5 Legendary cards guaranteed",
        type: "pack"
    },
];

var RARITY_COLORS = {
    common: "#6b7280",
    rare: "#3b82f6",
    epic: "#a855f7",
    legendary: "#ffd700",
};

var TREASURY = "retardo-s.near";

// Компонент для отображения изображения или видео кейса
function CaseMedia({ caseItem, style, className }) {
    var [videoError, setVideoError] = useState(false);

    // Если есть видео и оно не сломалось — показываем видео
    if (caseItem.video && !videoError) {
        return (
            <video
                src={caseItem.video}
                autoPlay
                loop
                muted
                playsInline
                className={className}
                style={{
                    ...style,
                    // Убираем чёрный фон через blend mode
                    mixBlendMode: "screen",
                    background: "transparent",
                }}
                onError={function () { setVideoError(true); }}
            >
                {/* mp4 и webm оба поддерживаются */}
                <source src={caseItem.video} type="video/mp4" />
                <source src={caseItem.video.replace(".mp4", ".webm")} type="video/webm" />
            </video>
        );
    }

    // Fallback на картинку
    return (
        <img
            src={caseItem.image}
            alt={caseItem.name}
            className={className}
            style={style}
            draggable="false"
            loading="lazy"
            onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
        />
    );
}

// Анимация открытия кейса
function CaseOpenModal({ caseItem, cards, onClose }) {
    var [revealed, setRevealed] = useState(false);
    var [revealedCards, setRevealedCards] = useState([]);

    var handleReveal = function () {
        setRevealed(true);
        cards.forEach(function (card, i) {
            setTimeout(function () {
                setRevealedCards(function (prev) { return [...prev, card]; });
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
            }, i * 300);
        });
    };

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.95)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16, flexDirection: "column",
        }}>
            <div style={{
                width: "100%", maxWidth: 420,
                background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                border: "2px solid rgba(120,200,255,0.3)",
                borderRadius: 24, padding: "28px 20px",
                textAlign: "center",
            }}>
                <h3 style={{ margin: "0 0 8px", fontSize: 22, fontWeight: 900, color: "#fff" }}>
                    🎁 {caseItem.name}
                </h3>
                <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 20, color: "#a0d8ff" }}>
                    {cards.length} карт получено!
                </div>

                {!revealed ? (
                    <>
                        <div style={{
                            width: 140, height: 140,
                            margin: "0 auto 24px",
                            position: "relative",
                            // Тёмный фон под видео чтобы screen blend работал
                            background: "#0a0e1a",
                            borderRadius: 16,
                            overflow: "hidden",
                        }}>
                            <CaseMedia
                                caseItem={caseItem}
                                style={{
                                    width: "100%", height: "100%",
                                    objectFit: "contain",
                                    animation: "iconBounce 1s ease-in-out infinite",
                                    filter: "drop-shadow(0 0 20px rgba(120,200,255,0.5))",
                                }}
                            />
                        </div>

                        <button
                            onClick={handleReveal}
                            style={{
                                padding: "14px 32px",
                                fontSize: 17, fontWeight: 900,
                                borderRadius: 16, border: "none",
                                background: "linear-gradient(135deg, #78c8ff, #5096ff)",
                                color: "#000", cursor: "pointer",
                                boxShadow: "0 6px 25px rgba(120,200,255,0.4)",
                                width: "100%",
                            }}
                        >
                            ✨ Открыть!
                        </button>
                    </>
                ) : (
                    <>
                        <div style={{
                            display: "flex",
                            gap: 8,
                            justifyContent: "center",
                            flexWrap: "wrap",
                            marginBottom: 20,
                            minHeight: 110,
                        }}>
                            {cards.map(function (card, i) {
                                var isVisible = revealedCards.length > i;
                                var rarityColor = RARITY_COLORS[card.rarity] || "#6b7280";

                                return (
                                    <div
                                        key={card.token_id || i}
                                        style={{
                                            opacity: isVisible ? 1 : 0,
                                            transform: isVisible ? "scale(1) translateY(0)" : "scale(0.5) translateY(20px)",
                                            transition: "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                            width: 72, height: 100,
                                            borderRadius: 10,
                                            overflow: "hidden",
                                            border: "3px solid " + rarityColor,
                                            boxShadow: isVisible ? "0 0 16px " + rarityColor + "80" : "none",
                                            background: "#0a0e1a",
                                            position: "relative",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {card.image_url || card.imageUrl ? (
                                            <img
                                                src={card.image_url || card.imageUrl}
                                                alt=""
                                                style={{
                                                    width: "100%", height: "100%",
                                                    objectFit: "cover",
                                                }}
                                                onError={function (e) {
                                                    e.currentTarget.src = "/cards/card.jpg";
                                                }}
                                            />
                                        ) : (
                                            <div style={{
                                                width: "100%", height: "100%",
                                                display: "flex", alignItems: "center",
                                                justifyContent: "center",
                                                background: "linear-gradient(135deg, #1a2232, #0f1625)",
                                                fontSize: 28,
                                            }}>
                                                🎴
                                            </div>
                                        )}

                                        <div style={{
                                            position: "absolute",
                                            bottom: 0, left: 0, right: 0,
                                            padding: "3px 4px",
                                            background: "rgba(0,0,0,0.7)",
                                            fontSize: 9, fontWeight: 900,
                                            color: rarityColor,
                                            textAlign: "center",
                                            textTransform: "uppercase",
                                        }}>
                                            {card.rarity}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {revealedCards.length === cards.length && (
                            <button
                                onClick={onClose}
                                style={{
                                    padding: "12px 24px",
                                    fontSize: 15, fontWeight: 700,
                                    borderRadius: 14, border: "none",
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                    color: "#fff", cursor: "pointer",
                                    width: "100%",
                                    boxShadow: "0 4px 20px rgba(34,197,94,0.35)",
                                }}
                            >
                                ✅ В инвентарь!
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function Market() {
    var ctx = useWalletConnect();
    var connected = ctx.connected;
    var accountId = ctx.accountId;
    var balance = ctx.balance;
    var sendNear = ctx.sendNear;

    var [buying, setBuying] = useState(null);
    var [error, setError] = useState("");
    var [openModal, setOpenModal] = useState(null);

    var token = "";
    try {
        token = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";
    } catch (e) { }

    var handleBuy = async function (c) {
        if (!connected || !accountId) {
            alert("Подключи HOT Wallet!");
            return;
        }
        if (balance < c.price) {
            alert("Недостаточно NEAR! Нужно " + c.price + " Ⓝ, у тебя " + Number(balance).toFixed(2));
            return;
        }

        setBuying(c.id);
        setError("");

        try {
            var pay = await sendNear({
                receiverId: TREASURY,
                amount: String(c.price),
            });

            var txHash = pay.txHash || "";
            if (!txHash) {
                throw new Error("Transaction failed — no txHash returned");
            }

            var open = await apiFetch("/api/cases/open", {
                method: "POST",
                token: token,
                body: JSON.stringify({ case_id: c.id, tx_hash: txHash }),
            });

            var cards = open.cards || [];

            setOpenModal({ caseItem: c, cards: cards });

            try {
                window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success");
            } catch (e) { }

        } catch (e) {
            setError("Ошибка: " + (e.message || e));
        } finally {
            setBuying(null);
        }
    };

    var handleCloseModal = function () {
        setOpenModal(null);
    };

    return (
        <div className="market-page">
            {openModal && (
                <CaseOpenModal
                    caseItem={openModal.caseItem}
                    cards={openModal.cards}
                    onClose={handleCloseModal}
                />
            )}

            <div className="market-header">
                <h2 className="market-title">
                    <span className="market-title-icon">🛒</span>NFT Market
                </h2>
                <div className="market-subtitle">Buy cases to get NFT cards</div>
            </div>

            {!connected && (
                <div className="market-warning">⚠️ Подключи HOT Wallet чтобы покупать</div>
            )}

            {connected && (
                <div style={{
                    textAlign: "center", marginBottom: 20, padding: 12,
                    background: "rgba(120,200,255,0.1)", borderRadius: 12,
                    border: "1px solid rgba(120,200,255,0.2)",
                }}>
                    <div style={{ fontSize: 13, color: "#78c8ff" }}>
                        💰 Баланс: {Number(balance).toFixed(4)} Ⓝ
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
                        Treasury: {TREASURY}
                    </div>
                </div>
            )}

            {error && (
                <div style={{
                    textAlign: "center", marginBottom: 16, padding: 14,
                    background: "rgba(255,80,80,0.12)",
                    border: "1px solid rgba(255,80,80,0.35)",
                    borderRadius: 12, color: "#ff6b6b", fontSize: 13,
                }}>
                    ❌ {error}
                </div>
            )}

            <div className="market-cases-grid">
                {CASES.map(function (c) {
                    var canBuy = connected && balance >= c.price;
                    var isBuying = buying === c.id;

                    return (
                        <div key={c.id} className="market-case-card">
                            <div className="market-case-image" style={{
                                // Фон для blend mode
                                background: "#0a0e1a",
                                borderRadius: 12,
                                overflow: "hidden",
                            }}>
                                <CaseMedia
                                    caseItem={c}
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                    }}
                                />
                            </div>
                            <div className="market-case-rarity-badge" data-rarity={c.rarity}>
                                {c.rarity}
                            </div>
                            <div className="market-case-name">{c.name}</div>
                            <div className="market-case-desc">{c.description}</div>
                            <div className="market-case-price">{c.price} Ⓝ</div>
                            <button
                                className="market-case-buy-btn"
                                onClick={function () { handleBuy(c); }}
                                disabled={!canBuy || isBuying}
                                style={{ opacity: canBuy ? 1 : 0.5 }}
                            >
                                {isBuying
                                    ? "⏳ Оплата..."
                                    : canBuy
                                        ? "🛒 Купить"
                                        : "Нужно " + c.price + " Ⓝ"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="market-footer">
                <div className="market-footer-icon">💎</div>
                <div className="market-footer-text">
                    Карты появятся в Инвентаре после покупки
                </div>
            </div>
        </div>
    );
}