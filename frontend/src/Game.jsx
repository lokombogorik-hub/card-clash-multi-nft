import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";

/* =========================
   Triple Triad rules / helpers
   ========================= */
const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const RULES = { combo: true, same: true, plus: true };

const rand9 = () => Math.ceil(Math.random() * 9);
const randomFirstTurn = () => (Math.random() < 0.5 ? "player" : "enemy");

const ART = [
    "/cards/card.jpg",
    "/cards/card1.jpg",
    "/cards/card2.jpg",
    "/cards/card3.jpg",
    "/cards/card4.jpg",
    "/cards/card5.jpg",
    "/cards/card6.jpg",
    "/cards/card7.jpg",
    "/cards/card8.jpg",
    "/cards/card9.jpg",
];

const genCard = (owner, id) => ({
    id,
    owner,
    values: { top: rand9(), right: rand9(), bottom: rand9(), left: rand9() },
    imageUrl: ART[Math.floor(Math.random() * ART.length)],
    placeKey: 0,
    captureKey: 0,
});

function neighborsOf(idx) {
    const x = idx % 3;
    const y = Math.floor(idx / 3);
    const res = [];
    for (const { dx, dy, a, b } of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 2 || ny < 0 || ny > 2) continue;
        res.push({ ni: ny * 3 + nx, a, b });
    }
    return res;
}

function flipToOwner(grid, ni, newOwner) {
    const t = grid[ni];
    if (!t) return false;
    if (t.owner === newOwner) return false;
    grid[ni] = { ...t, owner: newOwner, captureKey: (t.captureKey || 0) + 1 };
    return true;
}

function resolvePlacementFlips(placedIdx, grid, rules) {
    const placed = grid[placedIdx];
    if (!placed) return { flipped: [] };

    const infos = neighborsOf(placedIdx)
        .map(({ ni, a, b }) => {
            const target = grid[ni];
            if (!target) return null;
            const p = placed.values[a];
            const q = target.values[b];
            return { ni, placedSide: p, targetSide: q, sum: p + q };
        })
        .filter(Boolean);

    const toFlip = new Set();

    // basic
    for (const i of infos) if (i.placedSide > i.targetSide) toFlip.add(i.ni);

    // same
    if (rules.same) {
        const eq = infos.filter((i) => i.placedSide === i.targetSide);
        if (eq.length >= 2) eq.forEach((i) => toFlip.add(i.ni));
    }

    // plus
    if (rules.plus) {
        const groups = new Map();
        for (const i of infos) {
            const arr = groups.get(i.sum) || [];
            arr.push(i);
            groups.set(i.sum, arr);
        }
        for (const [, arr] of groups) if (arr.length >= 2) arr.forEach((i) => toFlip.add(i.ni));
    }

    const flipped = [];
    for (const ni of toFlip) if (flipToOwner(grid, ni, placed.owner)) flipped.push(ni);

    return { flipped };
}

function captureByPowerFrom(idx, grid) {
    const src = grid[idx];
    if (!src) return [];
    const flipped = [];

    for (const { ni, a, b } of neighborsOf(idx)) {
        const t = grid[ni];
        if (!t) continue;
        if (t.owner === src.owner) continue;
        if (src.values[a] > t.values[b]) {
            if (flipToOwner(grid, ni, src.owner)) flipped.push(ni);
        }
    }
    return flipped;
}

function resolveCombo(queue, grid, rules) {
    if (!rules.combo) return;
    const q = [...queue];
    while (q.length) {
        const idx = q.shift();
        const more = captureByPowerFrom(idx, grid);
        if (more.length) q.push(...more);
    }
}

/* 5 cards layout (3 + 2). CSS swaps columns for player side. */
const posForHandIndex = (i) => (i < 3 ? { col: 1, row: i + 1 } : { col: 2, row: i - 2 });

/* =========================
   Telegram user -> name/avatar
   ========================= */
function getPlayerName(me) {
    if (!me) return "Guest";
    const u = me.username ? `@${me.username}` : "";
    const full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
    return u || full || "Guest";
}

function getPlayerAvatarUrl(me) {
    if (!me) return null;
    if (me.photo_url) return me.photo_url;
    if (me.username) return `https://t.me/i/userpic/320/${me.username}.jpg`;
    return null;
}

function initialsFrom(name) {
    const n = (name || "").replace(/^@/, "").trim();
    return (n[0] || "?").toUpperCase();
}

/* =========================
   Magic (spells)
   ========================= */
const FREEZE_DURATION_MOVES = 2; // сколько "ходов с постановкой карты" держится заморозка
const REVEAL_MS = 3000;          // показать карту врага на 3 секунды

/* =========================
   Game
   ========================= */
export default function Game({ onExit, me }) {
    const aiGuard = useRef({ handled: false });
    const revealTimerRef = useRef(null);

    const makeHands = () => ({
        player: Array.from({ length: 5 }, (_, i) => genCard("player", `p${i}`)),
        enemy: Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`)),
    });

    const [{ player, enemy }, setHands] = useState(makeHands);
    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);

    const [turn, setTurn] = useState(() => randomFirstTurn());
    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);

    // spells
    const [spellMode, setSpellMode] = useState(null); // null | "freeze"
    const [frozen, setFrozen] = useState(() => Array(9).fill(0)); // counters
    const [enemyRevealId, setEnemyRevealId] = useState(null);

    const [playerSpells, setPlayerSpells] = useState({ freeze: 1, reveal: 1 });

    const haptic = (kind = "light") => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind);
        } catch { }
    };

    const clearReveal = () => {
        if (revealTimerRef.current) {
            clearTimeout(revealTimerRef.current);
            revealTimerRef.current = null;
        }
        setEnemyRevealId(null);
    };

    useEffect(() => {
        return () => {
            // cleanup on unmount
            if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        };
    }, []);

    const decFrozenAfterCardMove = () => {
        setFrozen((prev) => prev.map((v) => (v > 0 ? v - 1 : 0)));
    };

    const reset = () => {
        setHands(makeHands());
        setBoard(Array(9).fill(null));
        setSelected(null);
        setTurn(randomFirstTurn());
        setGameOver(false);
        setWinner(null);
        aiGuard.current.handled = false;

        setSpellMode(null);
        setFrozen(Array(9).fill(0));
        clearReveal();
        setPlayerSpells({ freeze: 1, reveal: 1 });
    };

    // если раскрытая карта уже ушла из руки — чистим
    useEffect(() => {
        if (!enemyRevealId) return;
        if (!enemy.some((c) => c.id === enemyRevealId)) clearReveal();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enemy, enemyRevealId]);

    const score = useMemo(() => {
        return board.reduce(
            (a, c) => {
                if (!c) return a;
                c.owner === "player" ? a.blue++ : a.red++;
                return a;
            },
            { red: 0, blue: 0 }
        );
    }, [board]);

    const winnerText = winner === "player" ? "Победа" : winner === "enemy" ? "Поражение" : "Ничья";

    const placeCard = (i) => {
        if (gameOver) return;
        if (turn !== "player") return;
        if (!selected) return;
        if (board[i]) return;
        if (frozen[i] > 0) return;

        const next = [...board];
        next[i] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };

        const { flipped } = resolvePlacementFlips(i, next, RULES);
        resolveCombo(flipped, next, RULES);

        setBoard(next);
        setHands((h) => ({ ...h, player: h.player.filter((c) => c.id !== selected.id) }));
        setSelected(null);
        setSpellMode(null);

        decFrozenAfterCardMove();

        aiGuard.current.handled = false;
        setTurn("enemy");
    };

    const onCellClick = (i) => {
        if (gameOver) return;

        // Spell: Freeze
        if (spellMode === "freeze") {
            if (turn !== "player") return;
            if (board[i]) return;      // замораживаем только пустые
            if (frozen[i] > 0) return; // уже заморожено

            setFrozen((prev) => {
                const next = [...prev];
                next[i] = FREEZE_DURATION_MOVES;
                return next;
            });

            setSpellMode(null);
            aiGuard.current.handled = false;
            setTurn("enemy");
            haptic("light");
            return;
        }

        // normal placement
        placeCard(i);
    };

    const onMagicFreeze = () => {
        if (gameOver) return;
        if (turn !== "player") return;
        if (playerSpells.freeze <= 0) return;

        haptic("light");
        setSelected(null);
        setSpellMode("freeze");
        setPlayerSpells((s) => ({ ...s, freeze: Math.max(0, s.freeze - 1) }));
    };

    const onMagicReveal = () => {
        if (gameOver) return;
        if (turn !== "player") return;
        if (playerSpells.reveal <= 0) return;
        if (!enemy.length) return;

        haptic("light");

        const c = enemy[Math.floor(Math.random() * enemy.length)];
        setEnemyRevealId(c.id);

        // auto-hide через 3 секунды
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => {
            setEnemyRevealId(null);
            revealTimerRef.current = null;
        }, REVEAL_MS);

        setSelected(null);
        setSpellMode(null);

        setPlayerSpells((s) => ({ ...s, reveal: Math.max(0, s.reveal - 1) }));
        aiGuard.current.handled = false;
        setTurn("enemy");
    };

    // AI turn
    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;
        if (aiGuard.current.handled) return;
        aiGuard.current.handled = true;

        const empty = board
            .map((c, idx) => (c === null && frozen[idx] === 0 ? idx : null))
            .filter((v) => v !== null);

        if (!empty.length || !enemy.length) {
            setTurn("player");
            return;
        }

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemy[Math.floor(Math.random() * enemy.length)];

        const next = [...board];
        next[cell] = { ...card, owner: "enemy", placeKey: (card.placeKey || 0) + 1 };

        const { flipped } = resolvePlacementFlips(cell, next, RULES);
        resolveCombo(flipped, next, RULES);

        const t = setTimeout(() => {
            setBoard(next);
            setHands((h) => ({ ...h, enemy: h.enemy.filter((c) => c.id !== card.id) }));

            decFrozenAfterCardMove();

            setTurn("player");
        }, 420);

        return () => clearTimeout(t);
    }, [turn, gameOver, board, enemy, frozen]);

    // game over
    useEffect(() => {
        if (board.some((c) => c === null)) return;
        const p = board.filter((c) => c.owner === "player").length;
        const e = board.filter((c) => c.owner === "enemy").length;
        setWinner(p > e ? "player" : e > p ? "enemy" : "draw");
        setGameOver(true);
    }, [board]);

    // confetti on win
    useEffect(() => {
        if (!gameOver || winner !== "player") return;

        const safe = (opts) => {
            try {
                confetti({ zIndex: 99999, ...opts });
            } catch { }
        };

        const origin = { x: 0.5, y: 0.35 };
        const timers = [];
        timers.push(setTimeout(() => safe({ particleCount: 40, spread: 75, startVelocity: 30, origin }), 0));
        timers.push(setTimeout(() => safe({ particleCount: 28, spread: 95, startVelocity: 26, origin }), 180));
        timers.push(setTimeout(() => safe({ particleCount: 18, spread: 110, startVelocity: 24, origin }), 360));
        return () => timers.forEach(clearTimeout);
    }, [gameOver, winner]);

    const myName = getPlayerName(me);
    const myAvatar = getPlayerAvatarUrl(me);

    const enemyName = "BunnyBot";
    const enemyAvatar = "/ui/avatar-enemy.png?v=1";

    const canUseMagic = turn === "player" && !gameOver;

    return (
        <div className="game-root">
            <div className="game-ui tt-layout">
                <button className="exit" onClick={onExit}>
                    ← Меню
                </button>

                {/* score */}
                <div className="hud-corner hud-score red hud-near-left">🟥 {score.red}</div>
                <div className="hud-corner hud-score blue hud-near-right">{score.blue} 🟦</div>

                {/* badges */}
                <PlayerBadge side="enemy" name={enemyName} avatarUrl={enemyAvatar} active={turn === "enemy"} />
                <PlayerBadge side="player" name={myName} avatarUrl={myAvatar} active={turn === "player"} />

                {/* LEFT enemy hand */}
                <div className="hand left">
                    <div className="hand-grid">
                        {enemy.map((c, i) => {
                            const { col, row } = posForHandIndex(i);
                            const isRevealed = enemyRevealId === c.id;
                            return (
                                <div key={c.id} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
                                    {isRevealed ? <Card card={c} disabled /> : <Card hidden />}
                                </div>
                            );
                        })}

                        {/* Magic slot (enemy side) */}
                        <div className="magic-slot" aria-hidden="true">
                            <button className="magic-btn" disabled title="Enemy magic (soon)">
                                ❄
                            </button>
                            <button className="magic-btn" disabled title="Enemy magic (soon)">
                                👁
                            </button>
                        </div>
                    </div>
                </div>

                {/* CENTER board */}
                <div className="center-col">
                    <div className="board">
                        {board.map((cell, i) => {
                            const isFrozen = frozen[i] > 0;

                            // подсветка:
                            // 1) обычная — когда выбрана карта
                            // 2) для freeze — когда активен режим и клетка пустая/не заморожена
                            const canHighlight =
                                !gameOver &&
                                !cell &&
                                !isFrozen &&
                                ((spellMode === "freeze" && turn === "player") || (spellMode == null && selected));

                            return (
                                <div
                                    key={i}
                                    className={`cell ${canHighlight ? "highlight" : ""} ${isFrozen ? "frozen" : ""}`}
                                    onClick={() => onCellClick(i)}
                                    title={isFrozen ? `Frozen (${frozen[i]})` : undefined}
                                >
                                    {cell && <Card card={cell} />}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* RIGHT player hand */}
                <div className="hand right">
                    <div className="hand-grid">
                        {player.map((c, i) => {
                            const { col, row } = posForHandIndex(i);
                            return (
                                <div key={c.id} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
                                    <Card
                                        card={c}
                                        selected={selected?.id === c.id}
                                        disabled={gameOver || turn !== "player" || spellMode === "freeze"}
                                        onClick={() => setSelected((prev) => (prev?.id === c.id ? null : c))}
                                    />
                                </div>
                            );
                        })}

                        {/* Magic slot (player side) */}
                        <div className="magic-slot">
                            <button
                                className={`magic-btn ${spellMode === "freeze" ? "active" : ""}`}
                                onClick={onMagicFreeze}
                                disabled={!canUseMagic || playerSpells.freeze <= 0}
                                title="Freeze: заморозить пустую клетку"
                            >
                                ❄ {playerSpells.freeze}
                            </button>

                            <button
                                className="magic-btn"
                                onClick={onMagicReveal}
                                disabled={!canUseMagic || playerSpells.reveal <= 0}
                                title="Reveal: показать 1 карту врага на 3 секунды"
                            >
                                👁 {playerSpells.reveal}
                            </button>
                        </div>
                    </div>
                </div>

                {gameOver && winner === "enemy" && <DiceRain />}

                {gameOver && (
                    <div className="game-over">
                        <div className="game-over-box">
                            <h2>{winnerText}</h2>
                            <div className="game-over-buttons">
                                <button onClick={reset}>Заново</button>
                                <button onClick={onExit}>Меню</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

/* =========================
   Player badge
   ========================= */
function PlayerBadge({ side, name, avatarUrl, active }) {
    const [imgOk, setImgOk] = useState(Boolean(avatarUrl));
    const initials = initialsFrom(name);

    return (
        <div className={`player-badge ${side} ${active ? "active" : ""}`}>
            {avatarUrl && imgOk ? (
                <img
                    className="player-badge-avatar"
                    src={avatarUrl}
                    alt=""
                    draggable="false"
                    referrerPolicy="no-referrer"
                    onError={() => setImgOk(false)}
                />
            ) : (
                <div className="player-badge-avatar-fallback">{initials}</div>
            )}
            <div className="player-badge-name">{name}</div>
        </div>
    );
}

/* =========================
   Dice Rain (loss)
   ========================= */
function DiceRain() {
    const dice = useMemo(() => {
        const chars = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
        const n = 44;
        return Array.from({ length: n }, (_, i) => {
            const left = Math.random() * 100;
            const delay = Math.random() * 0.9;
            const dur = 1.8 + Math.random() * 1.6;
            const size = 18 + Math.random() * 22;
            const rot = `${Math.floor(Math.random() * 900) - 450}deg`;
            return { id: i, ch: chars[(Math.random() * chars.length) | 0], left, delay, dur, size, rot };
        });
    }, []);

    return (
        <div className="dice-rain" aria-hidden="true">
            {dice.map((d) => (
                <div
                    key={d.id}
                    className="die"
                    style={{
                        left: `${d.left}%`,
                        fontSize: `${d.size}px`,
                        animationDuration: `${d.dur}s`,
                        animationDelay: `${d.delay}s`,
                        ["--rot"]: d.rot,
                    }}
                >
                    {d.ch}
                </div>
            ))}
        </div>
    );
}

/* =========================
   Card
   ========================= */
function Card({ card, onClick, selected, disabled, hidden }) {
    const [placedAnim, setPlacedAnim] = useState(false);
    const [capturedAnim, setCapturedAnim] = useState(false);

    useEffect(() => {
        if (!card?.placeKey) return;
        setPlacedAnim(true);
        const t = setTimeout(() => setPlacedAnim(false), 380);
        return () => clearTimeout(t);
    }, [card?.placeKey]);

    useEffect(() => {
        if (!card?.captureKey) return;
        setCapturedAnim(true);
        const t = setTimeout(() => setCapturedAnim(false), 360);
        return () => clearTimeout(t);
    }, [card?.captureKey]);

    if (hidden) {
        return (
            <div className="card back" aria-hidden="true">
                <div className="card-back-inner">
                    <img className="card-back-logo-img" src="/ui/cardclash-logo.png?v=3" alt="CardClash" draggable="false" />
                </div>
            </div>
        );
    }

    return (
        <div
            className={[
                "card",
                card.owner === "player" ? "player" : "enemy",
                selected ? "selected" : "",
                disabled ? "disabled" : "",
                placedAnim ? "is-placed" : "",
                capturedAnim ? "is-captured" : "",
            ].join(" ")}
            onClick={disabled ? undefined : onClick}
        >
            <div className="card-anim">
                <img className="card-art-img" src={card.imageUrl} alt="" draggable="false" />
                <div className="tt-badge" />
                <span className="tt-num top">{card.values.top}</span>
                <span className="tt-num left">{card.values.left}</span>
                <span className="tt-num right">{card.values.right}</span>
                <span className="tt-num bottom">{card.values.bottom}</span>
            </div>
        </div>
    );
}