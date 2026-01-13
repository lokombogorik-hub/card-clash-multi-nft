import { useEffect, useRef } from "react";

export default function NebulaBg() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        let w = 0, h = 0, dpr = 1;
        let raf = 0;

        const colors = [
            [24, 231, 255],   // cyan
            [255, 61, 242],   // magenta
            [124, 58, 237],   // purple
        ];

        const blobs = [];
        const stars = [];

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

            // мягкие "туманности"
            const blobCount = Math.round(Math.min(14, Math.max(8, (w * h) / 90000)));
            for (let i = 0; i < blobCount; i++) {
                const c = colors[Math.floor(Math.random() * colors.length)];
                blobs.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 120 + Math.random() * 220,
                    vx: (Math.random() - 0.5) * 0.10,
                    vy: (Math.random() - 0.5) * 0.10,
                    a: 0.10 + Math.random() * 0.12,
                    c,
                });
            }

            // небольшие звёзды (без "скорости")
            const starCount = Math.round(Math.min(220, Math.max(120, (w * h) / 8000)));
            for (let i = 0; i < starCount; i++) {
                stars.push({
                    x: Math.random() * w,
                    y: Math.random() * h,
                    r: 0.4 + Math.random() * 1.4,
                    a: 0.15 + Math.random() * 0.35,
                    tw: 0.004 + Math.random() * 0.01, // twinkle speed
                    t: Math.random() * 1000,
                });
            }
        };

        const wrap = (b) => {
            if (b.x < -b.r) b.x = w + b.r;
            if (b.x > w + b.r) b.x = -b.r;
            if (b.y < -b.r) b.y = h + b.r;
            if (b.y > h + b.r) b.y = -b.r;
        };

        const draw = () => {
            ctx.fillStyle = "#050611";
            ctx.fillRect(0, 0, w, h);

            // туманности (градиентные круги)
            for (const b of blobs) {
                b.x += b.vx;
                b.y += b.vy;
                wrap(b);

                const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
                g.addColorStop(0, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},${b.a})`);
                g.addColorStop(1, `rgba(${b.c[0]},${b.c[1]},${b.c[2]},0)`);
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
                ctx.fill();
            }

            // звёзды с легким мерцанием
            ctx.fillStyle = "rgba(255,255,255,0.9)";
            for (const s of stars) {
                s.t += 1;
                const tw = 0.6 + 0.4 * Math.sin(s.t * s.tw);
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