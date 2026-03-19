import { useEffect, useRef } from "react";

export default function Starfield() {
    const ref = useRef(null);

    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d", { alpha: false });

        let w = 0, h = 0, dpr = 1;
        const stars = [];
        const STAR_COUNT = 220;

        const resize = () => {
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            w = Math.floor(window.innerWidth);
            h = Math.floor(window.innerHeight);
            canvas.width = Math.floor(w * dpr);
            canvas.height = Math.floor(h * dpr);
            canvas.style.width = `${w}px`;
            canvas.style.height = `${h}px`;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const resetStar = (s) => {
            s.x = Math.random() * w;
            s.y = Math.random() * h;
            s.z = Math.random() * 1 + 0.2;
            s.v = 0.6 + Math.random() * 1.8; // скорость
            s.r = 0.6 + Math.random() * 1.6; // размер
        };

        for (let i = 0; i < STAR_COUNT; i++) {
            const s = {};
            resetStar(s);
            stars.push(s);
        }

        let raf = 0;
        const tick = () => {
            // фон
            ctx.fillStyle = "#050611";
            ctx.fillRect(0, 0, w, h);

            // “скорость” = вниз + чуть в стороны
            const cx = w * 0.5;
            const cy = h * 0.35;

            for (const s of stars) {
                // движение от центра
                const dx = (s.x - cx) / w;
                const dy = (s.y - cy) / h;

                s.x += dx * s.v * 2.4;
                s.y += dy * s.v * 2.4;

                // хвост
                ctx.strokeStyle = "rgba(255,255,255,0.55)";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(s.x, s.y);
                ctx.lineTo(s.x - dx * (6 + s.v * 6), s.y - dy * (6 + s.v * 6));
                ctx.stroke();

                // точка
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fill();

                if (s.x < -50 || s.x > w + 50 || s.y < -50 || s.y > h + 50) {
                    resetStar(s);
                }
            }

            raf = requestAnimationFrame(tick);
        };

        resize();
        tick();

        window.addEventListener("resize", resize);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("resize", resize);
        };
    }, []);

    return <canvas ref={ref} className="starfield" aria-hidden="true" />;
}