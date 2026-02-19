import { useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

const CASES = [
    {
        id: "starter",
        name: "Starter Case",
        price: 0.1,
        displayPrice: "1 Card",
        image: "/ui/case-starter.png",
        rarity: "common",
        description: "1 random card",
        animation: "fadeIn",
        type: "single",
    },
    {
        id: "premium",
        name: "Premium Case",
        price: 2,
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
        price: 5,
        displayPrice: "5 Epic Cards",
        image: "/ui/case-legendary.png",
        rarity: "epic",
        description: "5 Epic cards guaranteed",
        animation: "explosionReveal",
        type: "pack",
    },
    {
        id: "ultimate",
        name: "Ultimate Case",
        price: 10,
        displayPrice: "5 Legendary",
        image: "/ui/case-ultimate.png",
        rarity: "legendary",
        description: "5 Legendary cards guaranteed",
        animation: "cosmicReveal",
        type: "pack",
    },
];

export default function Market() {
    const {
        connected: isAuthenticated,
        accountId,
        sendNear,
        signAndSendTransaction,
        getUserNFTs,
    } = useWalletConnect();

    const [buying, setBuying] = useState(null);
    const [opening, setOpening] = useState(false);
    const [revealedNFT, setRevealedNFT] = useState(null);
    const [selectedCase, setSelectedCase] = useState(null);

    const token = localStorage.getItem("token") ||
        localStorage.getItem("accessToken") ||
        localStorage.getItem("access_token") || "";

    const handleBuy = async (caseData) => {
        if (!isAuthenticated || !accountId) {
            alert("Подключи HOT Wallet на главной странице!");
            return;
        }

        if (!token) {
            alert("Telegram auth required");
            return;
        }

        setBuying(caseData.id);

        try {
            // 1. Оплата (отправляем NEAR в treasury)
            const { txHash } = await sendNear({
                receiverId: "retardo-s.near",
                amount: caseData.price.toString(),
            });

            // 2. Открываем кейс на бекенде (получаем зарезервированные NFT)
            const result = await apiFetch("/api/cases/open", {
                method: "POST",
                token,
                body: JSON.stringify({
                    case_id: caseData.id,
                    tx_hash: txHash,
                }),
            });

            // 3. Показываем анимацию открытия
            setBuying(null);
            setSelectedCase(caseData);
            setOpening(true);

            // 4. Через 2 сек показываем результат
            setTimeout(() => {
                const cards = result.cards || [];
                const firstCard = cards[0];

                setRevealedNFT({
                    name: caseData.type === "single"
                        ? `Card #${firstCard.token_id.split('_')[1]}`
                        : `Pack of ${cards.length} Cards`,
                    image: `/cards/${firstCard.rarity}.jpg`,
                    rarity: firstCard.rarity,
                    token_id: firstCard.token_id,
                    count: cards.length,
                });

                // 5. Через 3 сек делаем claim (nft_transfer)
                setTimeout(async () => {
                    try {
                        // Для каждой карты в паке делаем claim
                        for (const card of cards) {
                            const claimData = await apiFetch("/api/cases/claim", {
                                method: "POST",
                                token,
                                body: JSON.stringify({
                                    reserved_token_id: card.token_id,
                                }),
                            });

                            // Подписываем транзакцию трансфера
                            await signAndSendTransaction(claimData.transaction);
                        }

                        // Обновляем инвентарь
                        await getUserNFTs();

                        setOpening(false);
                        setRevealedNFT(null);
                        setSelectedCase(null);

                        alert(`✅ Получено ${cards.length} карт!`);
                    } catch (e) {
                        console.error("Claim error:", e);
                        alert(`Ошибка получения NFT: ${e.message}`);
                        setOpening(false);
                        setRevealedNFT(null);
                        setSelectedCase(null);
                    }
                }, 3000);

            }, 2000);

        } catch (e) {
            alert(`Ошибка покупки: ${e.message}`);
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
                        <div className="market-case-price-near">{c.price} Ⓝ</div>

                        <button
                            className="market-case-buy-btn"
                            onClick={() => handleBuy(c)}
                            disabled={!isAuthenticated || buying === c.id}
                        >
                            {buying === c.id ? "Оплата..." : "Купить"}
                        </button>
                    </div>
                ))}
            </div>

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
                                <div className="market-opening-text">Opening case...</div>
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
                                <div className="market-revealed-nft-chain">
                                    ✅ Transferring {revealedNFT.count} NFT{revealedNFT.count > 1 ? 's' : ''}...
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="market-footer">
                <div className="market-footer-icon">🚀</div>
                <div className="market-footer-text">
                    Real NFTs on NEAR blockchain • Multi-collection support!
                </div>
            </div>
        </div>
    );
}