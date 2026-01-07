import React, { useState } from "react";

/* === БАЗОВЫЕ КАРТЫ === */
const BASE_DECK = [
    { id: 1, t: 5, r: 3, b: 2, l: 4 },
    { id: 2, t: 1, r: 6, b: 5, l: 2 },
    { id: 3, t: 4, r: 4, b: 4, l: 4 },
    { id: 4, t: 6, r: 2, b: 1, l: 5 },
    { id: 5, t: 2, r: 5, b: 6, l: 1 },
];

function clone(card) {
    return JSON.parse(JSON.stringify(card));
}

export default function App() {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [hands, setHands] = useState({
        red: BASE_DECK.map(c => ({ ...clone(c), owner: "red" })),
        blue: BASE_DECK.map(c => ({ ...clone(c), owner: "blue" })),
    });

    const [turn, setTurn] = useState("red");
    const [selected, setSelected] = useState(null);
    const [winner, setWinner] = useState(null);

    const dirs = [
        { dx: 0, dy: -1, a: "t", b: "b" },
        { dx: 1, dy: 0, a: "r", b: "l" },
        { dx: 0, dy: 1, a: "b", b: "t" },
        { dx: -1, dy: 0, a: "l", b: "r" },
    ];

    function place(index) {
        if (!selected || board[index] || winner) return;

        const newBoard = [...board];
        const placed = { ...selected };
        newBoard[index] = placed;

        dirs.forEach(({ dx, dy, a, b }) => {
            const x = index % 3 + dx;
            const y = Math.floor(index / 3) + dy;
            if (x < 0 || x > 2 || y < 0 || y > 2) return;

            const ni = y * 3 + x;
            const n = newBoard[ni];
            if (!n || n.owner === placed.owner) return;

            if (placed[a] > n[b]) {
                n.owner = placed.owner;
                n.flipped = true; // ✨ ТРИГГЕР АНИМАЦИИ
            }
        });

        setBoard(newBoard);
        setHands(h => ({
            ...h,
            [turn]: h[turn].filter(c => c !== selected),
        }));
        setSelected(null);

        if (newBoard.every(Boolean)) {
            const r = newBoard.filter(c => c.owner === "red").length;
            const b = newBoard.filter(c => c.owner === "blue").length;
            setWinner(r === b ? "Ничья" : r > b ? "🔴 RED победил" : "🔵 BLUE победил");
        } else {
            setTurn(turn === "red" ? "blue" : "red");
        }
    }

    const score = board.reduce(
        (a, c) => {
            if (!c) return a;
            a[c.owner]++;
            return a;
        },
        { red: 0, blue: 0 }
    );

    return (
        <div style={styles.root}>
            <h2>Ход: {turn === "red" ? "🔴 RED" : "🔵 BLUE"}</h2>

            <Hand
                cards={hands.red}
                active={turn === "red"}
                selected={selected}
                onSelect={setSelected}
            />

            <div style={styles.board}>
                {board.map((c, i) => (
                    <div
                        key={i}
                        style={{
                            ...styles.cell,
                            outline: selected && !c ? "2px solid gold" : "none",
                        }}
                        onClick={() => place(i)}
                    >
                        {c && <Card card={c} />}
                    </div>
                ))}
            </div>

            <Hand
                cards={hands.blue}
                active={turn === "blue"}
                selected={selected}
                onSelect={setSelected}
            />

            <div style={styles.score}>
                🔴 {score.red} : {score.blue} 🔵
            </div>

            {winner && <h2>{winner}</h2>}
        </div>
    );
}

/* === КОМПОНЕНТЫ === */

function Hand({ cards, active, selected, onSelect }) {
    return (
        <div style={{ ...styles.hand, opacity: active ? 1 : 0.4 }}>
            {cards.map(c => (
                <Card
                    key={c.id}
                    card={c}
                    selected={c === selected}
                    onClick={() => active && onSelect(c)}
                />
            ))}
        </div>
    );
}

function Card({ card, onClick, selected }) {
    return (
        <div
            onClick={onClick}
            style={{
                ...styles.card,
                borderColor: card.owner === "red" ? "crimson" : "dodgerblue",
                transform: card.flipped ? "rotateY(180deg)" : "none",
                outline: selected ? "3px solid gold" : "none",
            }}
        >
            <div style={styles.top}>{card.t}</div>
            <div style={styles.middle}>
                <span>{card.l}</span>
                <span>{card.r}</span>
            </div>
            <div style={styles.bottom}>{card.b}</div>
        </div>
    );
}

/* === СТИЛИ === */

const styles = {
    root: {
        background: "#0b0f1a",
        color: "#fff",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 8,
    },
    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 90px)",
        gap: 6,
        margin: 10,
    },
    cell: {
        width: 90,
        height: 120,
        border: "1px dashed #555",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    card: {
        width: 80,
        height: 110,
        background: "#1e253f",
        border: "2px solid",
        borderRadius: 10,
        padding: 4,
        fontSize: 14,
        transition: "all 0.4s",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
    },
    top: { textAlign: "center" },
    middle: {
        display: "flex",
        justifyContent: "space-between",
    },
    bottom: { textAlign: "center" },
    hand: {
        display: "flex",
        gap: 6,
        margin: 6,
    },
    score: {
        fontSize: 18,
        marginTop: 6,
    },
};
