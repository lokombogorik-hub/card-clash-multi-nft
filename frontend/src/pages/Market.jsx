import { useState } from "react";

const CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: "0.5 NEAR",
        image: "/ui/case-starter.png",
        rarity: "common",
        description: "3 random Common cards",
    },
    {
        id: "premium",
        name: "Premium Case",
        price: "2 NEAR",
        image: "/ui/case-premium.png",
        rarity: "rare",
        description: "2 Rare + 1 Epic card",
    },
    {
        id: "legendary",
        name: "Legendary Case",
        price: "10 NEAR",
        image: "/ui/case-legendary.png",
        rarity: "legendary",
        description: "1 Legendary + 2 Epic cards",
    },
];

export default function Market() {
    const [selectedCase, setSelectedCase] = useState(null);
    const [buying, setBuying] = useState(false);

    const handleBuy = async (caseId) => {
        setBuying(true);
        // TODO: integrate NEAR payment + backend mint
        setTimeout(() => {
            alert(`Bought ${caseId}! (mock)`);
            setBuying(false);
            setSelectedCase(null);
        }, 1500);
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

            {/* Cases Grid */}
            <div className="market-cases-grid">
                {CASES.map((c) => (
                    <button
                        key={c.id}
                        className={`market-case-card ${selectedCase?.id === c.id ? "selected" : ""}`}
                        onClick={() => setSelectedCase(c)}
                    >
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
                        <div className="market-case-price">{c.price}</div>
                    </button>
                ))}
            </div>

            {/* Buy Button */}
            {selectedCase && (
                <div className="market-buy-section">
                    <button
                        className="market-buy-btn"
                        disabled={buying}
                        onClick={() => handleBuy(selectedCase.id)}
                    >
                        {buying ? "Processing..." : `Buy ${selectedCase.name} for ${selectedCase.price}`}
                    </button>
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