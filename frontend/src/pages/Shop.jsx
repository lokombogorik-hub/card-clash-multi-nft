import React from "react";

export default function Shop({ go }) {
    return (
        <div style={styles.screen}>
            <h2>🛒 Магазин</h2>
            <p>Кейсы будут здесь</p>

            <button onClick={() => go("menu")}>⬅ Назад</button>
        </div>
    );
}

const styles = {
    screen: {
        minHeight: "100vh",
        background: "#111",
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
    },
};
