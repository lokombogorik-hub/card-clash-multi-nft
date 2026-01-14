import { useEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";

const isLandscape = () =>
    window.matchMedia?.("(orientation: landscape)")?.matches ??
    window.innerWidth > window.innerHeight;

export default function App() {
    const [screen, setScreen] = useState("home"); // home | market | profile | rotate | game
    const logoRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);

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

        tg.disableVerticalSwipes?.();
        return () => tg.enableVerticalSwipes?.();
    }, []);

    useEffect(() => {
        const v = logoRef.current;
        if (!v) return;
        v.play?.().catch(() => { });
    }, [screen]);

    const seasonInfo = useMemo(
        () => ({ title: "Season 1", subtitle: "Ends in 3d 12h", progress: 0.62 }),
        []
    );

    const requestFullscreenAndLandscape = async () => {
        const tg = window.Telegram?.WebApp;
        try { await tg?.requestFullscreen?.(); } catch { }
        try { await window.screen?.orientation?.lock?.("landscape"); } catch { }
    };

    const onPlay = async () => {
        await requestFullscreenAndLandscape();
        if (isLandscape()) setScreen("game");
        else setScreen("rotate");
    };

    useEffect(() => {
        if (screen !== "rotate") return;

        const check = () => {
            if (isLandscape()) setScreen("game");
        };

        window.addEventListener("resize", check);
        window.addEventListener("orientationchange", check);
        check();

        return () => {
            window.removeEventListener("resize", check);
            window.removeEventListener("orientationchange", check);
        };
    }, [screen]);

    const onExitGame = () => setScreen("home");

    const onConnectWallet = () => {
        alert("Wallet connect (soon)");
    };

    if (screen === "game") return <Game onExit={onExitGame} />;

    if (screen === "rotate") {
        return (
            <div className="rotate-gate">
                <Styles />
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
            <Styles />
            <StormBg />

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        <button
                            className="play-logo"
                            onPointerDown={() => logoRef.current?.play?.().catch(() => { })}
                            onClick={onPlay}
                            aria-label="Play"
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
                                    <div className="logo-fallback">
                                        Видео логотипа не поддерживается
                                        <div className="logo-fallback-sub">Проверь /ui/logo.mp4 (H.264)</div>
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

            {/* КОШЕЛЁК: выше SeasonBar и меню, по центру, маленькая кнопка */}
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
        { key: "market", label: "Маркет", icon: <GemIcon /> }, // <-- было NFT
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

function Styles() {
    return (
        <style>{`
      .shell{
        position: fixed;
        inset: 0;
        width: 100%;
        height: var(--app-h, 100vh);
        overflow: hidden;
        background: #000;
        color: #fff;
      }

      .storm-bg{
        position: absolute;
        inset: 0;
        z-index: 0;
        pointer-events: none;
      }

      .shell-content{
        position: relative;
        z-index: 1;
        height: 100%;
        padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 200px);
      }

      .home-center{
        height: 100%;
        display: grid;
        place-items: center;
      }

      .play-logo{
        width: min(240px, 56vmin);
        height: min(240px, 56vmin);
        border-radius: 999px;
        padding: 0;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.18);
        backdrop-filter: blur(8px);
        box-shadow: 0 24px 80px rgba(0,0,0,0.78);
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
        cursor: pointer;
      }

      .logo-wrap{
        width: 88%;
        height: 88%;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.10);
      }

      .logo-video{
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .play-icon{
        position: absolute;
        inset: 0;
        display: grid;
        place-items: center;
        pointer-events: none;
      }

      /* ====== КНОПКА КОШЕЛЬКА (выше низа) ====== */
      .wallet-float{
        position: absolute;
        left: 0;
        right: 0;
        /* больше -> выше, меньше -> ниже */
        bottom: calc(env(safe-area-inset-bottom, 0px) + 210px);
        z-index: 3;
        display: flex;
        justify-content: center;
        pointer-events: none;
      }

      .wallet-btn{
        pointer-events: auto;
        /* ширина/высота/шрифт */
        width: min(200px, 64vw);
        height: 40px;
        font-size: 12px;

        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.16);
        background:
          radial-gradient(80% 140% at 20% 20%, rgba(120,200,255,0.18), transparent 62%),
          radial-gradient(80% 140% at 80% 80%, rgba(255,61,242,0.10), transparent 62%),
          rgba(0,0,0,0.62);
        color: #fff;
        font-weight: 900;
        letter-spacing: .2px;
      }

      .bottom-stack{
        position: absolute;
        left: 0; right: 0;
        bottom: 0;
        z-index: 2;
        padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px);
        display: grid;
        gap: 10px;
      }

      .season-bar{
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.58);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(10px);
      }
      .season-title{ font-weight: 900; font-size: 13px; }
      .season-sub{ opacity: .8; font-size: 12px; margin-top: 2px; }
      .season-right{ margin-left:auto; display:flex; align-items:center; gap:10px; }
      .season-progress{ width:120px; height:8px; border-radius:999px; background: rgba(255,255,255,0.10); overflow:hidden; }
      .season-progress-fill{ height:100%; background: linear-gradient(90deg, rgba(120,200,255,0.85), rgba(255,61,242,0.45)); }
      .icon-btn{ width:36px; height:32px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.45); color:#fff; padding:0; }

      .bottom-nav{
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 10px;
        padding: 10px 10px;
        border-radius: 18px;
        background: rgba(0,0,0,0.65);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(12px);
      }

      .nav-item{
        padding: 10px 6px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        background: rgba(255,255,255,0.03);
        color: rgba(255,255,255,0.82);
        display: grid;
        justify-items: center;
        gap: 6px;
      }

      .nav-txt{ font-size: 11px; font-weight: 900; letter-spacing: .2px; }
      .nav-ic{ line-height: 0; }

      .nav-item.active{
        color: #fff;
        border-color: rgba(120,200,255,0.28);
        background:
          radial-gradient(80% 140% at 20% 20%, rgba(120,200,255,0.16), transparent 60%),
          radial-gradient(80% 140% at 80% 80%, rgba(255,61,242,0.12), transparent 60%),
          rgba(255,255,255,0.03);
        box-shadow: 0 0 24px rgba(120,200,255,0.10);
      }

      .nav-item.disabled{ opacity: 0.35; }

      /* rotate gate */
      .rotate-gate{
        position: fixed;
        inset: 0;
        display:flex;
        align-items:center;
        justify-content:center;
        padding: 18px;
        background: rgba(0,0,0,0.78);
        z-index: 30000;
        color:#fff;
      }
      .rotate-gate-box{
        width: min(420px, 92vw);
        background: rgba(0,0,0,0.45);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 16px;
        padding: 18px 16px;
        text-align:center;
      }
      .rotate-title{ font-weight: 900; font-size: 20px; margin-bottom: 6px; }
      .rotate-subtitle{ opacity: 0.85; font-size: 13px; margin-bottom: 14px; }
      .rotate-phone{
        width: 88px;
        height: 140px;
        margin: 0 auto 14px;
        border-radius: 16px;
        border: 2px solid rgba(255,255,255,0.35);
        transform: rotate(-18deg);
        animation: phoneWiggle 1.4s ease-in-out infinite;
      }
      @keyframes phoneWiggle{
        0%,100% { transform: rotate(-18deg); }
        50% { transform: rotate(-6deg); }
      }
    `}</style>
    );
}