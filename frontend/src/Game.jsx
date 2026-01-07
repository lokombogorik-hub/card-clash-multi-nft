import React, { useState } from "react";

const CARD_SIZE = 90;

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

    const [board, setBoard] = useState(() => {
        const b = Array(9).fill(null);
        b[1] = genCard("enemy", "e1");
        b[7] = genCard("enemy", "e2");
        return b;
    });

    const [selected, setSelected] = useState(null);

    const canPlace = (i) => board[i] === null && selected;

    const place = (i) => {
        if (!canPlace(i)) return;
        const nb = [...board];
        nb[i] = selected;
        setBoard(nb);
        setPlayerHand(playerHand.filter((c) => c.id !== selected.id));
        setSelected(null);
    };

    return (
        <div className="screen">
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${canPlace(i) ? "cell-active" : ""}`}
                        onClick={() => place(i)}
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            <div className="hand bottom">
                {playerHand.map((card, i) => (
                    <div
                        key={card.id}
                        style={{ marginLeft: i === 0 ? 0 : -30 }}
                    >
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
                width: CARD_SIZE,
                height: CARD_SIZE,
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
    top: { ...base, top: 4, left: "50%", transform: "translateX(-50%)" },
    right: { ...base, right: 4, top: "50%", transform: "translateY(-50%)" },
    bottom: { ...base, bottom: 4, left: "50%", transform: "translateX(-50%)" },
    left: { ...base, left: 4, top: "50%", transform: "translateY(-50%)" },
};
