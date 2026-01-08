import React, { useState, useEffect } from "react";

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
    const [enemyHand, setEnemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`))
    );

    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);
    const [turn, setTurn] = useState("player");

    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);

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
                grid[ni] = { ...target, owner: placed.owner, flipped: true };
            }
        });
    };

    /* ---------- PLAYER MOVE ---------- */

    const placeCard = (i) => {
        if (turn !== "player") return;
        if (!selected || board[i]) return;

        const next = [...board];
        const placed = { ...selected, owner: "player" };

        next[i] = placed;
        tryFlip(i, placed, next);

        setBoard(next);
        setPlayerHand(h => h.filter(c => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };

    /* ---------- AI MOVE ---------- */

    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;

        const empty = board
            .map((c, i) => (c === null ? i : null))
            .filter(i => i !== null);

        if (!empty.length || !enemyHand.length) {
            setTurn("player");
            return;
        }

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemyHand[Math.floor(Math.random() * enemyHand.length)];

        const next = [...board];
        const placed = { ...card, owner: "enemy" };

        next[cell] = placed;
        tryFlip(cell, placed, next);

        setTimeout(() => {
            setBoard(next);
            setEnemyHand(h => h.filter(c => c.id !== card.id));
            setTurn("player");
        }, 500);
    }, [turn]);

    /* ---------- GAME OVER ---------- */

    useEffect(() => {
        if (board.some(c => c === null)) return;

        const p = board.filter(c => c.owner === "player").length;
        const e = board.filter(c => c.owner === "enemy").length;

        setWinner(p > e ? "player" : e > p ? "enemy" : "draw");
        setGameOver(true);
    }, [board]);

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
            {gameOver && (
                <div className="game-over">
                    <h2>
                        {winner === "player" && "🏆 Победа"}
                        {winner === "enemy" && "💀 Поражение"}
                        {winner === "draw" && "🤝 Ничья"}
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
            className={`card ${card.owner} ${selected ? "selected" : ""}`}
            onClick={disabled ? undefined : onClick}
        >
            {/* Треугольный бейдж */}
            <div className="tt-badge" />

            {/* Цифры как в Triple Triad */}
            <span className="tt-num top">{card.values.top}</span>
            <span className="tt-num left">{card.values.left}</span>
            <span className="tt-num right">{card.values.right}</span>
            <span className="tt-num bottom">{card.values.bottom}</span>
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
