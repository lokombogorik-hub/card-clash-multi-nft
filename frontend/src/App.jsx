import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";
import StormBg from "./components/StormBg";

const API = import.meta.env.VITE_API_URL || ""; // например https://your-backend.com

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

async function apiJson(path, { token, method = "GET", body } = {}) {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`API ${method} ${path} failed: ${res.status} ${txt}`);
    }
    return res.json();
}

export default function App() {
    const [screen, setScreen] = useState("home"); // home | market | inventory | profile | game
    const isLandscape = useIsLandscape();

    const logoRef = useRef(null);
    const [logoOk, setLogoOk] = useState(true);

    const [accessToken, setAccessToken] = useState(() => localStorage.getItem("cc_token") || "");
    const [profile, setProfile] = useState(null); // backend user profile

    // wallet button: depends on bottom stack height
    const bottomStackRef = useRef(null);

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

    // Telegram init (colors + hide buttons)
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

    // Telegram login -> JWT -> /users/me
    useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) return;

        const doLogin = async () => {
            const initData = tg.initData || "";
            if (!initData) return; // если пусто — Telegram не дал initData => не WebApp запуск

            try {
                const r = await apiJson("/api/auth/telegram", {
                    method: "POST",
                    body: { initData },
                });

                const token = r.accessToken;
                if (!token) return;

                localStorage.setItem("cc_token", token);
                setAccessToken(token);

                const me = await apiJson("/api/users/me", { token });
                setProfile(me);
            } catch (e) {
                console.error(e);
            }
        };

        // 1 раз сразу + ретраи (иногда initData появляется чуть позже)
        doLogin();
        const t1 = setTimeout(doLogin, 350);
        const t2 = setTimeout(doLogin, 1200);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, []);

    // Если токен уже есть (после перезагрузки) — подгружаем профиль
    useEffect(() => {
        if (!accessToken) return;
        if (profile) return;

        apiJson("/api/users/me", { token: accessToken })
            .then(setProfile)
            .catch((e) => console.error(e));
    }, [accessToken, profile]);

    useEffect(() => {
        if (screen !== "home") return;
        logoRef.current?.play?.().catch(() => { });
    }, [screen]);

    const requestFullscreen = async () => {
        const tg = window.Telegram?.WebApp;
        try { tg?.requestFullscreen?.(); } catch { }
        try { tg?.expand?.(); } catch { }

        try {
            if (!document.fullscreenElement) {
                await document.documentElement.requestFullscreen?.();
            }
        } catch { }
    };

    const onPlay = () => {
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

    if (screen === "game") {
        return (
            <div className="shell">
                <StormBg />

                <div className={`game-host ${showRotate ? "is-hidden" : ""}`}>
                    <Game onExit={onExitGame} profile={profile} />
                </div>

                {showRotate && (
                    <div className="rotate-gate">
                        <div className="rotate-gate-box">
                            <div className="rotate-title">Поверни телефон</div>
                            <div className="rotate-subtitle">Игра работает только в горизонтальном режиме</div>
                            <div className="rotate-phone" />
                            <button onClick={onExitGame}>← Меню</button>
                        </div>
                    </div>
                )}
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
                                <svg width="44" height="44" viewBox="0 0 24 24" fill="none">
                                    <path d="M9 7.5v9l8-4.5-8-4.5Z" fill="white" opacity="0.95" />
                                </svg>
                            </span>
                        </button>
                    </div>
                )}
            </div>

            {/* Плавающая кнопка кошелька (не налезает при повороте) */}
            <div className="wallet-float">
                <button className="wallet-btn" onClick={onConnectWallet}>
                    Подключить кошелёк
                </button>
            </div>

            <div className="bottom-stack" ref={bottomStackRef}>
                <div className="season-bar">
                    <div>
                        <div className="season-title">{seasonInfo.title}</div>
                        <div className="season-sub">{seasonInfo.subtitle}</div>
                    </div>
                    <div className="season-right">
                        <div className="season-progress">
                            <div className="season-progress-fill" style={{ width: `${Math.round(seasonInfo.progress * 100)}%` }} />
                        </div>
                        <button className="icon-btn" aria-label="Refresh">⟳</button>
                    </div>
                </div>

                {/* Тут у тебя уже bottom-nav с иконками из App.jsx (если нужно — вернём отдельно) */}
            </div>
        </div>
    );
}