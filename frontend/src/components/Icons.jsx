// Единый набор SVG-иконок в line-стиле (как нижнее меню). Цвет — через
// currentColor (задаётся у родителя). Размер — проп size. Свечение (glow) в
// цвет иконки включено по умолчанию; усилить числом или выключить glow={false}.

function svgProps(size, glow) {
    var g = glow === false ? "none" : "drop-shadow(0 0 " + (glow || 3) + "px currentColor)";
    return {
        width: size, height: size, viewBox: "0 0 24 24",
        fill: "none", xmlns: "http://www.w3.org/2000/svg",
        style: { display: "inline-block", verticalAlign: "middle", flex: "0 0 auto", filter: g },
    };
}

export function CoinIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.16" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
            <path d="M12 8.1l1 2.2 2.4.2-1.8 1.5.6 2.3L12 14.7l-2.2 1.3.6-2.3-1.8-1.5 2.4-.2z" fill="currentColor" />
        </svg>
    );
}

export function BoltIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M13 2 4.5 13.2c-.3.4 0 1 .5 1H10l-1 7.2c-.1.6.7.9 1 .4l8.5-11.2c.3-.4 0-1-.5-1H14l1-7.2c.1-.6-.7-.9-1-.4z" fill="currentColor" />
        </svg>
    );
}

export function CaseIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="3" y="7.5" width="18" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 12.5h18" stroke="currentColor" strokeWidth="1.6" />
            <rect x="10.4" y="10.8" width="3.2" height="3.4" rx="0.8" fill="currentColor" />
        </svg>
    );
}

export function LockIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="15" r="1.5" fill="currentColor" />
        </svg>
    );
}

export function SwordsIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M14.5 3.5 21 3l-.5 6.5-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 3.5 3 3l.5 6.5 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 20l3-3M20 20l-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

export function SearchIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export function CheckIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="m4.5 12.5 4.5 4.5 10.5-11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function TrophyIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10M12 13v3M8.5 20h7M10 17.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

export function XIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

export function GemIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M6 3h12l3 5-9 13L3 8l3-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M3 8h18M9 3 7.5 8 12 21M15 3l1.5 5L12 21" stroke="currentColor" strokeWidth="1.3" opacity="0.6" strokeLinejoin="round" />
        </svg>
    );
}

export function PlayPadIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="2.5" y="7.5" width="19" height="9" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M7 10.5v3M5.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16" cy="11" r="1" fill="currentColor" />
            <circle cx="18" cy="13.5" r="1" fill="currentColor" />
        </svg>
    );
}

export function UsersIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M16 5.2a3.2 3.2 0 0 1 0 6M17.5 13.5A5.5 5.5 0 0 1 20.5 18.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

export function FireIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M12 2.5c2.5 3 5.5 4.8 5.5 9a5.5 5.5 0 0 1-11 0c0-1.8.7-3 1.6-4 .2 1 .8 1.7 1.6 2C9.6 6.8 10.8 4.7 12 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
    );
}

export function WarnIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M12 3.5 21.5 20H2.5L12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M12 9.5v4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function BotIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="4.5" y="8" width="15" height="11" rx="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 4.5V8M12 3.2a1.3 1.3 0 1 0 0 .1Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <circle cx="9" cy="13" r="1.3" fill="currentColor" />
            <circle cx="15" cy="13" r="1.3" fill="currentColor" />
            <path d="M2.8 12v3M21.2 12v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}
