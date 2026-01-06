import React, { useState, useEffect } from 'react';
import TripleTriadBoard from '../components/GameBoard/TripleTriadBoard';
import CardComponent from '../components/Cards/CardComponent';
import WalletConnect from '../components/MultiChainWallet/WalletConnect';

const GamePage = () => {
    const [board, setBoard] = useState(Array(3).fill(null).map(() => Array(3).fill(null)));
    const [hand, setHand] = useState([]);
    const [connected, setConnected] = useState(false);

    const demoCards = [
        { id: 1, top: 5, right: 3, bottom: 7, left: 2, element: 'fire' },
        { id: 2, top: 8, right: 1, bottom: 4, left: 6, element: 'water' },
    ];

    const handlePlaceCard = (row, col) => {
        if (hand.length === 0) return;
        const newBoard = [...board];
        newBoard[row][col] = hand[0];
        setBoard(newBoard);
        setHand(hand.slice(1));
    };

    return (
        <div>
            <WalletConnect onConnect={() => setConnected(true)} />
            {connected && (
                <>
                    <TripleTriadBoard board={board} onCellClick={handlePlaceCard} />
                    <div>
                        <h3>Your Hand</h3>
                        {hand.map(card => <CardComponent key={card.id} card={card} />)}
                    </div>
                </>
            )}
        </div>
    );
};

export default GamePage;