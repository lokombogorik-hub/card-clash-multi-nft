import React, { useState } from "react";

const CARD_W = 100;
const CARD_H = 140;

const genCard = (owner, id) => ({
    id,
    owner,
    values: {
        top: Math.ceil(Math.random() * 9),
        right: Math.ceil(Math.random() * 9),
        bottom: Math.ceil(Math.random() * 9),
        left: Math.ceil(Math.random() * 9),
    },
});

export default function Game() {
    const [playerHand, setPlayerHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("player", `p${i}`))
    );
    const [enemyHand, setEnemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`))
    );

    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);
    const [turn, setTurn] = useState("player");

    /* ---------------- PLACE CARD ---------------- */

    const placeCard = (index) => {
        if (!selected || board[index]) return;

        const nextBoard = [...board];
        nextBoard[index] = selected;

        setBoard(nextBoard);

        if (selected.owner === "player") {
            setPlayerHand(h => h.filter(c => c.id !== selected.id));
        } else {
            setEnemyHand(h => h.filter(c => c.id !== selected.id));
        }

        setSelected(null);
        setTurn(t => (t === "player" ? "enemy" : "player"));
    };

    return (
        <div className="game-root">

            {/* ENEMY HAND */}
            <div className="hand top">
                {enemyHand.map((card, i) => (
                    <div key={card.id} style={{ marginLeft: i ? -45 : 0 }}>
                        <Card
                            card={card}
                            selected={selected?.id === card.id}
                            onClick={() =>
                                turn === "enemy" && setSelected(card)
                            }
                        />
                    </div>
                ))}
            </div>

            {/* BOARD */}
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${selected && !cell ? "highlight" : ""
                            }`}
                        onClick={() =>
                            selected && !cell && placeCard(i)
                        }
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            {/* PLAYER HAND */}
            <div className="hand bottom">
                {playerHand.map((card, i) => (
                    <div key={card.id} style={{ marginLeft: i ? -45 : 0 }}>
                        <Card
                            card={card}
                            selected={selected?.id === card.id}
                            onClick={() =>
                                turn === "player" && setSelected(card)
                            }
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------------- CARD ---------------- */

function Card({ card, onClick, selected }) {
    return (
        <div
            className={`card ${card.owner} ${selected ? "selected" : ""}`}
            onClick={onClick}
            style={{ width: CARD_W, height: CARD_H }}
        >
            <span style={num.top}>{card.values.top}</span>
            <span style={num.right}>{card.values.right}</span>
            <span style={num.bottom}>{card.values.bottom}</span>
            <span style={num.left}>{card.values.left}</span>
        </div>
    );
}

/* ---------------- NUMBERS ---------------- */

const base = {
    position: "absolute",
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
};

const num = {
    top: { ...base, top: 6, left: "50%", transform: "translateX(-50%)" },
    right: { ...base, right: 6, top: "50%", transform: "translateY(-50%)" },
    bottom: { ...base, bottom: 6, left: "50%", transform: "translateX(-50%)" },
    left: { ...base, left: 6, top: "50%", transform: "translateY(-50%)" },
};
