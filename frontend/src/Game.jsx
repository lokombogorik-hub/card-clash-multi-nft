import React, { useState } from "react";

const CARD_SIZE = 90;

const styles = {
    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 8,
        padding: 10,
        background: "#1e1e1e",
        borderRadius: 12,
    },

    cell: {
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: "#2b2b2b",
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },

    card: (owner) => ({
        width: CARD_SIZE,
        height: CARD_SIZE,
        borderRadius: 10,
        background: owner === "blue" ? "#2f80ff" : "#ff4d4d",
        position: "relative",
        color: "white",
        fontWeight: "bold",
        userSelect: "none",
        boxShadow: "0 6px 12px rgba(0,0,0,0.4)",
    }),

    num: {
        position: "absolute",
        fontSize: 14,
    },

    top: { top: 4, left: "50%", transform: "translateX(-50%)" },
    bottom: { bottom: 4, left: "50%", transform: "translateX(-50%)" },
    left: { left: 4, top: "50%", transform: "translateY(-50%)" },
    right: { right: 4, top: "50%", transform: "translateY(-50%)" },
};

const initialBoard = Array(9).fill(null);

const demoCard = {
    owner: "blue",
    values: { top: 5, right: 3, bottom: 7, left: 2 },
};

export default function Game() {
    const [board, setBoard] = useState(initialBoard);

    const placeCard = (i) => {
        if (board[i]) return;
        const copy = [...board];
        copy[i] = demoCard;
        setBoard(copy);
    };

    return (
        <div style={styles.board}>
            {board.map((card, i) => (
                <div key={i} style={styles.cell} onClick={() => placeCard(i)}>
                    {card && (
                        <div style={styles.card(card.owner)}>
                            <span style={{ ...styles.num, ...styles.top }}>{card.values.top}</span>
                            <span style={{ ...styles.num, ...styles.right }}>{card.values.right}</span>
                            <span style={{ ...styles.num, ...styles.bottom }}>{card.values.bottom}</span>
                            <span style={{ ...styles.num, ...styles.left }}>{card.values.left}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
