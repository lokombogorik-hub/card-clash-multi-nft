import { useEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";

function useIsLandscape() {
    const get = () =>
        window.matchMedia?.("(orientation: landscape)")?.matches ??
        window.innerWidth > window.innerHeight;

    const [ok, setOk] = useState(get);

    useEffect(() => {
        const onChange = () => setOk(get());
        const m = window.matchMedia?.("(orientation: landscape)");
        m?.addEventListener?.("change", onChange);
        window.addEventListener("resize", onChange);
        window.addEventListener("orientationchange", onChange);
        return () => {
            m?.removeEventListener?.("change", onChange);
            window.removeEventListener("resize", onChange);
            window.removeEventListener("orientationchange", onChange);
        };
    }, []);

    return ok;
}

export default function App() {
    const [screen, setScreen] = useState("home");
    const isLandscape = useIsLandscape();

    const logoRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);

    // Telegram user for nickname/avatar
    const [me, setMe] = useState(null);

    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        tg.ready();
        tg.expand();

        tg.setHeaderColor?.("#000000");
        tg.setBackgroundColor?.("#000000");
        tg.setBottomBarColor?.("#000000");

        tg.MainButton?.hide();
        tg.SecondaryButton?.hide();
        tg.BackButton?.hide();

        try {
            setMe(tg.initDataUnsafe?.user || null);
        } catch {
            setMe(null);
        }

        tg.disableVerticalSwipes?.();
        return () => tg.enableVerticalSwipes?.();
    }, []);

    useEffect(() => {
        if (screen !== "home") return;
        logoRef.current?.play?.().catch(() => { });
    }, [screen]);

    const requestFullscreen = async () => {
        const tg = window.Telegram?.WebApp;
        try { tg?.requestFullscreen?.(); } catch { }
        try { tg?.expand?.(); } catch { }

        // browser fallback (если открылось не в Telegram)
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            }
        } catch { }
    };

    const onPlay = () => {
        // важно: fullscreen вызывать синхронно по клику
        requestFullscreen();
        setScreen("game");
    };

    const onExitGame = () => setScreen("home");

    const onConnectWallet = () => alert("Wallet connect (soon)");

    const showRotate = screen === "game" && !isLandscape;

    const seasonInfo = useMemo(
        () => ({ title: "Digitall Bunny Турнир", subtitle: "Ends in 3d 12h", progress: 0.62 }),
        []
    );

    return (
        <div className="shell">
            <StormBg />

            {screen === "game" ? (
                <>
                    <div className={`game-host ${showRotate ? "is-hidden" : ""}`}>
                        <Game onExit={onExitGame} me={me} />
                    </div>
                    {showRotate && <RotateGate onBack={onExitGame} />}
                </>
            ) : (
                <>
                    <div className="shell-content">
                        {screen === "home" && (
                            <div className="home-center">
                                <button
                                    className="play-logo"
                                    aria-label="Play"
                                    onPointerDown={() => logoRef.current?.play?.().catch(() => { })}
                                    onClick={onPlay}
                                >
                                    <div className="logo-wrap">
                                        {logoOk ? (
                                            <video
                                                ref={logoRef}
                                                className="logo-video"
                                                autoPlay
                                                loop
                                                muted
                                                playsInline
                                                preload="auto"
                                                onError={() => setLogoOk(false)}
                                            >
                                                <source src="/ui/logo.mp4" type="video/mp4" />
                                            </video>
                                        ) : (
                                            <div className="page">Видео логотипа не поддерживается</div>
                                        )}
                                    </div>

                                    <span className="play-icon">
                                        <PlayIcon />
                                    </span>
                                </button>
                            </div>
                        )}

                        {screen === "market" && (
                            <div className="page">
                                <h2>Маркет</h2>
                                <p>Кейсы / дропы / коллекции.</p>
                            </div>
                        )}

                        {screen === "profile" && (
                            <div className="page">
                                <h2>Профиль</h2>
                                <p>Прогресс, рейтинг, кошелёк.</p>
                            </div>
                        )}
                    </div>

                    <div className="wallet-float">
                        <button className="wallet-btn" onClick={onConnectWallet}>
                            Подключить кошелёк
                        </button>
                    </div>

                    <div className="bottom-stack">
                        <SeasonBar
                            title={seasonInfo.title}
                            subtitle={seasonInfo.subtitle}
                            progress={seasonInfo.progress}
                            onRefresh={() => console.log("refresh")}
                        />
                        <BottomNav active={screen} onChange={setScreen} />
                    </div>
                </>
            )}
        </div>
    );
}

function RotateGate({ onBack }) {
    return (
        <div className="rotate-gate">
            <div className="rotate-gate-box">
                <div className="rotate-title">Поверни телефон</div>
                <div className="rotate-subtitle">Игра работает только в горизонтальном режиме</div>
                <div className="rotate-phone" />
                <button onClick={onBack}>← Меню</button>
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
                    ⟳
                </button>
            </div>
        </div>
    );
}

function BottomNav({ active, onChange }) {
    const items = [
        { key: "home", label: "Главная" },
        { key: "market", label: "Маркет" },
        { key: "inventory", label: "Инвентарь", disabled: true },
        { key: "profile", label: "Профиль" },
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
                        <span className="nav-txt">{it.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

function PlayIcon() {
    return (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" />
        </svg>
    );
}