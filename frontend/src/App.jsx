/* global Telegram */
import React, { useState, useEffect } from "react";

/* ===== КАРТЫ ===== */
const BASE_DECK = [
    { id: 1, t: 5, r: 3, b: 4, l: 2 },
    { id: 2, t: 2, r: 5, b: 3, l: 4 },
    { id: 3, t: 4, r: 4, b: 2, l: 3 },
    { id: 4, t: 6, r: 2, b: 3, l: 1 },
    { id: 5, t: 3, r: 4, b: 5, l: 2 },
    { id: 6, t: 2, r: 3, b: 6, l: 4 },
    { id: 7, t: 4, r: 2, b: 4, l: 5 },
    { id: 8, t: 5, r: 5, b: 1, l: 3 },
    { id: 9, t: 4, r: 3, b: 5, l: 4 },
    { id: 10, t: 3, r: 2, b: 4, l: 6 },
];

function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

function dealHands() {
    const deck = shuffle(BASE_DECK);
    return {
        red: deck.slice(0, 5).map((c) => ({ ...c, owner: "red" })),
        blue: deck.slice(5, 10).map((c) => ({ ...c, owner: "blue" })),
    };
}

export default function App() {
    useEffect(() => {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.ready();
            window.Telegram.WebApp.expand();
        }
    }, []);

    const [hands, setHands] = useState(dealHands());
    const [board, setBoard] = useState(Array(9).fill(null));
    const [current, setCurrent] = useState("red");
    const [selected, setSelected] = useState(null);

    function place(index) {
        if (board[index] || !selected) return;

        const newBoard = [...board];
        newBoard[index] = selected;

        setBoard(newBoard);
        setHands({
            ...hands,
            [current]: hands[current].filter((c) => c.id !== selected.id),
        });
        setSelected(null);
        setCurrent(current === "red" ? "blue" : "red");
    }

    return (
        <div style={styles.screen}>
            <div style={styles.game}>
                <Hand
                    cards={hands.red}
                    active={current === "red"}
                    selected={selected}
                    onSelect={setSelected}
                />

                <div style={styles.board}>
                    {board.map((card, i) => (
                        <div
                            key={i}
                            onClick={() => place(i)}
                            style={{
                                ...styles.cell,
                                background: card
                                    ? card.owner === "red"
                                        ? "#7f1d1d"
                                        : "#1e3a8a"
                                    : "#1e293b",
                            }}
                        >
                            {card && <Numbers card={card} />}
                        </div>
                    ))}
                </div>

                <Hand
                    cards={hands.blue}
                    active={current === "blue"}
                    selected={selected}
                    onSelect={setSelected}
                />
            </div>
        </div>
    );
}

/* ===== КОМПОНЕНТЫ ===== */

function Numbers({ card }) {
    return (
        <div style={styles.numbers}>
            {card.t} {card.r}
            <br />
            {card.l} {card.b}
        </div>
    );
}

function Hand({ cards, active, onSelect, selected }) {
    return (
        <div style={styles.hand}>
            {cards.map((c) => (
                <div
                    key={c.id}
                    onClick={() => active && onSelect(c)}
                    style={{
                        ...styles.handCard,
                        border: selected?.id === c.id ? "2px solid gold" : "none",
                        opacity: active ? 1 : 0.4,
                    }}
                >
                    <Numbers card={c} />
                </div>
            ))}
        </div>
    );
}

/* ===== СТИЛИ ===== */

const styles = {
    screen: {
        width: "100vw",
        height: "100vh",
        background: "#0f172a",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        color: "white",
        overflow: "hidden",
    },
    game: {
        display: "flex",
        gap: 8,
        alignItems: "center",
    },
    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 90px)",
        gridTemplateRows: "repeat(3, 120px)",
        gap: 6,
    },
    cell: {
        width: 90,
        height: 120,
        borderRadius: 10,
        cursor: "pointer",
        boxSizing: "border-box",
    },
    hand: {
        width: 80,
    },
    handCard: {
        width: 70,
        height: 100,
        background: "#334155",
        marginBottom: 6,
        borderRadius: 8,
        cursor: "pointer",
        boxSizing: "border-box",
    },
    numbers: {
        padding: 6,
        fontSize: 12,
        lineHeight: "1.1",
        pointerEvents: "none",
    },
};
