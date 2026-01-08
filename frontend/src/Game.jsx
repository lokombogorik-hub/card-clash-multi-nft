import React, { useState, useEffect } from "react";

/* ---------- CONFIG ---------- */

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
    flipped: false,
});

/* ---------- GAME ---------- */

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

    /* ---------- FLIP LOGIC ---------- */

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
                    flipped: true, // ✅ флип ТОЛЬКО при захвате
                };
            }
        });
    };

    /* ---------- PLAYER MOVE ---------- */

    const placeCard = (i) => {
        if (turn !== "player") return;
        if (!selected || board[i]) return;

        const next = [...board];
        const placed = { ...selected, flipped: false };

        next[i] = placed;
        tryFlip(i, placed, next);

        setBoard(next);
        setPlayerHand((h) => h.filter((c) => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };

    /* ---------- AI MOVE ---------- */

    useEffect(() => {
        if (turn !== "enemy") return;

        const empty = board
            .map((c, i) => (c === null ? i : null))
            .filter((i) => i !== null);

        if (!empty.length || !enemyHand.length) {
            setTurn("player");
            return;
        }

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemyHand[Math.floor(Math.random() * enemyHand.length)];

        const next = [...board];
        const placed = { ...card, flipped: false };

        next[cell] = placed;
        tryFlip(cell, placed, next);

        setTimeout(() => {
            setBoard(next);
            setEnemyHand((h) => h.filter((c) => c.id !== card.id));
            setTurn("player");
        }, 600);
    }, [turn]);

    /* ---------- SCORE ---------- */

    const score = board.reduce(
        (a, c) => {
            if (!c) return a;
            c.owner === "player" ? a.blue++ : a.red++;
            return a;
        },
        { red: 0, blue: 0 }
    );

    /* ---------- RENDER ---------- */

    return (
        <div className="game-root">
            <div className="hand top">
                {enemyHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card card={c} disabled />
                    </div>
                ))}
            </div>

            <div className="scorebar">
                🟥 {score.red} : {score.blue} 🟦
            </div>

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

            <div className="hand bottom">
                {playerHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card
                            card={c}
                            selected={selected?.id === c.id}
                            onClick={() => setSelected(c)}
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
            className={`card ${card.owner} ${card.flipped ? "flip" : ""
                } ${selected ? "selected" : ""}`}
            onClick={disabled ? undefined : onClick}
        >
            <div className="tt-badge" />

            <span className="tt-num top">{card.values.top}</span>
            <span className="tt-num left">{card.values.left}</span>
            <span className="tt-num right">{card.values.right}</span>
            <span className="tt-num bottom">{card.values.bottom}</span>
        </div>
    );
}
