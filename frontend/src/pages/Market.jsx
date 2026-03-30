import { useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var CASES = [
    { id: "starter", name: "Starter Case", price: 0.01, displayPrice: "1 Card", image: "/ui/case-starter.png", video: "/ui/case-starter.mp4", rarity: "common", description: "1 random card", type: "single" },
    { id: "premium", name: "Premium Case", price: 0.01, displayPrice: "5 Cards", image: "/ui/case-premium.png", video: "/ui/case-premium.mp4", rarity: "rare", description: "5 random cards pack", type: "pack" },
    { id: "legendary", name: "Legendary Case", price: 0.01, displayPrice: "5 Epic Cards", image: "/ui/case-legendary.png", video: "/ui/case-legendary.mp4", rarity: "epic", description: "5 Epic cards guaranteed", type: "pack" },
    { id: "ultimate", name: "Ultimate Case", price: 0.01, displayPrice: "5 Legendary", image: "/ui/case-ultimate.png", video: "/ui/case-ultimate.mp4", rarity: "legendary", description: "5 Legendary cards guaranteed", type: "pack" },
];

var RARITY_COLORS = {
    common: "#6b7280",
    rare: "#3b82f6",
    epic: "#a855f7",
    legendary: "#ffd700",
};

var TREASURY = "retardo-s.near";

function CaseOpenModal({ caseItem, cards, onClose }) {
    var [revealed, setRevealed] = useState(false);
    var [revealedCards, setRevealedCards] = useState([]);
    var [videoError, setVideoError] = useState(false);

    var handleReveal = function () {
        setRevealed(true);
        cards.forEach(function (card, i) {
            setTimeout(function () {
                setRevealedCards(function (prev) { return [...prev, card]; });
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
            }, i * 300);
        });
    };

    var handleVideoEnd = function () {
        handleReveal();
    };

    var card = cards[0];
    var rarityColor = RARITY_COLORS[(card && card.rarity)] || "#6b7280";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.98)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0,
            flexDirection: "column",
        }}>
            <div style={{
                width: "100%",
                height: "100%",
                maxWidth: 600,
                background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px 16px",
                textAlign: "center",
                gap: 16,
            }}>
                <h3 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#fff" }}>
                    🎁 {caseItem.name}
                </h3>

                {/* ── ДО reveal: видео ── */}
                {!revealed && (
                    <>
                        <div style={{
                            width: "100%",
                            maxWidth: 480,
                            aspectRatio: "1/1",
                            borderRadius: 24,
                            overflow: "hidden",
                            background: "#000",
                            boxShadow: "0 0 60px rgba(120,200,255,0.25)",
                        }}>
                            {caseItem.video && !videoError ? (
                                <video
                                    key={caseItem.id}
                                    autoPlay
                                    playsInline
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "contain",
                                        display: "block",
                                        mixBlendMode: "screen",
                                    }}
                                    onEnded={handleVideoEnd}
                                    onError={function () { setVideoError(true); handleReveal(); }}
                                >
                                    <source src={caseItem.video} type="video/mp4" />
                                </video>
                            ) : (
                                <img
                                    src={caseItem.image}
                                    alt=""
                                    style={{
                                        width: "100%", height: "100%",
                                        objectFit: "contain",
                                    }}
                                    onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
                                />
                            )}
                        </div>

                        <button
                            onClick={handleReveal}
                            style={{
                                padding: "16px 0",
                                fontSize: 18, fontWeight: 900,
                                borderRadius: 16, border: "none",
                                background: "linear-gradient(135deg, #78c8ff, #5096ff)",
                                color: "#000", cursor: "pointer",
                                boxShadow: "0 6px 25px rgba(120,200,255,0.4)",
                                width: "100%", maxWidth: 480,
                            }}
                        >
                            {videoError ? "✨ Открыть!" : "⏭ Пропустить"}
                        </button>
                    </>
                )}

                {/* ── ПОСЛЕ reveal: одна большая карта ── */}
                {revealed && card && (
                    <>
                        <div style={{
                            opacity: revealedCards.length > 0 ? 1 : 0,
                            transform: revealedCards.length > 0
                                ? "scale(1) translateY(0)"
                                : "scale(0.7) translateY(30px)",
                            transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            width: "100%",
                            maxWidth: 320,
                            aspectRatio: "3/4",
                            borderRadius: 24,
                            overflow: "hidden",
                            border: "4px solid " + rarityColor,
                            boxShadow: revealedCards.length > 0
                                ? "0 0 60px " + rarityColor + "99, 0 0 120px " + rarityColor + "44"
                                : "none",
                            background: "#0a0e1a",
                            position: "relative",
                        }}>
                            {card.image_url || card.imageUrl ? (
                                <img
                                    src={card.image_url || card.imageUrl}
                                    alt={card.name || ""}
                                    style={{
                                        width: "100%", height: "100%",
                                        objectFit: "cover",
                                        display: "block",
                                    }}
                                    onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
                                />
                            ) : (
                                <div style={{
                                    width: "100%", height: "100%",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                    background: "linear-gradient(135deg, #1a2232, #0f1625)",
                                    fontSize: 80,
                                }}>🎴</div>
                            )}

                            {/* Название сверху */}
                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0,
                                padding: "10px 12px",
                                background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)",
                                fontSize: 14, fontWeight: 700, color: "#fff",
                                textAlign: "center",
                            }}>
                                {card.name || card.title}
                            </div>

                            {/* Рарность снизу */}
                            <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                padding: "12px",
                                background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)",
                                fontSize: 16, fontWeight: 900,
                                color: rarityColor,
                                textAlign: "center",
                                textTransform: "uppercase",
                                letterSpacing: 2,
                            }}>
                                ✦ {card.rarity} ✦
                            </div>
                        </div>

                        {revealedCards.length > 0 && (
                            <button
                                onClick={onClose}
                                style={{
                                    padding: "16px 0",
                                    fontSize: 17, fontWeight: 700,
                                    borderRadius: 16, border: "none",
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                    color: "#fff", cursor: "pointer",
                                    width: "100%", maxWidth: 480,
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
            // 1. Оплата — логику не трогаем
            var pay = await sendNear({
                receiverId: TREASURY,
                amount: String(c.price),
            });

            var txHash = pay.txHash || "";
            if (!txHash) {
                throw new Error("Transaction failed — no txHash returned");
            }

            // 2. Открытие кейса на бэкенде — логику не трогаем
            var open = await apiFetch("/api/cases/open", {
                method: "POST",
                token: token,
                body: JSON.stringify({ case_id: c.id, tx_hash: txHash }),
            });

            var cards = open.cards || [];

            // 3. Модалка с видео → карты
            setOpenModal({ caseItem: c, cards: cards });

            try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch (e) { }

        } catch (e) {
            setError("Ошибка: " + (e.message || e));
        } finally {
            setBuying(null);
        }
    };

    return (
        <div className="market-page">
            {openModal && (
                <CaseOpenModal
                    caseItem={openModal.caseItem}
                    cards={openModal.cards}
                    onClose={function () { setOpenModal(null); }}
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
                            {/* в меню только картинка — без видео */}
                            <div className="market-case-image">
                                <img
                                    src={c.image}
                                    alt={c.name}
                                    draggable="false"
                                    loading="lazy"
                                    onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
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