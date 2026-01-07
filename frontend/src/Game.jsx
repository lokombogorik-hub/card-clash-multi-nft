import React, { useState } from "react";

/* ---------- CONFIG ---------- */

const CARD_W = 120;
const CARD_H = 165;

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const rand = () => Math.ceil(Math.random() * 9);

const genCard = (owner, id) => ({
    id,
    owner,
    values: {
        top: rand(),
        right: rand(),
        bottom: rand(),
        left: rand(),
    },
});

/* ---------- GAME ---------- */

export default function Game() {
    const [playerHand, setPlayerHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("player", `p${i}`))
    );
    const [enemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`))
    );

    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);
    const [turn, setTurn] = useState("player");

    /* ---------- FLIP ---------- */

    const tryFlip = (idx, placed, grid) => {
        const x = idx % 3;
        const y = Math.floor(idx / 3);

        DIRS.forEach(({ dx, dy, a, b }) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return;

            const ni = ny * 3 + nx;
            const target = grid[ni];
            if (!target || target.owner === placed.owner) return;

            if (placed.values[a] > target.values[b]) {
                grid[ni] = {
                    ...target,
                    owner: placed.owner,
                    flipped: true,
                    flipKey: Math.random(),
                };
            }
        });
    };

    /* ---------- PLACE ---------- */

    const placeCard = (i) => {
        if (!selected || board[i]) return;

        const next = [...board];
        next[i] = selected;

        tryFlip(i, selected, next);

        setBoard(next);
        setPlayerHand((h) => h.filter((c) => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };
    const score = board.reduce(
        (acc, c) => {
            if (!c) return acc;
            acc[c.owner]++;
            return acc;
        },
        { red: 0, blue: 0 }
    );
    const isGameOver = board.every(Boolean);

    let winner = null;
    if (isGameOver) {
        if (score.red > score.blue) winner = "🟥 Победа!";
        else if (score.blue > score.red) winner = "🟦 Победа!";
        else winner = "🤝 Ничья";
    }

    /* ---------- RENDER ---------- */

    return (
        <div className="game-root">

            {/* ENEMY */}
            <div className="hand top">
                {enemyHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card card={c} disabled />
                    </div>
                ))}
            </div>
            <div className="scorebar">
                <span className="red">🟥 {score.red}</span>
                <span className="blue">{score.blue} 🟦</span>
            </div>

            {/* BOARD */}
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${selected && !cell ? "highlight" : ""}`}
                        onClick={() => placeCard(i)}
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            {/* PLAYER */}
            <div className="hand bottom">
                {playerHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card
                            card={c}
                            selected={selected?.id === c.id}
                            onClick={() => turn === "player" && setSelected(c)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ---------- CARD ---------- */

function Card({ card, onClick, selected, disabled }) {
    return (
        <div
            className={`card ${card.owner} 
        ${selected ? "selected" : ""} 
        ${card.flipped ? "flipped" : ""} 
        ${disabled ? "disabled" : ""}`}
            onClick={disabled ? undefined : onClick}
            style={{ width: CARD_W, height: CARD_H }}
        >
            <span style={num.top}>{card.values.top}</span>
            <span style={num.right}>{card.values.right}</span>
            <span style={num.bottom}>{card.values.bottom}</span>
            <span style={num.left}>{card.values.left}</span>
        </div>
    );
}

/* ---------- NUMBERS ---------- */

const base = {
    position: "absolute",
    fontSize: 14,
    fontWeight: "bold",
    color: "#fff",
    textShadow: "0 1px 2px #000",
};

const num = {
    top: { ...base, top: 6, left: "50%", transform: "translateX(-50%)" },
    right: { ...base, right: 6, top: "50%", transform: "translateY(-50%)" },
    bottom: { ...base, bottom: 6, left: "50%", transform: "translateX(-50%)" },
    left: { ...base, left: 6, top: "50%", transform: "translateY(-50%)" },
};
