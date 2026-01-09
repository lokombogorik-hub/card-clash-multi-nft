import React, { useEffect, useMemo, useRef, useState } from "react";

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const rand = () => Math.ceil(Math.random() * 9);

// base url (важно для деплоя в подпапку)
const BASE = import.meta.env.BASE_URL || "/";
const withBase = (p) => {
    const base = BASE.endsWith("/") ? BASE : BASE + "/";
    const path = p.startsWith("/") ? p.slice(1) : p;
    return base + path;
};

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

/**
 * RULES:
 * - combo: цепочка захватов (Combo). Включено.
 * При желании позже добавим Same/Plus/Elemental.
 */
const RULES = {
    combo: true,
};

const genCard = (owner, id) => ({
    id,
    owner,
    values: { top: rand(), right: rand(), bottom: rand(), left: rand() },
    imageUrl: ART[Math.floor(Math.random() * ART.length)],
    rarity: "common",
    placeKey: 0,   // для анимации выкладывания
    captureKey: 0, // для анимации захвата (подпрыгивание)
});

function getNeighbors(idx) {
    const x = idx % 3;
    const y = Math.floor(idx / 3);

    const res = [];
    for (const { dx, dy, a, b } of DIRS) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 2 || ny < 0 || ny > 2) continue;
        const ni = ny * 3 + nx;
        res.push({ ni, a, b });
    }
    return res;
}

/**
 * Захват по базовому правилу: если side(placed) > opposite(side(neighbor)) → захват.
 * Возвращает массив индексов захваченных карт.
 */
function captureByPower(sourceIdx, grid) {
    const source = grid[sourceIdx];
    if (!source) return [];

    const flipped = [];

    for (const { ni, a, b } of getNeighbors(sourceIdx)) {
        const target = grid[ni];
        if (!target) continue;
        if (target.owner === source.owner) continue;

        if (source.values[a] > target.values[b]) {
            grid[ni] = {
                ...target,
                owner: source.owner,
                captureKey: (target.captureKey || 0) + 1,
            };
            flipped.push(ni);
        }
    }

    return flipped;
}

/**
 * Полное разрешение хода с Combo:
 * 1) захваты от поставленной карты
 * 2) если включено combo → каждый захваченный может дальше захватывать и т.д.
 */
function resolveMoveCaptures(placedIdx, grid, rules) {
    const allFlipped = [];
    const queue = [];

    const first = captureByPower(placedIdx, grid);
    allFlipped.push(...first);
    queue.push(...first);

    if (!rules.combo) return allFlipped;

    // Combo: захваченные карты тоже захватывают дальше
    while (queue.length) {
        const idx = queue.shift();
        const more = captureByPower(idx, grid);
        if (more.length) {
            allFlipped.push(...more);
            queue.push(...more);
        }
    }

    return allFlipped;
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

    // защита от двойного AI-хода в dev из-за StrictMode
    const aiGuard = useRef({ handled: false });

    const reset = () => {
        const h = makeHands();
        setHands(h);
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

        // захваты + цепочки
        resolveMoveCaptures(i, next, RULES);

        setBoard(next);
        setHands((h) => ({ ...h, player: h.player.filter((c) => c.id !== selected.id) }));
        setSelected(null);

        aiGuard.current.handled = false;
        setTurn("enemy");
    };

    // AI (пока рандом, позже сделаем “умный”)
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
        const placed = {
            ...card,
            owner: "enemy",
            placeKey: (card.placeKey || 0) + 1,
        };

        next[cell] = placed;

        resolveMoveCaptures(cell, next, RULES);

        const t = setTimeout(() => {
            setBoard(next);
            setHands((h) => ({ ...h, enemy: h.enemy.filter((c) => c.id !== card.id) }));
            setTurn("player");
        }, 450);

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

    return (
        <div className="game-root">
            <button className="exit" onClick={onExit}>← Меню</button>

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

    useEffect(() => {
        if (!card?.placeKey) return;
        setPlacedAnim(true);
        const t = setTimeout(() => setPlacedAnim(false), 260);
        return () => clearTimeout(t);
    }, [card?.placeKey]);

    useEffect(() => {
        if (!card?.captureKey) return;
        setCapturedAnim(true);
        const t = setTimeout(() => setCapturedAnim(false), 320);
        return () => clearTimeout(t);
    }, [card?.captureKey]);

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
                <img
                    className="card-art-img"
                    src={card.imageUrl}
                    alt=""
                    draggable="false"
                    onError={() => console.error("Не загрузилась картинка карты:", card.imageUrl)}
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