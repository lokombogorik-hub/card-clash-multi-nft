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
    flipping: false,
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

    /* -------- CHAIN FLIP ENGINE -------- */

    const resolveFlips = (startIdx, grid) => {
        const queue = [startIdx];

        while (queue.length) {
            const idx = queue.shift();
            const card = grid[idx];
            if (!card) continue;

            const x = idx % 3;
            const y = Math.floor(idx / 3);

            DIRS.forEach(({ dx, dy, a, b }) => {
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return;

                const ni = ny * 3 + nx;
                const target = grid[ni];
                if (!target || target.owner === card.owner) return;

                if (card.values[a] > target.values[b]) {
                    grid[ni] = {
                        ...target,
                        owner: card.owner,
                        flipping: true,
                    };
                    queue.push(ni);
                }
            });
        }
    };

    /* -------- SAME + PLUS -------- */

    const applySamePlus = (idx, placed, grid) => {
        const x = idx % 3;
        const y = Math.floor(idx / 3);

        let same = [];
        let plus = {};

        DIRS.forEach(({ dx, dy, a, b }) => {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx > 2 || ny < 0 || ny > 2) return;

            const ni = ny * 3 + nx;
            const t = grid[ni];
            if (!t || t.owner === placed.owner) return;

            if (placed.values[a] === t.values[b]) same.push(ni);

            const sum = placed.values[a] + t.values[b];
            plus[sum] = plus[sum] ? [...plus[sum], ni] : [ni];
        });

        const hits = new Set();

        if (same.length >= 2) same.forEach(i => hits.add(i));
        Object.values(plus).forEach(arr => {
            if (arr.length >= 2) arr.forEach(i => hits.add(i));
        });

        hits.forEach(i => {
            grid[i] = {
                ...grid[i],
                owner: placed.owner,
                flipping: true,
            };
        });

        hits.forEach(i => resolveFlips(i, grid));
    };

    /* -------- PLAYER MOVE -------- */

    const placeCard = (i) => {
        if (turn !== "player" || !selected || board[i]) return;

        const next = [...board];
        const placed = { ...selected };

        next[i] = placed;

        applySamePlus(i, placed, next);
        resolveFlips(i, next);

        setBoard(next);
        setPlayerHand(h => h.filter(c => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };

    /* -------- AI MOVE -------- */

    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;

        const empty = board.map((c, i) => (c ? null : i)).filter(i => i !== null);
        if (!empty.length || !enemyHand.length) return;

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemyHand[Math.floor(Math.random() * enemyHand.length)];

        const next = [...board];
        next[cell] = card;

        applySamePlus(cell, card, next);
        resolveFlips(cell, next);

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
            className={`card ${card.owner} ${selected ? "selected" : ""} ${card.flipping ? "flip" : ""
                }`}
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
