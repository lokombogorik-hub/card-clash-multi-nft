import { useEffect, useRef } from "react";

const rand = (a, b) => a + Math.random() * (b - a);

function makeBolt(w, h) {
    const x0 = rand(w * 0.18, w * 0.82);
    const y0 = rand(-40, 20);
    const x1 = x0 + rand(-w * 0.20, w * 0.20);
    const y1 = rand(h * 0.45, h * 0.92);

    const pts = [];
    const steps = Math.floor(rand(16, 26));
    let x = x0;
    let y = y0;

    pts.push({ x, y });
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        y = y0 + (y1 - y0) * t + rand(-10, 10);
        x = x0 + (x1 - x0) * t + rand(-18, 18) * (0.3 + t);
        pts.push({ x, y });
    }

    const branches = [];
    if (Math.random() < 0.7) {
        const bi = Math.floor(rand(4, steps - 6));
        const bp = pts[bi];
        const bpts = [{ x: bp.x, y: bp.y }];
        let bx = bp.x;
        let by = bp.y;
        const bl = Math.floor(rand(5, 10));
        for (let k = 0; k < bl; k++) {
            by += rand(12, 22);
            bx += rand(-26, 26);
            bpts.push({ x: bx, y: by });
        }
        branches.push(bpts);
    }

    return { pts, branches };
}

export default function LightningFogBg() {
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

        const fog = [];
        const bolts = [];
        let raf = 0;
        let tick = 0;
        let nextBoltAt = 0;

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
            const fogCount = Math.round(Math.min(16, Math.max(10, (w * h) / 95000)));
            for (let i = 0; i < fogCount; i++) {
                fog.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: rand(240, 560),
                    vx: rand(-0.10, 0.10),
                    vy: rand(-0.08, 0.08),
                    a: rand(0.030, 0.055),
                    cold: Math.random() < 0.55,
                });
            }

            ctx.fillStyle = "#02030a";
            ctx.fillRect(0, 0, w, h);
            nextBoltAt = 0;
        };

        const wrapFog = (f) => {
            if (f.x < -f.r) f.x = w + f.r;
            if (f.x > w + f.r) f.x = -f.r;
            if (f.y < -f.r) f.y = h + f.r;
            if (f.y > h + f.r) f.y = -f.r;
        };

        const spawnBolt = () => {
            const bolt = makeBolt(w, h);
            bolts.push({
                bolt,
                life: 0,
                max: reduceMotion ? 14 : 18,
                flash: reduceMotion ? 0.30 : 0.55,
                width: rand(1.6, 2.6),
            });
        };

        const drawBolt = (b, alpha) => {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            // glow
            ctx.globalAlpha = alpha * 0.7;
            ctx.strokeStyle = "rgba(140,200,255,1)";
            ctx.shadowColor = "rgba(90,170,255,0.9)";
            ctx.shadowBlur = 18;
            ctx.lineWidth = b.width * 5;

            ctx.beginPath();
            ctx.moveTo(b.bolt.pts[0].x, b.bolt.pts[0].y);
            for (let i = 1; i < b.bolt.pts.length; i++) ctx.lineTo(b.bolt.pts[i].x, b.bolt.pts[i].y);
            ctx.stroke();

            // core
            ctx.shadowBlur = 0;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "rgba(255,255,255,0.95)";
            ctx.lineWidth = b.width;

            ctx.beginPath();
            ctx.moveTo(b.bolt.pts[0].x, b.bolt.pts[0].y);
            for (let i = 1; i < b.bolt.pts.length; i++) ctx.lineTo(b.bolt.pts[i].x, b.bolt.pts[i].y);
            ctx.stroke();

            // branches
            for (const br of b.bolt.branches) {
                ctx.globalAlpha = alpha * 0.5;
                ctx.strokeStyle = "rgba(170,220,255,0.9)";
                ctx.lineWidth = b.width * 0.9;

                ctx.beginPath();
                ctx.moveTo(br[0].x, br[0].y);
                for (let i = 1; i < br.length; i++) ctx.lineTo(br[i].x, br[i].y);
                ctx.stroke();
            }

            ctx.restore();
        };

        const frame = () => {
            tick++;

            // dark + trail for "foggy" motion
            ctx.fillStyle = "rgba(2,3,10,0.28)";
            ctx.fillRect(0, 0, w, h);

            // fog
            for (const f of fog) {
                f.x += f.vx;
                f.y += f.vy;
                wrapFog(f);

                const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
                const col = f.cold ? "170,210,255" : "255,255,255";
                g.addColorStop(0, `rgba(${col},${f.a})`);
                g.addColorStop(1, `rgba(${col},0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // lightning schedule
            if (!reduceMotion && tick >= nextBoltAt) {
                nextBoltAt = tick + Math.floor(rand(140, 260));
                spawnBolt();
            }

            // draw bolts + screen flash
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
                ctx.fillStyle = `rgba(220,240,255,${flash * 0.45})`;
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

    return <canvas ref={ref} className="lightning-bg" aria-hidden="true" />;
}