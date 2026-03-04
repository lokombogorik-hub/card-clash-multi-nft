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
    var { connected, accountId, sendNear, signAndSendTransaction } = useWalletConnect();

    var [buying, setBuying] = useState(null);
    var [opening, setOpening] = useState(false);
    var [revealedCards, setRevealedCards] = useState(null);
    var [claimStatus, setClaimStatus] = useState("");

    var token = localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";

    var handleBuy = async function (caseData) {
        if (!connected || !accountId) {
            alert("Подключи HOT Wallet на главной странице!");
            return;
        }
        if (!token) {
            alert("Telegram auth required");
            return;
        }

        setBuying(caseData.id);

        try {
            // 1. Payment
            var payResult = await sendNear({
                receiverId: "retardo-s.near",
                amount: caseData.price.toString(),
            });

            // 2. Open case on backend
            var result = await apiFetch("/api/cases/open", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    case_id: caseData.id,
                    tx_hash: payResult.txHash || "",
                }),
            });

            setBuying(null);
            var cards = result.cards || [];
            setOpening(true);
            setRevealedCards(null);

            // 3. Show animation then reveal
            setTimeout(function () {
                setRevealedCards(cards);
                setClaimStatus("claiming");

                // 4. Claim each card
                (async function () {
                    try {
                        for (var i = 0; i < cards.length; i++) {
                            var card = cards[i];
                            var claimData = await apiFetch("/api/cases/claim", {
                                method: "POST",
                                token: token,
                                body: JSON.stringify({ reserved_token_id: card.token_id }),
                            });
                            if (claimData.transaction) {
                                await signAndSendTransaction(claimData.transaction);
                            }
                        }
                        setClaimStatus("done");
                        setTimeout(function () {
                            setOpening(false);
                            setRevealedCards(null);
                            setClaimStatus("");
                        }, 2000);
                    } catch (e) {
                        console.error("Claim error:", e);
                        setClaimStatus("error: " + (e.message || e));
                    }
                })();
            }, 2000);

        } catch (e) {
            alert("Ошибка покупки: " + (e.message || e));
            setBuying(null);
            setOpening(false);
        }
    };

    return (
        <div className="market-page">
            <div className="market-header">
                <h2 className="market-title">
                    <span className="market-title-icon">🛒</span>
                    NFT Market
                </h2>
                <div className="market-subtitle">Buy cases to get NFT cards on NEAR blockchain</div>
            </div>

            {!connected && (
                <div className="market-warning">⚠️ Подключи HOT Wallet на главной странице, чтобы покупать кейсы</div>
            )}

            <div className="market-cases-grid">
                {CASES.map(function (c) {
                    return (
                        <div key={c.id} className="market-case-card">
                            <div className="market-case-image">
                                <img src={c.image} alt={c.name} draggable="false" loading="lazy"
                                    onError={function (e) { try { e.currentTarget.src = "/cards/card.jpg"; } catch (err) { } }} />
                            </div>
                            <div className="market-case-rarity-badge" data-rarity={c.rarity}>{c.rarity}</div>
                            <div className="market-case-name">{c.name}</div>
                            <div className="market-case-desc">{c.description}</div>
                            <div className="market-case-price">{c.displayPrice} • {c.price} Ⓝ</div>
                            <button className="market-case-buy-btn" onClick={function () { handleBuy(c); }}
                                disabled={!connected || buying === c.id}>
                                {buying === c.id ? "Paying..." : "Buy"}
                            </button>
                        </div>
                    );
                })}
            </div>

            {opening && (
                <div style={{
                    position: "fixed", inset: 0, zIndex: 99999,
                    background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
                }}>
                    <div style={{
                        background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                        border: "1px solid rgba(255,255,255,0.15)", borderRadius: 20,
                        padding: "28px 24px", maxWidth: 400, width: "100%", textAlign: "center",
                    }}>
                        {!revealedCards ? (
                            <>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🎁</div>
                                <div style={{ color: "#fff", fontSize: 18, fontWeight: 900 }}>Opening case...</div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>🎴</div>
                                <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, marginBottom: 12 }}>
                                    {revealedCards.length} Card{revealedCards.length > 1 ? "s" : ""} Received!
                                </div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 16 }}>
                                    {revealedCards.map(function (card, i) {
                                        return (
                                            <div key={i} style={{
                                                padding: "8px 12px", borderRadius: 10,
                                                background: "rgba(120,200,255,0.1)", border: "1px solid rgba(120,200,255,0.3)",
                                                color: "#78c8ff", fontSize: 12, fontFamily: "monospace",
                                            }}>
                                                {card.rarity} • {card.token_id}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div style={{ color: claimStatus.startsWith("error") ? "#ff6b6b" : "#a0d8ff", fontSize: 13 }}>
                                    {claimStatus === "claiming" ? "Transferring NFTs to your wallet..." :
                                        claimStatus === "done" ? "✅ All NFTs transferred!" :
                                            claimStatus}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="market-footer">
                <div className="market-footer-icon">🚀</div>
                <div className="market-footer-text">Real NFTs on NEAR blockchain</div>
            </div>
        </div>
    );
}