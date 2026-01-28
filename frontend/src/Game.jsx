import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { apiFetch } from "./api.js";
import { useWalletStore } from "./store/useWalletStore";

/* =========================
   Triple Triad (3x3) + Same/Plus/Combo + best-of-3 (to 3 wins)
   ========================= */

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const RULES = {
    same: true,
    plus: true,
    combo: true,
    elementalSquares: true,
    elementalBattle: true,
};

const MATCH_WINS_TARGET = 3;

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

const ELEMENTS = ["Earth", "Fire", "Water", "Poison", "Holy", "Thunder", "Wind", "Ice"];
const ELEM_ICON = {
    Earth: "🟫",
    Fire: "🔥",
    Water: "💧",
    Poison: "☠️",
    Holy: "✨",
    Thunder: "⚡",
    Wind: "🌪️",
    Ice: "❄️",
};

const BEATS = {
    Earth: ["Thunder"],
    Thunder: ["Water"],
    Water: ["Fire"],
    Fire: ["Ice"],
    Ice: ["Wind"],
    Wind: ["Poison"],
    Poison: ["Holy"],
    Holy: ["Earth"],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const randomFirstTurn = () => (Math.random() < 0.5 ? "player" : "enemy");
const showVal = (v) => String(v); // always digits

const RANKS = [
    { key: "common", label: "C", weight: 50, min: 1, max: 7, elemChance: 0.6 },
    { key: "rare", label: "R", weight: 30, min: 2, max: 8, elemChance: 0.7 },
    { key: "epic", label: "E", weight: 15, min: 3, max: 10, elemChance: 0.8 },
    { key: "legendary", label: "L", weight: 5, min: 4, max: 10, elemChance: 0.9 },
];

const FREEZE_DURATION_MOVES = 2;
const REVEAL_MS = 3000;

function weightedPick(defs) {
    const total = defs.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const d of defs) {
        r -= d.weight;
        if (r <= 0) return d;
    }
    return defs[defs.length - 1];
}

function genCard(owner, id) {
    const r = weightedPick(RANKS);
    const values = {
        top: randInt(r.min, r.max),
        right: randInt(r.min, r.max),
        bottom: randInt(r.min, r.max),
        left: randInt(r.min, r.max),
    };

    const hasElem = Math.random() < r.elemChance;
    const element = hasElem ? pick(ELEMENTS) : null;

    return {
        id,
        owner,
        values,
        imageUrl: ART[Math.floor(Math.random() * ART.length)],
        rank: r.key,
        rankLabel: r.label,
        element,
        placeKey: 0,
        captureKey: 0,
    };
}

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

function squareDelta(cardElement, cellElement) {
    if (!RULES.elementalSquares) return 0;
    if (!cellElement) return 0;
    if (!cardElement) return 0;
    return cardElement === cellElement ? +1 : -1;
}

function battleElementDelta(attackerElement, defenderElement) {
    if (!RULES.elementalBattle) return 0;
    if (!attackerElement || !defenderElement) return 0;

    if (attackerElement === defenderElement) return +1;
    if (BEATS[attackerElement]?.includes(defenderElement)) return +1;
    if (BEATS[defenderElement]?.includes(attackerElement)) return -1;

    return 0;
}

function valueForSamePlus(card, side, idx, boardElems) {
    const base = card.values[side];
    const d = squareDelta(card.element, boardElems[idx]);
    return clamp(base + d, 1, 10);
}

function attackerValueForBattle(attacker, side, aIdx, defender, boardElems) {
    const base = valueForSamePlus(attacker, side, aIdx, boardElems);
    const ed = battleElementDelta(attacker.element, defender.element);
    return clamp(base + ed, 1, 10);
}

function resolvePlacementTT(placedIdx, grid, boardElems) {
    const placed = grid[placedIdx];
    if (!placed) return { flippedAll: [], flippedSpecial: [] };

    const adj = neighborsOf(placedIdx)
        .map(({ ni, a, b }) => {
            const t = grid[ni];
            if (!t) return null;

            const pSP = valueForSamePlus(placed, a, placedIdx, boardElems);
            const tSP = valueForSamePlus(t, b, ni, boardElems);
            const sum = pSP + tSP;

            const pBattle = attackerValueForBattle(placed, a, placedIdx, t, boardElems);

            return { ni, a, b, target: t, pSP, tSP, sum, pBattle };
        })
        .filter(Boolean);

    const basicSet = new Set();
    const sameSet = new Set();
    const plusSet = new Set();

    // BASIC
    for (const i of adj) {
        if (i.target.owner !== placed.owner && i.pBattle > i.tSP) basicSet.add(i.ni);
    }

    // SAME
    if (RULES.same) {
        const eq = adj.filter((i) => i.pSP === i.tSP);
        if (eq.length >= 2) eq.forEach((i) => sameSet.add(i.ni));
    }

    // PLUS
    if (RULES.plus) {
        const groups = new Map();
        for (const i of adj) {
            const arr = groups.get(i.sum) || [];
            arr.push(i);
            groups.set(i.sum, arr);
        }
        for (const [, arr] of groups) if (arr.length >= 2) arr.forEach((i) => plusSet.add(i.ni));
    }

    const specialSet = new Set([...sameSet, ...plusSet]);
    const toFlip = new Set([...basicSet, ...specialSet]);

    const flippedAll = [];
    const flippedSpecial = [];

    for (const ni of toFlip) {
        if (flipToOwner(grid, ni, placed.owner)) {
            flippedAll.push(ni);
            if (specialSet.has(ni)) flippedSpecial.push(ni);
        }
    }

    return { flippedAll, flippedSpecial };
}

function captureByPowerFrom(idx, grid, boardElems) {
    const src = grid[idx];
    if (!src) return [];
    const flipped = [];

    for (const { ni, a, b } of neighborsOf(idx)) {
        const t = grid[ni];
        if (!t) continue;
        if (t.owner === src.owner) continue;

        const atk = attackerValueForBattle(src, a, idx, t, boardElems);
        const def = valueForSamePlus(t, b, ni, boardElems);

        if (atk > def) {
            if (flipToOwner(grid, ni, src.owner)) flipped.push(ni);
        }
    }
    return flipped;
}

function resolveCombo(queue, grid, boardElems) {
    if (!RULES.combo) return;
    const q = [...queue];
    while (q.length) {
        const idx = q.shift();
        const more = captureByPowerFrom(idx, grid, boardElems);
        if (more.length) q.push(...more);
    }
}

const posForHandIndex = (i) => (i < 3 ? { col: 1, row: i + 1 } : { col: 2, row: i - 2 });

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

function makeBoardElements() {
    if (!RULES.elementalSquares) return Array(9).fill(null);
    const chance = 0.38;
    return Array.from({ length: 9 }, () => (Math.random() < chance ? pick(ELEMENTS) : null));
}

function cloneDeckToHand(deck, owner) {
    return deck.map((c) => ({ ...c, owner, placeKey: 0, captureKey: 0 }));
}

function nftToCard(nft, idx) {
    return {
        id: nft.key || nft.tokenId || `nft_${idx}`,
        owner: "player",
        values: nft.stats || { top: 5, right: 5, bottom: 5, left: 5 },
        imageUrl: nft.imageUrl || ART[0],
        rank: nft.rank || "common",
        rankLabel: nft.rankLabel || "C",
        element: nft.element || null,
        placeKey: 0,
        captureKey: 0,
        nftData: nft,
    };
}

function getStoredToken() {
    try {
        return (
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            ""
        );
    } catch {
        return "";
    }
}

function getFallbackEnemyDeck() {
    return Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${i}`));
}

export default function Game({ onExit, me, playerDeck, matchId }) {
    const revealTimerRef = useRef(null);

    const { connected: nearConnected, walletAddress: nearAccountId, escrowClaim } = useWalletStore();

    const [stage2Busy, setStage2Busy] = useState(false);
    const [stage2Err, setStage2Err] = useState("");
    const [stage2Match, setStage2Match] = useState(null);

    const myTgId = me?.id ? Number(me.id) : 0;

    // AI enemy deck state (always declared!)
    const [enemyDeck, setEnemyDeck] = useState(() => getFallbackEnemyDeck());
    const [loadingEnemyDeck, setLoadingEnemyDeck] = useState(true);

    // Core state (always declared!)
    const [hands, setHands] = useState(() => ({
        player: cloneDeckToHand(playerDeck?.map((n, idx) => nftToCard(n, idx)) || [], "player"),
        enemy: cloneDeckToHand(getFallbackEnemyDeck(), "enemy"),
    }));

    const [boardElems, setBoardElems] = useState(() => makeBoardElements());
    const [board, setBoard] = useState(() => Array(9).fill(null));
    const [selected, setSelected] = useState(null);

    const [turn, setTurn] = useState(() => randomFirstTurn());
    const [series, setSeries] = useState(() => ({ player: 0, enemy: 0 }));
    const [roundNo, setRoundNo] = useState(() => 1);

    const [roundOver, setRoundOver] = useState(false);
    const [roundWinner, setRoundWinner] = useState(null);
    const [matchOver, setMatchOver] = useState(false);

    const [claimPickId, setClaimPickId] = useState(null);
    const [claimDone, setClaimDone] = useState(false);

    const [spellMode, setSpellMode] = useState(null);
    const [frozen, setFrozen] = useState(() => Array(9).fill(0));
    const [enemyRevealId, setEnemyRevealId] = useState(null);
    const [playerSpells, setPlayerSpells] = useState(() => ({ freeze: 1, reveal: 1 }));

    // refs for AI to never "miss" a move
    const boardRef = useRef(board);
    const handsRef = useRef(hands);
    const frozenRef = useRef(frozen);
    const boardElemsRef = useRef(boardElems);

    useEffect(() => void (boardRef.current = board), [board]);
    useEffect(() => void (handsRef.current = hands), [hands]);
    useEffect(() => void (frozenRef.current = frozen), [frozen]);
    useEffect(() => void (boardElemsRef.current = boardElems), [boardElems]);

    // Stage2 match refresh
    const refreshStage2Match = async () => {
        if (!matchId) return;
        try {
            const token = getStoredToken();
            if (!token) return;
            const m = await apiFetch(`/api/matches/${matchId}`, { token });
            setStage2Match(m);
        } catch {
            // ignore
        }
    };

    useEffect(() => {
        refreshStage2Match();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [matchId]);

    // Load AI deck from backend
    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                setLoadingEnemyDeck(true);
                const token = getStoredToken();
                const aiDeck = await apiFetch("/api/decks/ai_opponent", { token });
                const cards = Array.isArray(aiDeck) ? aiDeck.map((n, idx) => nftToCard(n, idx)) : [];

                if (!alive) return;

                if (cards.length === 5) setEnemyDeck(cards);
                else setEnemyDeck(getFallbackEnemyDeck());
            } catch {
                if (!alive) return;
                setEnemyDeck(getFallbackEnemyDeck());
            } finally {
                if (!alive) return;
                setLoadingEnemyDeck(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, []);

    // Sync hands on deck changes
    useEffect(() => {
        if (!Array.isArray(playerDeck) || playerDeck.length !== 5) return;
        setHands((h) => ({
            ...h,
            player: cloneDeckToHand(playerDeck.map((n, idx) => nftToCard(n, idx)), "player"),
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playerDeck]);

    useEffect(() => {
        setHands((h) => ({
            ...h,
            enemy: cloneDeckToHand(enemyDeck, "enemy"),
        }));
    }, [enemyDeck]);

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
            if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        };
    }, []);

    const decFrozenAfterCardMove = () => {
        setFrozen((prev) => prev.map((v) => (v > 0 ? v - 1 : 0)));
    };

    const startRound = ({ keepSeries = true, enemyDeckOverride = null } = {}) => {
        const ed = enemyDeckOverride || enemyDeck;

        setBoard(Array(9).fill(null));
        setBoardElems(makeBoardElements());

        if (Array.isArray(playerDeck) && playerDeck.length === 5) {
            setHands({
                player: cloneDeckToHand(playerDeck.map((n, idx) => nftToCard(n, idx)), "player"),
                enemy: cloneDeckToHand(ed, "enemy"),
            });
        } else {
            setHands({
                player: [],
                enemy: cloneDeckToHand(ed, "enemy"),
            });
        }

        setSelected(null);
        setTurn(randomFirstTurn());

        setRoundOver(false);
        setRoundWinner(null);

        setSpellMode(null);
        setFrozen(Array(9).fill(0));
        clearReveal();
        setPlayerSpells({ freeze: 1, reveal: 1 });

        if (!keepSeries) {
            setSeries({ player: 0, enemy: 0 });
            setRoundNo(1);
            setMatchOver(false);
            setClaimPickId(null);
            setClaimDone(false);
            setStage2Err("");
            setStage2Match(null);
        }
    };

    const resetMatch = () => {
        const newEnemy = Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${Date.now()}_${i}`));
        setEnemyDeck(newEnemy);
        setTimeout(() => startRound({ keepSeries: false, enemyDeckOverride: newEnemy }), 0);
    };

    const boardScore = useMemo(() => {
        return board.reduce(
            (a, c) => {
                if (!c) return a;
                c.owner === "player" ? a.blue++ : a.red++;
                return a;
            },
            { red: 0, blue: 0 }
        );
    }, [board]);

    const myName = getPlayerName(me);
    const myAvatar = getPlayerAvatarUrl(me);

    const enemyName = "BunnyBot";
    const enemyAvatar = "/ui/avatar-enemy.png?v=1";

    const canUseMagic = turn === "player" && !roundOver && !matchOver;

    const placeCard = (i) => {
        if (roundOver || matchOver) return;
        if (turn !== "player") return;
        if (!selected) return;
        if (board[i]) return;
        if (frozen[i] > 0) return;

        const next = [...board];
        next[i] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };

        const { flippedSpecial } = resolvePlacementTT(i, next, boardElems);
        resolveCombo(flippedSpecial, next, boardElems);

        setBoard(next);
        setHands((h) => ({ ...h, player: h.player.filter((c) => c.id !== selected.id) }));
        setSelected(null);
        setSpellMode(null);

        decFrozenAfterCardMove();
        setTurn("enemy");
    };

    const onCellClick = (i) => {
        if (roundOver || matchOver) return;

        if (spellMode === "freeze") {
            if (turn !== "player") return;
            if (playerSpells.freeze <= 0) return;
            if (board[i]) return;
            if (frozen[i] > 0) return;

            setFrozen((prev) => {
                const next = [...prev];
                next[i] = FREEZE_DURATION_MOVES;
                return next;
            });

            setPlayerSpells((s) => ({ ...s, freeze: Math.max(0, s.freeze - 1) }));
            setSpellMode(null);
            setTurn("enemy");
            haptic("light");
            return;
        }

        placeCard(i);
    };

    const onMagicFreeze = () => {
        if (!canUseMagic) return;
        if (playerSpells.freeze <= 0) return;
        haptic("light");
        setSelected(null);
        setSpellMode((m) => (m === "freeze" ? null : "freeze"));
    };

    const onMagicReveal = () => {
        if (!canUseMagic) return;
        if (playerSpells.reveal <= 0) return;
        if (!hands.enemy.length) return;

        haptic("light");

        const c = hands.enemy[Math.floor(Math.random() * hands.enemy.length)];
        setEnemyRevealId(c.id);

        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => {
            setEnemyRevealId(null);
            revealTimerRef.current = null;
        }, REVEAL_MS);

        setSelected(null);
        setSpellMode(null);

        setPlayerSpells((s) => ({ ...s, reveal: Math.max(0, s.reveal - 1) }));
        setTurn("enemy");
    };

    // ENEMY TURN
    useEffect(() => {
        if (turn !== "enemy" || roundOver || matchOver) return;

        const t = setTimeout(() => {
            const curBoard = boardRef.current;
            const curHands = handsRef.current;
            const curFrozen = frozenRef.current;
            const curElems = boardElemsRef.current;

            const empty = curBoard
                .map((c, idx) => (c === null && curFrozen[idx] === 0 ? idx : null))
                .filter((v) => v !== null);

            if (!empty.length || !curHands.enemy.length) {
                setTurn("player");
                return;
            }

            const cell = empty[Math.floor(Math.random() * empty.length)];
            const card = curHands.enemy[Math.floor(Math.random() * curHands.enemy.length)];

            const next = [...curBoard];
            next[cell] = { ...card, owner: "enemy", placeKey: (card.placeKey || 0) + 1 };

            const { flippedSpecial } = resolvePlacementTT(cell, next, curElems);
            resolveCombo(flippedSpecial, next, curElems);

            setBoard(next);
            setHands((h) => ({ ...h, enemy: h.enemy.filter((c) => c.id !== card.id) }));
            decFrozenAfterCardMove();
            setTurn("player");
        }, 420);

        const safety = setTimeout(() => {
            setTurn((cur) => (cur === "enemy" ? "player" : cur));
        }, 1400);

        return () => {
            clearTimeout(t);
            clearTimeout(safety);
        };
    }, [turn, roundOver, matchOver]);

    // ROUND OVER
    useEffect(() => {
        if (roundOver || matchOver) return;
        if (board.some((c) => c === null)) return;

        const red = board.filter((c) => c && c.owner === "enemy").length;
        const blue = board.filter((c) => c && c.owner === "player").length;

        const w = blue > red ? "player" : "enemy";

        setRoundWinner(w);
        setRoundOver(true);

        setSeries((s) => {
            const next = { ...s };
            if (w === "player") next.player += 1;
            if (w === "enemy") next.enemy += 1;
            return next;
        });
    }, [board, roundOver, matchOver]);

    // MATCH OVER
    useEffect(() => {
        if (matchOver) return;
        if (series.player >= MATCH_WINS_TARGET || series.enemy >= MATCH_WINS_TARGET) {
            setMatchOver(true);
            setClaimPickId(null);
            setClaimDone(false);
            if (matchId) refreshStage2Match();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [series, matchOver, matchId]);

    // CONFETTI
    useEffect(() => {
        if (!roundOver) return;
        if (roundWinner !== "player") return;

        const origin = { x: 0.5, y: 0.35 };
        const timers = [];
        timers.push(
            setTimeout(() => confetti({ zIndex: 99999, particleCount: 34, spread: 75, startVelocity: 30, origin }), 0)
        );
        timers.push(
            setTimeout(() => confetti({ zIndex: 99999, particleCount: 22, spread: 95, startVelocity: 26, origin }), 160)
        );
        return () => timers.forEach(clearTimeout);
    }, [roundOver, roundWinner]);

    const onNextRound = () => {
        setRoundNo((r) => r + 1);
        startRound({ keepSeries: true });
    };

    const matchWinner =
        series.player >= MATCH_WINS_TARGET ? "player" : series.enemy >= MATCH_WINS_TARGET ? "enemy" : null;

    const loserSide = matchWinner === "player" ? "enemy" : matchWinner === "enemy" ? "player" : null;
    const winnerSide = matchWinner;

    const playerDeckCards = useMemo(() => playerDeck.map((n, idx) => nftToCard(n, idx)), [playerDeck]);
    const loserDeck = loserSide === "enemy" ? enemyDeck : loserSide === "player" ? playerDeckCards : [];

    const stage2OpponentDeposits = useMemo(() => {
        if (!matchId || !stage2Match) return null;
        const players = stage2Match?.players || [];
        const deposits = stage2Match?.deposits || [];
        const opp = players.find((p) => Number(p.user_id) !== myTgId);
        if (!opp) return [];
        return deposits.filter((d) => Number(d.user_id) === Number(opp.user_id));
    }, [matchId, stage2Match, myTgId]);

    const onConfirmClaim = async () => {
        if (!matchOver) return;
        if (winnerSide !== "player") return;
        if (!loserSide) return;

        // Stage1
        if (!matchId) {
            if (!claimPickId) return;
            setClaimDone(true);
            haptic("medium");
            return;
        }

        setStage2Err("");
        setStage2Busy(true);

        try {
            const token = getStoredToken();
            if (!token) throw new Error("No JWT token (auth missing)");
            if (!nearConnected || !nearAccountId) throw new Error("NEAR wallet not connected");
            if (!claimPickId) throw new Error("Pick an NFT first");

            const m = await apiFetch(`/api/matches/${matchId}`, { token });
            setStage2Match(m);

            const players = m?.players || [];
            const deposits = m?.deposits || [];
            const opp = players.find((p) => Number(p.user_id) !== myTgId);
            if (!opp) throw new Error("Opponent not found in match");

            const loserUserId = Number(opp.user_id);
            const picked = deposits.find(
                (d) => String(d.id) === String(claimPickId) && Number(d.user_id) === loserUserId
            );
            if (!picked) throw new Error("Selected deposit not found (or not opponent deposit)");

            await apiFetch(`/api/matches/${matchId}/finish`, {
                method: "POST",
                token,
                body: JSON.stringify({
                    winner_user_id: myTgId,
                    loser_user_id: loserUserId,
                    nft_contract_id: picked.nft_contract_id,
                    token_id: picked.token_id,
                }),
            });

            const { txHash } = await escrowClaim({
                matchId,
                winnerAccountId: nearAccountId,
                loserNftContractId: picked.nft_contract_id,
                loserTokenId: picked.token_id,
            });

            if (txHash) {
                await apiFetch(`/api/matches/${matchId}/claim_tx`, {
                    method: "POST",
                    token,
                    body: JSON.stringify({ tx_hash: txHash }),
                });
            }

            setClaimDone(true);
            haptic("medium");
        } catch (e) {
            setStage2Err(String(e?.message || e));
        } finally {
            setStage2Busy(false);
        }
    };

    // UI guard rendering (no early returns before hooks)
    const deckOk = Array.isArray(playerDeck) && playerDeck.length === 5;

    const overlayLoading = loadingEnemyDeck;

    return (
        <div className="game-root">
            <div className="game-ui tt-layout">
                <button className="exit" onClick={onExit}>
                    ← Меню
                </button>

                {!deckOk ? (
                    <div style={{ color: "#fff", padding: 20, textAlign: "center", gridColumn: "1 / -1", fontSize: 14 }}>
                        ⚠️ Ошибка: активная колода не содержит 5 карт.
                        <br />
                        Вернитесь в Инвентарь и выберите 5 NFT.
                    </div>
                ) : null}

                {deckOk ? (
                    <>
                        <div className="hud-corner hud-score red hud-near-left">🟥 {boardScore.red}</div>
                        <div className="hud-corner hud-score blue hud-near-right">
                            {boardScore.blue} 🟦
                        </div>

                        <PlayerBadge side="enemy" name={enemyName} avatarUrl={enemyAvatar} active={turn === "enemy"} />
                        <PlayerBadge side="player" name={getPlayerName(me)} avatarUrl={myAvatar} active={turn === "player"} />

                        {/* LEFT enemy hand */}
                        <div className="hand left">
                            <div className="hand-grid">
                                {hands.enemy.map((c, i) => {
                                    const { col, row } = posForHandIndex(i);
                                    const isRevealed = enemyRevealId === c.id;
                                    return (
                                        <div key={c.id} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
                                            {isRevealed ? <Card card={c} disabled /> : <Card hidden />}
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="magic-column enemy" aria-hidden="true">
                                <button className="magic-btn freeze" disabled title="Enemy magic (soon)">
                                    <span className="magic-ic">❄</span>
                                </button>
                                <button className="magic-btn reveal" disabled title="Enemy magic (soon)">
                                    <span className="magic-ic">👁</span>
                                </button>
                            </div>
                        </div>

                        {/* CENTER BOARD */}
                        <div className="center-col">
                            <div className="board">
                                {board.map((cell, i) => {
                                    const isFrozen = frozen[i] > 0;
                                    const canHighlight =
                                        !roundOver &&
                                        !matchOver &&
                                        !cell &&
                                        !isFrozen &&
                                        ((spellMode === "freeze" && turn === "player") || (spellMode == null && selected));

                                    const elem = boardElems[i];

                                    return (
                                        <div
                                            key={i}
                                            className={`cell ${canHighlight ? "highlight" : ""} ${isFrozen ? "frozen" : ""}`}
                                            onClick={() => onCellClick(i)}
                                            title={isFrozen ? `Frozen (${frozen[i]})` : elem ? `Element: ${elem}` : undefined}
                                        >
                                            {elem && (
                                                <div className="elem-bg" aria-hidden="true">
                                                    {ELEM_ICON[elem]}
                                                </div>
                                            )}
                                            {cell && <Card card={cell} cellElement={elem} />}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* RIGHT player hand */}
                        <div className="hand right">
                            <div className="hand-grid">
                                {hands.player.map((c, i) => {
                                    const { col, row } = posForHandIndex(i);
                                    return (
                                        <div key={c.id} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
                                            <Card
                                                card={c}
                                                selected={selected?.id === c.id}
                                                disabled={roundOver || matchOver || turn !== "player" || spellMode === "freeze"}
                                                onClick={() => setSelected((prev) => (prev?.id === c.id ? null : c))}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="magic-column player">
                                <button
                                    className={`magic-btn freeze ${spellMode === "freeze" ? "active" : ""}`}
                                    onClick={onMagicFreeze}
                                    disabled={!canUseMagic || playerSpells.freeze <= 0}
                                    title="Freeze (house rule)"
                                >
                                    <span className="magic-ic">❄</span>
                                    <span className="magic-count">{playerSpells.freeze}</span>
                                </button>

                                <button
                                    className="magic-btn reveal"
                                    onClick={onMagicReveal}
                                    disabled={!canUseMagic || playerSpells.reveal <= 0}
                                    title="Reveal (house rule)"
                                >
                                    <span className="magic-ic">👁</span>
                                    <span className="magic-count">{playerSpells.reveal}</span>
                                </button>
                            </div>
                        </div>

                        {/* LOADING OVERLAY (enemy deck) */}
                        {overlayLoading ? (
                            <div className="game-over">
                                <div className="game-over-box" style={{ minWidth: 320 }}>
                                    <h2 style={{ margin: 0 }}>Загрузка соперника…</h2>
                                    <div style={{ opacity: 0.85, fontSize: 12, marginTop: 10 }}>
                                        Получаем AI deck из backend…
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* GAME OVER / MATCH OVER */}
                        {(roundOver || matchOver) && (
                            <div className="game-over">
                                <div className="game-over-box" style={{ minWidth: 320 }}>
                                    <h2 style={{ marginBottom: 8 }}>
                                        {matchOver
                                            ? matchWinner === "player"
                                                ? "Матч выигран"
                                                : "Матч проигран"
                                            : roundWinner === "player"
                                                ? "Победа"
                                                : "Поражение"}
                                    </h2>

                                    <div style={{ opacity: 0.9, fontSize: 12, marginBottom: 10 }}>
                                        Раунд {roundNo} • Серия до {MATCH_WINS_TARGET} • Счёт {series.player}:{series.enemy}
                                    </div>

                                    {matchId ? (
                                        <div style={{ fontSize: 11, opacity: 0.85, marginBottom: 10, fontFamily: "monospace" }}>
                                            Stage2 matchId: {matchId}
                                        </div>
                                    ) : null}

                                    {matchOver && matchWinner && loserSide && (
                                        <>
                                            <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>
                                                {matchWinner === "player"
                                                    ? "Выбери 1 карту соперника"
                                                    : "Соперник забирает 1 твою карту"}
                                            </div>

                                            {matchWinner === "player" ? (
                                                <>
                                                    {matchId && Array.isArray(stage2OpponentDeposits) ? (
                                                        <>
                                                            {stage2OpponentDeposits.length ? (
                                                                <div
                                                                    style={{
                                                                        display: "grid",
                                                                        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                                                                        gap: 8,
                                                                        marginBottom: 10,
                                                                    }}
                                                                >
                                                                    {stage2OpponentDeposits.map((d) => (
                                                                        <div
                                                                            key={d.id}
                                                                            onClick={() => !claimDone && setClaimPickId(String(d.id))}
                                                                            style={{
                                                                                cursor: claimDone ? "default" : "pointer",
                                                                                outline:
                                                                                    claimPickId === String(d.id)
                                                                                        ? "2px solid rgba(120,200,255,0.75)"
                                                                                        : "1px solid rgba(255,255,255,0.12)",
                                                                                borderRadius: 12,
                                                                                padding: 10,
                                                                                background: "rgba(0,0,0,0.35)",
                                                                                fontSize: 11,
                                                                                fontFamily: "monospace",
                                                                                opacity: claimDone ? 0.6 : 1,
                                                                            }}
                                                                        >
                                                                            <div style={{ fontWeight: 900, marginBottom: 6 }}>NFT</div>
                                                                            <div style={{ opacity: 0.9 }}>{d.nft_contract_id}</div>
                                                                            <div style={{ opacity: 0.9 }}>{d.token_id}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 10 }}>
                                                                    Нет депозитов соперника в матче. Stage2 claim невозможен (нужно lock 5 NFT до боя).
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div
                                                            style={{
                                                                display: "grid",
                                                                gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                                                                gap: 8,
                                                                marginBottom: 10,
                                                            }}
                                                        >
                                                            {loserDeck.map((c) => (
                                                                <div
                                                                    key={c.id}
                                                                    onClick={() => !claimDone && setClaimPickId(c.id)}
                                                                    style={{
                                                                        cursor: claimDone ? "default" : "pointer",
                                                                        outline:
                                                                            claimPickId === c.id
                                                                                ? "2px solid rgba(120,200,255,0.75)"
                                                                                : "1px solid rgba(255,255,255,0.12)",
                                                                        borderRadius: 12,
                                                                        padding: 4,
                                                                        opacity: claimDone ? 0.6 : 1,
                                                                    }}
                                                                >
                                                                    <Card card={c} disabled />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {!claimDone ? (
                                                        <button disabled={!claimPickId || stage2Busy} onClick={onConfirmClaim}>
                                                            {stage2Busy ? "On-chain..." : "Забрать выбранную карту"}
                                                        </button>
                                                    ) : (
                                                        <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12 }}>
                                                            Карта получена. {matchId ? "Stage2 (on-chain)." : "Stage1 (off-chain)."}
                                                        </div>
                                                    )}

                                                    {stage2Err ? (
                                                        <div style={{ marginTop: 8, color: "#ffb3b3", fontSize: 12 }}>{stage2Err}</div>
                                                    ) : null}

                                                    {matchId && !nearConnected ? (
                                                        <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                                                            Для Stage2 claim нужен подключённый NEAR кошелёк (HERE).
                                                        </div>
                                                    ) : null}
                                                </>
                                            ) : (
                                                <div style={{ opacity: 0.85, fontSize: 12, marginBottom: 10 }}>(Пока AI не выбирает.)</div>
                                            )}
                                        </>
                                    )}

                                    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                                        {!matchOver && <button onClick={onNextRound}>Следующий раунд</button>}
                                        {matchOver && <button onClick={resetMatch}>Новый матч</button>}
                                        <button onClick={onExit}>Меню</button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                ) : null}
            </div>
        </div>
    );
}

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

function Card({ card, onClick, selected, disabled, hidden, cellElement }) {
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
                    <img className="card-back-logo-img" src="/ui/cardclash-logo.png?v=3" alt="CardClash" draggable="false" loading="lazy" />
                </div>
            </div>
        );
    }

    const sd = card.element && cellElement ? (card.element === cellElement ? +1 : -1) : 0;

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
                    src={card.imageUrl || "/cards/card.jpg"}
                    alt=""
                    draggable="false"
                    loading="lazy"
                    onError={(e) => {
                        try {
                            e.currentTarget.src = "/cards/card.jpg";
                        } catch { }
                    }}
                />

                {card.element ? (
                    <div className="card-elem-pill" title={card.element}>
                        <span className="card-elem-ic">{ELEM_ICON[card.element]}</span>
                        {sd !== 0 ? <span className="card-elem-delta">{sd > 0 ? "+1" : "-1"}</span> : null}
                    </div>
                ) : null}

                <div className="tt-badge" />
                <span className="tt-num top">{showVal(card.values.top)}</span>
                <span className="tt-num left">{showVal(card.values.left)}</span>
                <span className="tt-num right">{showVal(card.values.right)}</span>
                <span className="tt-num bottom">{showVal(card.values.bottom)}</span>
            </div>
        </div>
    );
}