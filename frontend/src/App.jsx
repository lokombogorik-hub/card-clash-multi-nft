import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";
import { apiFetch } from "./api";
import Inventory from "./pages/Inventory";
import Profile from "./pages/Profile";
import Market from "./pages/Market";

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

function readTelegramUser() {
    try {
        return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    } catch {
        return null;
    }
}

export default function App() {
    const [screen, setScreen] = useState("home"); // home | market | inventory | profile | game
    const isLandscape = useIsLandscape();

    const [token, setToken] = useState(null);
    const [me, setMe] = useState(null);

    const [activeDeckCards, setActiveDeckCards] = useState(null); // массив из 5 карт для Game

    const logoRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);

    const bottomStackRef = useRef(null);

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

        // читаем user
        setMe(readTelegramUser());

        const sync = () => setMe(readTelegramUser());
        try {
            tg.onEvent?.("viewportChanged", sync);
        } catch { }

        // Telegram auth -> JWT
        const initAuth = async () => {
            try {
                const initData = tg.initData || "";
                if (!initData) return;
                const r = await apiFetch("/api/auth/telegram", {
                    method: "POST",
                    body: JSON.stringify({ initData }),
                });
                setToken(r.accessToken);
            } catch (e) {
                console.error("Auth failed:", e);
            }
        };
        initAuth();

        tg.disableVerticalSwipes?.();
        return () => {
            try {
                tg.offEvent?.("viewportChanged", sync);
            } catch { }
            tg.enableVerticalSwipes?.();
        };
    }, []);

    useLayoutEffect(() => {
        const el = bottomStackRef.current;
        if (!el) return;

        const apply = () => {
            const h = Math.ceil(el.getBoundingClientRect().height);
            document.documentElement.style.setProperty("--bottom-stack-h", `${h}px`);
        };

        apply();
        const ro = new ResizeObserver(apply);
        ro.observe(el);
        return () => ro.disconnect();
    }, [screen]);

    useEffect(() => {
        if (screen !== "home") return;
        logoRef.current?.play?.().catch(() => { });
    }, [screen]);

    const requestFullscreen = async () => {
        const tg = window.Telegram?.WebApp;
        try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch { }
        try { tg?.requestFullscreen?.(); } catch { }
        try { tg?.expand?.(); } catch { }
        try {
            if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.();
        } catch { }
    };

    const loadActiveDeck = async () => {
        if (!token) return null;
        try {
            // новый endpoint (см backend ниже)
            const r = await apiFetch("/api/decks/active/full", { token });
            if (Array.isArray(r.cards) && r.cards.length === 5) return r.cards;
            return null;
        } catch {
            return null;
        }
    };

    const onPlay = async () => {
        requestFullscreen();

        const deck = await loadActiveDeck();
        if (!deck) {
            setScreen("inventory");
            return;
        }

        setActiveDeckCards(deck);
        setScreen("game");
    };

    const onExitGame = () => {
        setScreen("home");
    };

    const onConnectWallet = () => {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); } catch { }
        alert("Wallet connect (soon)");
    };

    const showRotate = screen === "game" && !isLandscape;

    const seasonInfo = useMemo(
        () => ({ title: "Digitall Bunny Турнир", subtitle: "Ends in 3d 12h", progress: 0.62 }),
        []
    );

    if (screen === "game") {
        return (
            <div className="shell">
                <StormBg />
                <div className={`game-host ${showRotate ? "is-hidden" : ""}`}>
                    <Game onExit={onExitGame} me={me} playerDeck={activeDeckCards} />
                </div>
                {showRotate && <RotateGate onBack={onExitGame} />}
            </div>
        );
    }

    return (
        <div className="shell">
            <StormBg />

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

                {screen === "market" && <Market />}
                {screen === "inventory" && <Inventory token={token} onDeckReady={() => setScreen("home")} />}
                {screen === "profile" && <Profile token={token} />}
            </div>

            <div className="wallet-float">
                <button className="wallet-btn" onClick={onConnectWallet}>
                    Подключить кошелёк
                </button>
            </div>

            <div className="bottom-stack" ref={bottomStackRef}>
                <SeasonBar
                    title={seasonInfo.title}
                    subtitle={seasonInfo.subtitle}
                    progress={seasonInfo.progress}
                    onRefresh={() => console.log("refresh")}
                />
                <BottomNav active={screen} onChange={setScreen} />
            </div>
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
            <div>
                <div className="season-title">{title}</div>
                <div className="season-sub">{subtitle}</div>
            </div>

            <div className="season-right">
                <div className="season-progress">
                    <div className="season-progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <button className="icon-btn" onClick={onRefresh} aria-label="Refresh">⟳</button>
            </div>
        </div>
    );
}

function BottomNav({ active, onChange }) {
    const items = [
        { key: "home", label: "Главная", icon: <HomeIcon /> },
        { key: "market", label: "Маркет", icon: <GemIcon /> },
        { key: "inventory", label: "Инвентарь", icon: <BagIcon /> },
        { key: "profile", label: "Профиль", icon: <UserIcon /> },
    ];

    return (
        <div className="bottom-nav">
            {items.map((it) => {
                const isActive = active === it.key;
                return (
                    <button
                        key={it.key}
                        className={`nav-item ${isActive ? "active" : ""}`}
                        onClick={() => onChange(it.key)}
                    >
                        <span className="nav-ic">{it.icon}</span>
                        <span className="nav-txt">{it.label}</span>
                    </button>
                );
            })}

        </div>
    );
}

/* Icons */
function PlayIcon() {
    return (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" />
        </svg>
    );
}
function HomeIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="white" strokeWidth="2" opacity="0.9" />
        </svg>
    );
}
function GemIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2 3 9l9 13 9-13-9-7Z" stroke="white" strokeWidth="2" opacity="0.9" />
            <path d="M3 9h18" stroke="white" strokeWidth="2" opacity="0.6" />
        </svg>
    );
}
function BagIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 8h12l-1 13H7L6 8Z" stroke="white" strokeWidth="2" opacity="0.9" />
            <path d="M9 8a3 3 0 0 1 6 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        </svg>
    );
}
function UserIcon() {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="white" strokeWidth="2" opacity="0.9" />
            <path d="M4 20a8 8 0 0 1 16 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
        </svg>
    );
}
