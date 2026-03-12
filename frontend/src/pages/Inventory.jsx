// frontend/src/pages/Inventory.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWallet } from '../context/WalletConnectContext';
import { nftToCard, nftsToCards, getElementEmoji, getElementColor, getRarityClass } from '../utils/cardUtils';

const API_URL = import.meta.env.VITE_API_URL || '';
const NFT_CONTRACT = import.meta.env.VITE_NFT_CONTRACT_ID || 'cc.retardio.near';

const Inventory = ({ onBack, onStartGame }) => {
    const { wallet, signedAccountId } = useWallet();

    const [cards, setCards] = useState([]);
    const [selectedCards, setSelectedCards] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [saving, setSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState('');

    // Ref для предотвращения двойной загрузки
    const loadedRef = useRef(false);
    const mountedRef = useRef(true);

    // Загрузка NFT
    const loadNFTs = useCallback(async () => {
        if (!signedAccountId) {
            setLoading(false);
            setError('Connect wallet to view inventory');
            return;
        }

        // Предотвращаем повторную загрузку
        if (loadedRef.current) return;
        loadedRef.current = true;

        setLoading(true);
        setError(null);

        try {
            console.log('[Inventory] Loading NFTs for:', signedAccountId);

            // Пробуем загрузить напрямую из NEAR RPC
            const nfts = await fetchNFTsFromChain(signedAccountId);

            if (!mountedRef.current) return;

            if (nfts && nfts.length > 0) {
                const convertedCards = nftsToCards(nfts);
                console.log('[Inventory] Loaded cards:', convertedCards.length);
                setCards(convertedCards);

                // Загружаем сохранённую колоду
                await loadSavedDeck(convertedCards);
            } else {
                console.log('[Inventory] No NFTs found, trying mock');
                // Пробуем mock NFTs для тестирования
                await loadMockNFTs();
            }
        } catch (err) {
            console.error('[Inventory] Load error:', err);
            if (mountedRef.current) {
                setError('Failed to load NFTs: ' + err.message);
                // Пробуем mock как fallback
                await loadMockNFTs();
            }
        } finally {
            if (mountedRef.current) {
                setLoading(false);
            }
        }
    }, [signedAccountId]);

    // Загрузка NFT напрямую из NEAR
    const fetchNFTsFromChain = async (accountId) => {
        const rpcUrl = 'https://rpc.mainnet.near.org';

        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'nft-query',
                method: 'query',
                params: {
                    request_type: 'call_function',
                    finality: 'final',
                    account_id: NFT_CONTRACT,
                    method_name: 'nft_tokens_for_owner',
                    args_base64: btoa(JSON.stringify({
                        account_id: accountId,
                        from_index: '0',
                        limit: 100
                    }))
                }
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'RPC error');
        }

        if (data.result && data.result.result) {
            const bytes = new Uint8Array(data.result.result);
            const text = new TextDecoder().decode(bytes);
            const nfts = JSON.parse(text);
            return nfts.map(nft => ({
                ...nft,
                contract_id: NFT_CONTRACT
            }));
        }

        return [];
    };

    // Загрузка mock NFT для тестирования
    const loadMockNFTs = async () => {
        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch(`${API_URL}/api/mock_nfts`, {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });

            if (response.ok) {
                const mockNfts = await response.json();
                if (mountedRef.current && mockNfts.length > 0) {
                    const convertedCards = nftsToCards(mockNfts);
                    setCards(convertedCards);
                    console.log('[Inventory] Loaded mock cards:', convertedCards.length);
                }
            }
        } catch (err) {
            console.error('[Inventory] Mock load error:', err);
        }
    };

    // Загрузка сохранённой колоды
    const loadSavedDeck = async (availableCards) => {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) return;

            const response = await fetch(`${API_URL}/api/decks/my`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const deckData = await response.json();
                if (deckData.cards && Array.isArray(deckData.cards)) {
                    // Восстанавливаем выбранные карты
                    const savedIds = deckData.cards;
                    const selected = availableCards.filter(c => savedIds.includes(c.id));
                    if (mountedRef.current) {
                        setSelectedCards(selected);
                        console.log('[Inventory] Restored deck:', selected.length, 'cards');
                    }
                }
            }
        } catch (err) {
            console.error('[Inventory] Deck load error:', err);
        }
    };

    // Выбор/снятие карты
    const toggleCard = (card) => {
        setSelectedCards(prev => {
            const isSelected = prev.some(c => c.id === card.id);

            if (isSelected) {
                return prev.filter(c => c.id !== card.id);
            } else {
                if (prev.length >= 5) {
                    // Убираем первую, добавляем новую
                    return [...prev.slice(1), card];
                }
                return [...prev, card];
            }
        });

        // Очищаем сообщение при изменении
        setSaveMessage('');
    };

    // Сохранение колоды на backend
    const saveDeck = async () => {
        if (selectedCards.length !== 5) {
            setSaveMessage('Select exactly 5 cards');
            return;
        }

        setSaving(true);
        setSaveMessage('');

        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                setSaveMessage('Please login first');
                setSaving(false);
                return;
            }

            const deckPayload = {
                cards: selectedCards.map(c => c.id),
                full_cards: selectedCards.map(c => ({
                    id: c.id,
                    token_id: c.token_id,
                    name: c.name,
                    image: c.image,
                    rarity: c.rarity,
                    element: c.element,
                    stats: c.stats,
                    attack: c.attack,
                    defense: c.defense,
                    speed: c.speed,
                    contract_id: c.contract_id
                }))
            };

            console.log('[Inventory] Saving deck:', deckPayload);

            const response = await fetch(`${API_URL}/api/decks/save`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(deckPayload)
            });

            const result = await response.json();

            if (response.ok) {
                setSaveMessage('✅ Deck saved! Ready for PvP');
                console.log('[Inventory] Deck saved successfully');
            } else {
                setSaveMessage('❌ ' + (result.detail || 'Failed to save'));
            }
        } catch (err) {
            console.error('[Inventory] Save error:', err);
            setSaveMessage('❌ Network error');
        } finally {
            setSaving(false);
        }
    };

    // Play with selected deck
    const handlePlay = () => {
        if (selectedCards.length !== 5) {
            setSaveMessage('Select 5 cards first');
            return;
        }

        if (onStartGame) {
            onStartGame(selectedCards);
        }
    };

    // Effects
    useEffect(() => {
        mountedRef.current = true;
        loadedRef.current = false;

        loadNFTs();

        return () => {
            mountedRef.current = false;
        };
    }, [loadNFTs]);

    // Render card
    const renderCard = (card, isSelected) => {
        const rarityClass = getRarityClass(card.rarity);
        const elementEmoji = getElementEmoji(card.element);
        const elementColor = getElementColor(card.element);

        return (
            <div
                key={card.id}
                className={`inventory-card ${rarityClass} ${isSelected ? 'selected' : ''}`}
                onClick={() => toggleCard(card)}
            >
                <div className="inventory-card-image-container">
                    {card.image ? (
                        <img
                            src={card.image}
                            alt={card.name}
                            className="inventory-card-image"
                            loading="lazy"
                            onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                            }}
                        />
                    ) : null}
                    <div className="inventory-card-placeholder" style={{ display: card.image ? 'none' : 'flex' }}>
                        {elementEmoji}
                    </div>
                </div>

                {/* Element badge */}
                <div
                    className="inventory-card-element"
                    style={{ backgroundColor: elementColor }}
                >
                    {elementEmoji}
                </div>

                {/* Stats */}
                <div className="inventory-card-stats">
                    <span className="stat attack">⚔️{card.attack}</span>
                    <span className="stat defense">🛡️{card.defense}</span>
                    <span className="stat speed">⚡{card.speed}</span>
                </div>

                {/* Name */}
                <div className="inventory-card-name">{card.name}</div>

                {/* Selection indicator */}
                {isSelected && (
                    <div className="inventory-card-selected-badge">
                        {selectedCards.findIndex(c => c.id === card.id) + 1}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="inventory-screen">
            <div className="inventory-header">
                <button className="back-button" onClick={onBack}>← Back</button>
                <h2>Inventory</h2>
                <div className="inventory-count">{cards.length} NFTs</div>
            </div>

            {/* Selected deck panel */}
            <div className="selected-deck-panel">
                <div className="selected-deck-title">
                    Your Deck ({selectedCards.length}/5)
                </div>
                <div className="selected-deck-cards">
                    {[0, 1, 2, 3, 4].map(i => (
                        <div key={i} className="selected-deck-slot">
                            {selectedCards[i] ? (
                                <div className={`selected-deck-card ${getRarityClass(selectedCards[i].rarity)}`}>
                                    <img
                                        src={selectedCards[i].image}
                                        alt=""
                                        onError={(e) => e.target.style.display = 'none'}
                                    />
                                    <span className="slot-element">{getElementEmoji(selectedCards[i].element)}</span>
                                </div>
                            ) : (
                                <div className="selected-deck-empty">?</div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="selected-deck-actions">
                    <button
                        className="save-deck-btn"
                        onClick={saveDeck}
                        disabled={saving || selectedCards.length !== 5}
                    >
                        {saving ? 'Saving...' : 'Save Deck'}
                    </button>
                    <button
                        className="play-deck-btn"
                        onClick={handlePlay}
                        disabled={selectedCards.length !== 5}
                    >
                        Play
                    </button>
                </div>

                {saveMessage && (
                    <div className={`save-message ${saveMessage.includes('✅') ? 'success' : 'error'}`}>
                        {saveMessage}
                    </div>
                )}
            </div>

            {/* Cards grid */}
            <div className="inventory-content">
                {loading ? (
                    <div className="inventory-loading">
                        <div className="loading-spinner"></div>
                        <p>Loading NFTs...</p>
                    </div>
                ) : error ? (
                    <div className="inventory-error">
                        <p>{error}</p>
                        <button onClick={() => { loadedRef.current = false; loadNFTs(); }}>
                            Retry
                        </button>
                    </div>
                ) : cards.length === 0 ? (
                    <div className="inventory-empty">
                        <p>No NFTs found</p>
                        <p className="inventory-empty-hint">
                            Get NFTs from Cases or Market
                        </p>
                    </div>
                ) : (
                    <div className="inventory-grid">
                        {cards.map(card => renderCard(card, selectedCards.some(c => c.id === card.id)))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Inventory;