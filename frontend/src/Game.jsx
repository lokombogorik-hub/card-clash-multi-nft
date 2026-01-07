import React from "react";

const cards = [1, 2, 3, 4, 5];

export default function Game({ onExit }) {
    return (
        <div style={styles.wrapper}>
            <button style={styles.exit} onClick={onExit}>⟵ Меню</button>

            {/* Левая колода */}
            <div style={styles.hand}>
                {cards.map((c) => (
                    <div key={c} style={{ ...styles.card, background: "#2563eb" }}>
                        {c}
                    </div>
                ))}
            </div>

            {/* Поле */}
            <div style={styles.board}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} style={styles.cell} />
                ))}
            </div>

            {/* Правая колода */}
            <div style={styles.hand}>
                {cards.map((c) => (
                    <div key={c} style={{ ...styles.card, background: "#dc2626" }}>
                        {c}
                    </div>
                ))}
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0b1220",
        padding: "20px",
        color: "white",
    },
    exit: {
        position: "absolute",
        top: 20,
        left: 20,
        padding: "8px 12px",
    },
    hand: {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
    },
    card: {
        width: "70px",
        height: "100px",
        borderRadius: "10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "24px",
    },
    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 90px)",
        gridTemplateRows: "repeat(3, 90px)",
        gap: "8px",
    },
    cell: {
        width: "90px",
        height: "90px",
        background: "#1e293b",
        borderRadius: "8px",
    },
};
