import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";
import { apiFetch } from "./api.js";
import Inventory from "./pages/Inventory";
import Profile from "./pages/Profile";
import Market from "./pages/Market";
import WalletConnector from "./components/MultiChainWallet/WalletConnector";
import LockEscrowModal from "./components/Stage2/LockEscrowModal";
import Matchmaking from "./components/Stage2/Matchmaking";
import WalletConnectProvider from "./context/WalletConnectContext";

function useIsLandscape() {
    var get = function () {
        var mq = window.matchMedia ? window.matchMedia("(orientation: landscape)") : null;
        return mq ? mq.matches : window.innerWidth > window.innerHeight;
    };
    var [ok, setOk] = useState(get);
    useEffect(function () {
        var onChange = function () { setOk(get()); };
        var m = window.matchMedia ? window.matchMedia("(orientation: landscape)") : null;
        if (m && m.addEventListener) m.addEventListener("change", onChange);
        window.addEventListener("resize", onChange);
        window.addEventListener("orientationchange", onChange);
        return function () {
            if (m && m.removeEventListener) m.removeEventListener("change", onChange);
            window.removeEventListener("resize", onChange);
            window.removeEventListener("orientationchange", onChange);
        };
    }, []);
    return ok;
}

function readTelegramUser() {
    try { return window.Telegram?.WebApp?.initDataUnsafe?.user || null; }
    catch (e) { return null; }
}

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

function AppContent() {
    var [screen, setScreen] = useState("home");
    var isLandscape = useIsLandscape();

    var [token, setToken] = useState(null);
    var [me, setMe] = useState(null);
    var [playerDeck, setPlayerDeck] = useState(null);

    var [gameMode, setGameMode] = useState("ai");
    var [stage2LockOpen, setStage2LockOpen] = useState(false);
    var [stage2MatchId, setStage2MatchId] = useState("");

    var logoRef = useRef(null);
    var [logoOk, setLogoOk] = useState(true);
    var bottomStackRef = useRef(null);

    var apiBase = import.meta.env.VITE_API_BASE_URL || "";
    var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
    var stage2Enabled = Boolean(escrowContractId);

    var [authState, setAuthState] = useState({ status: "idle", error: "" });

    useEffect(function () {
        var t = getStoredToken();
        if (t) {
            setToken(t);
            if (authState.status === "idle") setAuthState({ status: "ok", error: "" });
        }
    }, []);

    useEffect(function () {
        var tg = window.Telegram?.WebApp;
        if (!tg) { setMe(null); return; }

        tg.ready();
        tg.expand();
        try { tg.setHeaderColor?.("#000000"); } catch (e) { }
        try { tg.setBackgroundColor?.("#000000"); } catch (e) { }
        try { tg.setBottomBarColor?.("#000000"); } catch (e) { }
        try { tg.MainButton?.hide(); } catch (e) { }
        try { tg.SecondaryButton?.hide(); } catch (e) { }
        try { tg.BackButton?.hide(); } catch (e) { }

        setMe(readTelegramUser());

        var initAuth = async function () {
            try {
                setAuthState({ status: "loading", error: "" });
                var initData = tg.initData || "";
                if (!initData) {
                    var stored = getStoredToken();
                    if (stored) { setToken(stored); setAuthState({ status: "ok", error: "" }); return; }
                    setAuthState({ status: "err", error: "tg.initData is empty" });
                    return;
                }
                var r = await apiFetch("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData: initData }) });
                var accessToken = r?.accessToken || r?.access_token || r?.token || null;
                setToken(accessToken);
                try {
                    if (accessToken) {
                        localStorage.setItem("token", accessToken);
                        localStorage.setItem("accessToken", accessToken);
                        localStorage.setItem("access_token", accessToken);
                    }
                } catch (e) { }
                if (accessToken) setAuthState({ status: "ok", error: "" });
                else setAuthState({ status: "err", error: "No accessToken in response" });
            } catch (e) {
                setAuthState({ status: "err", error: String(e?.message || e) });
            }
        };

        initAuth();
        try { tg.disableVerticalSwipes?.(); } catch (e) { }
        return function () { try { tg.enableVerticalSwipes?.(); } catch (e) { } };
    }, []);

    useLayoutEffect(function () {
        var el = bottomStackRef.current;
        if (!el) return;
        var apply = function () {
            var h = Math.ceil(el.getBoundingClientRect().height);
            document.documentElement.style.setProperty("--bottom-stack-h", h + "px");
        };
        apply();
        var ro = new ResizeObserver(apply);
        ro.observe(el);
        return function () { ro.disconnect(); };
    }, [screen]);

    useEffect(function () {
        if (screen !== "home") return;
        try { logoRef.current?.play?.(); } catch (e) { }
    }, [screen]);

    var requestFullscreen = async function () {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); } catch (e) { }
        try { window.Telegram?.WebApp?.requestFullscreen?.(); } catch (e) { }
        try { window.Telegram?.WebApp?.expand?.(); } catch (e) { }
        try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch (e) { }
    };

    var onPlay = async function () {
        requestFullscreen();
        setScreen("inventory");
    };

    // Called when deck is saved in Inventory - receives full NFT data
    var onDeckReady = function (selectedNfts) {
        if (Array.isArray(selectedNfts) && selectedNfts.length === 5) {
            setPlayerDeck(selectedNfts);
        }
        setScreen("matchmaking");
    };

    var onExitGame = function () {
        setScreen("home");
        setPlayerDeck(null);
        setStage2MatchId("");
        setGameMode("ai");
    };

    var showRotate = screen === "game" && !isLandscape;
    var showWalletConnector = screen === "home";

    var seasonInfo = useMemo(function () {
        return { title: "Digitall Bunny Турнир", subtitle: "Ends in 3d 12h", progress: 0.62 };
    }, []);

    if (screen === "game") {
        return (
            <div className="shell">
                <StormBg />
                <div className={"game-host" + (showRotate ? " is-hidden" : "")}>
                    {playerDeck && playerDeck.length === 5 ? (
                        <Game onExit={onExitGame} me={me} playerDeck={playerDeck} matchId={stage2MatchId} mode={gameMode} />
                    ) : (
                        <div style={{ color: "#fff", padding: 20 }}>Loading deck...</div>
                    )}
                </div>
                {showRotate && <RotateGate onBack={onExitGame} />}
            </div>
        );
    }

    return (
        <div className="shell">
            <StormBg />

            {showWalletConnector ? <WalletConnector /> : null}

            <LockEscrowModal
                open={stage2LockOpen}
                onClose={function () { setStage2LockOpen(false); }}
                onReady={function (data) {
                    setStage2MatchId(data.matchId || "");
                    setStage2LockOpen(false);
                    setGameMode("pvp");
                    setScreen("game");
                }}
                me={me}
                playerDeck={playerDeck}
            />

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        <button className="play-logo" aria-label="Play" onClick={onPlay}>
                            <div className="logo-wrap">
                                {logoOk ? (
                                    <video ref={logoRef} className="logo-video" autoPlay loop muted playsInline preload="auto" onError={function () { setLogoOk(false); }}>
                                        <source src="/ui/logo.mp4" type="video/mp4" />
                                    </video>
                                ) : (
                                    <div className="page">Logo</div>
                                )}
                            </div>
                            <span className="play-icon"><PlayIcon /></span>
                        </button>
                    </div>
                )}

                {screen === "matchmaking" && (
                    <Matchmaking
                        me={me}
                        onBack={function () { setScreen("inventory"); }}
                        onMatched={function (data) {
                            setGameMode(data.mode || "ai");

                            if (!playerDeck || playerDeck.length !== 5) {
                                alert("Колода не выбрана. Вернись в инвентарь.");
                                setScreen("inventory");
                                return;
                            }

                            if (data.mode === "ai") {
                                setStage2MatchId("");
                                setScreen("game");
                                return;
                            }
                            if (!stage2Enabled) {
                                setStage2MatchId(data.matchId || "");
                                setScreen("game");
                                return;
                            }
                            setStage2MatchId(data.matchId || "");
                            setStage2LockOpen(true);
                        }}
                    />
                )}

                {screen === "market" && <Market />}
                {screen === "inventory" && <Inventory token={token || getStoredToken()} onDeckReady={onDeckReady} />}
                {screen === "profile" && <Profile token={token || getStoredToken()} me={me} />}
            </div>

            <div className="bottom-stack" ref={bottomStackRef}>
                {screen === "home" && (
                    <SeasonBar title={seasonInfo.title} subtitle={seasonInfo.subtitle} progress={seasonInfo.progress} onRefresh={function () { }} />
                )}
                <BottomNav active={screen} onChange={setScreen} />
            </div>
        </div>
    );
}

export default function App() {
    return (
        <WalletConnectProvider>
            <AppContent />
        </WalletConnectProvider>
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
                    <div className="season-progress-fill" style={{ width: Math.round(progress * 100) + "%" }} />
                </div>
                <button className="icon-btn" onClick={onRefresh} aria-label="Refresh">⟳</button>
            </div>
        </div>
    );
}

function BottomNav({ active, onChange }) {
    var items = [
        { key: "home", label: "Главная", icon: <HomeIcon /> },
        { key: "market", label: "Маркет", icon: <GemIcon /> },
        { key: "inventory", label: "Колода", icon: <BagIcon /> },
        { key: "profile", label: "Профиль", icon: <UserIcon /> },
    ];
    return (
        <div className="bottom-nav">
            {items.map(function (it) {
                var isActive = active === it.key;
                return (
                    <button key={it.key} className={"nav-item" + (isActive ? " active" : "")} onClick={function () { onChange(it.key); }}>
                        <span className="nav-ic">{it.icon}</span>
                        <span className="nav-txt">{it.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

function PlayIcon() {
    return (<svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" /></svg>);
}
function HomeIcon() {
    return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="white" strokeWidth="2" opacity="0.9" /></svg>);
}
function GemIcon() {
    return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 9l9 13 9-13-9-7Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M3 9h18" stroke="white" strokeWidth="2" opacity="0.6" /></svg>);
}
function BagIcon() {
    return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 8h12l-1 13H7L6 8Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M9 8a3 3 0 0 1 6 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" /></svg>);
}
function UserIcon() {
    return (<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M4 20a8 8 0 0 1 16 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" /></svg>);
}