// Единый набор SVG-иконок в line-стиле (как нижнее меню). Цвет — через
// currentColor (задаётся у родителя). Размер — проп size. Свечение (glow) в
// цвет иконки включено по умолчанию; усилить числом или выключить glow={false}.

function svgProps(size, glow) {
    var g = glow === false ? "none" : "drop-shadow(0 0 " + (glow || 3) + "px currentColor)";
    return {
        width: size, height: size, viewBox: "0 0 24 24",
        fill: "none", xmlns: "http://www.w3.org/2000/svg",
        style: {
            display: "inline-block", verticalAlign: "middle", flex: "0 0 auto",
            filter: g,
            transform: "translateZ(0)",      // отдельный GPU-слой — не мерцает над анимацией
            willChange: "filter",
            backfaceVisibility: "hidden",
        },
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
            <g stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none">
                <path d="M20.5 3.5 10 14" />
                <path d="M17.8 3.3 20.7 3.3 20.7 6.2" />
                <path d="m6.5 16.5-3 3 1.5 1.5 3-3" />
                <path d="M8 12.5 11.5 16" />
                <path d="M3.5 3.5 14 14" />
                <path d="M6.2 3.3 3.3 3.3 3.3 6.2" />
                <path d="m17.5 16.5 3 3-1.5 1.5-3-3" />
                <path d="M12.5 12.5 16 16" />
            </g>
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

// ── СТИХИИ КАРТ ─────────────────────────────────────────────────
export const ELEMENT_COLOR = {
    Earth: "#7ad07a", Fire: "#ff7a3c", Water: "#4aa8ff", Poison: "#b06bff",
    Holy: "#ffe08a", Thunder: "#ffd23c", Wind: "#7fe3d0", Ice: "#9fd8ff",
};

function ElementGlyph({ element }) {
    switch (element) {
        case "Fire":
            return <path d="M12 2.5c2.5 3 5.5 4.8 5.5 9a5.5 5.5 0 0 1-11 0c0-1.9.7-3.1 1.7-4.1.2 1.1.8 1.8 1.6 2.1C9.5 6.9 10.8 4.7 12 2.5Z" fill="currentColor" />;
        case "Water":
            return <path d="M12 3s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11Z" fill="currentColor" />;
        case "Earth":
            return <path d="M5 19.5C5 11 11 5.5 19.5 4.5 19.5 13 13.5 18.5 5 19.5Zm4-4c2.2-2 4.4-3.2 6.5-3.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" fill="none" />;
        case "Poison":
            return (
                <g>
                    <path d="M12 3a7 7 0 0 0-7 7c0 2.6 1.4 4.1 2.6 4.9V17a1.4 1.4 0 0 0 1.4 1.4h6A1.4 1.4 0 0 0 16.4 17v-2.1C17.6 14.1 19 12.6 19 10a7 7 0 0 0-7-7Z" stroke="currentColor" strokeWidth="1.6" fill="none" />
                    <circle cx="9.4" cy="10.4" r="1.5" fill="currentColor" />
                    <circle cx="14.6" cy="10.4" r="1.5" fill="currentColor" />
                </g>
            );
        case "Holy":
            return <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" fill="currentColor" />;
        case "Thunder":
            return <path d="M13 2 4.5 13.2c-.3.4 0 1 .5 1H10l-1 7.2c-.1.6.7.9 1 .4l8.5-11.2c.3-.4 0-1-.5-1H14l1-7.2c.1-.6-.7-.9-1-.4z" fill="currentColor" />;
        case "Wind":
            return <path d="M3 8.5h10.5A2.75 2.75 0 1 0 10.7 5.5M3 12.5h13A3 3 0 1 1 13 15.5M3 16.5h8A2.4 2.4 0 1 1 8.6 19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />;
        case "Ice":
            return (
                <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                    <path d="M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25 3.8 16.75" />
                    <path d="M12 6.2 9.7 4M12 6.2 14.3 4M12 17.8l-2.3 2.2M12 17.8l2.3 2.2M5.6 9.4 4 8.5M18.4 14.6l1.6.9M18.4 9.4 20 8.5M5.6 14.6 4 15.5" strokeWidth="1.4" />
                </g>
            );
        default:
            return <circle cx="12" cy="12" r="6.5" stroke="currentColor" strokeWidth="1.7" />;
    }
}

export function ElementIcon({ element, size = 16, glow }) {
    var color = ELEMENT_COLOR[element] || "#9fb2d0";
    return (
        <span style={{ color: color, display: "inline-flex", verticalAlign: "middle" }}>
            <svg {...svgProps(size, glow)}><ElementGlyph element={element} /></svg>
        </span>
    );
}

// ── МЕДАЛИ (место 1/2/3) ────────────────────────────────────────
var MEDAL_COLOR = { 1: "#ffd23c", 2: "#cfd8e3", 3: "#e0925a" };
export function MedalIcon({ place = 1, size = 18, glow }) {
    var color = MEDAL_COLOR[place] || "#9fb2d0";
    return (
        <span style={{ color: color, display: "inline-flex", verticalAlign: "middle" }}>
            <svg {...svgProps(size, glow)}>
                <path d="M8.5 3 12 8.5 15.5 3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="12" cy="15" r="6" stroke="currentColor" strokeWidth="1.8" />
                <text x="12" y="17.6" textAnchor="middle" fontSize="7" fontWeight="900" fill="currentColor">{place}</text>
            </svg>
        </span>
    );
}

// ── ЗАКЛИНАНИЯ ──────────────────────────────────────────────────
export function FreezeIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <path d="M12 2.5v19M3.8 7.25l16.4 9.5M20.2 7.25 3.8 16.75" />
            <path d="M12 6.2 9.7 4M12 6.2 14.3 4M12 17.8l-2.3 2.2M12 17.8l2.3 2.2" strokeWidth="1.4" />
        </svg>
    );
}

export function EyeIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="2.6" fill="currentColor" />
        </svg>
    );
}

export function InfoIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="8" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function BellIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

// Колода — стопка карт.
export function CardsIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="8" y="4.5" width="10.5" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity="0.12" transform="rotate(9 13.25 12)" />
            <rect x="6.5" y="5.5" width="10.5" height="15" rx="2" stroke="currentColor" strokeWidth="1.7" fill="currentColor" fillOpacity="0.16" />
            <path d="M9.5 9h4.5M9.5 12h4.5M9.5 15h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.7" />
        </svg>
    );
}

// Значок NEAR (скруглённый квадрат + N).
export function NearIcon({ size = 16, glow }) {
    return (
        <svg {...svgProps(size, glow)}>
            <rect x="3.5" y="3.5" width="17" height="17" rx="4.6" stroke="currentColor" strokeWidth="1.7" />
            <path d="M8 16.3V8l8 8V7.7" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}
