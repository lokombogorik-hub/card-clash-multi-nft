import React from "react";

const cards = [1, 2, 3, 4, 5];

export default function Game({ onExit }) {
    return (
        <div style={styles.screen}>
            {/* ВРАГ */}
            <div style={styles.handTop}>
                {cards.map((c, i) => (
                    <div
                        key={c}
                        style={{
                            ...styles.card,
                            background: "#dc2626",
                            marginLeft: i === 0 ? 0 : -20,
                        }}
                    >
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
                {cards.map((c, i) => (
                    <div
                        key={c}
                        style={{
                            ...styles.card,
                            background: "#2563eb",
                            marginLeft: i === 0 ? 0 : -20,
                        }}
                    >
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
        marginBottom: "8px",
    },

    handBottom: {
        display: "flex",
        marginTop: "8px",
    },

    card: {
        width: "90px",
        height: "140px",
        borderRadius: "14px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "26px",
        boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
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
        borderRadius: "12px",
    },

    exit: {
        position: "absolute",
        left: 10,
        top: 10,
        padding: "6px 10px",
    },
};
