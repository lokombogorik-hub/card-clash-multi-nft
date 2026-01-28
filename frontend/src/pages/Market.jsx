import { useState } from "react";

const CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: "0.5 NEAR",
        image: "/ui/case-starter.png",
        rarity: "common",
        description: "3 random Common cards",
        animation: "fadeIn",
    },
    {
        id: "premium",
        name: "Premium Case",
        price: "2 NEAR",
        image: "/ui/case-premium.png",
        rarity: "rare",
        description: "2 Rare + 1 Epic card",
        animation: "spinReveal",
    },
    {
        id: "legendary",
        name: "Legendary Case",
        price: "10 NEAR",
        image: "/ui/case-legendary.png",
        rarity: "legendary",
        description: "1 Legendary + 2 Epic cards",
        animation: "explosionReveal",
    },
    {
        id: "ultimate",
        name: "Ultimate Case",
        price: "50 NEAR",
        image: "/ui/case-ultimate.png",
        rarity: "legendary",
        description: "5 Legendary cards guaranteed",
        animation: "cosmicReveal",
    },
];

export default function Market() {
    const [selectedCase, setSelectedCase] = useState(null);
    const [buying, setBuying] = useState(false);
    const [opening, setOpening] = useState(false);
    const [revealedNFT, setRevealedNFT] = useState(null);

    const handleBuy = async (caseId) => {
        const selectedCaseData = CASES.find((c) => c.id === caseId);
        if (!selectedCaseData) return;

        setBuying(true);
        setOpening(true);

        // Simulate purchase
        setTimeout(() => {
            setBuying(false);

            // Simulate NFT reveal
            setTimeout(() => {
                setRevealedNFT({
                    name: "Epic Bunny #1337",
                    image: "/cards/card3.jpg",
                    rarity: selectedCaseData.rarity,
                });

                setTimeout(() => {
                    setOpening(false);
                    setRevealedNFT(null);
                    setSelectedCase(null);
                }, 3000);
            }, 2000);
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
            {selectedCase && !opening && (
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

            {/* Opening Animation */}
            {opening && (
                <div className="market-opening-overlay">
                    <div className={`market-opening-container ${selectedCase?.animation || "fadeIn"}`}>
                        {!revealedNFT ? (
                            <>
                                <div className="market-opening-case">
                                    <img
                                        src={selectedCase?.image}
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