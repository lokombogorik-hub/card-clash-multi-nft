import { useEffect, useMemo, useRef, useState } from "react";
import Game from "./Game";

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

        // визуально "прячем" верхнюю шапку Telegram под цвет фона
        tg.setHeaderColor?.("#050611");
        tg.setBackgroundColor?.("#050611");
        tg.setBottomBarColor?.("#050611");

        // убираем стандартные телеграм-кнопки
        tg.MainButton?.hide();
        tg.SecondaryButton?.hide();
        tg.BackButton?.hide();

        tg.disableVerticalSwipes?.();
        return () => tg.enableVerticalSwipes?.();
    }, []);

    // пробуем запустить видео (на iOS иногда требуется жест — мы ещё "пинаем" в onPointerDown)
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
        try {
            await tg?.requestFullscreen?.();
        } catch { }
        try {
            await window.screen?.orientation?.lock?.("landscape");
        } catch { }
    };

    const onPlay = async () => {
        await requestFullscreenAndLandscape();
        if (isLandscape()) setScreen("game");
        else setScreen("rotate");
    };

    // rotate gate: ждём landscape
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
        try {
            window.Telegram?.WebApp?.exitFullscreen?.();
        } catch { }
        setScreen("home");
    };

    if (screen === "game") return <Game onExit={onExitGame} />;

    if (screen === "rotate") {
        return (
            <div className="rotate-gate">
                <MenuStyles />
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
            <MenuStyles />
            <DarkWarpBg />

            <div className="shell-content">
                {screen === "home" && (
                    <div className="home-center">
                        {/* Одна кнопка по центру: кликаешь по play и запускаешь */}
                        <button
                            className="play-stage"
                            onPointerDown={() => logoRef.current?.play?.().catch(() => { })}
                            onClick={onPlay}
                            aria-label="Play"
                        >
                            {/* ЛОГО по центру, статично, увеличено */}
                            <div className="logo-center" aria-hidden="true">
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
                                        <div className="logo-fallback-sub">
                                            Проверь /ui/logo.mp4 и перекодируй в H.264
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Play поверх логотипа */}
                            <span className="play-core">
                                <PlayIcon />
                            </span>
                        </button>
                    </div>
                )}

                {screen === "market" && (
                    <div className="page">
                        <h2>Маркет</h2>
                        <p>Здесь будет магазин/кейсы/NFT.</p>
                    </div>
                )}

                {screen === "profile" && (
                    <div className="page">
                        <h2>Профиль</h2>
                        <p>Здесь будет прогресс, рейтинг, кошельки.</p>
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
                <BottomNav active={screen} onChange={setScreen} />
            </div>
        </div>
    );
}

/* ================= UI ================= */

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

/* ================= BACKGROUND (darker + more dynamic) ================= */

function DarkWarpBg() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

        let w = 0, h = 0, dpr = 1;
        let raf = 0;

        // звезды в 3D (warp)
        const stars = [];
        const STAR_COUNT = 320;

        // туманности (очень темные)
        const blobs = [];
        const blobColors = [
            [24, 231, 255],
            [255, 61, 242],
            [124, 58, 237],
        ];

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.max(1, window.innerWidth);
            h = Math.max(1, window.innerHeight);

            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            stars.length = 0;
            blobs.length = 0;

            // туманности
            const blobCount = 10;
            for (let i = 0; i < blobCount; i++) {
                const c = blobColors[Math.floor(Math.random() * blobColors.length)];
                blobs.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 180 + Math.random() * 320,
                    vx: (Math.random() - 0.5) * 0.08,
                    vy: (Math.random() - 0.5) * 0.08,
                    a: 0.05 + Math.random() * 0.06, // темнее
                    c,
                });
            }

            // звезды (z=depth)
            for (let i = 0; i < STAR_COUNT; i++) {
                stars.push(spawnStar(true));
            }
        };

        const spawnStar = (randomZ = false) => {
            // координаты в "нормализованном" пространстве вокруг центра
            return {
                x: (Math.random() * 2 - 1) * w,
                y: (Math.random() * 2 - 1) * h,
                z: randomZ ? Math.random() * w : w, // depth
                p: Math.random(), // random for brightness
            };
        };

        const drawBlob = (b) => {
            const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
            g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
            g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
        };

        let tick = 0;
        const frame = () => {
            tick++;

            // лёгкий "трейл" для динамики
            ctx.fillStyle = "rgba(5, 6, 17, 0.35)";
            ctx.fillRect(0, 0, w, h);

            // туманности (очень темные, медленные)
            for (const b of blobs) {
                b.x += b.vx;
                b.y += b.vy;
                if (b.x < -b.r) b.x = w + b.r;
                if (b.x > w + b.r) b.x = -b.r;
                if (b.y < -b.r) b.y = h + b.r;
                if (b.y > h + b.r) b.y = -b.r;
                drawBlob(b);
            }

            // warp центр немного выше
            const cx = w * 0.5;
            const cy = h * 0.42;

            // скорость
            const speed = reduceMotion ? 6 : 18;

            for (let i = 0; i < stars.length; i++) {
                const s = stars[i];
                s.z -= speed;

                if (s.z <= 1) {
                    stars[i] = spawnStar(false);
                    continue;
                }

                // перспектива
                const k = 128 / s.z;
                const x = cx + s.x * k;
                const y = cy + s.y * k;

                if (x < -50 || x > w + 50 || y < -50 || y > h + 50) {
                    stars[i] = spawnStar(false);
                    continue;
                }

                // размер и яркость
                const r = (1 - s.z / w) * 2.2 + 0.3;
                const a = 0.10 + (1 - s.z / w) * 0.9;

                // небольшие “стреки”
                const x2 = cx + s.x * (128 / (s.z + speed * 2));
                const y2 = cy + s.y * (128 / (s.z + speed * 2));

                ctx.strokeStyle = `rgba(255,255,255,${a * 0.55})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x2, y2);
                ctx.lineTo(x, y);
                ctx.stroke();

                ctx.fillStyle = `rgba(255,255,255,${a})`;
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }

            raf = requestAnimationFrame(frame);
        };

        resize();

        // старт: заливаем фон полностью один раз (чтобы не было прозрачного)
        ctx.fillStyle = "#050611";
        ctx.fillRect(0, 0, w, h);

        frame();

        window.addEventListener("resize", resize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={ref} className="bg-canvas" aria-hidden="true" />;
}

/* ================= ICONS ================= */

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

/* ================= STYLES ================= */

function MenuStyles() {
    return (
        <style>{`
      .shell{
        position: fixed;
        inset: 0;
        width: 100%;
        height: var(--app-h, 100vh);
        overflow: hidden;
        background: #050611;
        color: #fff;
      }

      .bg-canvas{
        position:absolute;
        inset:0;
        z-index:0;
      }

      .shell-content{
        position: relative;
        z-index: 1;
        height: 100%;
        padding-top: calc(env(safe-area-inset-top, 0px) + 8px);
        padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 120px);
      }

      .home-center{
        height:100%;
        display:grid;
        place-items:center;
      }

      /* Кликабельная зона по центру */
      .play-stage{
        width: min(360px, 80vmin);
        height: min(360px, 80vmin);
        padding: 0;
        border: none;
        background: transparent;
        position: relative;
        display: grid;
        place-items: center;
        cursor: pointer;
      }

      /* Логотип по центру (увеличенный) */
      .logo-center{
        width: min(260px, 64vmin);
        height: min(260px, 64vmin);
        border-radius: 18px;
        overflow: hidden;
        background: rgba(0,0,0,0.20);
        border: 1px solid rgba(255,255,255,0.10);
        backdrop-filter: blur(8px);
        box-shadow: 0 22px 70px rgba(0,0,0,0.60);
      }

      .logo-video{
        width: 100%;
        height: 100%;
        object-fit: contain;
        display: block;
      }

      .logo-fallback{
        width:100%;
        height:100%;
        display:grid;
        place-items:center;
        text-align:center;
        font-size:12px;
        padding:12px;
        color: rgba(255,255,255,0.88);
      }
      .logo-fallback-sub{
        margin-top:6px;
        opacity:0.75;
        font-size:11px;
      }

      /* Play поверх логотипа */
      .play-core{
        position:absolute;
        width: 76px;
        height: 76px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: rgba(0,0,0,0.35);
        border: 1px solid rgba(255,255,255,0.16);
        box-shadow: 0 18px 55px rgba(0,0,0,0.65), 0 0 30px rgba(24,231,255,0.12);
        backdrop-filter: blur(10px);
        pointer-events:none;
      }

      .page{ padding: 18px; }

      .bottom-stack{
        position: absolute;
        left: 0; right: 0;
        bottom: 0;
        z-index: 2;
        padding: 10px 12px calc(env(safe-area-inset-bottom, 0px) + 10px);
        display: grid;
        gap: 10px;
        pointer-events: none;
      }

      .season-bar{
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 14px;
        background: rgba(0,0,0,0.52);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(10px);
      }
      .season-title{ font-weight: 900; font-size: 13px; }
      .season-sub{ opacity: 0.82; font-size: 12px; margin-top: 2px; }
      .season-right{
        margin-left: auto;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .season-progress{
        width: 120px;
        height: 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.10);
        overflow: hidden;
      }
      .season-progress-fill{
        height: 100%;
        background: linear-gradient(90deg, rgba(24,231,255,0.85), rgba(255,61,242,0.65));
      }
      .icon-btn{
        width: 36px;
        height: 32px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(0,0,0,0.40);
        color: #fff;
        padding: 0;
      }

      .bottom-nav{
        pointer-events: auto;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        padding: 10px 10px;
        border-radius: 16px;
        background: rgba(0,0,0,0.60);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(10px);
      }
      .nav-item{
        padding: 8px 8px;
        border-radius: 14px;
        background: transparent;
        border: 1px solid transparent;
        color: rgba(255,255,255,0.78);
        display: grid;
        justify-items: center;
        gap: 6px;
      }
      .nav-ic{ line-height: 0; }
      .nav-txt{ font-size: 11px; font-weight: 800; }
      .nav-item.active{
        color: #fff;
        border-color: rgba(24,231,255,0.28);
        background: rgba(24,231,255,0.10);
      }
      .nav-item.disabled{ opacity: 0.35; }

      .rotate-gate {
        position: fixed;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, 0.75);
        z-index: 30000;
        color: #fff;
      }
      .rotate-gate-box {
        width: min(420px, 92vw);
        background: rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 16px;
        padding: 18px 16px;
        text-align: center;
      }
      .rotate-title { font-weight: 900; font-size: 20px; margin-bottom: 6px; }
      .rotate-subtitle { opacity: 0.85; font-size: 13px; margin-bottom: 14px; }
      .rotate-phone {
        width: 88px;
        height: 140px;
        margin: 0 auto 14px;
        border-radius: 16px;
        border: 2px solid rgba(255,255,255,0.35);
        transform: rotate(-18deg);
        animation: phoneWiggle 1.4s ease-in-out infinite;
      }
      @keyframes phoneWiggle {
        0%,100% { transform: rotate(-18deg); }
        50% { transform: rotate(-6deg); }
      }
    `}</style>
    );
}