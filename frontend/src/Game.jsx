import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const RULES = { combo: true, same: true, plus: true };

const rand = () => Math.ceil(Math.random() * 9);
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
    values: { top: rand(), right: rand(), bottom: rand(), left: rand() },
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
    if (!placed) return { flipped: [], specialType: "" };

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

    for (const i of infos) if (i.placedSide > i.targetSide) toFlip.add(i.ni);

    let sameTriggered = false;
    if (rules.same) {
        const eq = infos.filter((i) => i.placedSide === i.targetSide);
        if (eq.length >= 2) {
            sameTriggered = true;
            eq.forEach((i) => toFlip.add(i.ni));
        }
    }

    let plusTriggered = false;
    if (rules.plus) {
        const groups = new Map();
        for (const i of infos) {
            const arr = groups.get(i.sum) || [];
            arr.push(i);
            groups.set(i.sum, arr);
        }
        for (const [, arr] of groups) {
            if (arr.length >= 2) {
                plusTriggered = true;
                arr.forEach((i) => toFlip.add(i.ni));
            }
        }
    }

    const specialType =
        sameTriggered && plusTriggered ? "both" : sameTriggered ? "same" : plusTriggered ? "plus" : "";

    const flipped = [];
    for (const ni of toFlip) {
        if (flipToOwner(grid, ni, placed.owner)) flipped.push(ni);
    }
    return { flipped, specialType };
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

const posForHandIndex = (i) => {
    // 0..2 -> col1 rows 1..3, 3..4 -> col2 rows 1..2
    if (i < 3) return { col: 1, row: i + 1 };
    return { col: 2, row: i - 2 };
};

export default function Game({ onExit }) {
    const aiGuard = useRef({ handled: false });

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

    const reset = () => {
        setHands(makeHands());
        setBoard(Array(9).fill(null));
        setSelected(null);
        setTurn(randomFirstTurn());
        setGameOver(false);
        setWinner(null);
        aiGuard.current.handled = false;
    };

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

    const placeCard = (i) => {
        if (gameOver) return;
        if (turn !== "player") return;
        if (!selected || board[i]) return;

        const next = [...board];
        next[i] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };

        const { flipped } = resolvePlacementFlips(i, next, RULES);
        resolveCombo(flipped, next, RULES);

        setBoard(next);
        setHands((h) => ({ ...h, player: h.player.filter((c) => c.id !== selected.id) }));
        setSelected(null);

        aiGuard.current.handled = false;
        setTurn("enemy");
    };

    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;
        if (aiGuard.current.handled) return;
        aiGuard.current.handled = true;

        const empty = board.map((c, idx) => (c === null ? idx : null)).filter((v) => v !== null);
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
            setTurn("player");
        }, 420);

        return () => clearTimeout(t);
    }, [turn, gameOver, board, enemy]);

    useEffect(() => {
        if (board.some((c) => c === null)) return;
        const p = board.filter((c) => c.owner === "player").length;
        const e = board.filter((c) => c.owner === "enemy").length;
        setWinner(p > e ? "player" : e > p ? "enemy" : "draw");
        setGameOver(true);
    }, [board]);

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

    return (
        <div className="game-root">
            <div className="game-ui tt-layout">
                <button className="exit" onClick={onExit}>← Меню</button>

                {/* LEFT: enemy hand (backs) */}
                <div className="hand left">
                    <div className="hand-grid">
                        {enemy.map((c, i) => {
                            const { col, row } = posForHandIndex(i);
                            return (
                                <div
                                    key={c.id}
                                    className={`hand-slot col${col}`}
                                    style={{ gridColumn: col, gridRow: row }}
                                >
                                    <Card hidden />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* CENTER: HUD + board */}
                <div className="center-col">
                    <div className="hud-top">
                        <div className="hud-score red">🟥 {score.red}</div>
                        <div className={`hud-turn ${turn}`}>
                            <div className="hud-dot" />
                        </div>
                        <div className="hud-score blue">{score.blue} 🟦</div>
                    </div>

                    <div className="board">
                        {board.map((cell, i) => (
                            <div
                                key={i}
                                className={`cell ${!gameOver && selected && !cell ? "highlight" : ""}`}
                                onClick={() => placeCard(i)}
                            >
                                {cell && <Card card={cell} />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: player hand */}
                <div className="hand right">
                    <div className="hand-grid">
                        {player.map((c, i) => {
                            const { col, row } = posForHandIndex(i);
                            return (
                                <div
                                    key={c.id}
                                    className={`hand-slot col${col}`}
                                    style={{ gridColumn: col, gridRow: row }}
                                >
                                    <Card
                                        card={c}
                                        selected={selected?.id === c.id}
                                        disabled={gameOver || turn !== "player"}
                                        onClick={() => setSelected((prev) => (prev?.id === c.id ? null : c))}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

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
                    <img
                        className="card-back-logo-img"
                        src="/ui/cardclash-logo.png"
                        alt="CardClash"
                        draggable="false"
                    />
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