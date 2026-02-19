import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";
import { useWalletConnect } from "../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../libs/nearNft";

function nftKey(n) {
    return n.token_id || n.tokenId || n.id;
}

export default function Inventory({ token, onDeckReady }) {
    const { accountId, connected } = useWalletConnect();
    const [loading, setLoading] = useState(false);
    const [nfts, setNfts] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const nftContractId = import.meta.env.VITE_NEAR_NFT_CONTRACT_ID;

    useEffect(() => {
        let alive = true;
        const load = async () => {
            setLoading(true);
            try {
                // 1. Загружаем активную колоду из БД
                const deckRes = await apiFetch("/api/decks/active", { token });
                if (alive && deckRes.cards) setSelected(new Set(deckRes.cards));

                // 2. Загружаем NFT
                let items = [];
                if (connected && accountId && nftContractId) {
                    // Пробуем взять реальные NFT из NEAR
                    const nearItems = await nearNftTokensForOwner(nftContractId, accountId);
                    items = nearItems.map(t => ({
                        token_id: t.token_id,
                        imageUrl: t.metadata?.media || "/cards/card.jpg",
                        stats: t.metadata?.extra ? JSON.parse(t.metadata.extra) : { top: 5, right: 5, bottom: 5, left: 5 }
                    }));
                }

                // Если с блокчейна пусто или нет кошелька, берем моки из БД (Stage 1)
                if (items.length === 0) {
                    const mockRes = await apiFetch("/api/nfts/my", { token });
                    items = mockRes.items || [];
                }

                if (alive) setNfts(items);
            } catch (e) {
                if (alive) setError("Failed to load inventory");
            } finally {
                if (alive) setLoading(false);
            }
        };
        load();
        return () => { alive = false; };
    }, [token, accountId, connected, nftContractId]);

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else {
                if (next.size >= 5) return next;
                next.add(id);
            }
            return next;
        });
    };

    const saveDeck = async () => {
        setSaving(true);
        try {
            await apiFetch("/api/decks/active", {
                token,
                method: "PUT",
                body: JSON.stringify({ cards: Array.from(selected) }),
            });
            onDeckReady?.();
        } catch (e) {
            setError("Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page inventory-page">
            <div className="inv-header">
                <h2 className="inv-title">Deck Builder</h2>
                <div className="inv-subtitle">{selected.size}/5 Cards Selected</div>
            </div>

            {loading ? <div className="inv-loading">Loading...</div> : (
                <div className="inv-grid-game-style">
                    {nfts.map((n, idx) => {
                        const id = nftKey(n);
                        const isSel = selected.has(id);
                        const s = n.stats || { top: 5, right: 5, bottom: 5, left: 5 };
                        return (
                            <div key={id} className={`inv-card-game ${isSel ? 'is-selected' : ''}`} onClick={() => toggle(id)}>
                                <div className="inv-card-art-full">
                                    <img src={n.imageUrl} alt="" />
                                </div>
                                <div className="inv-tt-badge" />
                                <span className="inv-tt-num top">{s.top}</span>
                                <span className="inv-tt-num left">{s.left}</span>
                                <span className="inv-tt-num right">{s.right}</span>
                                <span className="inv-tt-num bottom">{s.bottom}</span>
                                {isSel && <div className="inv-pick-badge"><div className="inv-pick-check">✓</div></div>}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="inv-actions">
                <button className="inv-btn inv-btn-primary"
                    disabled={selected.size !== 5 || saving}
                    onClick={saveDeck}>
                    {saving ? "Saving..." : "Save Deck"}
                </button>
            </div>
        </div>
    );
}