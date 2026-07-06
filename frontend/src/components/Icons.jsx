// Единый набор SVG-иконок в line-стиле (как нижнее меню). Цвет наследуется
// через currentColor — задаётся у родителя (color/стиль). Размер — проп size.
// Заменяют эмодзи по всему интерфейсу для более «дорогого» вида.

function svgProps(size) {
    return {
        width: size, height: size, viewBox: "0 0 24 24",
        fill: "none", xmlns: "http://www.w3.org/2000/svg",
        style: { display: "inline-block", verticalAlign: "middle", flex: "0 0 auto" },
    };
}

// Монета ClashCoin — кружок с внутренним кольцом и звездой-искрой.
export function CoinIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.16" />
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="12" cy="12" r="5.6" stroke="currentColor" strokeWidth="1.2" opacity="0.65" />
            <path d="M12 8.1l1 2.2 2.4.2-1.8 1.5.6 2.3L12 14.7l-2.2 1.3.6-2.3-1.8-1.5 2.4-.2z"
                fill="currentColor" />
        </svg>
    );
}

// Буст — молния.
export function BoltIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="M13 2 4.5 13.2c-.3.4 0 1 .5 1H10l-1 7.2c-.1.6.7.9 1 .4l8.5-11.2c.3-.4 0-1-.5-1H14l1-7.2c.1-.6-.7-.9-1-.4z"
                fill="currentColor" />
        </svg>
    );
}

// Кейс / ящик.
export function CaseIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <rect x="3" y="7.5" width="18" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M9 7.5V6a3 3 0 0 1 6 0v1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M3 12.5h18" stroke="currentColor" strokeWidth="1.6" />
            <rect x="10.4" y="10.8" width="3.2" height="3.4" rx="0.8" fill="currentColor" />
        </svg>
    );
}

// Замок (лок NFT).
export function LockIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2" stroke="currentColor" strokeWidth="1.8" />
            <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="12" cy="15" r="1.5" fill="currentColor" />
        </svg>
    );
}

// Скрещённые мечи (активный матч / PvP).
export function SwordsIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="M14.5 3.5 21 3l-.5 6.5-8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M9.5 3.5 3 3l.5 6.5 8 8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 20l3-3M20 20l-3-3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

// Лупа (поиск соперника).
export function SearchIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

// Галочка (успех / готово).
export function CheckIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="m4.5 12.5 4.5 4.5 10.5-11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

// Кубок (турнир / лидеры).
export function TrophyIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <path d="M7 5H4.5v1.5A3.5 3.5 0 0 0 8 10M17 5h2.5v1.5A3.5 3.5 0 0 1 16 10M12 13v3M8.5 20h7M10 17.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
    );
}

// Крестик (ошибка / нет).
export function XIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

// Ромб/самоцвет (маркет).
export function GemIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <path d="M6 3h12l3 5-9 13L3 8l3-5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M3 8h18M9 3 7.5 8 12 21M15 3l1.5 5L12 21" stroke="currentColor" strokeWidth="1.3" opacity="0.6" strokeLinejoin="round" />
        </svg>
    );
}

// Игровой контроллер (вернуться в игру).
export function PlayPadIcon({ size = 16 }) {
    return (
        <svg {...svgProps(size)}>
            <rect x="2.5" y="7.5" width="19" height="9" rx="4.5" stroke="currentColor" strokeWidth="1.7" />
            <path d="M7 10.5v3M5.5 12h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="16" cy="11" r="1" fill="currentColor" /><circle cx="18" cy="13.5" r="1" fill="currentColor" />
        </svg>
    );
}
