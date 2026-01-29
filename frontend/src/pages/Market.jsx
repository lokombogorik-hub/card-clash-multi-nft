import { useState } from "react";
import { useWalletStore } from "../store/useWalletStore";

const CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: 0.5, // NEAR
        image: "/ui/case-starter.png",
        rarity: "common",
        description: "3 random Common cards",
        animation: "fadeIn",
    },
    {
        id: "premium",
        name: "Premium Case",
        price: 2,
        image: "/ui/case-premium.png",
        rarity: "rare",
        description: "2 Rare + 1 Epic card",
        animation: "spinReveal",
    },
    {
        id: "legendary",
        name: "Legendary Case",
        price: 10,
        image: "/ui/case-legendary.png",
        rarity: "legendary",
        description: "1 Legendary + 2 Epic cards",
        animation: "explosionReveal",
    },
    {
        id: "ultimate",
        name: "Ultimate Case",
        price: 50,
        image: "/ui/case-ultimate.png",
        rarity: "legendary",
        description: "5 Legendary cards guaranteed",
        animation: "cosmicReveal",
    },
];

export default function Market() {
    const { connected, accountId, sendNear } = useWalletStore();

    const [buying, setBuying] = useState(null); // id кейса
    const [opening, setOpening] = useState(false);
    const [revealedNFT, setRevealedNFT] = useState(null);
    const [selectedCase, setSelectedCase] = useState(null);

    const handleBuy = async (caseData) => {
        if (!connected || !accountId) {
            alert("Подключи HOT Wallet на главной странице!");
            return;
        }

        setBuying(caseData.id);

        try {
            // Оплата через HOT Wallet
            const receiverId = "cardclash.near"; // Замени на свой аккаунт
            const amount = caseData.price.toString();

            await sendNear({ receiverId, amount });

            // После успешной оплаты — открываем кейс
            setBuying(null);
            setSelectedCase(caseData);
            setOpening(true);

            // Simulate case opening
            setTimeout(() => {
                setRevealedNFT({
                    name: "Epic Bunny #1337",
                    image: "/cards/card3.jpg",
                    rarity: caseData.rarity,
                });

                setTimeout(() => {
                    setOpening(false);
                    setRevealedNFT(null);
                    setSelectedCase(null);
                }, 3000);
            }, 2000);

        } catch (e) {
            alert(`Ошибка оплаты: ${e.message}`);
            setBuying(null);
        }
    };

    return (
        <div className="market-page">
            {/* Header */}
            <div className="market-header">
                <h2 className="market-title">
                    <span className="market-title-icon">🛒</span>
                    NFT Market
                </h2>
                <div className="market-subtitle">
                    Buy cases to get random NFT cards
                </div>
            </div>

            {!connected && (
                <div className="market-warning">
                    ⚠️ Подключи HOT Wallet на главной странице, чтобы покупать кейсы
                </div>
            )}

            {/* Cases Grid */}
            <div className="market-cases-grid">
                {CASES.map((c) => (
                    <div key={c.id} className="market-case-card">
                        <div className="market-case-image">
                            <img
                                src={c.image}
                                alt={c.name}
                                draggable="false"
                                loading="lazy"
                                onError={(e) => {
                                    try {
                                        e.currentTarget.src = "/cards/card.jpg";
                                    } catch { }
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
                            onClick={() => handleBuy(c)}
                            disabled={!connected || buying === c.id}
                        >
                            {buying === c.id ? "Покупка..." : "Купить"}
                        </button>
                    </div>
                ))}
            </div>

            {/* Opening Animation */}
            {opening && selectedCase && (
                <div className="market-opening-overlay">
                    <div className={`market-opening-container ${selectedCase.animation}`}>
                        {!revealedNFT ? (
                            <>
                                <div className="market-opening-case">
                                    <img
                                        src={selectedCase.image}
                                        alt="Opening"
                                        draggable="false"
                                    />
                                </div>
                                <div className="market-opening-text">Opening...</div>
                            </>
                        ) : (
                            <div className="market-revealed-nft">
                                <div className="market-revealed-nft-glow" />
                                <div className="market-revealed-nft-card">
                                    <img
                                        src={revealedNFT.image}
                                        alt={revealedNFT.name}
                                        draggable="false"
                                    />
                                </div>
                                <div className="market-revealed-nft-name">{revealedNFT.name}</div>
                                <div className="market-revealed-nft-rarity" data-rarity={revealedNFT.rarity}>
                                    {revealedNFT.rarity}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Coming Soon */}
            <div className="market-footer">
                <div className="market-footer-icon">🚀</div>
                <div className="market-footer-text">
                    More cases & NFT trading coming soon!
                </div>
            </div>
        </div>
    );
}