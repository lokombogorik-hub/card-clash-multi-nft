import React, { useState } from "react";

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

/* ===== НАПРАВЛЕНИЯ ===== */
const DIRS = [
    [-1, 0, "t", "b"],
    [1, 0, "b", "t"],
    [0, -1, "l", "r"],
    [0, 1, "r", "l"],
];

export default function App() {
    const [hands, setHands] = useState(dealHands());
    const [board, setBoard] = useState(Array(9).fill(null));
    const [current, setCurrent] = useState("red");
    const [selected, setSelected] = useState(null);
    const [gameOver, setGameOver] = useState(false);
    const [flipped, setFlipped] = useState([]);

    /* ===== ДОБАВЬ ЭТО ПЕРЕД chainCapture ===== */

    function checkSamePlus(board, index) {
        const base = board[index];
        const r = Math.floor(index / 3);
        const c = index % 3;

        let sameHits = [];
        let plusMap = {};

        DIRS.forEach(([dr, dc, a, b]) => {
            const nr = r + dr;
            const nc = c + dc;
            if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;

            const i = nr * 3 + nc;
            const other = board[i];
            if (!other || other.owner === base.owner) return;

            // SAME
            if (base[a] === other[b]) {
                sameHits.push(i);
            }

            // PLUS
            const sum = base[a] + other[b];
            if (!plusMap[sum]) plusMap[sum] = [];
            plusMap[sum].push(i);
        });

        let captured = [];

        // SAME работает если 2+
        if (sameHits.length >= 2) {
            captured.push(...sameHits);
        }

        // PLUS работает если 2+
        Object.values(plusMap).forEach((group) => {
            if (group.length >= 2) {
                captured.push(...group);
            }
        });

        // Убираем дубликаты
        return [...new Set(captured)];
    }

    /* ===== ЦЕПОЧКА ЗАХВАТОВ ===== */
    function chainCapture(startBoard, startIndex) {
        let boardCopy = [...startBoard];
        let queue = [startIndex];
        let flippedOrder = [];

        while (queue.length > 0) {
            const index = queue.shift();
            const r = Math.floor(index / 3);
            const c = index % 3;

            DIRS.forEach(([dr, dc, a, b]) => {
                const nr = r + dr;
                const nc = c + dc;
                if (nr < 0 || nr > 2 || nc < 0 || nc > 2) return;

                const i = nr * 3 + nc;
                const from = boardCopy[index];
                const to = boardCopy[i];

                if (!to || to.owner === from.owner) return;

                if (from[a] > to[b]) {
                    boardCopy[i] = { ...to, owner: from.owner };
                    queue.push(i);
                    flippedOrder.push(i);
                }
            });
        }

        return { board: boardCopy, flippedOrder };
    }

    function place(index) {
        if (board[index] || !selected || gameOver) return;
        if (selected.owner !== current) return;

        let newBoard = [...board];
        newBoard[index] = selected;

        // SAME / PLUS
        const forced = checkSamePlus(newBoard, index);
        forced.forEach((i) => {
            newBoard[i] = { ...newBoard[i], owner: current };
        });

        // CHAIN
        const { board: finalBoard, flippedOrder } = chainCapture(
            newBoard,
            index
        );


        // 🎬 анимация по очереди
        flippedOrder.forEach((i, step) => {
            setTimeout(() => {
                setFlipped((prev) => [...prev, i]);
            }, step * 250);
        });

        setTimeout(() => setFlipped([]), flippedOrder.length * 250 + 300);

        setBoard(finalBoard);
        setHands({
            ...hands,
            [current]: hands[current].filter((c) => c.id !== selected.id),
        });

        setSelected(null);
        setCurrent(current === "red" ? "blue" : "red");

        if (finalBoard.every(Boolean)) setGameOver(true);
    }

    const redScore = board.filter((c) => c?.owner === "red").length;
    const blueScore = board.filter((c) => c?.owner === "blue").length;

    let winner = "";
    if (gameOver) {
        if (redScore > blueScore) winner = "🟥 Победил!";
        else if (blueScore > redScore) winner = "🟦 Победил!";
        else winner = "🤝 Ничья";
    }

    function resetGame() {
        setHands(dealHands());
        setBoard(Array(9).fill(null));
        setCurrent("red");
        setSelected(null);
        setGameOver(false);
    }

    return (
        <div style={styles.app}>
            <h2>Card Clash</h2>
            <p>Ход: {current === "red" ? "🟥" : "🟦"}</p>

            <div style={styles.game}>
                <Hand
                    cards={hands.red}
                    active={current === "red"}
                    selected={selected}
                    onSelect={setSelected}
                    color="#7f1d1d"
                    score={redScore}
                />

                <div style={styles.board}>
                    {board.map((card, i) => {
                        const canPlace = selected && !card;
                        return (
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
                                    outline: canPlace ? "2px solid #facc15" : "none",
                                    transform: flipped.includes(i)
                                        ? "rotateY(180deg)"
                                        : "rotateY(0deg)",
                                }}
                            >
                                {card && <Numbers card={card} />}
                            </div>
                        );
                    })}
                </div>

                <Hand
                    cards={hands.blue}
                    active={current === "blue"}
                    selected={selected}
                    onSelect={setSelected}
                    color="#1e3a8a"
                    score={blueScore}
                />
            </div>

            {gameOver && (
                <>
                    <h2>{winner}</h2>
                    <button onClick={resetGame} style={styles.button}>
                        🔁 Новая игра
                    </button>
                </>
            )}
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

function Hand({ cards, active, onSelect, color, score, selected }) {
    return (
        <div style={{ width: 90, textAlign: "center" }}>
            <div style={{ position: "relative", height: 300 }}>
                {cards.map((c, i) => {
                    const isSelected = selected?.id === c.id;
                    return (
                        <div
                            key={c.id}
                            onClick={() => active && onSelect(c)}
                            style={{
                                ...styles.handCard,
                                top: i * 30 - (isSelected ? 10 : 0),
                                background: color,
                                border: isSelected ? "3px solid gold" : "none",
                                boxShadow: isSelected ? "0 0 10px gold" : "none",
                                opacity: active ? 1 : 0.4,
                            }}
                        >
                            <Numbers card={c} />
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: 10 }}>Счёт: {score}</div>
        </div>
    );
}

/* ===== СТИЛИ ===== */
const styles = {
    app: {
        minHeight: "100vh",
        background: "#0f172a",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 10,
    },
    game: {
        display: "flex",
        gap: 12,
        alignItems: "center",
    },
    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 90px)",
        gridTemplateRows: "repeat(3, 120px)",
        gap: 8,
        perspective: 800,
    },
    cell: {
        borderRadius: 12,
        position: "relative",
        cursor: "pointer",
        transition: "all 0.3s ease",
        transformStyle: "preserve-3d",
    },
    numbers: {
        position: "absolute",
        top: 6,
        left: 6,
        fontSize: 12,
        fontWeight: "bold",
        lineHeight: "14px",
        transform: "rotateY(0deg)",
    },
    handCard: {
        position: "absolute",
        width: 70,
        height: 100,
        borderRadius: 10,
        cursor: "pointer",
        transition: "all 0.2s ease",
    },
    button: {
        marginTop: 10,
        padding: "6px 12px",
        borderRadius: 6,
        border: "none",
        cursor: "pointer",
    },
};
