import React, { useState } from "react";

const createHand = (owner) =>
    Array.from({ length: 5 }).map((_, i) => ({
        id: `${owner}-${i}`,
        owner,
        values: {
            top: Math.ceil(Math.random() * 9),
            right: Math.ceil(Math.random() * 9),
            bottom: Math.ceil(Math.random() * 9),
            left: Math.ceil(Math.random() * 9),
        },
    }));

export default function Game() {
    const [playerHand, setPlayerHand] = useState(createHand("player"));
    const [enemyHand] = useState(createHand("enemy"));

    const [board, setBoard] = useState(Array(9).fill(null));
    const [selectedCard, setSelectedCard] = useState(null);

    const canPlace = (index) => board[index] === null && selectedCard;

    const placeCard = (index) => {
        if (!canPlace(index)) return;

        const newBoard = [...board];
        newBoard[index] = selectedCard;

        setBoard(newBoard);
        setPlayerHand(playerHand.filter((c) => c.id !== selectedCard.id));
        setSelectedCard(null);
    };

    return (
        <div className="screen">
            {/* ENEMY */}
            <div className="hand top">
                {enemyHand.map((card) => (
                    <Card key={card.id} card={card} />
                ))}
            </div>

            {/* BOARD */}
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${canPlace(i) ? "cell-active" : ""}`}
                        onClick={() => placeCard(i)}
                    >
                        {cell && <Card card={cell} small />}
                    </div>
                ))}
            </div>

            {/* PLAYER */}
            <div className="hand bottom">
                {playerHand.map((card) => (
                    <Card
                        key={card.id}
                        card={card}
                        selected={selectedCard?.id === card.id}
                        onClick={() => setSelectedCard(card)}
                    />
                ))}
            </div>
        </div>
    );
}

/* ---------------- CARD ---------------- */

function Card({ card, onClick, selected, small }) {
    return (
        <div
            className={`card ${card.owner} ${selected ? "selected" : ""}`}
            onClick={onClick}
            style={small ? { transform: "scale(0.85)" } : undefined}
        >
            <span style={numStyle.top}>{card.values.top}</span>
            <span style={numStyle.right}>{card.values.right}</span>
            <span style={numStyle.bottom}>{card.values.bottom}</span>
            <span style={numStyle.left}>{card.values.left}</span>
        </div>
    );
}

/* ---------------- NUMBERS ---------------- */

const baseNum = {
    position: "absolute",
    fontSize: 16,
    fontWeight: "bold",
    color: "white",
};

const numStyle = {
    top: { ...baseNum, top: 6, left: "50%", transform: "translateX(-50%)" },
    right: { ...baseNum, right: 6, top: "50%", transform: "translateY(-50%)" },
    bottom: { ...baseNum, bottom: 6, left: "50%", transform: "translateX(-50%)" },
    left: { ...baseNum, left: 6, top: "50%", transform: "translateY(-50%)" },
};
