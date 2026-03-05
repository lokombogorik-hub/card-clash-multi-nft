import { useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var CASES = [
    { id: "starter", name: "Starter Case", price: 0.1, displayPrice: "1 Card", image: "/ui/case-starter.png", rarity: "common", description: "1 random card", type: "single" },
    { id: "premium", name: "Premium Case", price: 2, displayPrice: "5 Cards", image: "/ui/case-premium.png", rarity: "rare", description: "5 random cards pack", type: "pack" },
    { id: "legendary", name: "Legendary Case", price: 5, displayPrice: "5 Epic Cards", image: "/ui/case-legendary.png", rarity: "epic", description: "5 Epic cards guaranteed", type: "pack" },
    { id: "ultimate", name: "Ultimate Case", price: 10, displayPrice: "5 Legendary", image: "/ui/case-ultimate.png", rarity: "legendary", description: "5 Legendary cards guaranteed", type: "pack" },
];

export default function Market() {
    var { connected, accountId, balance, sendNear } = useWalletConnect();
    var [buying, setBuying] = useState(null);
    var [result, setResult] = useState(null);

    var token = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";

    var handleBuy = async function (caseData) {
        if (!connected || !accountId) {
            alert("Подключи HOT Wallet!");
            return;
        }

        if (balance < caseData.price) {
            alert("Недостаточно NEAR! Нужно " + caseData.price + " Ⓝ");
            return;
        }

        setBuying(caseData.id);
        setResult(null);

        try {
            // 1. Payment
            var payResult = await sendNear({
                receiverId: "retardo-s.near",
                amount: caseData.price,
            });

            if (!payResult.txHash) {
                throw new Error("Transaction failed - no txHash");
            }

            // 2. Open case on backend
            var openResult = await apiFetch("/api/cases/open", {
                method: "POST",
                token: token,
                body: JSON.stringify({ case_id: caseData.id, tx_hash: payResult.txHash }),
            });

            setResult({
                success: true,
                cards: openResult.cards || [],
                message: "Получено " + (openResult.cards?.length || 0) + " карт!",
            });

        } catch (e) {
            console.error("Buy error:", e);
            setResult({ success: false, message: "Ошибка: " + (e.message || e) });
        } finally {
            setBuying(null);
        }
    };

    return (
        <div className="market-page">
            <div className="market-header">
                <h2 className="market-title"><span className="market-title-icon">🛒</span>NFT Market</h2>
                <div className="market-subtitle">Buy cases to get NFT cards</div>
            </div>

            {!connected && <div className="market-warning">⚠️ Подключи HOT Wallet чтобы покупать</div>}

            {connected && (
                <div style={{ textAlign: "center", marginBottom: 20, padding: 12, background: "rgba(120,200,255,0.1)", borderRadius: 12 }}>
                    <div style={{ fontSize: 13, color: "#78c8ff" }}>💰 Баланс: {Number(balance).toFixed(2)} Ⓝ</div>
                </div>
            )}

            {result && (
                <div style={{
                    textAlign: "center", marginBottom: 20, padding: 16,
                    background: result.success ? "rgba(34,197,94,0.15)" : "rgba(255,80,80,0.15)",
                    border: "1px solid " + (result.success ? "rgba(34,197,94,0.4)" : "rgba(255,80,80,0.4)"),
                    borderRadius: 12
                }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: result.success ? "#22c55e" : "#ff6b6b" }}>
                        {result.success ? "✅ " : "❌ "}{result.message}
                    </div>
                    {result.cards && result.cards.length > 0 && (
                        <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                            {result.cards.map(function (c, i) {
                                return <div key={i} style={{ padding: "4px 10px", borderRadius: 8, background: "rgba(0,0,0,0.3)", fontSize: 11, color: "#a0d8ff" }}>
                                    {c.rarity} #{c.token_id}
                                </div>;
                            })}
                        </div>
                    )}
                </div>
            )}

            <div className="market-cases-grid">
                {CASES.map(function (c) {
                    var canBuy = connected && balance >= c.price;
                    return (
                        <div key={c.id} className="market-case-card">
                            <div className="market-case-image">
                                <img src={c.image} alt={c.name} draggable="false" loading="lazy"
                                    onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }} />
                            </div>
                            <div className="market-case-rarity-badge" data-rarity={c.rarity}>{c.rarity}</div>
                            <div className="market-case-name">{c.name}</div>
                            <div className="market-case-desc">{c.description}</div>
                            <div className="market-case-price">{c.price} Ⓝ</div>
                            <button className="market-case-buy-btn" onClick={function () { handleBuy(c); }}
                                disabled={!canBuy || buying === c.id}
                                style={{ opacity: canBuy ? 1 : 0.5 }}>
                                {buying === c.id ? "⏳ Paying..." : canBuy ? "Buy" : "Need " + c.price + " Ⓝ"}
                            </button>
                        </div>
                    );
                })}
            </div>

            <div className="market-footer">
                <div className="market-footer-icon">💎</div>
                <div className="market-footer-text">Cards will appear in your Inventory after purchase</div>
            </div>
        </div>
    );
}