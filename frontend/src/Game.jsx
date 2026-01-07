import React, { useState, useEffect } from "react";

const CARD_SIZE = 90;

export default function Game({ onExit }) {
    const [board, setBoard] = useState(Array(9).fill(null));
    const [currentPlayer, setCurrentPlayer] = useState("🟥");

    useEffect(() => {
        if (window.Telegram?.WebApp) {
            window.Telegram.WebApp.expand();
        }
    }, []);

    function placeCard(index) {
        if (board[index]) return;

        const newBoard = [...board];
        newBoard[index] = {
            owner: currentPlayer,
            values: {
                top: rand(),
                right: rand(),
                bottom: rand(),
                left: rand(),
            },
        };

        setBoard(newBoard);
        setCurrentPlayer(currentPlayer === "🟥" ? "🟦" : "🟥");
    }

    const scoreRed = board.filter(c => c?.owner === "🟥").length;
    const scoreBlue = board.filter(c => c?.owner === "🟦").length;

    return (
        <div style={styles.wrapper}>
            <div style={styles.top}>
                🟥 {scoreRed} : {scoreBlue} 🟦
            </div>

            <div style={styles.grid}>
                {board.map((card, i) => (
                    <div
                        key={i}
                        style={styles.cell}
                        onClick={() => placeCard(i)}
                    >
                        {card && (
                            <div
                                style={{
                                    ...styles.card,
                                    background:
                                        card.owner === "🟥"
                                            ? "linear-gradient(135deg,#b71c1c,#ff5252)"
                                            : "linear-gradient(135deg,#0d47a1,#42a5f5)",
                                }}
                            >
                                <span style={styles.topNum}>{card.values.top}</span>
                                <span style={styles.rightNum}>{card.values.right}</span>
                                <span style={styles.bottomNum}>{card.values.bottom}</span>
                                <span style={styles.leftNum}>{card.values.left}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <button style={styles.exit} onClick={onExit}>
                ⬅ В меню
            </button>
        </div>
    );
}

function rand() {
    return Math.floor(Math.random() * 9) + 1;
}

const styles = {
    wrapper: {
        minHeight: "100vh",
        background: "#121212",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px",
        color: "white",
    },
    top: {
        fontSize: "20px",
        marginBottom: "8px",
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "6px",
    },
    cell: {
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: "#222",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },
    card: {
        width: "100%",
        height: "100%",
        borderRadius: "10px",
        position: "relative",
        color: "white",
        fontWeight: "bold",
    },
    topNum: {
        position: "absolute",
        top: 4,
        left: "50%",
        transform: "translateX(-50%)",
    },
    rightNum: {
        position: "absolute",
        right: 4,
        top: "50%",
        transform: "translateY(-50%)",
    },
    bottomNum: {
        position: "absolute",
        bottom: 4,
        left: "50%",
        transform: "translateX(-50%)",
    },
    leftNum: {
        position: "absolute",
        left: 4,
        top: "50%",
        transform: "translateY(-50%)",
    },
    exit: {
        padding: "10px 20px",
        borderRadius: "10px",
        border: "none",
        background: "#333",
        color: "white",
    },
};
