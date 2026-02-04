import { useState } from "react";
import { useWalletStore } from "../store/useWalletStore";

const CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: 0.1, // NEAR (storage cost)
        displayPrice: "1 Card",
        image: "/ui/case-starter.png",
        rarity: "common",
        description: "1 random Common card",
        animation: "fadeIn",
        type: "single",
    },
    {
        id: "premium",
        name: "Premium Case",
        price: 0.5, // NEAR (storage for 5 cards)
        displayPrice: "5 Cards",
        image: "/ui/case-premium.png",
        rarity: "rare",
        description: "5 random cards pack",
        animation: "spinReveal",
        type: "pack",
    },
    {
        id: "legendary",
        name: "Legendary Case",
        price: 0.5,
        displayPrice: "5 Epic Cards",
        image: "/ui/case-legendary.png",
        rarity: "legendary",
        description: "5 Epic cards pack",
        animation: "explosionReveal",
        type: "pack",
    },
    {
        id: "ultimate",
        name: "Ultimate Case",
        price: 0.5,
        displayPrice: "5 Legendary",
        image: "/ui/case-ultimate.png",
        rarity: "legendary",
        description: "5 Legendary cards guaranteed",
        animation: "cosmicReveal",
        type: "pack",
    },
];

export default function Market() {
    const { isAuthenticated, accountId, mintCard, mintPack, getUserNFTs } = useWalletStore();

    const [buying, setBuying] = useState(null);
    const [opening, setOpening] = useState(false);
    const [revealedNFT, setRevealedNFT] = useState(null);
    const [selectedCase, setSelectedCase] = useState(null);

    const handleBuy = async (caseData) => {
        if (!isAuthenticated || !accountId) {
            alert("Подключи HOT Wallet на главной странице!");
            return;
        }

        setBuying(caseData.id);

        try {
            let result;

            // Минтим NFT через контракт
            if (caseData.type === "single") {
                result = await mintCard();
            } else {
                result = await mintPack();
            }

            // Обновляем список NFT
            await getUserNFTs();

            // Открываем кейс с анимацией
            setBuying(null);
            setSelectedCase(caseData);
            setOpening(true);

            // Показываем результат
            setTimeout(() => {
                const rarities = ['common', 'rare', 'epic', 'legendary'];
                const randomRarity = caseData.rarity === 'legendary' ? 'legendary' :
                    rarities[Math.floor(Math.random() * rarities.length)];

                setRevealedNFT({
                    name: caseData.type === "single" ?
                        `Card #${Date.now().toString().slice(-4)}` :
                        `Pack of 5 Cards`,
                    image: `/cards/card${Math.floor(Math.random() * 5) + 1}.jpg`,
                    rarity: randomRarity,
                });

                setTimeout(() => {
                    setOpening(false);
                    setRevealedNFT(null);
                    setSelectedCase(null);
                }, 3000);
            }, 2000);

        } catch (e) {
            alert(`Ошибка покупки: ${e.message}`);
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
                    Buy cases to get NFT cards on NEAR blockchain
                </div>
            </div>

            {!isAuthenticated && (
                <div className="market-warning">
                    ⚠️ Подключи HOT Wallet на главной странице, чтобы покупать кейсы
                </div>
            )}

            {isAuthenticated && accountId && (
                <div className="market-account-info">
                    🔗 Connected: {accountId}
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
                        <div className="market-case-price">{c.displayPrice}</div>
                        <div className="market-case-price-near">{c.price} Ⓝ (storage)</div>

                        <button
                            className="market-case-buy-btn"
                            onClick={() => handleBuy(c)}
                            disabled={!isAuthenticated || buying === c.id}
                        >
                            {buying === c.id ? "Минтинг..." : "Купить"}
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
                                <div className="market-opening-text">Minting on blockchain...</div>
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
                                <div className="market-revealed-nft-chain">✅ Minted on NEAR</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="market-footer">
                <div className="market-footer-icon">🚀</div>
                <div className="market-footer-text">
                    Real NFTs on NEAR blockchain • Trading coming soon!
                </div>
            </div>
        </div>
    );
}