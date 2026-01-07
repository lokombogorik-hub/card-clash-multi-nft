import React, { useState } from "react";

const CARD_W = 110;
const CARD_H = 150;

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

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

function rand() {
    return Math.ceil(Math.random() * 9);
}

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

    /* ---------------- FLIP LOGIC ---------------- */

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
                grid[ni] = { ...target, owner: placed.owner, flipped: true };
            }
        });
    };

    /* ---------------- PLACE CARD ---------------- */

    const placeCard = (i) => {
        if (!selected || board[i]) return;

        const next = [...board];
        next[i] = selected;

        tryFlip(i, selected, next);

        setBoard(next);

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

            {/* ENEMY */}
            <div className="hand top">
                {enemyHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -50 : 0 }}>
                        <Card
                            card={c}
                            onClick={() => turn === "enemy" && setSelected(c)}
                            selected={selected?.id === c.id}
                        />
                    </div>
                ))}
            </div>

            {/* BOARD */}
            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${selected && !cell ? "highlight" : ""}`}
                        onClick={() => selected && !cell && placeCard(i)}
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            {/* PLAYER */}
            <div className="hand bottom">
                {playerHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -50 : 0 }}>
                        <Card
                            card={c}
                            onClick={() => turn === "player" && setSelected(c)}
                            selected={selected?.id === c.id}
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
            className={`card ${card.owner} ${selected ? "selected" : ""} ${card.flipped ? "flipped" : ""}`}
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
