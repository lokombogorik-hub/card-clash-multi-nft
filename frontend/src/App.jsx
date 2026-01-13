import { useEffect, useMemo, useState } from "react";
import Game from "./Game";
import Starfield from "./components/Starfield";

const isLandscape = () =>
    window.matchMedia?.("(orientation: landscape)")?.matches ??
    window.innerWidth > window.innerHeight;

export default function App() {
    // home | market | profile | rotate | game
    const [screen, setScreen] = useState("home");

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        tg.ready();
        tg.expand();

        // "прячем" шапку Telegram визуально
        tg.setHeaderColor?.("#050611");
        tg.setBackgroundColor?.("#050611");
        tg.setBottomBarColor?.("#050611"); // если поддерживается

        // убираем стандартные телеграм-кнопки
        tg.MainButton?.hide();
        tg.SecondaryButton?.hide();
        tg.BackButton?.hide();

        // чтобы не закрывалось свайпом вниз (по желанию)
        tg.disableVerticalSwipes?.();

        return () => tg.enableVerticalSwipes?.();
    }, []);

    // демо-статус сезона (потом подтянешь из backend)
    const seasonInfo = useMemo(
        () => ({ title: "Season 1", subtitle: "Ends in 3d 12h", progress: 0.62 }),
        []
    );

    const requestFullscreen = async () => {
        const tg = window.Telegram?.WebApp;
        try { await tg?.requestFullscreen?.(); } catch { }
        try { await window.screen?.orientation?.lock?.("landscape"); } catch { }
    };

    const onPlay = async () => {
        await requestFullscreen();
        if (isLandscape()) setScreen("game");
        else setScreen("rotate");
    };

    // rotate gate: ждём landscape
    useEffect(() => {
        if (screen !== "rotate") return;
        const onChange = () => {
            if (isLandscape()) setScreen("game");
        };
        window.addEventListener("resize", onChange);
        window.addEventListener("orientationchange", onChange);
        onChange();
        return () => {
            window.removeEventListener("resize", onChange);
            window.removeEventListener("orientationchange", onChange);
        };
    }, [screen]);

    if (screen === "game") return <Game onExit={() => setScreen("home")} />;

    if (screen === "rotate") {
        return (
            <div className="rotate-gate">
                <div className="rotate-gate-box">
                    <div className="rotate-title">Поверни телефон</div>
                    <div className="rotate-subtitle">Игра запускается только в горизонтальном режиме</div>
                    <div className="rotate-phone" />
                    <button onClick={() => setScreen("home")}>← Назад</button>
                </div>
            </div>
        );
    }

    return (
        <div className="shell">
            <Starfield />

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        <button className="play-orb" onClick={onPlay} aria-label="Play">
                            <PlayIcon />
                        </button>
                    </div>
                )}

                {screen === "market" && (
                    <div className="page">
                        <h2>Маркет</h2>
                        <p>Тут будет магазин/кейсы/NFT.</p>
                    </div>
                )}

                {screen === "profile" && (
                    <div className="page">
                        <h2>Профиль</h2>
                        <p>Тут будет прогресс, рейтинг, кошельки.</p>
                    </div>
                )}
            </div>

            <div className="bottom-stack">
                <SeasonBar
                    title={seasonInfo.title}
                    subtitle={seasonInfo.subtitle}
                    progress={seasonInfo.progress}
                    onRefresh={() => console.log("refresh")}
                />

                <BottomNav
                    active={screen}
                    onChange={setScreen}
                />
            </div>
        </div>
    );
}

function SeasonBar({ title, subtitle, progress, onRefresh }) {
    return (
        <div className="season-bar">
            <div className="season-text">
                <div className="season-title">{title}</div>
                <div className="season-sub">{subtitle}</div>
            </div>

            <div className="season-right">
                <div className="season-progress">
                    <div className="season-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <button className="icon-btn" onClick={onRefresh} aria-label="Refresh">
                    <RefreshIcon />
                </button>
            </div>
        </div>
    );
}

function BottomNav({ active, onChange }) {
    const items = [
        { key: "home", label: "Главная", icon: <HomeIcon /> },
        { key: "market", label: "Маркет", icon: <SaleIcon /> },
        { key: "inventory", label: "Инвентарь", icon: <BagIcon />, disabled: true },
        { key: "profile", label: "Профиль", icon: <UserIcon /> },
    ];

    return (
        <div className="bottom-nav">
            {items.map((it) => {
                const isActive = active === it.key;
                return (
                    <button
                        key={it.key}
                        className={`nav-item ${isActive ? "active" : ""} ${it.disabled ? "disabled" : ""}`}
                        onClick={it.disabled ? undefined : () => onChange(it.key)}
                    >
                        <span className="nav-ic">{it.icon}</span>
                        <span className="nav-txt">{it.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

/* ===== SVG ICONS (минималистичные) ===== */
function PlayIcon() {
    return (
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
            <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path
                d="M20 12a8 8 0 1 1-2.34-5.66"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
            />
            <path d="M20 4v6h-6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

function HomeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="white" strokeWidth="2" />
        </svg>
    );
}
function SaleIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M20 13 11 22 2 13V4h9l9 9Z" stroke="white" strokeWidth="2" />
            <path d="M7.5 7.5h.01" stroke="white" strokeWidth="4" strokeLinecap="round" />
        </svg>
    );
}
function BagIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 8h12l-1 13H7L6 8Z" stroke="white" strokeWidth="2" />
            <path d="M9 8a3 3 0 0 1 6 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}
function UserIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="white" strokeWidth="2" />
            <path d="M4 20a8 8 0 0 1 16 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}