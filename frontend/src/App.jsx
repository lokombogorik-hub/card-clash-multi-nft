import React, { useState } from "react";
import Game from "./Game";

export default function App() {
    const [screen, setScreen] = useState("menu");

    if (screen === "game") {
        return <Game onExit={() => setScreen("menu")} />;
    }

    return (
        <div style={styles.wrapper}>
            <h1 style={styles.title}>Card Clash</h1>

            <button style={styles.button} onClick={() => setScreen("game")}>
                ▶ Играть
            </button>

            <button style={styles.buttonDisabled}>🃏 Колоды (скоро)</button>
            <button style={styles.buttonDisabled}>🛒 Магазин (скоро)</button>
        </div>
    );
}

const styles = {
    wrapper: {
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #2b2b2b, #0e0e0e)",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "16px",
        fontFamily: "sans-serif",
    },
    title: {
        fontSize: "42px",
        marginBottom: "20px",
    },
    button: {
        width: "220px",
        padding: "14px",
        fontSize: "18px",
        borderRadius: "12px",
        border: "none",
        background: "linear-gradient(135deg, #ffb347, #ffcc33)",
        cursor: "pointer",
    },
    buttonDisabled: {
        width: "220px",
        padding: "14px",
        fontSize: "16px",
        borderRadius: "12px",
        border: "none",
        background: "#555",
        color: "#aaa",
    },
};
