import { useEffect, useRef } from "react";

const rand = (a, b) => a + Math.random() * (b - a);

function makeBolt(w, h, kind) {
    const isBig = kind === "big";

    const x0 = rand(w * 0.15, w * 0.85);
    const y0 = rand(-80, -20);           // выше экрана
    const x1 = x0 + rand(-w * (isBig ? 0.18 : 0.12), w * (isBig ? 0.18 : 0.12));
    const y1 = rand(h * 0.92, h * 1.15); // ниже экрана => “через весь экран”

    const pts = [];
    const steps = Math.floor(rand(isBig ? 28 : 18, isBig ? 40 : 28));

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wiggleX = rand(isBig ? -22 : -14, isBig ? 22 : 14) * (0.25 + t);
        const wiggleY = rand(-10, 10);

        pts.push({
            x: x0 + (x1 - x0) * t + wiggleX,
            y: y0 + (y1 - y0) * t + wiggleY,
        });
    }

    // ветки
    const branches = [];
    const branchCount = isBig ? (Math.random() < 0.7 ? 2 : 1) : (Math.random() < 0.45 ? 1 : 0);

    for (let b = 0; b < branchCount; b++) {
        const bi = Math.floor(rand(6, pts.length - 8));
        const bp = pts[bi];

        const bpts = [{ x: bp.x, y: bp.y }];
        let bx = bp.x;
        let by = bp.y;

        const bl = Math.floor(rand(isBig ? 10 : 6, isBig ? 16 : 10));
        for (let k = 0; k < bl; k++) {
            by += rand(14, 26);
            bx += rand(isBig ? -28 : -20, isBig ? 28 : 20);
            bpts.push({ x: bx, y: by });
        }
        branches.push(bpts);
    }

    return { pts, branches };
}

export default function StormBg() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const reduceMotion =
            window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

        let w = 0, h = 0, dpr = 1;

        const fog = [];
        const bolts = [];
        const rain = [];

        let raf = 0;
        let tick = 0;

        let nextSmallAt = 0;
        let nextBigAt = 0;

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.max(1, window.innerWidth);
            h = Math.max(1, window.innerHeight);

            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            fog.length = 0;
            bolts.length = 0;
            rain.length = 0;

            // туман снизу: меньше по высоте, но движется
            const fogCount = Math.round(Math.min(10, Math.max(6, (w * h) / 140000)));
            for (let i = 0; i < fogCount; i++) {
                fog.push({
                    x: Math.random() * w,
                    y: rand(h * 0.80, h * 1.06),
                    r: rand(180, 380),
                    vx: rand(-0.09, 0.09),
                    vy: rand(-0.05, 0.05),
                    a: rand(0.028, 0.050),
                });
            }

            // дождь
            const dropCount = Math.round(Math.min(220, Math.max(130, (w * h) / 9000)));
            for (let i = 0; i < dropCount; i++) {
                rain.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    v: rand(8, 18),
                    len: rand(10, 22),
                    a: rand(0.08, 0.18),
                });
            }

            tick = 0;

            // молнии медленнее/реже
            nextSmallAt = Math.floor(rand(60, 120));
            nextBigAt = Math.floor(rand(160, 280));

            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, w, h);
        };

        const wrapFog = (f) => {
            if (f.x < -f.r) f.x = w + f.r;
            if (f.x > w + f.r) f.x = -f.r;

            // держим область тумана снизу
            if (f.y < h * 0.74) f.y = h * 1.06;
            if (f.y > h * 1.12) f.y = h * 0.80;
        };

        const spawn = (kind) => {
            const isBig = kind === "big";
            bolts.push({
                kind,
                bolt: makeBolt(w, h, kind),
                life: 0,
                max: isBig ? 26 : 18,              // живет чуть дольше => “медленнее”
                width: isBig ? rand(2.0, 3.0) : rand(1.0, 1.7),
                flash: isBig ? rand(0.55, 0.80) : rand(0.20, 0.38),
            });

            // ограничиваем число активных
            if (bolts.length > 6) bolts.splice(0, bolts.length - 6);
        };

        const drawBolt = (obj, alpha) => {
            const { bolt, width } = obj;

            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // glow
            ctx.globalAlpha = alpha * 0.55;
            ctx.strokeStyle = "rgba(120,200,255,1)";
            ctx.shadowColor = "rgba(90,170,255,0.95)";
            ctx.shadowBlur = obj.kind === "big" ? 26 : 18;
            ctx.lineWidth = width * (obj.kind === "big" ? 5.6 : 4.6);

            ctx.beginPath();
            ctx.moveTo(bolt.pts[0].x, bolt.pts[0].y);
            for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i].x, bolt.pts[i].y);
            ctx.stroke();

            // core
            ctx.shadowBlur = 0;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "rgba(255,255,255,0.96)";
            ctx.lineWidth = width;

            ctx.beginPath();
            ctx.moveTo(bolt.pts[0].x, bolt.pts[0].y);
            for (let i = 1; i < bolt.pts.length; i++) ctx.lineTo(bolt.pts[i].x, bolt.pts[i].y);
            ctx.stroke();

            // branches
            for (const br of bolt.branches) {
                ctx.globalAlpha = alpha * 0.42;
                ctx.strokeStyle = "rgba(170,220,255,0.9)";
                ctx.lineWidth = width * 0.9;

                ctx.beginPath();
                ctx.moveTo(br[0].x, br[0].y);
                for (let i = 1; i < br.length; i++) ctx.lineTo(br[i].x, br[i].y);
                ctx.stroke();
            }

            ctx.restore();
        };

        const frame = () => {
            tick++;

            // черный фон с лёгким трейлом
            ctx.fillStyle = "rgba(0,0,0,0.30)";
            ctx.fillRect(0, 0, w, h);

            // дождь
            ctx.strokeStyle = "rgba(170,210,255,0.12)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (const d of rain) {
                d.y += d.v;
                d.x += d.v * 0.08; // небольшой снос
                if (d.y > h + 40) {
                    d.y = -40;
                    d.x = Math.random() * w;
                }
                if (d.x > w + 40) d.x = -40;

                // линия капли
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x - 2, d.y - d.len);
            }
            ctx.stroke();

            // тонкая полоса тумана снизу
            const bandTop = h * 0.78;
            const band = ctx.createLinearGradient(0, bandTop, 0, h);
            band.addColorStop(0, "rgba(0,0,0,0)");
            band.addColorStop(1, "rgba(80,90,110,0.10)");
            ctx.fillStyle = band;
            ctx.fillRect(0, bandTop, w, h - bandTop);

            for (const f of fog) {
                f.x += f.vx;
                f.y += f.vy;
                wrapFog(f);

                const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                g.addColorStop(0, `rgba(85,95,115,${f.a})`);
                g.addColorStop(1, `rgba(85,95,115,0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // молнии: медленнее и реже, но крупнее по охвату
            if (!reduceMotion) {
                if (tick >= nextSmallAt) {
                    nextSmallAt = tick + Math.floor(rand(70, 140));
                    spawn("small");
                    if (Math.random() < 0.25) spawn("small"); // иногда двойной удар
                }
                if (tick >= nextBigAt) {
                    nextBigAt = tick + Math.floor(rand(170, 300));
                    spawn("big");
                }
            }

            // рисуем молнии + вспышка
            let flash = 0;
            for (let i = bolts.length - 1; i >= 0; i--) {
                const b = bolts[i];
                b.life++;

                const p = b.life / b.max;
                const a = (p < 0.18 ? 1 : 1 - (p - 0.18) / 0.82) * 0.95;

                flash = Math.max(flash, b.flash * (1 - p));
                drawBolt(b, a);

                if (b.life >= b.max) bolts.splice(i, 1);
            }

            if (flash > 0.01) {
                ctx.fillStyle = `rgba(220,240,255,${flash * 0.32})`;
                ctx.fillRect(0, 0, w, h);
            }

            raf = requestAnimationFrame(frame);
        };

        resize();
        frame();
        window.addEventListener("resize", resize);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={ref} className="storm-bg" aria-hidden="true" />;
}