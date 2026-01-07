import React from "react";

export default function MainMenu({ go }) {
    return (
        <div style={styles.menu}>
            <h1 style={styles.title}>Card Clash</h1>

            <button style={styles.button} onClick={() => go("game")}>
                ▶ Играть
            </button>

            <button style={styles.button} onClick={() => go("deck")}>
                🃏 Колода
            </button>

            <button style={styles.button} onClick={() => go("shop")}>
                🛒 Магазин
            </button>
        </div>
    );
}

const styles = {
    menu: {
        minHeight: "100vh",
        background: "radial-gradient(circle, #2a1c0f, #0b0703)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        color: "#fff",
    },
    title: {
        fontSize: 42,
        marginBottom: 20,
        textShadow: "0 0 15px gold",
    },
    button: {
        width: 220,
        padding: "14px 0",
        fontSize: 18,
        borderRadius: 14,
        border: "2px solid gold",
        background: "linear-gradient(#c89b3c, #7a4e12)",
        color: "#000",
        cursor: "pointer",
        boxShadow: "0 0 15px rgba(255,200,100,0.6)",
    },
};
