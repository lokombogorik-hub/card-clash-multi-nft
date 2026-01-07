import React, { useState } from "react";

/* === КАРТЫ === */
const BASE_DECK = [
    { id: 1, t: 5, r: 3, b: 2, l: 4 },
    { id: 2, t: 1, r: 6, b: 5, l: 2 },
    { id: 3, t: 4, r: 4, b: 4, l: 4 },
    { id: 4, t: 6, r: 2, b: 1, l: 5 },
    { id: 5, t: 2, r: 5, b: 6, l: 1 },
];

export default function Game() {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [turn, setTurn] = useState("red");
    const [selected, setSelected] = useState(null);
    const [winner, setWinner] = useState("");

    const [hands, setHands] = useState({
        red: BASE_DECK.map(c => ({ ...c, owner: "red" })),
        blue: BASE_DECK.map(c => ({ ...c, owner: "blue" })),
    });

    const dirs = [
        { dx: 0, dy: -1, a: "t", b: "b" },
        { dx: 1, dy: 0, a: "r", b: "l" },
        { dx: 0, dy: 1, a: "b", b: "t" },
        { dx: -1, dy: 0, a: "l", b: "r" },
    ];

    function place(i) {
        if (!selected || board[i] || winner) return;

        const newBoard = [...board];
        const placed = { ...selected };
        newBoard[i] = placed;

        dirs.forEach(({ dx, dy, a, b }) => {
            const x = (i % 3) + dx;
            const y = Math.floor(i / 3) + dy;
            if (x < 0 || x > 2 || y < 0 || y > 2) return;

            const ni = y * 3 + x;
            const n = newBoard[ni];
            if (!n || n.owner === placed.owner) return;

            if (placed[a] > n[b]) {
                n.owner = placed.owner;
                n.flipped = true;
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
            setWinner(
                r === b ? "🤝 Ничья" : r > b ? "🔴 RED победил" : "🔵 BLUE победил"
            );
        } else {
            setTurn(turn === "red" ? "blue" : "red");
        }
    }

    const score = board.reduce(
        (a, c) => {
            if (c) a[c.owner]++;
            return a;
        },
        { red: 0, blue: 0 }
    );

    return (
        <div style={styles.root}>
            <h3>Ход: {turn === "red" ? "🔴 RED" : "🔵 BLUE"}</h3>

            <Hand cards={hands.red} active={turn === "red"} select={setSelected} />

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

            <Hand cards={hands.blue} active={turn === "blue"} select={setSelected} />

            <div style={styles.score}>🔴 {score.red} : {score.blue} 🔵</div>

            {winner && <h2>{winner}</h2>}
        </div>
    );
}

/* === COMPONENTS === */

function Hand({ cards, active, select }) {
    return (
        <div style={{ ...styles.hand, opacity: active ? 1 : 0.4 }}>
            {cards.map(c => (
                <Card key={c.id} card={c} onClick={() => active && select(c)} />
            ))}
        </div>
    );
}

function Card({ card, onClick }) {
    return (
        <div
            onClick={onClick}
            style={{
                ...styles.card,
                borderColor: card.owner === "red" ? "crimson" : "dodgerblue",
                transform: card.flipped ? "rotateY(180deg)" : "none",
            }}
        >
            <div>{card.t}</div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{card.l}</span>
                <span>{card.r}</span>
            </div>
            <div>{card.b}</div>
        </div>
    );
}

/* === STYLES === */

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
        transition: "0.4s",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
    },
    hand: { display: "flex", gap: 6, margin: 6 },
    score: { fontSize: 18, marginTop: 6 },
};
