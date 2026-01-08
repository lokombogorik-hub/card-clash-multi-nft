import React, { useState, useEffect } from "react";

/* ---------- CONFIG ---------- */

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const rand = () => Math.ceil(Math.random() * 9);

/* ---------- HELPERS ---------- */

const toMatrix = (board) => [
    board.slice(0, 3),
    board.slice(3, 6),
    board.slice(6, 9),
];

const fromMatrix = (m) => m.flat();

function checkSame(card, x, y, m) {
    const hits = [];
    DIRS.forEach(({ dx, dy, a, b }) => {
        const n = m[y + dy]?.[x + dx];
        if (n && card.values[a] === n.values[b]) hits.push(n);
    });
    if (hits.length >= 2) hits.forEach(c => c.owner = card.owner);
    return hits;
}

function checkPlus(card, x, y, m) {
    const sums = {};
    DIRS.forEach(({ dx, dy, a, b }) => {
        const n = m[y + dy]?.[x + dx];
        if (!n) return;
        const s = card.values[a] + n.values[b];
        sums[s] ??= [];
        sums[s].push(n);
    });
    const hits = Object.values(sums).filter(g => g.length >= 2).flat();
    hits.forEach(c => c.owner = card.owner);
    return hits;
}

function chainReaction(start, m) {
    const q = [...start];
    while (q.length) {
        const c = q.shift();
        const { x, y } = c.position;
        DIRS.forEach(({ dx, dy, a, b }) => {
            const n = m[y + dy]?.[x + dx];
            if (!n || n.owner === c.owner) return;
            if (c.values[a] > n.values[b]) {
                n.owner = c.owner;
                q.push(n);
            }
        });
    }
}

/* ---------- GAME ---------- */

export default function Game() {
    const [playerHand, setPlayerHand] = useState(
        Array.from({ length: 5 }, (_, i) => ({
            id: `p${i}`,
            owner: "player",
            values: { top: rand(), right: rand(), bottom: rand(), left: rand() }
        }))
    );

    const [enemyHand, setEnemyHand] = useState(
        Array.from({ length: 5 }, (_, i) => ({
            id: `e${i}`,
            owner: "enemy",
            values: { top: rand(), right: rand(), bottom: rand(), left: rand() }
        }))
    );

    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);
    const [turn, setTurn] = useState("player");

    /* ---------- PLAYER MOVE ---------- */

    const placeCard = (i) => {
        if (turn !== "player" || !selected || board[i]) return;

        const next = [...board];
        const placed = {
            ...selected,
            owner: "player",
            position: { x: i % 3, y: Math.floor(i / 3) }
        };
        next[i] = placed;

        let m = toMatrix(next);

        const same = checkSame(placed, placed.position.x, placed.position.y, m);
        const plus = checkPlus(placed, placed.position.x, placed.position.y, m);

        const hits = [...new Set([...same, ...plus])];
        if (hits.length) chainReaction(hits, m);

        setBoard(fromMatrix(m));
        setPlayerHand(h => h.filter(c => c.id !== selected.id));
        setSelected(null);
        setTurn("enemy");
    };

    /* ---------- AI MOVE ---------- */

    useEffect(() => {
        if (turn !== "enemy") return;

        const empty = board.map((c, i) => c ? null : i).filter(i => i !== null);
        if (!empty.length) return;

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemyHand[0];

        const next = [...board];
        next[cell] = {
            ...card,
            owner: "enemy",
            position: { x: cell % 3, y: Math.floor(cell / 3) }
        };

        setTimeout(() => {
            setBoard(next);
            setEnemyHand(h => h.slice(1));
            setTurn("player");
        }, 500);
    }, [turn]);

    /* ---------- RENDER ---------- */

    return (
        <div className="game-root">
            <div className="hand top">
                {enemyHand.map(c => <Card key={c.id} card={c} disabled />)}
            </div>

            <div className="board">
                {board.map((cell, i) => (
                    <div key={i} className="cell" onClick={() => placeCard(i)}>
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            <div className="hand bottom">
                {playerHand.map(c => (
                    <Card
                        key={c.id}
                        card={c}
                        selected={selected?.id === c.id}
                        onClick={() => setSelected(c)}
                    />
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
            <span className="tt-num top">{card.values.top}</span>
            <span className="tt-num right">{card.values.right}</span>
            <span className="tt-num bottom">{card.values.bottom}</span>
            <span className="tt-num left">{card.values.left}</span>
        </div>
    );
}
