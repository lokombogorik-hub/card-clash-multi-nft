import React from "react";

export default function DeckBuilder({ go }) {
    return (
        <div style={styles.screen}>
            <h2>🃏 Выбор колоды</h2>
            <p>Скоро здесь будет выбор карт</p>

            <button onClick={() => go("menu")}>⬅ Назад</button>
        </div>
    );
}

const styles = {
    screen: {
        minHeight: "100vh",
        background: "#0b0f1a",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
    },
};
