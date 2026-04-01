import { useState, useEffect } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var CASES = [
    { id: "starter", name: "Starter Case", price: 0.01, displayPrice: "1 Card", image: "/ui/case-starter.png", video: "/ui/case-starter.mp4", rarity: "common", description: "1 random card", type: "single" },
    { id: "premium", name: "Premium Case", price: 0.01, displayPrice: "1 Card", image: "/ui/case-premium.png", video: "/ui/case-premium.mp4", rarity: "rare", description: "1 rare card", type: "single" },
    { id: "legendary", name: "Legendary Case", price: 0.01, displayPrice: "1 Epic Card", image: "/ui/case-legendary.png", video: "/ui/case-legendary.mp4", rarity: "epic", description: "1 Epic card guaranteed", type: "single" },
    { id: "ultimate", name: "Ultimate Case", price: 0.01, displayPrice: "1 Legendary", image: "/ui/case-ultimate.png", video: "/ui/case-ultimate.mp4", rarity: "legendary", description: "1 Legendary card guaranteed", type: "single" },
];

var RARITY_COLORS = {
    common: "#6b7280",
    rare: "#3b82f6",
    epic: "#a855f7",
    legendary: "#ffd700",
};

var TREASURY = "retardo-s.near";
var IPFS_BASE = "https://bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e.ipfs.w3s.link";
var NFT_CONTRACT_ID = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

async function loadTokenMetadata(tokenId) {
    if (!NFT_CONTRACT_ID) return null;
    if (!tokenId || String(tokenId).startsWith("card_")) return null;

    try {
        var args = JSON.stringify({ token_id: String(tokenId) });
        var args_base64 = btoa(args);

        var resp = await fetch("https://rpc.mainnet.near.org", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0", id: "1", method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT_ID,
                    method_name: "nft_token",
                    args_base64: args_base64,
                }
            })
        });

        var data = await resp.json();
        if (data.result && data.result.result) {
            var bytes = new Uint8Array(data.result.result);
            var token = JSON.parse(new TextDecoder().decode(bytes));
            var media = token?.metadata?.media || "";
            var title = token?.metadata?.title || "";

            var imageUrl = media;
            if (media && media.startsWith("ipfs://")) {
                imageUrl = "https://ipfs.io/ipfs/" + media.slice(7);
            } else if (media && !media.startsWith("http")) {
                imageUrl = IPFS_BASE + "/" + media;
            } else if (!media) {
                // Строим URL по номеру токена как fallback
                var nftNumber = parseInt(tokenId, 10) + 1;
                imageUrl = IPFS_BASE + "/" + nftNumber + ".png";
            }

            console.log("[CASE] token", tokenId, "media:", media, "→", imageUrl);
            return { imageUrl, title };
        }
    } catch (e) {
        console.warn("[CASE] Failed to load token metadata for", tokenId, e);
    }

    // Fallback — строим URL по номеру
    try {
        var nftNumber = parseInt(tokenId, 10) + 1;
        return {
            imageUrl: IPFS_BASE + "/" + nftNumber + ".png",
            title: "BUNNY #" + nftNumber,
        };
    } catch (e) {
        return null;
    }
}

function CaseOpenModal({ caseItem, cards, onClose }) {
    var [revealed, setRevealed] = useState(false);
    var [revealedCards, setRevealedCards] = useState([]);
    var [videoError, setVideoError] = useState(false);
    var [resolvedCards, setResolvedCards] = useState(cards);
    var [metaLoading, setMetaLoading] = useState(true);

    // Загружаем реальные картинки из NEAR контракта
    useEffect(function () {
        var alive = true;
        setMetaLoading(true);

        (async function () {
            var updated = await Promise.all(cards.map(async function (card) {
                var tokenId = card.token_id;

                // Для mock токенов оставляем как есть
                if (!tokenId || String(tokenId).startsWith("card_")) {
                    return card;
                }

                var meta = await loadTokenMetadata(tokenId);
                if (!meta) return card;

                return {
                    ...card,
                    image_url: meta.imageUrl,
                    imageUrl: meta.imageUrl,
                    name: meta.title || card.name || card.title,
                };
            }));

            if (alive) {
                setResolvedCards(updated);
                setMetaLoading(false);
                console.log("[CASE] Resolved cards:", updated);
            }
        })();

        return function () { alive = false; };
    }, [cards]);

    var handleReveal = function () {
        setRevealed(true);
        resolvedCards.forEach(function (card, i) {
            setTimeout(function () {
                setRevealedCards(function (prev) { return [...prev, card]; });
                try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
            }, i * 300);
        });
    };

    var card = resolvedCards[0];
    var rarityColor = RARITY_COLORS[(card && card.rarity)] || "#6b7280";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "rgba(0,0,0,0.98)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "16px",
        }}>
            <div style={{
                width: "100%",
                maxWidth: 360,
                maxHeight: "90vh",
                background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                borderRadius: 24,
                border: "1px solid rgba(120,200,255,0.2)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "20px 16px",
                gap: 12,
                overflowY: "auto",
            }}>
                <h3 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#fff" }}>
                    🎁 {caseItem.name}
                </h3>

                {/* Индикатор загрузки метадаты */}
                {metaLoading && (
                    <div style={{
                        fontSize: 11, color: "rgba(120,200,255,0.6)",
                        padding: "4px 12px",
                        background: "rgba(120,200,255,0.08)",
                        borderRadius: 8,
                    }}>
                        ⏳ Загрузка NFT...
                    </div>
                )}

                {/* ДО reveal: видео */}
                {!revealed && (
                    <>
                        <div style={{
                            width: "100%", aspectRatio: "1/1",
                            borderRadius: 16, overflow: "hidden",
                            background: "#000",
                            boxShadow: "0 0 40px rgba(120,200,255,0.2)",
                            flexShrink: 0,
                        }}>
                            {caseItem.video && !videoError ? (
                                <video
                                    key={caseItem.id}
                                    autoPlay playsInline muted
                                    style={{
                                        width: "100%", height: "100%",
                                        objectFit: "contain", display: "block",
                                    }}
                                    onEnded={handleReveal}
                                    onError={function () { setVideoError(true); handleReveal(); }}
                                >
                                    <source src={caseItem.video} type="video/mp4" />
                                </video>
                            ) : (
                                <img
                                    src={caseItem.image}
                                    alt=""
                                    style={{ width: "100%", height: "100%", objectFit: "contain" }}
                                    onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
                                />
                            )}
                        </div>

                        <button
                            onClick={handleReveal}
                            style={{
                                padding: "12px 0", fontSize: 15, fontWeight: 900,
                                borderRadius: 14, border: "none",
                                background: "linear-gradient(135deg, #78c8ff, #5096ff)",
                                color: "#000", cursor: "pointer", width: "100%",
                            }}
                        >
                            {videoError ? "✨ Открыть!" : "⏭ Пропустить"}
                        </button>
                    </>
                )}

                {/* ПОСЛЕ reveal: карта */}
                {revealed && card && (
                    <>
                        <div style={{
                            opacity: revealedCards.length > 0 ? 1 : 0,
                            transform: revealedCards.length > 0
                                ? "scale(1) translateY(0)"
                                : "scale(0.7) translateY(20px)",
                            transition: "all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
                            width: "100%", maxWidth: 220,
                            aspectRatio: "3/4", borderRadius: 18,
                            overflow: "hidden",
                            border: "3px solid " + rarityColor,
                            boxShadow: revealedCards.length > 0
                                ? "0 0 40px " + rarityColor + "80"
                                : "none",
                            background: "#0a0e1a",
                            position: "relative", flexShrink: 0,
                        }}>
                            {card.image_url || card.imageUrl ? (
                                <img
                                    src={card.image_url || card.imageUrl}
                                    alt={card.name || ""}
                                    style={{
                                        width: "100%", height: "100%",
                                        objectFit: "cover", display: "block",
                                    }}
                                    onError={function (e) {
                                        console.log("[CASE] Image failed:", e.currentTarget.src);
                                        var src = e.currentTarget.src;
                                        if (src.includes("w3s.link")) {
                                            // Пробуем альтернативный gateway
                                            var filename = src.split("/").pop();
                                            e.currentTarget.src = "https://ipfs.io/ipfs/bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e/" + filename;
                                        } else {
                                            e.currentTarget.src = "/cards/card.jpg";
                                        }
                                    }}
                                />
                            ) : (
                                <div style={{
                                    width: "100%", height: "100%",
                                    display: "flex", alignItems: "center",
                                    justifyContent: "center", fontSize: 60,
                                }}>
                                    🎴
                                </div>
                            )}

                            <div style={{
                                position: "absolute", top: 0, left: 0, right: 0,
                                padding: "8px 10px",
                                background: "linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)",
                                fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center",
                            }}>
                                {card.name || card.title}
                            </div>

                            <div style={{
                                position: "absolute", bottom: 0, left: 0, right: 0,
                                padding: "8px",
                                background: "linear-gradient(to top, rgba(0,0,0,0.9), transparent)",
                                fontSize: 12, fontWeight: 900,
                                color: rarityColor,
                                textAlign: "center",
                                textTransform: "uppercase",
                                letterSpacing: 1,
                            }}>
                                ✦ {card.rarity} ✦
                            </div>
                        </div>

                        {revealedCards.length > 0 && (
                            <button
                                onClick={onClose}
                                style={{
                                    padding: "10px 0", fontSize: 14, fontWeight: 700,
                                    borderRadius: 12, border: "none",
                                    background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                    color: "#fff", cursor: "pointer", width: "60%",
                                    boxShadow: "0 4px 16px rgba(34,197,94,0.3)",
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
    var [buyingStatus, setBuyingStatus] = useState("");
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
        setBuyingStatus("⏳ Оплата...");
        setError("");

        try {
            // 1. Оплата
            var pay = await sendNear({
                receiverId: TREASURY,
                amount: String(c.price),
            });

            var txHash = pay.txHash || "";
            if (!txHash) {
                throw new Error("Transaction failed — no txHash returned");
            }

            // 2. Открытие кейса
            setBuyingStatus("⛓ Трансфер NFT...");
            var open = await apiFetch("/api/cases/open", {
                method: "POST",
                token: token,
                body: JSON.stringify({ case_id: c.id, tx_hash: txHash }),
            });

            console.log("[MARKET] Case open response:", open);

            var cards = open.cards || [];

            // 3. Показываем модалку
            setBuyingStatus("");
            setOpenModal({ caseItem: c, cards: cards });

            try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch (e) { }

        } catch (e) {
            setError("Ошибка: " + (e.message || e));
            setBuyingStatus("");
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
                                    ? (buyingStatus || "⏳ Оплата...")
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