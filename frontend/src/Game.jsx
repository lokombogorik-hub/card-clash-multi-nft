import React, { useState } from "react";

const CARD_SIZE = 100;

const styles = {
    screen: {
        minHeight: "100vh",
        background: "#0b1d3a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },

    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
        padding: 12,
        background: "#122b55",
        borderRadius: 16,
    },

    cell: {
        width: CARD_SIZE,
        height: CARD_SIZE,
        background: "#1e3a6d",
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
    },

    card: {
        width: "100%",
        height: "100%",
        background: "#2f80ff",
        borderRadius: 12,
        position: "relative",
        color: "white",
        fontWeight: "bold",
        boxShadow: "0 6px 14px rgba(0,0,0,0.5)",
    },

    num: {
        position: "absolute",
        fontSize: 14,
    },

    top: { top: 6, left: "50%", transform: "translateX(-50%)" },
    bottom: { bottom: 6, left: "50%", transform: "translateX(-50%)" },
    left: { left: 6, top: "50%", transform: "translateY(-50%)" },
    right: { right: 6, top: "50%", transform: "translateY(-50%)" },
};

const demoCard = {
    top: 5,
    right: 3,
    bottom: 7,
    left: 2,
};

export default function Game() {
    const [board, setBoard] = useState(Array(9).fill(null));

    const placeCard = (i) => {
        if (board[i]) return;
        const copy = [...board];
        copy[i] = demoCard;
        setBoard(copy);
    };

    return (
        <div style={styles.screen}>
            <div style={styles.board}>
                {board.map((card, i) => (
                    <div key={i} style={styles.cell} onClick={() => placeCard(i)}>
                        {card && (
                            <div style={styles.card}>
                                <span style={{ ...styles.num, ...styles.top }}>{card.top}</span>
                                <span style={{ ...styles.num, ...styles.right }}>{card.right}</span>
                                <span style={{ ...styles.num, ...styles.bottom }}>{card.bottom}</span>
                                <span style={{ ...styles.num, ...styles.left }}>{card.left}</span>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
