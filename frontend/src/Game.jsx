import React, { useState, useEffect } from "react";

/* ---------------- CONFIG ---------------- */

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

/* ---------------- GAME ---------------- */

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
    const [gameOver, setGameOver] = useState(false);

    /* -------- SAME + PLUS LOGIC -------- */

    const checkSamePlus = (idx, placed, grid) => {
        const x = idx % 3;
        const y = Math.floor(idx / 3);

        let sameHits = [];
        let plusMap = {};

        DIRS.forEach(({ dx, dy, a, b }) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return;

            const ni = ny * 3 + nx;
            const t = grid[ni];
            if (!t || t.owner === placed.owner) return;

            if (placed.values[a] === t.values[b]) sameHits.push(ni);

            const sum = placed.values[a] + t.values[b];
            plusMap[sum] = plusMap[sum] ? [...plusMap[sum], ni] : [ni];
        });

        if (sameHits.length >= 2) {
            sameHits.forEach(i => {
                grid[i] = { ...grid[i], owner: placed.owner };
            });
        }

        Object.values(plusMap).forEach(list => {
            if (list.length >= 2) {
                list.forEach(i => {
                    grid[i] = { ...grid[i], owner: placed.owner };
                });
            }
        });
    };

    /* -------- NORMAL FLIP -------- */

    const tryFlip = (idx, placed, grid) => {
        const x = idx % 3;
        const y = Math.floor(idx / 3);

        DIRS.forEach(({ dx, dy, a, b }) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return;

            const ni = ny * 3 + nx;
            const t = grid[ni];
            if (!t || t.owner === placed.owner) return;

            if (placed.values[a] > t.values[b]) {
                grid[ni] = { ...t, owner: placed.owner };
            }
        });
    };

    /* -------- PLAYER MOVE -------- */

    const placeCard = (i) => {
        if (turn !== "player" || !selected || board[i]) return;

        const next = [...board];
        const placed = { ...selected };

        next[i] = placed;
        checkSamePlus(i, placed, next);
        tryFlip(i, placed, next);

        setBoard(next);
        setPlayerHand(h => h.filter(c => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };

    /* -------- AI MOVE -------- */

    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;

        const empty = board.map((c, i) => c ? null : i).filter(i => i !== null);
        if (!empty.length || !enemyHand.length) return;

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemyHand[Math.floor(Math.random() * enemyHand.length)];

        const next = [...board];
        next[cell] = card;

        checkSamePlus(cell, card, next);
        tryFlip(cell, card, next);

        setTimeout(() => {
            setBoard(next);
            setEnemyHand(h => h.filter(c => c.id !== card.id));
            setTurn("player");
        }, 500);
    }, [turn]);

    /* -------- GAME OVER -------- */

    useEffect(() => {
        if (board.some(c => c === null)) return;
        setGameOver(true);
    }, [board]);

    /* -------- SCORE -------- */

    const score = board.reduce(
        (a, c) => {
            if (!c) return a;
            c.owner === "player" ? a.blue++ : a.red++;
            return a;
        },
        { red: 0, blue: 0 }
    );

    /* ---------------- RENDER ---------------- */

    return (
        <div className="game-root">
            {gameOver && (
                <div className="game-over">
                    <h2>
                        {score.blue > score.red ? "🏆 Победа" :
                            score.red > score.blue ? "💀 Поражение" : "🤝 Ничья"}
                    </h2>
                    <button onClick={() => window.location.reload()}>🔄 Заново</button>
                </div>
            )}

            <div className="hand top">
                {enemyHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -40 : 0 }}>
                        <Card card={c} disabled />
                    </div>
                ))}
            </div>

            <div className="scorebar">🟥 {score.red} : {score.blue} 🟦</div>

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

/* ---------------- CARD ---------------- */

function Card({ card, onClick, selected, disabled }) {
    return (
        <div
            className={`card ${card.owner} ${selected ? "selected" : ""}`}
            onClick={disabled ? undefined : onClick}
        >
            <div className="tt-diamond">
                <span className="n top">{card.values.top}</span>
                <span className="n left">{card.values.left}</span>
                <span className="n right">{card.values.right}</span>
                <span className="n bottom">{card.values.bottom}</span>
            </div>
        </div>
    );
}
