import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";
import { apiFetch } from "./api.js";
import Inventory from "./pages/Inventory";
import Profile from "./pages/Profile";
import Market from "./pages/Market";
import WalletConnector from "./components/MultiChainWallet/WalletConnector";
import Matchmaking from "./components/Stage2/Matchmaking";
import WalletConnectProvider from "./context/WalletConnectContext";

function useIsMobile() {
    var check = function () {
        if (typeof window === "undefined") return false;
        var ua = navigator.userAgent || "";
        var mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
        var touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
        var narrow = window.innerWidth <= 1024;
        return mobile || (touch && narrow);
    };
    var [isMobile, setIsMobile] = useState(check);
    useEffect(function () {
        var onChange = function () { setIsMobile(check()); };
        window.addEventListener("resize", onChange);
        return function () { window.removeEventListener("resize", onChange); };
    }, []);
    return isMobile;
}

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

function Leaderboard({ token }) {
    var [leaders, setLeaders] = useState([]);
    var [loading, setLoading] = useState(true);

    useEffect(function () {
        (async function () {
            try {
                var t = token || getStoredToken();
                var res = await apiFetch("/api/matches/leaderboard?limit=10", { token: t });
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

var TOURNAMENTS = [
    {
        id: 1, title: "Digital Bunny Cup", subtitle: "Главный турнир сезона",
        status: "soon", players: 0, maxPlayers: 0, prize: "N/A USDT",
        prizePool: ["N/A USDT", "N/A USDT", "N/A USDT"], format: "1v1 Single Elimination",
        avatar: "https://bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e.ipfs.w3s.link/326.png",
        gradient: ["#667eea", "#764ba2"]
    },
    {
        id: 2, title: "Weekly Clash", subtitle: "Еженедельные битвы",
        status: "soon", players: 0, maxPlayers: 0, prize: "N/A NEAR",
        prizePool: ["N/A NEAR", "N/A NEAR", "N/A NEAR"], format: "1v1 Best of 3",
        avatar: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&h=200&fit=crop",
        gradient: ["#f093fb", "#f5576c"]
    },
    {
        id: 3, title: "Season Finale", subtitle: "Финал сезона",
        status: "soon", players: 0, maxPlayers: 0, prize: "N/A NFT + N/A USDT",
        prizePool: ["N/A USDT + N/A NFT", "N/A USDT + N/A NFT", "N/A USDT + N/A NFT"],
        format: "1v1 Double Elimination",
        avatar: "https://avatars.mds.yandex.net/i?id=a9714c12aca31ffe8e80d0238892dc19_l-6607472-images-thumbs&n=13",
        gradient: ["#4facfe", "#00f2fe"]
    }
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
            <div className="season-bar-avatar" style={{ background: "linear-gradient(135deg, " + t.gradient[0] + ", " + t.gradient[1] + ")" }}>
                <img src={t.avatar} alt={t.title} onError={function (e) { e.target.style.display = "none"; }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div className="season-title">{t.title}</div>
                <div className="season-sub">{t.subtitle}</div>
            </div>
            <div className="season-right">
                <div className="season-soon-badge">SOON</div>
                <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                    {TOURNAMENTS.map(function (_, i) {
                        return <div key={i} onClick={function (e) { e.stopPropagation(); setIdx(i); }} style={{
                            width: i === idx ? 16 : 6, height: 6, borderRadius: 3,
                            background: i === idx ? "#78c8ff" : "rgba(255,255,255,.25)",
                            transition: "width .3s, background .3s", cursor: "pointer",
                        }} />;
                    })}
                </div>
            </div>
        </div>
    );
}

function TournamentPage() {
    var [expandedId, setExpandedId] = useState(null);
    return (
        <div className="tournament-page-v2">
            <div className="tournament-header">
                <h2 className="tournament-title">
                    <span className="tournament-title-icon">🏆</span>Турниры
                </h2>
                <div className="tournament-subtitle">Участвуй в турнирах и выигрывай призы</div>
            </div>
            <div className="tournament-stats-row">
                <div className="tournament-stat-chip"><span className="stat-chip-icon">🎮</span><span>{TOURNAMENTS.length} турнира</span></div>
                <div className="tournament-stat-chip"><span className="stat-chip-icon">💎</span><span>Много призов</span></div>
            </div>
            <div className="tournament-list-v2">
                {TOURNAMENTS.map(function (t, i) {
                    var isExpanded = expandedId === t.id;
                    return (
                        <div key={t.id} className={"tournament-card-v2" + (isExpanded ? " expanded" : "")}
                            style={{ animationDelay: (i * 0.1) + "s" }}
                            onClick={function () { setExpandedId(isExpanded ? null : t.id); }}>
                            <div className="tournament-card-glow" style={{ background: "linear-gradient(135deg, " + t.gradient[0] + "40, " + t.gradient[1] + "40)" }} />
                            <div className="tournament-card-main">
                                <div className="tournament-avatar-wrap">
                                    <div className="tournament-avatar-ring" style={{ background: "linear-gradient(135deg, " + t.gradient[0] + ", " + t.gradient[1] + ")" }}>
                                        <div className="tournament-avatar">
                                            <img src={t.avatar} alt={t.title} onError={function (e) { e.target.src = "https://via.placeholder.com/80"; }} />
                                        </div>
                                    </div>
                                    <div className="tournament-avatar-badge">SOON</div>
                                </div>
                                <div className="tournament-card-info">
                                    <div className="tournament-card-title-row"><h3>{t.title}</h3></div>
                                    <p className="tournament-card-subtitle">{t.subtitle}</p>
                                    <div className="tournament-quick-stats">
                                        <div className="quick-stat"><span className="quick-stat-icon">👥</span><span>{t.players}/{t.maxPlayers}</span></div>
                                        <div className="quick-stat"><span className="quick-stat-icon">🎯</span><span>{t.format.split(" ")[0]}</span></div>
                                        <div className="quick-stat prize"><span className="quick-stat-icon">💰</span><span>{t.prize}</span></div>
                                    </div>
                                </div>
                                <div className={"tournament-expand-arrow" + (isExpanded ? " rotated" : "")}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                        <path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" />
                                    </svg>
                                </div>
                            </div>
                            {isExpanded && (
                                <div className="tournament-expanded">
                                    <div className="tournament-divider" />
                                    <div className="tournament-prize-section">
                                        <div className="prize-section-title">Призовой фонд</div>
                                        <div className="prize-places">
                                            {t.prizePool.map(function (prize, pi) {
                                                return (
                                                    <div key={pi} className={"prize-place place-" + (pi + 1)}>
                                                        <span className="place-icon">{["🥇", "🥈", "🥉"][pi]}</span>
                                                        <span className="place-prize">{prize}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div className="tournament-format-section">
                                        <div className="format-item">
                                            <span className="format-icon">📋</span>
                                            <span className="format-label">Формат:</span>
                                            <span className="format-value">{t.format}</span>
                                        </div>
                                        <div className="format-item">
                                            <span className="format-icon">👥</span>
                                            <span className="format-label">Участники:</span>
                                            <span className="format-value">до {t.maxPlayers} игроков</span>
                                        </div>
                                    </div>
                                    <button className="tournament-action-btn"
                                        style={{ background: "linear-gradient(135deg, " + t.gradient[0] + ", " + t.gradient[1] + ")" }}
                                        onClick={function (e) { e.stopPropagation(); alert("Регистрация скоро откроется!"); }}>
                                        <span className="btn-icon">🔔</span>
                                        <span>Уведомить о старте</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="tournament-bottom-info">
                <div className="bottom-info-icon">💡</div>
                <div className="bottom-info-text">Нажми на турнир, чтобы узнать подробности</div>
            </div>
        </div>
    );
}

function RotateGateGame({ onBack }) {
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

function RotateGateMenu() {
    return (
        <div className="rotate-gate" style={{ zIndex: 99999 }}>
            <div className="rotate-gate-box">
                <div className="rotate-title">Поверни телефон</div>
                <div className="rotate-subtitle">Меню работает только в вертикальном режиме</div>
                <div className="rotate-phone" style={{ transform: "rotate(90deg)", animation: "phoneWiggle 1.4s ease-in-out infinite" }} />
            </div>
        </div>
    );
}

function AppContent() {
    var [screen, setScreen] = useState("home");
    var isLandscape = useIsLandscape();
    var isMobile = useIsMobile();
    var [token, setToken] = useState(null);
    var [me, setMe] = useState(null);
    var [playerDeck, setPlayerDeck] = useState(null);
    var [gameMode, setGameMode] = useState("ai");
    var [stage2MatchId, setStage2MatchId] = useState("");
    var logoRef = useRef(null);
    var [logoOk, setLogoOk] = useState(true);
    var bottomStackRef = useRef(null);
    var [authState, setAuthState] = useState({ status: "idle", error: "" });

    // State для активного матча
    var [activeMatch, setActiveMatch] = useState(null);
    var [activeMatchLoading, setActiveMatchLoading] = useState(false);
    // Ref чтобы не делать двойные запросы
    var activeMatchFetchingRef = useRef(false);

    // PATCH: Функция проверки активного матча вынесена в useCallback
    // чтобы можно было вызывать и при mount, и при возврате на home
    var checkActiveMatch = useCallback(async function () {
        var t = token || getStoredToken();
        if (!t) return;
        if (activeMatchFetchingRef.current) return;
        activeMatchFetchingRef.current = true;
        try {
            var data = await apiFetch("/api/matches/active", { token: t });
            if (data && data.match_id && data.status !== "cancelled") {
                setActiveMatch(data);
            } else {
                setActiveMatch(null);
            }
        } catch (e) {
            // 404 — нет активного матча, это норма
            setActiveMatch(null);
        } finally {
            activeMatchFetchingRef.current = false;
        }
    }, [token]);

    // PATCH: Проверяем активный матч при получении токена
    useEffect(function () {
        if (!token) return;
        checkActiveMatch();
    }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

    // PATCH: Проверяем активный матч при КАЖДОМ возврате на home
    // (не только при первом рендере с токеном)
    useEffect(function () {
        if (screen === "home") {
            checkActiveMatch();
        }
    }, [screen]); // eslint-disable-line react-hooks/exhaustive-deps

    // PATCH: Также слушаем visibilitychange — когда пользователь
    // возвращается из кошелька (мобильный deep-link redirect)
    useEffect(function () {
        var onVisible = function () {
            if (document.visibilityState === "visible" && screen === "home") {
                console.warn("[App] visibilitychange → visible, checking active match");
                checkActiveMatch();
            }
        };
        document.addEventListener("visibilitychange", onVisible);
        return function () { document.removeEventListener("visibilitychange", onVisible); };
    }, [screen, checkActiveMatch]);

    useEffect(function () {
        var t = getStoredToken();
        if (t) {
            setToken(t);
            setAuthState(function (s) { return s.status === "idle" ? { status: "ok", error: "" } : s; });
        }
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
                var r = await apiFetch("/api/auth/telegram", {
                    method: "POST",
                    body: JSON.stringify({ initData: initData }),
                });
                var accessToken = r?.accessToken || r?.access_token || r?.token || null;
                setToken(accessToken);
                try {
                    if (accessToken) {
                        localStorage.setItem("token", accessToken);
                        localStorage.setItem("accessToken", accessToken);
                        localStorage.setItem("access_token", accessToken);
                    }
                } catch (_) { }
                setAuthState(accessToken ? { status: "ok", error: "" } : { status: "err", error: "No accessToken" });
            } catch (e) {
                setAuthState({ status: "err", error: String(e?.message || e) });
            }
        })();

        try { tg.disableVerticalSwipes?.(); } catch (_) { }
        return function () { try { window.Telegram?.WebApp?.enableVerticalSwipes?.(); } catch (_) { } };
    }, []);

    useLayoutEffect(function () {
        var el = bottomStackRef.current;
        if (!el) return;
        var apply = function () {
            document.documentElement.style.setProperty(
                "--bottom-stack-h",
                Math.ceil(el.getBoundingClientRect().height) + "px"
            );
        };
        apply();
        var ro = new ResizeObserver(apply);
        ro.observe(el);
        return function () { ro.disconnect(); };
    }, [screen]);

    useEffect(function () {
        if (screen === "home") try { logoRef.current?.play?.(); } catch (_) { }
    }, [screen]);

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

    var onExitGame = function () {
        setScreen("home");
        setPlayerDeck(null);
        setStage2MatchId("");
        setGameMode("ai");
        // PATCH: После выхода из игры сразу проверяем — вдруг матч ещё активен
        // (например игрок вышел случайно через кнопку back)
        // Небольшая задержка чтобы screen успел смениться
        setTimeout(function () { checkActiveMatch(); }, 300);
    };

    var showRotateGame = isMobile && screen === "game" && !isLandscape;
    var showRotateMenu = isMobile && screen !== "game" && isLandscape;

    if (screen === "game") {
        return (
            <div className="shell">
                <StormBg />
                <div className={"game-host" + (showRotateGame ? " is-hidden" : "")}>
                    {playerDeck && playerDeck.length === 5 ? (
                        <Game
                            onExit={onExitGame}
                            me={me}
                            playerDeck={playerDeck}
                            matchId={stage2MatchId}
                            mode={gameMode}
                        />
                    ) : (
                        <div style={{ color: "#fff", padding: 20 }}>Loading deck...</div>
                    )}
                </div>
                {showRotateGame && <RotateGateGame onBack={onExitGame} />}
            </div>
        );
    }

    return (
        <div className="shell">
            <StormBg />
            {showRotateMenu && <RotateGateMenu />}

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        <div className="home-wallet-row"><WalletConnector /></div>

                        {/* Баннер активного матча */}
                        {activeMatch && (
                            <div style={{
                                margin: "8px 16px 0",
                                padding: "14px 16px",
                                background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(255,140,0,0.15))",
                                border: "1px solid rgba(255,215,0,0.5)",
                                borderRadius: 14,
                                display: "flex",
                                flexDirection: "column",
                                gap: 8,
                            }}>
                                <div style={{
                                    fontSize: 14, fontWeight: 700, color: "#ffd700",
                                    display: "flex", alignItems: "center", gap: 8
                                }}>
                                    ⚔️ У тебя есть активный матч!
                                </div>
                                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                                    {activeMatch.escrow_locked
                                        ? "NFT залочены — матч идёт"
                                        : activeMatch.my_escrow_confirmed
                                            ? "Твои NFT залочены, ждём оппонента"
                                            : "NFT ещё не залочены"
                                    }
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                                    {/* PATCH: "Вернуться в игру" — только если escrow_locked */}
                                    {activeMatch.escrow_locked && (
                                        <button
                                            onClick={async function () {
                                                setActiveMatchLoading(true);
                                                try {
                                                    var t = token || getStoredToken();
                                                    // PATCH: Получаем полные данные матча чтобы взять деки
                                                    var matchFull = await apiFetch(
                                                        "/api/matches/" + activeMatch.match_id,
                                                        { token: t }
                                                    );
                                                    // Пробуем получить колоду из матча или из decks API
                                                    var deck = null;
                                                    if (matchFull) {
                                                        var myId = String(me?.id || "");
                                                        var isP1 = String(matchFull.player1_id) === myId;
                                                        var deckField = isP1 ? matchFull.player1_deck : matchFull.player2_deck;
                                                        if (Array.isArray(deckField) && deckField.length === 5) {
                                                            deck = deckField;
                                                        }
                                                    }
                                                    // Fallback: decks API
                                                    if (!deck || deck.length !== 5) {
                                                        try {
                                                            var deckRes = await apiFetch("/api/decks/active/full", { token: t });
                                                            if (deckRes?.cards?.length === 5) {
                                                                deck = deckRes.cards;
                                                            }
                                                        } catch (_) { }
                                                    }
                                                    if (!deck || deck.length !== 5) {
                                                        alert("Не удалось восстановить колоду. Попробуй ещё раз.");
                                                        return;
                                                    }
                                                    setPlayerDeck(deck);
                                                    setGameMode("pvp");
                                                    setStage2MatchId(activeMatch.match_id);
                                                    setActiveMatch(null);
                                                    setScreen("game");
                                                } catch (e) {
                                                    alert("Ошибка восстановления матча: " + (e?.message || e));
                                                } finally {
                                                    setActiveMatchLoading(false);
                                                }
                                            }}
                                            disabled={activeMatchLoading}
                                            style={{
                                                flex: 1, padding: "10px 16px",
                                                borderRadius: 10, border: "none",
                                                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                                                color: "#000", fontWeight: 900, fontSize: 14,
                                                cursor: "pointer",
                                                opacity: activeMatchLoading ? 0.6 : 1,
                                            }}
                                        >
                                            {activeMatchLoading ? "⏳..." : "🎮 Вернуться в игру"}
                                        </button>
                                    )}
                                    {/* PATCH: Если escrow не залочен — кнопка "Залочить NFT" вместо "Вернуться" */}
                                    {!activeMatch.escrow_locked && activeMatch.my_escrow_confirmed && (
                                        <div style={{
                                            flex: 1, padding: "10px 16px", borderRadius: 10,
                                            background: "rgba(255,255,0,0.1)",
                                            border: "1px solid rgba(255,255,0,0.3)",
                                            color: "#ffd700", fontSize: 13, textAlign: "center",
                                        }}>
                                            ⏳ Ждём оппонента...
                                        </div>
                                    )}
                                    {!activeMatch.escrow_locked && !activeMatch.my_escrow_confirmed && (
                                        <button
                                            onClick={function () {
                                                // Возвращаем в matchmaking для повторного лока
                                                setStage2MatchId(activeMatch.match_id);
                                                setGameMode("pvp");
                                                setScreen("matchmaking");
                                            }}
                                            style={{
                                                flex: 1, padding: "10px 16px",
                                                borderRadius: 10, border: "none",
                                                background: "linear-gradient(135deg, #4facfe, #00f2fe)",
                                                color: "#000", fontWeight: 900, fontSize: 14,
                                                cursor: "pointer",
                                            }}
                                        >
                                            🔒 Залочить NFT
                                        </button>
                                    )}
                                    <button
                                        onClick={async function () {
                                            try {
                                                var t = token || getStoredToken();
                                                await apiFetch(
                                                    "/api/matches/" + activeMatch.match_id + "/cancel",
                                                    { method: "POST", token: t }
                                                );
                                            } catch (e) { /* ignore */ }
                                            setActiveMatch(null);
                                        }}
                                        style={{
                                            padding: "10px 14px", borderRadius: 10,
                                            border: "1px solid rgba(255,100,100,0.4)",
                                            background: "rgba(255,100,100,0.1)",
                                            color: "#ff6b6b", fontSize: 13,
                                            cursor: "pointer",
                                        }}
                                    >
                                        Отменить
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="home-spacer" />
                        <div className="home-logo-area">
                            <button className="play-logo" aria-label="Play" onClick={onPlay}>
                                <div className="logo-wrap">
                                    {logoOk ? (
                                        <video
                                            ref={logoRef}
                                            className="logo-video"
                                            autoPlay loop muted playsInline preload="auto"
                                            onError={function () { setLogoOk(false); }}
                                        >
                                            <source src="/ui/logo.mp4" type="video/mp4" />
                                        </video>
                                    ) : (
                                        <div className="page">Logo</div>
                                    )}
                                </div>
                                <span className="play-icon"><PlayIcon /></span>
                            </button>
                        </div>
                        <div className="home-bottom-area"><Leaderboard token={token} /></div>
                    </div>
                )}

                {screen === "matchmaking" && (
                    <Matchmaking
                        me={me}
                        playerDeck={playerDeck}
                        onBack={function () { setScreen("inventory"); }}
                        onMatched={async function (data) {
                            setGameMode(data.mode || "ai");
                            setStage2MatchId(data.matchId || "");
                            if (!playerDeck || playerDeck.length !== 5) {
                                try {
                                    var t = token || getStoredToken();
                                    var deckRes = await apiFetch("/api/decks/active/full", { token: t });
                                    if (deckRes?.cards?.length === 5) {
                                        setPlayerDeck(deckRes.cards);
                                    } else {
                                        alert("Колода не выбрана. Вернись в инвентарь.");
                                        setScreen("inventory");
                                        return;
                                    }
                                } catch (_) {
                                    alert("Колода не выбрана. Вернись в инвентарь.");
                                    setScreen("inventory");
                                    return;
                                }
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
                    <button
                        key={it.key}
                        className={"nav-item" + (active === it.key ? " active" : "")}
                        onClick={function () { onChange(it.key); }}
                    >
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