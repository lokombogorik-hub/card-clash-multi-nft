import { useEffect, useRef } from "react";

export default function NebulaBg() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        let w = 0,
            h = 0,
            dpr = 1;

        const blobs = [];
        const stars = [];
        let raf = 0;
        let t = 0;

        const colors = [
            [24, 231, 255],  // cyan
            [255, 61, 242],  // magenta
            [124, 58, 237],  // purple
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

            blobs.length = 0;
            stars.length = 0;

            // очень тёмные "туманности", но с движением
            const blobCount = Math.round(Math.min(14, Math.max(9, (w * h) / 90000)));
            for (let i = 0; i < blobCount; i++) {
                const c = colors[Math.floor(Math.random() * colors.length)];
                blobs.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 180 + Math.random() * 320,
                    vx: (Math.random() - 0.5) * 0.55, // чуть активнее
                    vy: (Math.random() - 0.5) * 0.55,
                    a: 0.05 + Math.random() * 0.06,   // темнее
                    c,
                    phase: Math.random() * 1000,
                });
            }

            // звезды + небольшой дрейф (чуть активнее)
            const starCount = Math.round(Math.min(320, Math.max(180, (w * h) / 6500)));
            for (let i = 0; i < starCount; i++) {
                stars.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 0.4 + Math.random() * 1.6,
                    a: 0.06 + Math.random() * 0.28,  // темнее
                    tw: 0.006 + Math.random() * 0.02,
                    phase: Math.random() * 1000,
                    vx: (Math.random() - 0.5) * 0.12,
                    vy: (Math.random() - 0.5) * 0.12,
                });
            }

            // базовая заливка, чтобы не было "пустого" кадра
            ctx.fillStyle = "#02030a";
            ctx.fillRect(0, 0, w, h);
        };

        const wrapBlob = (b) => {
            if (b.x < -b.r) b.x = w + b.r;
            if (b.x > w + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = h + b.r;
            if (b.y > h + b.r) b.y = -b.r;
        };

        const wrapStar = (s) => {
            if (s.x < -20) s.x = w + 20;
            if (s.x > w + 20) s.x = -20;
            if (s.y < -20) s.y = h + 20;
            if (s.y > h + 20) s.y = -20;
        };

        const draw = () => {
            t += 1;

            // "трейл" чтобы было больше динамики, но всё тёмное
            ctx.fillStyle = "rgba(2,3,10,0.30)";
            ctx.fillRect(0, 0, w, h);

            // туманности
            for (const b of blobs) {
                b.x += b.vx;
                b.y += b.vy;
                wrapBlob(b);

                const pulse = 0.80 + 0.20 * Math.sin((t + b.phase) * 0.01);
                const alpha = b.a * pulse;

                const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${alpha})`);
                g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // звезды
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            for (const s of stars) {
                s.x += s.vx;
                s.y += s.vy;
                wrapStar(s);

                const tw = 0.6 + 0.4 * Math.sin((t + s.phase) * s.tw);
                ctx.globalAlpha = s.a * tw;

                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;

            raf = requestAnimationFrame(draw);
        };

        resize();
        draw();
        window.addEventListener("resize", resize);

        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={ref} className="nebula-bg" aria-hidden="true" />;
}