import React, { useState, useEffect } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { useDeckStore } from '../../store/deckStore';

const DeckBuilderPage = () => {
    const { wallets, nftCollections } = useWalletStore();
    const { currentDeck, savedDecks, saveDeck } = useDeckStore();

    const [selectedCards, setSelectedCards] = useState([]);
    const [deckName, setDeckName] = useState('Моя колода');
    const [filters, setFilters] = useState({
        chain: 'all', // all, near, ethereum, solana, tezos
        rarity: 'all',
        element: 'all',
        collection: 'all'
    });

    // Загрузка коллекции пользователя
    useEffect(() => {
        loadUserCollection();
    }, [wallets]);

    const loadUserCollection = async () => {
        // Загрузка NFT из всех подключенных кошельков
        const allCollections = [];

        for (const wallet of wallets) {
            const collection = await fetchNFTs(wallet.address, wallet.chain);
            allCollections.push(...collection);
        }

        // Конвертация в игровые карты
        const gameCards = convertToGameCards(allCollections);
        setUserCollection(gameCards);
    };

    const addCardToDeck = (card) => {
        if (selectedCards.length >= 10) {
            alert('Максимум 10 карт в колоде!');
            return;
        }

        // Проверка дубликатов
        const sameCardCount = selectedCards.filter(c =>
            c.id === card.id
        ).length;

        if (sameCardCount >= 3) {
            alert('Максимум 3 одинаковые карты!');
            return;
        }

        setSelectedCards([...selectedCards, card]);
    };

    const removeCardFromDeck = (cardId) => {
        setSelectedCards(selectedCards.filter(card => card.id !== cardId));
    };

    const saveCurrentDeck = async () => {
        if (selectedCards.length < 5) {
            alert('Минимум 5 карт в колоде!');
            return;
        }

        const deck = {
            name: deckName,
            cards: selectedCards,
            created: new Date().toISOString(),
            chainComposition: calculateChainComposition(selectedCards)
        };

        await saveDeck(deck);
        alert('Колода сохранена!');
    };

    return (
        <div className="deck-builder">
            {/* Левая панель - коллекция карт */}
            <div className="collection-panel">
                <h3>Ваша коллекция</h3>

                {/* Фильтры */}
                <div className="filters">
                    <select onChange={(e) => setFilters({ ...filters, chain: e.target.value })}>
                        <option value="all">Все сети</option>
                        <option value="near">NEAR</option>
                        <option value="ethereum">Ethereum</option>
                        <option value="polygon">Polygon</option>
                        <option value="solana">Solana</option>
                        <option value="tezos">Tezos</option>
                    </select>

                    {/* Другие фильтры... */}
                </div>

                {/* Список карт */}
                <div className="cards-grid">
                    {filteredCollection.map(card => (
                        <CardThumbnail
                            key={card.id}
                            card={card}
                            onClick={() => addCardToDeck(card)}
                            isInDeck={selectedCards.some(c => c.id === card.id)}
                        />
                    ))}
                </div>
            </div>

            {/* Правая панель - текущая колода */}
            <div className="deck-panel">
                <h3>Текущая колода ({selectedCards.length}/10)</h3>

                <input
                    type="text"
                    value={deckName}
                    onChange={(e) => setDeckName(e.target.value)}
                    placeholder="Название колоды"
                />

                {/* Слоты колоды */}
                <div className="deck-slots">
                    {Array.from({ length: 10 }).map((_, index) => (
                        <DeckSlot
                            key={index}
                            slotNumber={index + 1}
                            card={selectedCards[index]}
                            onRemove={() => selectedCards[index] &&
                                removeCardFromDeck(selectedCards[index].id)}
                        />
                    ))}
                </div>

                {/* Статистика колоды */}
                <DeckStats cards={selectedCards} />

                {/* Кнопка сохранения */}
                <button
                    className="save-deck-btn"
                    onClick={saveCurrentDeck}
                    disabled={selectedCards.length < 5}
                >
                    💾 Сохранить колоду
                </button>

                {/* Список сохраненных колод */}
                <div className="saved-decks">
                    <h4>Сохраненные колоды</h4>
                    {savedDecks.map(deck => (
                        <SavedDeckItem
                            key={deck.id}
                            deck={deck}
                            onSelect={() => setSelectedCards(deck.cards)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};