import React, { useState } from "react";

/* ---------- CONSTANTS ---------- */
const CARD_W = 120;
const CARD_H = 170;

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

/* ---------- HELPERS ---------- */
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
    const [turn, setTurn] = useState("player");
    const [selected, setSelected] = useState(null);
    const [board, setBoard] = useState(Array(9).fill(null));

    const [playerHand, setPlayerHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("player", `p${i}`))
    );

    const [enemyHand, setEnemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`))
    );

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
                grid[ni] = { ...target, owner: placed.owner };
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
            <div className="hand enemy">
                {enemyHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -60 : 0 }}>
                        <Card
                            card={c}
                            selected={selected?.id === c.id}
                            onClick={() => turn === "enemy" && setSelected(c)}
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
                        onClick={() => placeCard(i)}
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            {/* PLAYER HAND */}
            <div className="hand player">
                {playerHand.map((c, i) => (
                    <div key={c.id} style={{ marginLeft: i ? -60 : 0 }}>
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
function Card({ card, onClick, selected }) {
    return (
        <div
            className={`card ${card.owner} ${selected ? "selected" : ""}`}
            onClick={onClick}
            style={{ width: CARD_W, height: CARD_H }}
        >
            <span className="num top">{card.values.top}</span>
            <span className="num right">{card.values.right}</span>
            <span className="num bottom">{card.values.bottom}</span>
            <span className="num left">{card.values.left}</span>
        </div>
    );
}
