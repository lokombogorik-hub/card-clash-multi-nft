import { useEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";

/**
 * Проверка ландшафта.
 * На iOS/Telegram matchMedia бывает капризным — поэтому fallback на сравнение width/height.
 */
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
    /**
     * Экраны:
     * - home: главный экран
     * - market/profile: заглушки
     * - game: игра
     */
    const [screen, setScreen] = useState("home");
    const isLandscape = useIsLandscape();

    // Видео-логотип на главном экране
    const logoRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);

    // Telegram WebApp init
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        tg.ready();
        tg.expand();

        // Маскируем “шапку” цветом (полностью убрать на iOS/PC часто нельзя)
        tg.setHeaderColor?.("#000000");
        tg.setBackgroundColor?.("#000000");
        tg.setBottomBarColor?.("#000000");

        // Скрываем стандартные кнопки
        tg.MainButton?.hide();
        tg.SecondaryButton?.hide();
        tg.BackButton?.hide();

        // Чтобы WebView не пытался скроллить вертикально
        tg.disableVerticalSwipes?.();
        return () => tg.enableVerticalSwipes?.();
    }, []);

    // Автоплей видео на home (в некоторых WebView нужно “подтолкнуть” play при касании)
    useEffect(() => {
        if (screen !== "home") return;
        logoRef.current?.play?.().catch(() => { });
    }, [screen]);

    // “Максимум возможного” для fullscreen/landscape (не гарантируется на iOS/Telegram Desktop)
    const requestFullscreenAndLandscape = async () => {
        const tg = window.Telegram?.WebApp;
        try {
            tg?.HapticFeedback?.impactOccurred?.("light");
        } catch { }

        try {
            await tg?.requestFullscreen?.();
        } catch { }

        try {
            await window.screen?.orientation?.lock?.("landscape");
        } catch { }

        try {
            tg?.expand?.();
        } catch { }
    };
    const requestFullscreenAndLandscape = async () => {
        const tg = window.Telegram?.WebApp;

        try { tg?.HapticFeedback?.impactOccurred?.("light"); } catch { }

        // Telegram Desktop / Mobile (если поддерживает)
        try { await tg?.requestFullscreen?.(); } catch { }
        try { await window.screen?.orientation?.lock?.("landscape"); } catch { }
        try { tg?.expand?.(); } catch { }

        // ===== Browser fallback (ПК браузер) =====
        // Важно: работает ТОЛЬКО по клику (у тебя это onPlay => ок)
        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            }
        } catch { }
    };
    const onPlay = async () => {
        // ВАЖНО: Сначала показываем game. Если портрет — поверх будет rotate-gate.
        setScreen("game");
        await requestFullscreenAndLandscape();
    };

    const onExitGame = () => setScreen("home");

    const onConnectWallet = () => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch { }
        alert("Wallet connect (soon)");
    };

    // Если экран "game" и устройство в портрете — показываем табло
    const showRotate = screen === "game" && !isLandscape;

    // Данные сезона (заглушка)
    const seasonInfo = useMemo(
        () => ({ title: "Digitall Bunny Турнир", subtitle: "Ends in 3d 12h", progress: 0.62 }),
        []
    );

    return (
        <div className="shell">
            {/* фон-канвас (дождь/молнии) */}
            <StormBg />

            {screen === "game" ? (
                <>
                    {/* Игра всегда смонтирована: при повороте не ломаем состояние, а просто прячем */}
                    <div className={`game-host ${showRotate ? "is-hidden" : ""}`}>
                        <Game onExit={onExitGame} />
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
                                            <div className="page">
                                                Видео логотипа не поддерживается
                                                <div style={{ opacity: 0.8, marginTop: 6, fontSize: 12 }}>
                                                    Проверь /ui/logo.mp4 (H.264)
                                                </div>
                                            </div>
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

                    {/* Кнопка кошелька */}
                    <div className="wallet-float">
                        <button className="wallet-btn" onClick={onConnectWallet}>
                            Подключить кошелёк
                        </button>
                    </div>

                    {/* нижний стек (season + nav) */}
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

/* =========================
   UI Components
   ========================= */

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
        { key: "home", label: "Главная", icon: <HomeIcon /> },
        { key: "market", label: "Маркет", icon: <GemIcon /> },
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

/* icons */
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
            <path
                d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
                stroke="white"
                strokeWidth="2"
                opacity="0.9"
            />
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