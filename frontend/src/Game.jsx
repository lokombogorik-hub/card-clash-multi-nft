import React, { useState } from "react";

const CARD_W = 90;
const CARD_H = 130;

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

    const [enemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`))
    );

    const [board] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);

    return (
        <div className="game-root">
            {/* ENEMY HAND */}
            <div className="hand top">
                {enemyHand.map((card, i) => (
                    <div key={card.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card card={card} />
                    </div>
                ))}
            </div>

            {/* BOARD */}
            <div className="board">
                {board.map((_, i) => (
                    <div key={i} className="cell" />
                ))}
            </div>

            {/* PLAYER HAND */}
            <div className="hand bottom">
                {playerHand.map((card, i) => (
                    <div key={card.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card
                            card={card}
                            selected={selected?.id === card.id}
                            onClick={() => setSelected(card)}
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
            style={{
                width: CARD_W,
                height: CARD_H,
            }}
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
