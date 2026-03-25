import { useEffect, useRef } from "react";

const rand = (a, b) => a + Math.random() * (b - a);

function makeBolt(w, h, isBig) {
    const x0 = rand(w * 0.15, w * 0.85);
    const y0 = rand(-80, -20);
    const x1 = x0 + rand(-w * (isBig ? 0.18 : 0.12), w * (isBig ? 0.18 : 0.12));
    const y1 = rand(h * 0.92, h * 1.15);

    const steps = Math.floor(rand(isBig ? 28 : 18, isBig ? 40 : 28));
    const dx = x1 - x0;
    const dy = y1 - y0;
    const wiggleRange = isBig ? 22 : 14;

    // Используем Float32Array — компактнее, быстрее итерация
    const ptsX = new Float32Array(steps + 1);
    const ptsY = new Float32Array(steps + 1);

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        ptsX[i] = x0 + dx * t + rand(-wiggleRange, wiggleRange) * (0.25 + t);
        ptsY[i] = y0 + dy * t + rand(-10, 10);
    }

    // ветки — тоже typed arrays
    const branchChance = isBig ? 0.7 : 0.45;
    const branchCount = Math.random() < branchChance ? (isBig && Math.random() < 0.7 ? 2 : 1) : 0;
    const branches = [];

    for (let b = 0; b < branchCount; b++) {
        const bi = Math.floor(rand(6, steps + 1 - 8));
        const bl = Math.floor(rand(isBig ? 10 : 6, isBig ? 16 : 10));
        const bx = new Float32Array(bl + 1);
        const by = new Float32Array(bl + 1);
        bx[0] = ptsX[bi];
        by[0] = ptsY[bi];

        const bWiggle = isBig ? 28 : 20;
        for (let k = 1; k <= bl; k++) {
            by[k] = by[k - 1] + rand(14, 26);
            bx[k] = bx[k - 1] + rand(-bWiggle, bWiggle);
        }
        branches.push({ x: bx, y: by, len: bl + 1 });
    }

    return { ptsX, ptsY, ptsLen: steps + 1, branches };
}

// Выносим Path2D-построение — избегаем повторного beginPath/moveTo/lineTo
function buildPath(xArr, yArr, len) {
    const p = new Path2D();
    p.moveTo(xArr[0], yArr[0]);
    for (let i = 1; i < len; i++) p.lineTo(xArr[i], yArr[i]);
    return p;
}

export default function StormBg() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false }); // alpha:false — быстрее композитинг

        const reduceMotion =
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

        let w = 0, h = 0;
        let raf = 0;
        let tick = 0;
        let nextSmallAt = 0;
        let nextBigAt = 0;

        // Пулы — избегаем GC от постоянных push/splice
        const fog = [];
        const bolts = [];
        let boltsCount = 0; // активных молний в массиве

        // Дождь — структура массивов (SoA) вместо массива объектов (AoS)
        let rainX, rainY, rainV, rainLen, rainCount;

        // Кэшированные градиенты тумана — пересоздаём только при resize
        let fogGradients = [];
        // Кэш band gradient
        let bandGrad = null;
        let bandTop = 0;

        const resize = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.max(1, window.innerWidth);
            h = Math.max(1, window.innerHeight);

            canvas.width = (w * dpr) | 0;
            canvas.height = (h * dpr) | 0;
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Туман
            fog.length = 0;
            fogGradients.length = 0;
            const fogCount = Math.min(10, Math.max(6, (w * h) / 140000 | 0));
            for (let i = 0; i < fogCount; i++) {
                fog.push({
                    x: Math.random() * w,
                    y: rand(h * 0.80, h * 1.06),
                    r: rand(180, 380),
                    vx: rand(-0.09, 0.09),
                    vy: rand(-0.05, 0.05),
                    a: rand(0.028, 0.050),
                });
                fogGradients.push(null); // lazy create
            }

            // Band gradient — кэшируем
            bandTop = h * 0.78;
            bandGrad = ctx.createLinearGradient(0, bandTop, 0, h);
            bandGrad.addColorStop(0, "rgba(0,0,0,0)");
            bandGrad.addColorStop(1, "rgba(80,90,110,0.10)");

            // Дождь — SoA
            rainCount = Math.min(220, Math.max(130, (w * h) / 9000 | 0));
            rainX = new Float32Array(rainCount);
            rainY = new Float32Array(rainCount);
            rainV = new Float32Array(rainCount);
            rainLen = new Float32Array(rainCount);
            for (let i = 0; i < rainCount; i++) {
                rainX[i] = Math.random() * w;
                rainY[i] = Math.random() * h;
                rainV[i] = rand(8, 18);
                rainLen[i] = rand(10, 22);
            }

            // Молнии — сброс
            boltsCount = 0;
            tick = 0;
            nextSmallAt = (rand(60, 120)) | 0;
            nextBigAt = (rand(160, 280)) | 0;

            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, w, h);
        };

        const spawn = (isBig) => {
            const obj = {
                isBig,
                bolt: makeBolt(w, h, isBig),
                path: null,       // lazy
                brPaths: null,    // lazy
                life: 0,
                max: isBig ? 26 : 18,
                width: isBig ? rand(2.0, 3.0) : rand(1.0, 1.7),
                flash: isBig ? rand(0.55, 0.80) : rand(0.20, 0.38),
            };

            // Предстроим Path2D один раз
            const b = obj.bolt;
            obj.path = buildPath(b.ptsX, b.ptsY, b.ptsLen);
            obj.brPaths = b.branches.map(br => buildPath(br.x, br.y, br.len));

            if (boltsCount < bolts.length) {
                bolts[boltsCount] = obj;
            } else {
                bolts.push(obj);
            }
            boltsCount++;
            if (boltsCount > 6) boltsCount = 6; // ограничиваем
        };

        const drawBolt = (obj, alpha) => {
            const { path, brPaths, width, isBig } = obj;

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // glow
            ctx.globalAlpha = alpha * 0.55;
            ctx.strokeStyle = "rgba(120,200,255,1)";
            ctx.shadowColor = "rgba(90,170,255,0.95)";
            ctx.shadowBlur = isBig ? 26 : 18;
            ctx.lineWidth = width * (isBig ? 5.6 : 4.6);
            ctx.stroke(path);

            // core
            ctx.shadowBlur = 0;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "rgba(255,255,255,0.96)";
            ctx.lineWidth = width;
            ctx.stroke(path);

            // branches
            if (brPaths.length > 0) {
                ctx.globalAlpha = alpha * 0.42;
                ctx.strokeStyle = "rgba(170,220,255,0.9)";
                ctx.lineWidth = width * 0.9;
                for (let i = 0; i < brPaths.length; i++) {
                    ctx.stroke(brPaths[i]);
                }
            }

            ctx.restore();
        };

        const hLow = () => h * 0.74;
        const hHigh = () => h * 1.12;

        const frame = () => {
            tick++;

            // Чёрный фон с трейлом
            ctx.globalAlpha = 0.30;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, w, h);
            ctx.globalAlpha = 1;

            // Дождь — batch одним beginPath
            ctx.strokeStyle = "rgba(170,210,255,0.12)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < rainCount; i++) {
                rainY[i] += rainV[i];
                rainX[i] += rainV[i] * 0.08;
                if (rainY[i] > h + 40) {
                    rainY[i] = -40;
                    rainX[i] = Math.random() * w;
                }
                if (rainX[i] > w + 40) rainX[i] = -40;

                ctx.moveTo(rainX[i], rainY[i]);
                ctx.lineTo(rainX[i] - 2, rainY[i] - rainLen[i]);
            }
            ctx.stroke();

            // Полоса тумана снизу — кэшированный градиент
            ctx.fillStyle = bandGrad;
            ctx.fillRect(0, bandTop, w, h - bandTop);

            // Туманные круги
            const hL = hLow();
            const hH = hHigh();
            for (let i = 0; i < fog.length; i++) {
                const f = fog[i];
                f.x += f.vx;
                f.y += f.vy;

                // wrap
                if (f.x < -f.r) f.x = w + f.r;
                else if (f.x > w + f.r) f.x = -f.r;
                if (f.y < hL) f.y = h * 1.06;
                else if (f.y > hH) f.y = h * 0.80;

                // Градиент пересоздаём (зависит от x,y,r — нельзя кэшировать позиционно)
                const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                g.addColorStop(0, `rgba(85,95,115,${f.a})`);
                g.addColorStop(1, "rgba(85,95,115,0)");
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, 6.2831853); // 2π без Math.PI
                ctx.fill();
            }

            // Молнии — спавн
            if (!reduceMotion) {
                if (tick >= nextSmallAt) {
                    nextSmallAt = tick + (rand(70, 140) | 0);
                    spawn(false);
                    if (Math.random() < 0.25) spawn(false);
                }
                if (tick >= nextBigAt) {
                    nextBigAt = tick + (rand(170, 300) | 0);
                    spawn(true);
                }
            }

            // Отрисовка молний + вспышка
            let flash = 0;
            let writeIdx = 0;
            for (let i = 0; i < boltsCount; i++) {
                const b = bolts[i];
                b.life++;

                const p = b.life / b.max;
                const a = (p < 0.18 ? 1 : 1 - (p - 0.18) / 0.82) * 0.95;

                const f = b.flash * (1 - p);
                if (f > flash) flash = f;

                drawBolt(b, a);

                if (b.life < b.max) {
                    if (writeIdx !== i) bolts[writeIdx] = bolts[i];
                    writeIdx++;
                }
            }
            boltsCount = writeIdx;

            if (flash > 0.01) {
                ctx.fillStyle = `rgba(220,240,255,${flash * 0.32})`;
                ctx.fillRect(0, 0, w, h);
            }

            raf = requestAnimationFrame(frame);
        };

        resize();
        raf = requestAnimationFrame(frame);
        window.addEventListener("resize", resize);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={ref} className="storm-bg" aria-hidden="true" />;
}