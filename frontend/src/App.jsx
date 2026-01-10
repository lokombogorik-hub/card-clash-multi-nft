import { useEffect, useRef, useState } from "react";
import Game from "./Game";

export default function App() {
    const [screen, setScreen] = useState("menu");
    const videoRef = useRef(null);
    const [needTap, setNeedTap] = useState(false);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;
        tg.ready();
        tg.expand();
    }, []);

    useEffect(() => {
        if (screen !== "menu") return;

        const v = videoRef.current;
        if (!v) return;

        // пробуем autoplay
        const tryPlay = async () => {
            try {
                await v.play();
                setNeedTap(false);
            } catch {
                // WebView запретил autoplay -> ждём тапа
                setNeedTap(true);
            }
        };

        tryPlay();
    }, [screen]);

    const handleUserGesturePlay = async () => {
        const v = videoRef.current;
        if (!v) return;
        try {
            await v.play();
            setNeedTap(false);
        } catch {
            // если и после тапа не играет — значит проблема с кодеком/путём
            setNeedTap(true);
        }
    };

    if (screen === "game") {
        return <Game onExit={() => setScreen("menu")} />;
    }

    return (
        <div className="menu-root" onPointerDown={needTap ? handleUserGesturePlay : undefined}>
            <video
                ref={videoRef}
                className="menu-video"
                src="/video/menu.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
            />

            <div className="menu-overlay" />

            <div className="menu-content">
                <h1>Card Clash</h1>

                {needTap && (
                    <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 6 }}>
                        Нажми по экрану, чтобы запустить фон
                    </div>
                )}

                <button onClick={() => setScreen("game")}>▶ Играть</button>
            </div>
        </div>
    );
}