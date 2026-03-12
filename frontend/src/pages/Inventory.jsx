// frontend/src/pages/Inventory.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { apiFetch } from "../api";
import {
    nftToCard,
    getElementEmoji,
    getRarityFromTokenId,
    getRankLabel,
} from "../utils/cardUtils";

const API_URL = import.meta.env.VITE_API_URL || "";
const NFT_CONTRACT = import.meta.env.VITE_NFT_CONTRACT_ID || "cc.retardio.near";

export default function Inventory({ token, onDeckReady }) {
    const [cards, setCards] = useState([]);
    const [selected, setSelected] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");
    const [tappingId, setTappingId] = useState(null);

    const mountedRef = useRef(true);
    const loadedRef = useRef(false);

    // Load NFTs
    const loadNFTs = useCallback(async () => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        setLoading(true);
        setError(null);

        try {
            // Try chain first
            const chainNfts = await fetchNFTsFromChain();

            if (!mountedRef.current) return;

            if (chainNfts && chainNfts.length > 0) {
                const converted = chainNfts.map((nft, idx) => nftToCard(nft, idx));
                setCards(converted);
                await loadSavedDeck(converted);
            } else {
                // Fallback to mock
                await loadMockNFTs();
            }
        } catch (err) {
            console.error("[Inventory] Load error:", err);
            if (mountedRef.current) {
                setError("Failed to load NFTs");
                await loadMockNFTs();
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [token]);

    const fetchNFTsFromChain = async () => {
        // Get account from localStorage or context
        let accountId = null;
        try {
            const walletData = localStorage.getItem("near_wallet_auth_key");
            if (walletData) {
                const parsed = JSON.parse(walletData);
                accountId = parsed.accountId || parsed.account_id;
            }
        } catch (e) { }

        if (!accountId) {
            // Try HOT wallet
            try {
                const hotAuth = localStorage.getItem("hot:authed:mainnet");
                if (hotAuth) {
                    const parsed = JSON.parse(hotAuth);
                    accountId = parsed.accountId || parsed.account_id || parsed;
                }
            } catch (e) { }
        }

        if (!accountId) return [];

        const rpcUrl = "https://rpc.mainnet.near.org";

        const response = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "nft-query",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: NFT_CONTRACT,
                    method_name: "nft_tokens_for_owner",
                    args_base64: btoa(
                        JSON.stringify({
                            account_id: accountId,
                            from_index: "0",
                            limit: 100,
                        })
                    ),
                },
            }),
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || "RPC error");
        }

        if (data.result && data.result.result) {
            const bytes = new Uint8Array(data.result.result);
            const text = new TextDecoder().decode(bytes);
            const nfts = JSON.parse(text);
            return nfts.map((nft) => ({
                ...nft,
                contract_id: NFT_CONTRACT,
            }));
        }

        return [];
    };

    const loadMockNFTs = async () => {
        try {
            const mockNfts = await apiFetch("/api/mock_nfts", { token });
            if (mountedRef.current && Array.isArray(mockNfts) && mockNfts.length > 0) {
                const converted = mockNfts.map((nft, idx) => nftToCard(nft, idx));
                setCards(converted);
                await loadSavedDeck(converted);
            }
        } catch (err) {
            console.error("[Inventory] Mock load error:", err);
        }
    };

    const loadSavedDeck = async (availableCards) => {
        if (!token) return;
        try {
            const deckData = await apiFetch("/api/decks/my", { token });
            if (deckData.cards && Array.isArray(deckData.cards)) {
                const savedIds = deckData.cards;
                const restored = availableCards.filter((c) =>
                    savedIds.includes(c.id || c.token_id)
                );
                if (mountedRef.current && restored.length > 0) {
                    setSelected(restored);
                }
            }
        } catch (err) {
            // No saved deck, that's fine
        }
    };

    const toggleCard = (card) => {
        setSelected((prev) => {
            const isSelected = prev.some((c) => c.id === card.id);
            if (isSelected) {
                return prev.filter((c) => c.id !== card.id);
            } else {
                if (prev.length >= 5) {
                    return [...prev.slice(1), card];
                }
                return [...prev, card];
            }
        });
        setSaveMsg("");
    };

    const handleTap = (card, e) => {
        // Visual feedback
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        e.currentTarget.style.setProperty("--px", `${x}%`);
        e.currentTarget.style.setProperty("--py", `${y}%`);

        setTappingId(card.id);
        setTimeout(() => setTappingId(null), 520);

        toggleCard(card);

        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch (e) { }
    };

    const saveDeck = async () => {
        if (selected.length !== 5) {
            setSaveMsg("Select exactly 5 cards");
            return;
        }

        setSaving(true);
        setSaveMsg("");

        try {
            const payload = {
                cards: selected.map((c) => c.id || c.token_id),
                full_cards: selected.map((c) => ({
                    id: c.id,
                    token_id: c.token_id,
                    name: c.name,
                    imageUrl: c.imageUrl,
                    image: c.image,
                    values: c.values,
                    rarity: c.rarity,
                    rank: c.rank,
                    rankLabel: c.rankLabel,
                    element: c.element,
                    contract_id: c.contract_id,
                })),
            };

            await apiFetch("/api/decks/save", {
                method: "POST",
                token,
                body: JSON.stringify(payload),
            });

            setSaveMsg("✅ Deck saved!");

            // Auto-proceed to matchmaking
            if (onDeckReady) {
                setTimeout(() => onDeckReady(selected), 600);
            }
        } catch (err) {
            console.error("[Inventory] Save error:", err);
            setSaveMsg("❌ " + (err.message || "Failed to save"));
        } finally {
            setSaving(false);
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        loadedRef.current = false;
        loadNFTs();
        return () => {
            mountedRef.current = false;
        };
    }, [loadNFTs]);

    const renderCard = (card) => {
        const isSelected = selected.some((c) => c.id === card.id);
        const pickIndex = selected.findIndex((c) => c.id === card.id);
        const isTapping = tappingId === card.id;

        // Rarity border color
        let rankColor = "rgba(255,255,255,.18)";
        let rankGlow = "rgba(120,200,255,.25)";
        if (card.rarity === "legendary" || card.rank === "legendary") {
            rankColor = "rgba(255,215,0,.7)";
            rankGlow = "rgba(255,215,0,.4)";
        } else if (card.rarity === "epic" || card.rank === "epic") {
            rankColor = "rgba(180,80,255,.6)";
            rankGlow = "rgba(180,80,255,.35)";
        } else if (card.rarity === "rare" || card.rank === "rare") {
            rankColor = "rgba(120,200,255,.6)";
            rankGlow = "rgba(120,200,255,.35)";
        }

        return (
            <div
                key={card.id}
                className={`inv-card-game ${isSelected ? "is-selected" : ""} ${isTapping ? "is-tapping" : ""}`}
                style={{
                    "--rank": rankColor,
                    "--rankGlow": rankGlow,
                }}
                onClick={(e) => handleTap(card, e)}
            >
                {/* Art */}
                <div className="inv-card-art-full">
                    {card.imageUrl || card.image ? (
                        <img
                            src={card.imageUrl || card.image}
                            alt={card.name}
                            loading="lazy"
                            onError={(e) => {
                                e.target.style.display = "none";
                            }}
                        />
                    ) : null}
                </div>

                {/* Element pill */}
                {card.element && (
                    <div className="inv-card-elem-pill">
                        <span className="inv-card-elem-ic">{getElementEmoji(card.element)}</span>
                    </div>
                )}

                {/* TT numbers */}
                <div className="inv-tt-badge" />
                <span className="inv-tt-num top">{card.values?.top ?? "?"}</span>
                <span className="inv-tt-num left">{card.values?.left ?? "?"}</span>
                <span className="inv-tt-num right">{card.values?.right ?? "?"}</span>
                <span className="inv-tt-num bottom">{card.values?.bottom ?? "?"}</span>

                {/* Pick badge */}
                {isSelected && (
                    <div className="inv-pick-badge">
                        <div className="inv-pick-badge-inner">
                            <span className="inv-pick-check">✓</span>
                            <span className="inv-pick-no">{pickIndex + 1}</span>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="inventory-page">
            <div className="inv-header">
                <h1 className="inv-title">
                    <span className="inv-title-icon">🎴</span>
                    Inventory
                </h1>
                <p className="inv-subtitle">
                    Select 5 cards for your deck • {cards.length} NFTs loaded
                </p>
            </div>

            {/* Selected deck panel */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    marginBottom: 16,
                    padding: "12px 16px",
                    background: "rgba(0,0,0,.45)",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,.12)",
                }}
            >
                <div style={{ display: "flex", gap: 8 }}>
                    {[0, 1, 2, 3, 4].map((i) => (
                        <div
                            key={i}
                            style={{
                                width: 40,
                                height: 56,
                                borderRadius: 8,
                                background: selected[i]
                                    ? `url(${selected[i].imageUrl || selected[i].image}) center/cover`
                                    : "rgba(255,255,255,.08)",
                                border: selected[i]
                                    ? "2px solid rgba(120,200,255,.6)"
                                    : "1px dashed rgba(255,255,255,.2)",
                                display: "grid",
                                placeItems: "center",
                                fontSize: 14,
                                color: "rgba(255,255,255,.5)",
                            }}
                        >
                            {!selected[i] && "?"}
                        </div>
                    ))}
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>
                        {selected.length}/5
                    </span>
                    <button
                        onClick={saveDeck}
                        disabled={saving || selected.length !== 5}
                        style={{
                            padding: "10px 18px",
                            borderRadius: 10,
                            background:
                                selected.length === 5
                                    ? "linear-gradient(135deg, #78c8ff 0%, #5096ff 100%)"
                                    : "rgba(255,255,255,.1)",
                            color: selected.length === 5 ? "#000" : "#fff",
                            fontWeight: 700,
                            fontSize: 14,
                            border: "none",
                            cursor: selected.length === 5 ? "pointer" : "not-allowed",
                            opacity: selected.length === 5 ? 1 : 0.5,
                        }}
                    >
                        {saving ? "Saving..." : "Save & Play"}
                    </button>
                </div>
            </div>

            {saveMsg && (
                <div
                    style={{
                        marginBottom: 16,
                        padding: "10px 14px",
                        borderRadius: 10,
                        background: saveMsg.includes("✅")
                            ? "rgba(100,255,150,.15)"
                            : "rgba(255,80,80,.15)",
                        border: saveMsg.includes("✅")
                            ? "1px solid rgba(100,255,150,.4)"
                            : "1px solid rgba(255,80,80,.4)",
                        color: saveMsg.includes("✅") ? "#a0ffc8" : "#ffb3b3",
                        fontSize: 13,
                        textAlign: "center",
                    }}
                >
                    {saveMsg}
                </div>
            )}

            {/* Cards grid */}
            {loading ? (
                <div className="inv-loading">
                    <div className="inv-loading-spinner" />
                    <p>Loading NFTs...</p>
                </div>
            ) : error ? (
                <div className="inv-error">
                    <p>{error}</p>
                    <button
                        onClick={() => {
                            loadedRef.current = false;
                            loadNFTs();
                        }}
                        style={{ marginTop: 12 }}
                    >
                        Retry
                    </button>
                </div>
            ) : cards.length === 0 ? (
                <div className="inv-empty">
                    <div className="inv-empty-icon">📦</div>
                    <div className="inv-empty-title">No NFTs found</div>
                    <p className="inv-empty-text">
                        Get NFTs from Cases or Market to start playing
                    </p>
                </div>
            ) : (
                <div className="inv-grid-game-style">
                    {cards.map((card) => renderCard(card))}
                </div>
            )}
        </div>
    );
}