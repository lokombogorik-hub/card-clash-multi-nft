import React from "react";

const cards = [1, 2, 3, 4, 5];

export default function Game({ onExit }) {
    return (
        <div style={styles.screen}>
            {/* ВРАГ */}
            <div style={styles.handTop}>
                {cards.map((c) => (
                    <div key={c} style={{ ...styles.card, background: "#dc2626" }}>
                        {c}
                    </div>
                ))}
            </div>

            {/* ПОЛЕ */}
            <div style={styles.board}>
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} style={styles.cell} />
                ))}
            </div>

            {/* ИГРОК */}
            <div style={styles.handBottom}>
                {cards.map((c) => (
                    <div key={c} style={{ ...styles.card, background: "#2563eb" }}>
                        {c}
                    </div>
                ))}
            </div>

            <button style={styles.exit} onClick={onExit}>
                ⟵ Меню
            </button>
        </div>
    );
}

const styles = {
    screen: {
        height: "100vh",
        background: "#0b1220",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px",
        color: "white",
    },

    handTop: {
        display: "flex",
        gap: "10px",
    },

    handBottom: {
        display: "flex",
        gap: "10px",
    },

    card: {
        width: "70px",
        height: "100px",
        borderRadius: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "24px",
    },

    board: {
        display: "grid",
        gridTemplateColumns: "repeat(3, 110px)",
        gridTemplateRows: "repeat(3, 110px)",
        gap: "10px",
    },

    cell: {
        width: "110px",
        height: "110px",
        background: "#1e293b",
        borderRadius: "10px",
    },

    exit: {
        position: "absolute",
        left: 10,
        top: 10,
        padding: "6px 10px",
    },
};
