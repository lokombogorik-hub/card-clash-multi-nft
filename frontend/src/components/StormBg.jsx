import { useEffect, useRef } from "react";

const rand = (a, b) => a + Math.random() * (b - a);

function makeBolt(w, h, kind) {
    const isBig = kind === "big";

    const x0 = rand(w * 0.15, w * 0.85);
    const y0 = rand(-30, 10);

    const endX = x0 + rand(-w * (isBig ? 0.22 : 0.14), w * (isBig ? 0.22 : 0.14));
    const endY = rand(h * (isBig ? 0.45 : 0.30), h * (isBig ? 0.92 : 0.62));

    const pts = [];
    const steps = Math.floor(rand(isBig ? 22 : 14, isBig ? 34 : 20));

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const wiggleX = rand(isBig ? -22 : -14, isBig ? 22 : 14) * (0.25 + t);
        const wiggleY = rand(-10, 10);

        pts.push({
            x: x0 + (endX - x0) * t + wiggleX,
            y: y0 + (endY - y0) * t + wiggleY,
        });
    }

    const branches = [];
    const branchCount = isBig ? (Math.random() < 0.7 ? 2 : 1) : (Math.random() < 0.55 ? 1 : 0);

    for (let b = 0; b < branchCount; b++) {
        const bi = Math.floor(rand(5, pts.length - 7));
        const bp = pts[bi];

        const bpts = [{ x: bp.x, y: bp.y }];
        let bx = bp.x;
        let by = bp.y;

        const bl = Math.floor(rand(isBig ? 8 : 5, isBig ? 14 : 9));
        for (let k = 0; k < bl; k++) {
            by += rand(10, 22);
            bx += rand(isBig ? -30 : -22, isBig ? 30 : 22);
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

        let w = 0,
            h = 0,
            dpr = 1;

        // fog only bottom
        const fog = [];
        const bolts = [];
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

            // fog blobs mostly near bottom
            const fogCount = Math.round(Math.min(14, Math.max(9, (w * h) / 110000)));
            for (let i = 0; i < fogCount; i++) {
                fog.push({
                    x: Math.random() * w,
                    y: rand(h * 0.65, h * 1.05),
                    r: rand(220, 520),
                    vx: rand(-0.10, 0.10),
                    vy: rand(-0.05, 0.05),
                    a: rand(0.03, 0.06),
                });
            }

            // reset timers
            tick = 0;
            nextSmallAt = Math.floor(rand(12, 28)); // частые мелкие
            nextBigAt = Math.floor(rand(90, 160));  // большие реже
            bolts.length = 0;

            // base black
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, w, h);
        };

        const wrapFog = (f) => {
            if (f.x < -f.r) f.x = w + f.r;
            if (f.x > w + f.r) f.x = -f.r;
            // держим туман снизу
            if (f.y < h * 0.55) f.y = h * 1.02;
            if (f.y > h * 1.10) f.y = h * 0.62;
        };

        const spawn = (kind) => {
            const isBig = kind === "big";
            bolts.push({
                kind,
                bolt: makeBolt(w, h, kind),
                life: 0,
                max: isBig ? 22 : 14,
                width: isBig ? rand(2.0, 3.0) : rand(1.0, 1.7),
                flash: isBig ? rand(0.55, 0.85) : rand(0.20, 0.40),
            });

            // limit active bolts for perf
            if (bolts.length > 7) bolts.splice(0, bolts.length - 7);
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
            ctx.shadowBlur = obj.kind === "big" ? 24 : 16;
            ctx.lineWidth = width * (obj.kind === "big" ? 5.5 : 4.5);

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
                ctx.globalAlpha = alpha * 0.45;
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

            // keep black background with slight trail
            ctx.fillStyle = "rgba(0,0,0,0.26)";
            ctx.fillRect(0, 0, w, h);

            // bottom fog gradient band (subtle)
            const band = ctx.createLinearGradient(0, h * 0.55, 0, h);
            band.addColorStop(0, "rgba(0,0,0,0)");
            band.addColorStop(1, "rgba(80,90,110,0.12)");
            ctx.fillStyle = band;
            ctx.fillRect(0, h * 0.55, w, h * 0.45);

            // fog blobs
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

            // schedule more strikes
            if (!reduceMotion) {
                if (tick >= nextSmallAt) {
                    nextSmallAt = tick + Math.floor(rand(14, 34)); // часто
                    // иногда 2 маленькие подряд
                    spawn("small");
                    if (Math.random() < 0.35) spawn("small");
                }
                if (tick >= nextBigAt) {
                    nextBigAt = tick + Math.floor(rand(90, 170)); // большие реже
                    spawn("big");
                }
            }

            // draw bolts + flash
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
                ctx.fillStyle = `rgba(220,240,255,${flash * 0.35})`;
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