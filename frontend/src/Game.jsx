import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Triple Triad directions:
 * placed.values[a] compares vs neighbor.values[b]
 */
const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const rand = () => Math.ceil(Math.random() * 9);

// Vite base URL (для деплоя в подпапку)
const BASE = import.meta.env.BASE_URL || "/";
const withBase = (p) => {
    const base = BASE.endsWith("/") ? BASE : BASE + "/";
    const path = p.startsWith("/") ? p.slice(1) : p;
    return base + path;
};

// арты (можешь заменить/расширить)
const ART = [
    "cards/card.jpg",
    "cards/card1.jpg",
    "cards/card2.jpg",
    "cards/card3.jpg",
    "cards/card4.jpg",
    "cards/card5.jpg",
    "cards/card6.jpg",
    "cards/card7.jpg",
    "cards/card8.jpg",
    "cards/card9.jpg",
].map(withBase);

const RULES = {
    combo: true,
    same: true,
    plus: true,
};

const genCard = (owner, id) => ({
    id,
    owner,
    values: { top: rand(), right: rand(), bottom: rand(), left: rand() },
    imageUrl: ART[Math.floor(Math.random() * ART.length)],
    rarity: "common",

    // keys for animations
    placeKey: 0,    // when card is placed on board
    captureKey: 0,  // when card is captured (bounce)
    specialKey: 0,  // when Same/Plus triggers on placed card
    specialType: "", // "same" | "plus" | "both"
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

/**
 * Capture helper (flip target card to newOwner with animation key bump)
 */
function flipToOwner(grid, ni, newOwner) {
    const t = grid[ni];
    if (!t) return false;
    if (t.owner === newOwner) return false;

    grid[ni] = {
        ...t,
        owner: newOwner,
        captureKey: (t.captureKey || 0) + 1,
    };
    return true;
}

/**
 * Resolve a placement using Power + Same + Plus (conditions computed from snapshot),
 * returns indices of flipped cards (direct flips only).
 */
function resolvePlacementFlips(placedIdx, grid, rules) {
    const placed = grid[placedIdx];
    if (!placed) return { flipped: [], specialType: "" };

    // snapshot neighbor values/owners at the moment of placement
    const infos = neighborsOf(placedIdx)
        .map(({ ni, a, b }) => {
            const target = grid[ni];
            if (!target) return null;
            const p = placed.values[a];
            const q = target.values[b];
            return {
                ni,
                a,
                b,
                placedSide: p,
                targetSide: q,
                sum: p + q,
                targetOwner: target.owner,
            };
        })
        .filter(Boolean);

    const toFlip = new Set();

    // 1) Power rule
    for (const info of infos) {
        if (info.placedSide > info.targetSide) {
            toFlip.add(info.ni);
        }
    }

    // 2) Same rule (condition can be satisfied by any adjacent cards; flip only opponents)
    let sameTriggered = false;
    if (rules.same) {
        const eq = infos.filter((i) => i.placedSide === i.targetSide);
        if (eq.length >= 2) {
            sameTriggered = true;
            for (const i of eq) toFlip.add(i.ni);
        }
    }

    // 3) Plus rule (group by equal sums; if any sum appears >=2 -> triggers)
    let plusTriggered = false;
    if (rules.plus) {
        const groups = new Map();
        for (const i of infos) {
            const key = i.sum;
            const arr = groups.get(key) || [];
            arr.push(i);
            groups.set(key, arr);
        }
        for (const [, arr] of groups) {
            if (arr.length >= 2) {
                plusTriggered = true;
                for (const i of arr) toFlip.add(i.ni);
            }
        }
    }

    const specialType =
        sameTriggered && plusTriggered ? "both" : sameTriggered ? "same" : plusTriggered ? "plus" : "";

    // Apply flips (only if opponent)
    const flipped = [];
    for (const ni of toFlip) {
        if (flipToOwner(grid, ni, placed.owner)) flipped.push(ni);
    }

    return { flipped, specialType };
}

/**
 * Combo propagation:
 * In Triple Triad, combo typically propagates using the normal Power rule
 * from cards that were captured by Same/Plus/Power.
 */
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

export default function Game({ onExit }) {
    const makeHands = () => ({
        player: Array.from({ length: 5 }, (_, i) => genCard("player", `p${i}`)),
        enemy: Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`)),
    });

    const [{ player, enemy }, setHands] = useState(makeHands);
    const [board, setBoard] = useState(Array(9).fill(null));
    const [selected, setSelected] = useState(null);
    const [turn, setTurn] = useState("player");

    const [gameOver, setGameOver] = useState(false);
    const [winner, setWinner] = useState(null);

    // guard for StrictMode (dev) to avoid double AI move
    const aiGuard = useRef({ handled: false });

    const reset = () => {
        setHands(makeHands());
        setBoard(Array(9).fill(null));
        setSelected(null);
        setTurn("player");
        setGameOver(false);
        setWinner(null);
        aiGuard.current.handled = false;
    };

    const placeCard = (i) => {
        if (turn !== "player") return;
        if (!selected || board[i]) return;

        const next = [...board];
        const placed = {
            ...selected,
            owner: "player",
            placeKey: (selected.placeKey || 0) + 1,
        };

        next[i] = placed;

        // resolve placement (Power + Same + Plus)
        const { flipped, specialType } = resolvePlacementFlips(i, next, RULES);

        // mark special on the placed card (for flash animation)
        if (specialType) {
            next[i] = {
                ...next[i],
                specialType,
                specialKey: (next[i].specialKey || 0) + 1,
            };
        }

        // combo propagation (power rule only) from all flipped cards
        resolveCombo(flipped, next, RULES);

        setBoard(next);
        setHands((h) => ({ ...h, player: h.player.filter((c) => c.id !== selected.id) }));
        setSelected(null);

        aiGuard.current.handled = false;
        setTurn("enemy");
    };

    // AI (рандом)
    useEffect(() => {
        if (turn !== "enemy" || gameOver) return;
        if (aiGuard.current.handled) return;
        aiGuard.current.handled = true;

        const empty = board
            .map((c, idx) => (c === null ? idx : null))
            .filter((v) => v !== null);

        if (!empty.length || !enemy.length) {
            setTurn("player");
            return;
        }

        const cell = empty[Math.floor(Math.random() * empty.length)];
        const card = enemy[Math.floor(Math.random() * enemy.length)];

        const next = [...board];
        next[cell] = {
            ...card,
            owner: "enemy",
            placeKey: (card.placeKey || 0) + 1,
        };

        const { flipped, specialType } = resolvePlacementFlips(cell, next, RULES);

        if (specialType) {
            next[cell] = {
                ...next[cell],
                specialType,
                specialKey: (next[cell].specialKey || 0) + 1,
            };
        }

        resolveCombo(flipped, next, RULES);

        const t = setTimeout(() => {
            setBoard(next);
            setHands((h) => ({ ...h, enemy: h.enemy.filter((c) => c.id !== card.id) }));
            setTurn("player");
        }, 450);

        return () => clearTimeout(t);
    }, [turn, gameOver, board, enemy]);

    // Game over
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

    return (
        <div className="game-root">

            <button className="exit" onClick={onExit}>← Меню</button>
            <video
                className="table-video"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                poster={`${import.meta.env.BASE_URL}table.jpg`}
            >
                <source src={`${import.meta.env.BASE_URL}table.mp4`} type="video/mp4" />
            </video>
            {gameOver && (
                <div className="game-over">
                    <div className="game-over-box">
                        <h2>
                            {winner === "player" && "Победа"}
                            {winner === "enemy" && "Поражение"}
                            {winner === "draw" && "Ничья"}
                        </h2>
                        <div className="game-over-buttons">
                            <button onClick={reset}>Заново</button>
                            <button onClick={onExit}>Меню</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="hand top">
                {enemy.map((c) => (
                    <div key={c.id} className="hand-slot">
                        <Card card={c} disabled />
                    </div>
                ))}
            </div>

            <div className="scorebar">🟥 {score.red} : {score.blue} 🟦</div>

            <div className="board">
                {board.map((cell, i) => (
                    <div
                        key={i}
                        className={`cell ${selected && !cell ? "highlight" : ""}`}
                        onClick={() => placeCard(i)}
                    >
                        {cell && <Card card={cell} />}
                    </div>
                ))}
            </div>

            <div className="hand bottom">
                {player.map((c) => (
                    <div key={c.id} className="hand-slot">
                        <Card
                            card={c}
                            selected={selected?.id === c.id}
                            onClick={() => setSelected(c)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}

function Card({ card, onClick, selected, disabled }) {
    const [placedAnim, setPlacedAnim] = useState(false);
    const [capturedAnim, setCapturedAnim] = useState(false);
    const [specialAnim, setSpecialAnim] = useState(false);

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

    useEffect(() => {
        if (!card?.specialKey) return;
        setSpecialAnim(true);
        const t = setTimeout(() => setSpecialAnim(false), 520);
        return () => clearTimeout(t);
    }, [card?.specialKey]);

    const specialClass =
        card.specialType === "both"
            ? "special-both"
            : card.specialType === "same"
                ? "special-same"
                : card.specialType === "plus"
                    ? "special-plus"
                    : "";

    return (
        <div
            className={[
                "card",
                card.owner === "player" ? "player" : "enemy",
                selected ? "selected" : "",
                disabled ? "disabled" : "",
                placedAnim ? "is-placed" : "",
                capturedAnim ? "is-captured" : "",
                specialAnim ? "is-special" : "",
                specialClass,
            ].join(" ")}
            onClick={disabled ? undefined : onClick}
        >
            <div className="card-anim">
                <img
                    className="card-art-img"
                    src={card.imageUrl}
                    alt=""
                    draggable="false"
                />

                <div className="tt-badge" />
                <span className="tt-num top">{card.values.top}</span>
                <span className="tt-num left">{card.values.left}</span>
                <span className="tt-num right">{card.values.right}</span>
                <span className="tt-num bottom">{card.values.bottom}</span>
            </div>
        </div>
    );
}