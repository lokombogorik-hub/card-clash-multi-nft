import { useEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import LightningFogBg from "./components/LightningFogBg";

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

        tg.setHeaderColor?.("#02030a");
        tg.setBackgroundColor?.("#02030a");
        tg.setBottomBarColor?.("#02030a");

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

    const onExitGame = () => {
        try { window.Telegram?.WebApp?.exitFullscreen?.(); } catch { }
        setScreen("home");
    };

    const onConnectWallet = () => {
        // TODO: integrate TonConnect / WalletConnect
        console.log("connect wallet");
        alert("Wallet connect (soon)");
    };

    if (screen === "game") return <Game onExit={onExitGame} />;

    if (screen === "rotate") {
        return (
            <div className="rotate-gate">
                <MenuStyles />
                <div className="rotate-gate-box">
                    <div className="rotate-title">Rotate your phone</div>
                    <div className="rotate-subtitle">Game starts only in landscape mode</div>
                    <div className="rotate-phone" />
                    <button onClick={() => setScreen("home")}>← Back</button>
                </div>
            </div>
        );
    }

    return (
        <div className="shell">
            <MenuStyles />
            <LightningFogBg />

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
                                        Logo video not supported
                                        <div className="logo-fallback-sub">Check /ui/logo.mp4 (H.264)</div>
                                    </div>
                                )}
                            </div>

                            <span className="play-icon">
                                <PlayIcon />
                            </span>
                        </button>
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

                <button className="wallet-btn" onClick={onConnectWallet}>
                    Connect Wallet
                </button>

                {/* you can keep your BottomNav here if you want */}
            </div>
        </div>
    );
}

/* ======= Season bar ======= */
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

/* ======= Icons ======= */
function PlayIcon() {
    return (
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
            <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" />
        </svg>
    );
}

function RefreshIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M20 4v6h-6" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    );
}

/* ======= Styles (no need to edit index.css) ======= */
function MenuStyles() {
    return (
        <style>{`
      .shell{
        position: fixed;
        inset: 0;
        width: 100%;
        height: var(--app-h, 100vh);
        overflow: hidden;
        background: #02030a;
        color: #fff;
      }

      .lightning-bg{
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
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 150px);
      }

      .home-center{ height:100%; display:grid; place-items:center; }

      .play-logo{
        width: min(240px, 56vmin);
        height: min(240px, 56vmin);
        border-radius: 999px;
        padding: 0;
        border: 1px solid rgba(255,255,255,0.10);
        background: rgba(0,0,0,0.22);
        backdrop-filter: blur(8px);
        box-shadow: 0 24px 70px rgba(0,0,0,0.70);
        display: grid;
        place-items: center;
        position: relative;
        overflow: hidden;
        cursor: pointer;
      }

      /* slightly larger logo */
      .logo-wrap{
        width: 88%;
        height: 88%;
        position: relative;
        z-index: 1;
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
        z-index: 2;
        pointer-events: none;
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
        display:flex;
        align-items:center;
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
      .season-progress-fill{ height:100%; background: linear-gradient(90deg, rgba(180,230,255,0.85), rgba(255,61,242,0.55)); }
      .icon-btn{ width:36px; height:32px; border-radius:10px; border:1px solid rgba(255,255,255,0.12); background: rgba(0,0,0,0.45); color:#fff; padding:0; }

      .wallet-btn{
        height: 44px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.14);
        background: linear-gradient(90deg, rgba(180,230,255,0.20), rgba(0,0,0,0.60));
        color: #fff;
        font-weight: 900;
        font-size: 13px;
      }

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