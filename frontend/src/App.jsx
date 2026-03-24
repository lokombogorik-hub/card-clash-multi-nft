import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";
import { apiFetch } from "./api.js";
import Inventory from "./pages/Inventory";
import Profile from "./pages/Profile";
import Market from "./pages/Market";
import WalletConnector from "./components/MultiChainWallet/WalletConnector";
import Matchmaking from "./components/Stage2/Matchmaking";
import WalletConnectProvider from "./context/WalletConnectContext";

/* ── helpers ── */
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
    catch (_) { return null; }
}

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (_) { return ""; }
}

/* ── countdown ── */
function useCountdown(targetDate) {
    var calc = function () {
        var diff = new Date(targetDate).getTime() - Date.now();
        if (diff <= 0) return { d: 0, h: 0, m: 0, s: 0, over: true };
        var s = Math.floor(diff / 1000);
        var m = Math.floor(s / 60);
        var h = Math.floor(m / 60);
        var d = Math.floor(h / 24);
        return { d: d, h: h % 24, m: m % 60, s: s % 60, over: false };
    };
    var [tick, setTick] = useState(calc);
    useEffect(function () {
        var id = setInterval(function () { setTick(calc()); }, 1000);
        return function () { clearInterval(id); };
    }, [targetDate]);
    return tick;
}

function CountdownBadge({ targetDate }) {
    var t = useCountdown(targetDate);
    if (t.over) return <span className="season-sub">Завершён</span>;
    var parts = [];
    if (t.d > 0) parts.push(t.d + "д");
    if (t.h > 0 || t.d > 0) parts.push(t.h + "ч");
    parts.push((t.m < 10 ? "0" : "") + t.m + "м");
    parts.push((t.s < 10 ? "0" : "") + t.s + "с");
    return <span className="season-sub">Осталось: {parts.join(" ")}</span>;
}

/* ── leaderboard ── */
function Leaderboard({ token }) {
    var [leaders, setLeaders] = useState([]);
    var [loading, setLoading] = useState(true);

    useEffect(function () {
        (async function () {
            try {
                var t = token || getStoredToken();
                var res = await apiFetch("/api/matches/leaderboard?limit=50", { token: t });
                setLeaders(Array.isArray(res?.leaders) ? res.leaders : Array.isArray(res) ? res : []);
            } catch (_) { setLeaders([]); }
            finally { setLoading(false); }
        })();
    }, [token]);

    var medals = ["🥇", "🥈", "🥉"];
    var medalClass = ["gold", "silver", "bronze"];

    var renderItem = function (p, i) {
        var cls = "leaderboard-item" + (i < 3 ? " " + medalClass[i] : "");
        var name = p.username || p.first_name || ("Player #" + (i + 1));
        var initial = name.charAt(0).toUpperCase();
        var photoUrl = p.photo_url || p.photoUrl || p.avatar || p.avatar_url || null;
        return (
            <div key={p.user_id || p.id || i} className={cls}>
                <div className="leaderboard-rank">{i < 3 ? medals[i] : i + 1}</div>
                {photoUrl ? (
                    <img className="leaderboard-avatar" src={photoUrl} alt={name}
                        onError={function (e) { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }} />
                ) : null}
                <div className="leaderboard-avatar-fallback" style={{ display: photoUrl ? "none" : "flex" }}>{initial}</div>
                <div className="leaderboard-info">
                    <div className="leaderboard-name">{name}</div>
                    <div className="leaderboard-stats">{p.wins || 0}W / {p.losses || 0}L</div>
                </div>
                <div className="leaderboard-rating">{p.rating || p.score || 0}</div>
            </div>
        );
    };

    return (
        <div className="leaderboard">
            <div className="leaderboard-title">
                <span className="leaderboard-title-icon">🏆</span> Лидеры
            </div>
            <div className="leaderboard-content">
                {loading ? (
                    <div className="leaderboard-center-state"><div className="leaderboard-loading-spinner" /></div>
                ) : leaders.length === 0 ? (
                    <div className="leaderboard-center-state">Пока нет данных</div>
                ) : (
                    <div className="leaderboard-scroll">{leaders.map(renderItem)}</div>
                )}
            </div>
        </div>
    );
}

/* ── season bar ── */
var TOURNAMENTS = [
    { id: 1, title: "Digital Bunny Cup", endDate: "2025-08-01T18:00:00Z", progress: 0.62, status: "active" },
    { id: 2, title: "Weekly Clash", endDate: "2025-07-21T18:00:00Z", progress: 0.3, status: "upcoming" },
    { id: 3, title: "Season Finale", endDate: "2025-09-01T00:00:00Z", progress: 0.1, status: "upcoming" },
];

function SeasonBar({ onGoTournament }) {
    var [idx, setIdx] = useState(0);
    var t = TOURNAMENTS[idx];
    useEffect(function () {
        var id = setInterval(function () { setIdx(function (i) { return (i + 1) % TOURNAMENTS.length; }); }, 4000);
        return function () { clearInterval(id); };
    }, []);
    return (
        <div className="season-bar" style={{ cursor: "pointer" }} onClick={onGoTournament}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="season-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {t.status === "active" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4eff91", display: "inline-block", boxShadow: "0 0 6px #4eff91", flexShrink: 0 }} />}
                    {t.title}
                </div>
                <CountdownBadge targetDate={t.endDate} />
            </div>
            <div className="season-right">
                <div style={{ display: "flex", gap: 5 }}>
                    {TOURNAMENTS.map(function (_, i) {
                        return <div key={i} onClick={function (e) { e.stopPropagation(); setIdx(i); }} style={{
                            width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
                            background: i === idx ? "#78c8ff" : "rgba(255,255,255,.25)",
                            transition: "width .3s, background .3s", cursor: "pointer",
                        }} />;
                    })}
                </div>
                <div className="season-progress">
                    <div className="season-progress-fill" style={{ width: Math.round(t.progress * 100) + "%" }} />
                </div>
            </div>
        </div>
    );
}

/* ── tournament page ── */
function TournamentPage() {
    var tournaments = [
        { id: 1, title: "Digital Bunny Cup", status: "active", players: 32, maxPlayers: 64, prize: "5 NFT", endDate: "2025-08-01T18:00:00Z" },
        { id: 2, title: "Weekly Clash", status: "upcoming", players: 0, maxPlayers: 32, prize: "3 NFT", endDate: "2025-07-21T18:00:00Z" },
        { id: 3, title: "Season Finale", status: "upcoming", players: 0, maxPlayers: 128, prize: "20 NFT", endDate: "2025-09-01T00:00:00Z" },
    ];
    var statusLabel = { active: "LIVE", upcoming: "Скоро", ended: "Завершён" };
    var statusCls = { active: "live", upcoming: "upcoming", ended: "ended" };
    return (
        <div className="tournament-page">
            <div className="tournament-header">
                <div className="tournament-title"><span className="tournament-title-icon">🏟️</span> Турниры</div>
                <div className="tournament-subtitle">Участвуй и выигрывай NFT</div>
            </div>
            <div className="tournament-list">
                {tournaments.map(function (t, i) {
                    var isActive = t.status === "active";
                    return (
                        <div key={t.id} className={"tournament-card " + t.status} style={{ animationDelay: (i * 0.1) + "s" }}>
                            <div className="tournament-card-header">
                                <div className="tournament-card-title">{t.title}</div>
                                <div className={"tournament-card-badge " + statusCls[t.status]}>{statusLabel[t.status]}</div>
                            </div>
                            <div className="tournament-card-info">
                                <div className="tournament-card-stat"><div className="tournament-card-stat-value">{t.players}/{t.maxPlayers}</div><div className="tournament-card-stat-label">Игроки</div></div>
                                <div className="tournament-card-stat"><div className="tournament-card-stat-value">1v1</div><div className="tournament-card-stat-label">Формат</div></div>
                                <div className="tournament-card-stat"><div className="tournament-card-stat-value"><CountdownBadge targetDate={t.endDate} /></div><div className="tournament-card-stat-label">До конца</div></div>
                            </div>
                            <div className="tournament-card-prize"><span className="tournament-card-prize-icon">🎁</span><span className="tournament-card-prize-value">{t.prize}</span><span className="tournament-card-prize-label">Приз</span></div>
                            <button className={"tournament-join-btn " + (isActive ? "active" : "upcoming")} disabled={!isActive}
                                onClick={function () { if (isActive) alert("Турнирный режим скоро будет доступен!"); }}>
                                {isActive ? "Участвовать" : "Скоро"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ── rotate gate — игра (нужен горизонт) ── */
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

/* ── rotate gate — меню (нужна вертикаль) ── */
function RotateGateMenu() {
    return (
        <div className="rotate-gate" style={{ zIndex: 99999 }}>
            <div className="rotate-gate-box">
                <div className="rotate-title">Поверни телефон</div>
                <div className="rotate-subtitle">Меню работает только в вертикальном режиме</div>
                <div className="rotate-phone" style={{
                    transform: "rotate(90deg)",
                    animation: "phoneWiggle 1.4s ease-in-out infinite",
                }} />
            </div>
        </div>
    );
}

/* ── app content ── */
function AppContent() {
    var [screen, setScreen] = useState("home");
    var isLandscape = useIsLandscape();
    var [token, setToken] = useState(null);
    var [me, setMe] = useState(null);
    var [playerDeck, setPlayerDeck] = useState(null);
    var [gameMode, setGameMode] = useState("ai");
    var [stage2MatchId, setStage2MatchId] = useState("");
    var logoRef = useRef(null);
    var [logoOk, setLogoOk] = useState(true);
    var bottomStackRef = useRef(null);
    var [authState, setAuthState] = useState({ status: "idle", error: "" });

    useEffect(function () {
        var t = getStoredToken();
        if (t) { setToken(t); setAuthState(function (s) { return s.status === "idle" ? { status: "ok", error: "" } : s; }); }
    }, []);

    useEffect(function () {
        var tg = window.Telegram?.WebApp;
        if (!tg) { setMe(null); return; }
        tg.ready(); tg.expand();
        try { tg.setHeaderColor?.("#000000"); } catch (_) { }
        try { tg.setBackgroundColor?.("#000000"); } catch (_) { }
        try { tg.setBottomBarColor?.("#000000"); } catch (_) { }
        try { tg.MainButton?.hide(); } catch (_) { }
        try { tg.SecondaryButton?.hide(); } catch (_) { }
        try { tg.BackButton?.hide(); } catch (_) { }
        setMe(readTelegramUser());

        (async function () {
            try {
                setAuthState({ status: "loading", error: "" });
                var initData = tg.initData || "";
                if (!initData) {
                    var stored = getStoredToken();
                    if (stored) { setToken(stored); setAuthState({ status: "ok", error: "" }); return; }
                    setAuthState({ status: "err", error: "tg.initData is empty" }); return;
                }
                var r = await apiFetch("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData: initData }) });
                var accessToken = r?.accessToken || r?.access_token || r?.token || null;
                setToken(accessToken);
                try { if (accessToken) { localStorage.setItem("token", accessToken); localStorage.setItem("accessToken", accessToken); localStorage.setItem("access_token", accessToken); } } catch (_) { }
                setAuthState(accessToken ? { status: "ok", error: "" } : { status: "err", error: "No accessToken" });
            } catch (e) { setAuthState({ status: "err", error: String(e?.message || e) }); }
        })();

        try { tg.disableVerticalSwipes?.(); } catch (_) { }
        return function () { try { window.Telegram?.WebApp?.enableVerticalSwipes?.(); } catch (_) { } };
    }, []);

    useLayoutEffect(function () {
        var el = bottomStackRef.current;
        if (!el) return;
        var apply = function () { document.documentElement.style.setProperty("--bottom-stack-h", Math.ceil(el.getBoundingClientRect().height) + "px"); };
        apply();
        var ro = new ResizeObserver(apply); ro.observe(el);
        return function () { ro.disconnect(); };
    }, [screen]);

    useEffect(function () { if (screen === "home") try { logoRef.current?.play?.(); } catch (_) { } }, [screen]);

    var requestFullscreen = async function () {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light"); } catch (_) { }
        try { window.Telegram?.WebApp?.requestFullscreen?.(); } catch (_) { }
        try { window.Telegram?.WebApp?.expand?.(); } catch (_) { }
        try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen?.(); } catch (_) { }
    };

    var onPlay = function () { requestFullscreen(); setScreen("inventory"); };
    var onDeckReady = function (selectedNfts) {
        if (Array.isArray(selectedNfts) && selectedNfts.length === 5) setPlayerDeck(selectedNfts);
        setScreen("matchmaking");
    };
    var onExitGame = function () { setScreen("home"); setPlayerDeck(null); setStage2MatchId(""); setGameMode("ai"); };

    /* игра требует горизонталь */
    var showRotate = screen === "game" && !isLandscape;
    /* меню требует вертикаль */
    var showRotateMenu = screen !== "game" && isLandscape;

    /* ── GAME SCREEN ── */
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

    /* ── MAIN SHELL ── */
    return (
        <div className="shell">
            <StormBg />

            {/* меню только вертикаль */}
            {showRotateMenu && <RotateGateMenu />}

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        <div className="home-wallet-row">
                            <WalletConnector />
                        </div>
                        <div className="home-logo-area">
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
                        <div className="home-bottom-area">
                            <Leaderboard token={token} />
                        </div>
                    </div>
                )}

                {screen === "matchmaking" && (
                    <Matchmaking me={me} playerDeck={playerDeck}
                        onBack={function () { setScreen("inventory"); }}
                        onMatched={async function (data) {
                            setGameMode(data.mode || "ai");
                            setStage2MatchId(data.matchId || "");
                            if (!playerDeck || playerDeck.length !== 5) {
                                try {
                                    var t = token || getStoredToken();
                                    var deckRes = await apiFetch("/api/decks/active/full", { token: t });
                                    if (deckRes?.cards?.length === 5) { setPlayerDeck(deckRes.cards); }
                                    else { alert("Колода не выбрана. Вернись в инвентарь."); setScreen("inventory"); return; }
                                } catch (_) { alert("Колода не выбрана. Вернись в инвентарь."); setScreen("inventory"); return; }
                            }
                            setScreen("game");
                        }}
                    />
                )}

                {screen === "market" && <Market />}
                {screen === "inventory" && <Inventory token={token || getStoredToken()} onDeckReady={onDeckReady} />}
                {screen === "profile" && <Profile token={token || getStoredToken()} me={me} />}
                {screen === "tournament" && <TournamentPage />}
            </div>

            <div className="bottom-stack" ref={bottomStackRef}>
                {screen === "home" && <SeasonBar onGoTournament={function () { setScreen("tournament"); }} />}
                <BottomNav active={screen} onChange={setScreen} />
            </div>
        </div>
    );
}

export default function App() {
    return <WalletConnectProvider><AppContent /></WalletConnectProvider>;
}

function BottomNav({ active, onChange }) {
    var items = [
        { key: "home", label: "Главная", icon: <HomeIcon /> },
        { key: "tournament", label: "Турнир", icon: <TrophyIcon /> },
        { key: "market", label: "Маркет", icon: <GemIcon /> },
        { key: "inventory", label: "Колода", icon: <BagIcon /> },
        { key: "profile", label: "Профиль", icon: <UserIcon /> },
    ];
    return (
        <div className="bottom-nav" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {items.map(function (it) {
                return (
                    <button key={it.key} className={"nav-item" + (active === it.key ? " active" : "")} onClick={function () { onChange(it.key); }}>
                        <span className="nav-ic">{it.icon}</span>
                        <span className="nav-txt">{it.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

function PlayIcon() { return <svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" /></svg>; }
function HomeIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z" stroke="white" strokeWidth="2" opacity="0.9" /></svg>; }
function TrophyIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M8 21h8M12 17v4M5 3H3v5a4 4 0 0 0 4 4M19 3h2v5a4 4 0 0 1-4 4M7 3h10v6a5 5 0 0 1-10 0V3Z" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" /></svg>; }
function GemIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 9l9 13 9-13-9-7Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M3 9h18" stroke="white" strokeWidth="2" opacity="0.6" /></svg>; }
function BagIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 8h12l-1 13H7L6 8Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M9 8a3 3 0 0 1 6 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" /></svg>; }
function UserIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" stroke="white" strokeWidth="2" opacity="0.9" /><path d="M4 20a8 8 0 0 1 16 0" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9" /></svg>; }