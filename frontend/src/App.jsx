import { useEffect, useState } from "react";
import Game from "./Game";

export default function App() {
    const [screen, setScreen] = useState("menu");

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;
        tg.ready();
        tg.expand();
    }, []);

    if (screen === "game") {
        return <Game onExit={() => setScreen("menu")} />;
    }

    return (
        <div className="app">
            <h1>Card Clash</h1>
            <button onClick={() => setScreen("game")}>▶ Играть</button>
        </div>
    );
}