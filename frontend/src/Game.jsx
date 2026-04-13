import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { apiFetch } from "./api.js";
import { useWalletConnect } from "./context/WalletConnectContext";

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */

const DIRS = [
    { dx: 0, dy: -1, a: "top", b: "bottom" },
    { dx: 1, dy: 0, a: "right", b: "left" },
    { dx: 0, dy: 1, a: "bottom", b: "top" },
    { dx: -1, dy: 0, a: "left", b: "right" },
];

const RULES = {
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
    Earth: "🌍",
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

const ACE_VALUE = 10;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const randomFirstTurn = () => (Math.random() < 0.5 ? "player" : "enemy");

const RANKS = [
    { key: "common", label: "C", weight: 50, min: 1, max: 5, elemChance: 1.0, aceChance: 0 },
    { key: "rare", label: "R", weight: 30, min: 2, max: 7, elemChance: 1.0, aceChance: 0 },
    { key: "epic", label: "E", weight: 15, min: 3, max: 8, elemChance: 1.0, aceChance: 0.15 },
    { key: "legendary", label: "L", weight: 5, min: 4, max: 9, elemChance: 1.0, aceChance: 0.4 },
];

const FREEZE_DURATION_MOVES = 2;
const REVEAL_MS = 3000;

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

function weightedPick(defs) {
    const total = defs.reduce((s, d) => s + d.weight, 0);
    let r = Math.random() * total;
    for (const d of defs) {
        r -= d.weight;
        if (r <= 0) return d;
    }
    return defs[defs.length - 1];
}

function isAce(val) {
    return Number(val) === ACE_VALUE;
}

function displayVal(val) {
    if (isAce(val)) return "A";
    return val;
}

function genCard(owner, id) {
    const r = weightedPick(RANKS);
    const maxVal = Math.min(r.max, 9);
    const minVal = Math.max(r.min, 1);

    const values = {
        top: randInt(minVal, maxVal),
        right: randInt(minVal, maxVal),
        bottom: randInt(minVal, maxVal),
        left: randInt(minVal, maxVal),
    };

    if (r.aceChance > 0 && Math.random() < r.aceChance) {
        const sides = ["top", "right", "bottom", "left"];
        const aceSide = pick(sides);
        values[aceSide] = ACE_VALUE;
    }

    const element = pick(ELEMENTS);

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

// ✅ ИСПРАВЛЕНО: правильная проверка границ сетки 3x3
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

function resolvePlacement(placedIdx, grid, boardElems) {
    const placed = grid[placedIdx];
    if (!placed) return [];

    const flipped = [];

    for (const { ni, a, b } of neighborsOf(placedIdx)) {
        const target = grid[ni];
        if (!target || target.owner === placed.owner) continue;

        const attackBase = Number(placed.values?.[a] ?? 1);
        const defendBase = Number(target.values?.[b] ?? 1);

        const placedCellElem = boardElems?.[placedIdx] ?? null;
        const targetCellElem = boardElems?.[ni] ?? null;

        const attackBonus = placedCellElem
            ? (placed.element === placedCellElem ? +1 : -1)
            : 0;

        const defendBonus = targetCellElem
            ? (target.element === targetCellElem ? +1 : -1)
            : 0;

        const attackVal = attackBase === ACE_VALUE
            ? ACE_VALUE
            : Math.min(9, Math.max(1, attackBase + attackBonus));

        const defendVal = defendBase === ACE_VALUE
            ? ACE_VALUE
            : Math.min(9, Math.max(1, defendBase + defendBonus));

        if (Number(attackVal) > Number(defendVal)) {
            if (flipToOwner(grid, ni, placed.owner)) {
                flipped.push(ni);
            }
        }
    }

    return flipped;
}

// ✅ ИСПРАВЛЕНО: безопасный nftToCard с защитой от null/undefined
function nftToCard(nft, idx) {
    if (!nft) {
        return genCard("player", `fallback_${idx}`);
    }

    let element = nft.element;
    if (!element || !ELEMENTS.includes(element)) {
        const id = nft.id || nft.key || nft.tokenId || nft.token_id || `nft_${idx}`;
        const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        element = ELEMENTS[hash % ELEMENTS.length];
    }

    const rankKey = nft.rank || (nft.rarity && (nft.rarity.key || nft.rarity)) || "common";
    const rankDef = RANKS.find(r => r.key === rankKey) || RANKS[0];

    const rawValues = nft.values || nft.stats || {};

    // ✅ Все значения приводим к числам с fallback
    const values = {
        top: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.top) || 5)),
        right: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.right) || 5)),
        bottom: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.bottom) || 5)),
        left: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.left) || 5)),
    };

    if (rankDef.aceChance > 0) {
        const hasAce = Object.values(values).some(v => v === ACE_VALUE);
        if (!hasAce) {
            const id = nft.id || nft.key || nft.tokenId || nft.token_id || `nft_${idx}`;
            const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            if ((hash % 100) / 100 < rankDef.aceChance) {
                const sides = ["top", "right", "bottom", "left"];
                values[sides[hash % 4]] = ACE_VALUE;
            }
        }
    }

    const imageUrl = nft.imageUrl || nft.image || nft.metadata?.media || nft.metadata?.image || "";

    return {
        id: nft.id || nft.key || nft.tokenId || nft.token_id || `nft_${idx}`,
        owner: nft.owner || "player",
        values,
        imageUrl,
        rank: rankKey,
        rankLabel: nft.rankLabel || rankKey[0].toUpperCase(),
        element,
        placeKey: 0,
        captureKey: 0,
        nftData: nft,
    };
}

// ✅ ИСПРАВЛЕНО: безопасный парсинг карты с сервера (для PvP board/hand)
function serverCardToCard(cell, owner, prevCard) {
    if (!cell) return null;

    const rawValues = cell.values || cell.stats || {};
    const values = {
        top: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.top) || 5)),
        right: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.right) || 5)),
        bottom: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.bottom) || 5)),
        left: Math.min(ACE_VALUE, Math.max(1, Number(rawValues.left) || 5)),
    };

    let element = cell.element;
    if (!element || !ELEMENTS.includes(element)) {
        const id = cell.id || cell.token_id || cell.tokenId || "unknown";
        const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        element = ELEMENTS[hash % ELEMENTS.length];
    }

    return {
        id: cell.id || cell.token_id || cell.tokenId || `card_${Math.random()}`,
        owner,
        values,
        imageUrl: cell.imageUrl || cell.image || cell.metadata?.media || cell.metadata?.image || "",
        rank: cell.rank || "common",
        rankLabel: cell.rankLabel || (cell.rank ? cell.rank[0].toUpperCase() : "C"),
        element,
        placeKey: prevCard?.placeKey || 0,
        captureKey: prevCard?.captureKey || 0,
        nftData: cell,
    };
}

function makeBoardElements() {
    if (!RULES.elementalSquares) return Array(9).fill(null);
    const chance = 0.38;
    return Array.from({ length: 9 }, () => (Math.random() < chance ? pick(ELEMENTS) : null));
}

function cloneDeckToHand(deck, owner) {
    return deck.map((c) => ({ ...c, owner, placeKey: 0, captureKey: 0 }));
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

/* ═══════════════════════════════════════════════
   GAME COMPONENT
   ═══════════════════════════════════════════════ */

export default function Game({ onExit, me, playerDeck, matchId, mode = "ai" }) {
    const revealTimerRef = useRef(null);
    const wsRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const mountedRef = useRef(true);

    // ✅ myPlayerIdRef для использования в замыканиях WS без stale state
    const myPlayerIdRef = useRef(null);
    const myRoleRef = useRef(null);
    const pvpStateRef = useRef(null);

    const {
        connected: nearConnected,
        accountId: nearAccountId,
        signAndSendTransaction,
    } = useWalletConnect();

    const [wsConnected, setWsConnected] = useState(false);
    const [wsError, setWsError] = useState("");
    const [pvpState, setPvpState] = useState(null);
    const [myRole, setMyRole] = useState(null);
    const [opponentConnected, setOpponentConnected] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(false);
    const [reconnectDeadline, setReconnectDeadline] = useState(null);
    const [myPlayerId, setMyPlayerId] = useState(null);

    const isPvP = mode === "pvp" && Boolean(matchId);

    const [claimCards, setClaimCards] = useState([]);
    const [claimPickIndex, setClaimPickIndex] = useState(null);
    const [claimRevealed, setClaimRevealed] = useState(false);
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimDone, setClaimDone] = useState(false);
    const [claimError, setClaimError] = useState("");
    const [claimedCard, setClaimedCard] = useState(null);

    const [stage2Busy, setStage2Busy] = useState(false);
    const [stage2Err, setStage2Err] = useState("");
    const [stage2Match, setStage2Match] = useState(null);

    const myTgId = me?.id ? Number(me.id) : 0;
    const isStage2 = mode === "pvp" && Boolean(matchId);

    const [enemyDeck, setEnemyDeck] = useState(() => getFallbackEnemyDeck());
    const [loadingEnemyDeck, setLoadingEnemyDeck] = useState(true);

    const [hands, setHands] = useState(() => ({
        player: cloneDeckToHand(
            Array.isArray(playerDeck) && playerDeck.length === 5
                ? playerDeck.map((n, idx) => nftToCard(n, idx))
                : [],
            "player"
        ),
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

    const [spellMode, setSpellMode] = useState(null);
    const [frozen, setFrozen] = useState(() => Array(9).fill(0));
    const [enemyRevealId, setEnemyRevealId] = useState(null);
    const [playerSpells, setPlayerSpells] = useState(() => ({ freeze: 1, reveal: 1 }));

    const boardRef = useRef(board);
    const handsRef = useRef(hands);
    const frozenRef = useRef(frozen);
    const boardElemsRef = useRef(boardElems);

    useEffect(() => void (boardRef.current = board), [board]);
    useEffect(() => void (handsRef.current = hands), [hands]);
    useEffect(() => void (frozenRef.current = frozen), [frozen]);
    useEffect(() => void (boardElemsRef.current = boardElems), [boardElems]);

    const deckOk = Array.isArray(playerDeck) && playerDeck.length === 5;

    // ✅ Синхронизируем ref с state для использования в WS-замыканиях
    useEffect(() => {
        myPlayerIdRef.current = myPlayerId;
    }, [myPlayerId]);

    useEffect(() => {
        myRoleRef.current = myRole;
    }, [myRole]);

    useEffect(() => {
        pvpStateRef.current = pvpState;
    }, [pvpState]);

    // ==================== Helpers для PvP ====================

    // ✅ Безопасное получение effectiveMyPlayerId без stale closure
    const getEffectiveMyPlayerId = (data) => {
        if (myPlayerIdRef.current) return myPlayerIdRef.current;
        const role = myRoleRef.current || data?.you_are;
        const state = pvpStateRef.current || data?.state;
        if (role && state) {
            return role === "player1" ? state.player1_id : state.player2_id;
        }
        return null;
    };

    // ==================== PvP WebSocket Logic ====================
    useEffect(() => {
        if (!isPvP || !matchId) return;

        mountedRef.current = true;

        const token = getStoredToken();
        if (!token) {
            setWsError("No auth token");
            return;
        }

        const apiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
        if (!apiUrl) {
            setWsError("No API URL configured");
            return;
        }

        const wsBase = apiUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
        const wsUrl = `${wsBase}/ws/match/${matchId}`;

        let ws = null;
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        let reconnectTimeout = null;

        const connect = () => {
            if (!mountedRef.current) return;

            try {
                ws = new WebSocket(wsUrl);
                wsRef.current = ws;
            } catch (err) {
                setWsError("Failed to connect");
                return;
            }

            ws.onopen = () => {
                if (!mountedRef.current) {
                    ws.close();
                    return;
                }
                reconnectAttempts = 0;
                setWsError("");
                try {
                    ws.send(JSON.stringify({ type: "auth", token }));
                } catch (err) { }
            };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;

                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    console.error("[WS] Failed to parse message:", e);
                    return;
                }

                try {
                    switch (data.type) {
                        case "connected":
                            setWsConnected(true);
                            setMyRole(data.you_are);
                            myRoleRef.current = data.you_are;
                            if (data.player_id) {
                                setMyPlayerId(data.player_id);
                                myPlayerIdRef.current = data.player_id;
                            }
                            setWaitingForOpponent(true);
                            setWsError("");
                            break;

                        case "player_connected":
                            setOpponentConnected(true);
                            setWaitingForOpponent(false);
                            setReconnectDeadline(null);
                            break;

                        case "player_disconnected":
                            setOpponentConnected(false);
                            if (data.reconnect_deadline) {
                                setReconnectDeadline(new Date(data.reconnect_deadline));
                            }
                            break;

                        case "game_start":
                            setWaitingForOpponent(false);
                            setOpponentConnected(true);
                            break;

                        case "game_state":
                            handleGameState(data);
                            break;

                        case "card_played":
                            handleCardPlayed(data);
                            break;

                        case "turn_change":
                            handleTurnChange(data);
                            break;

                        case "game_over":
                            handleGameOver(data);
                            break;

                        case "error":
                            setWsError(data.message || "Unknown error");
                            break;

                        case "pong":
                            break;

                        case "ping":
                            try {
                                ws.send(JSON.stringify({ type: "pong" }));
                            } catch (e) { }
                            break;

                        default:
                            console.log("[WS] Unknown message type:", data.type);
                    }
                } catch (e) {
                    // ✅ Ловим ВСЕ ошибки внутри обработчиков — не даём крашнуть
                    console.error("[WS] Error handling message:", data.type, e);
                }
            };

            ws.onerror = (err) => {
                console.error("[WS] Error:", err);
            };

            ws.onclose = (event) => {
                setWsConnected(false);

                if (!mountedRef.current) return;
                if (event.code === 1000) return;

                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000);
                    reconnectTimeout = setTimeout(connect, delay);
                } else {
                    setWsError("Connection lost. Please refresh.");
                }
            };
        };

        connect();

        pingIntervalRef.current = setInterval(() => {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                try {
                    wsRef.current.send(JSON.stringify({ type: "ping" }));
                } catch (err) { }
            }
        }, 15000);

        return () => {
            mountedRef.current = false;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close(1000, "Component unmounted");
                wsRef.current = null;
            }
        };
    }, [isPvP, matchId]);

    // ✅ ИСПРАВЛЕНО: handleGameState с безопасным парсингом
    const handleGameState = (data) => {
        if (!mountedRef.current) return;

        try {
            const state = data.state;
            if (!state) return;

            setPvpState(state);
            pvpStateRef.current = state;

            // Определяем наш ID
            let effectiveMyPlayerId = myPlayerIdRef.current;
            if (!effectiveMyPlayerId) {
                const role = myRoleRef.current || data.you_are;
                if (role === "player1") {
                    effectiveMyPlayerId = state.player1_id;
                } else if (role === "player2") {
                    effectiveMyPlayerId = state.player2_id;
                }
                if (effectiveMyPlayerId) {
                    setMyPlayerId(effectiveMyPlayerId);
                    myPlayerIdRef.current = effectiveMyPlayerId;
                }
            }

            // ✅ Обновляем доску безопасно
            if (Array.isArray(state.board)) {
                setBoard(prev => state.board.map((cell, idx) => {
                    if (!cell) return null;

                    // Определяем владельца
                    let owner = "enemy";
                    if (effectiveMyPlayerId && String(cell.owner) === String(effectiveMyPlayerId)) {
                        owner = "player";
                    }

                    const prevCard = prev[idx];
                    return serverCardToCard(cell, owner, prevCard);
                }));
            }

            if (Array.isArray(state.board_elements)) {
                setBoardElems(state.board_elements);
            }

            // ✅ Определяем чей ход
            if (state.current_turn !== undefined && state.current_turn !== null) {
                const isMyTurn = effectiveMyPlayerId
                    ? String(state.current_turn) === String(effectiveMyPlayerId)
                    : false;
                setTurn(isMyTurn ? "player" : "enemy");
            }

            // ✅ Обновляем руку игрока
            if (Array.isArray(data.your_hand)) {
                const myHand = data.your_hand.map((card, idx) => {
                    const c = nftToCard(card, idx);
                    return { ...c, owner: "player" };
                });
                setHands(h => ({ ...h, player: myHand }));
            }

            // ✅ Обновляем руку противника (только счётчик — карты скрыты)
            const role = myRoleRef.current || data.you_are;
            const enemyHandCount = role === "player1"
                ? (state.player2_hand_count ?? 0)
                : (state.player1_hand_count ?? 0);

            setHands(h => ({
                ...h,
                enemy: Array(Math.max(0, enemyHandCount)).fill(null).map((_, i) => ({
                    id: `enemy_hidden_${i}_${Date.now()}`,
                    owner: "enemy",
                    hidden: true,
                    values: { top: 5, right: 5, bottom: 5, left: 5 },
                })),
            }));

            if (state.status === "finished") {
                setMatchOver(true);
                setRoundOver(true);
                if (effectiveMyPlayerId) {
                    const iWon = String(state.winner) === String(effectiveMyPlayerId);
                    setRoundWinner(iWon ? "player" : "enemy");
                    if (iWon) {
                        confetti({ zIndex: 99999, particleCount: 50, spread: 80, origin: { y: 0.4 } });
                        prepareClaimCards();
                    }
                }
            }

            setLoadingEnemyDeck(false);
        } catch (e) {
            console.error("[handleGameState] Error:", e);
        }
    };

    // ✅ ИСПРАВЛЕНО: handleCardPlayed с полной защитой от краша
    const handleCardPlayed = (data) => {
        if (!mountedRef.current) return;

        try {
            const { cell_index, card, captured, player_id } = data;

            // Валидация входных данных
            if (cell_index === undefined || cell_index === null) {
                console.error("[handleCardPlayed] Missing cell_index");
                return;
            }
            if (!card) {
                console.error("[handleCardPlayed] Missing card data");
                return;
            }
            if (cell_index < 0 || cell_index > 8) {
                console.error("[handleCardPlayed] Invalid cell_index:", cell_index);
                return;
            }

            const effectiveMyPlayerId = getEffectiveMyPlayerId(data);
            const isMyCard = effectiveMyPlayerId
                ? String(player_id) === String(effectiveMyPlayerId)
                : false;
            const owner = isMyCard ? "player" : "enemy";

            // ✅ Парсим карту через безопасную функцию
            const parsedCard = serverCardToCard(card, owner, null);
            parsedCard.placeKey = Date.now();

            setBoard(prev => {
                const next = [...prev];

                // Проверяем что клетка пуста (или обновляем)
                next[cell_index] = parsedCard;

                // ✅ Применяем захваченные клетки
                if (Array.isArray(captured) && captured.length > 0) {
                    const captureTime = Date.now();
                    for (const idx of captured) {
                        if (typeof idx !== "number" || idx < 0 || idx > 8) continue;
                        if (next[idx]) {
                            next[idx] = {
                                ...next[idx],
                                owner,
                                captureKey: captureTime + idx, // уникальный для каждой карты
                            };
                        }
                    }
                }

                return next;
            });

            // ✅ Убираем карту из руки
            if (isMyCard) {
                const cardId = card.id || card.token_id || card.tokenId;
                if (cardId) {
                    setHands(h => ({
                        ...h,
                        player: h.player.filter(c => {
                            const cId = c.id || c.token_id || c.tokenId;
                            return String(cId) !== String(cardId);
                        }),
                    }));
                }
            } else {
                setHands(h => ({
                    ...h,
                    enemy: h.enemy.length > 0 ? h.enemy.slice(0, -1) : [],
                }));
            }

            haptic("medium");
        } catch (e) {
            console.error("[handleCardPlayed] Error:", e);
        }
    };

    // ✅ ИСПРАВЛЕНО: handleTurnChange с защитой от stale closure
    const handleTurnChange = (data) => {
        if (!mountedRef.current) return;

        try {
            const effectiveMyPlayerId = getEffectiveMyPlayerId(data);
            if (!effectiveMyPlayerId) {
                console.warn("[handleTurnChange] Unknown player ID");
                return;
            }

            const isMyTurn = String(data.current_turn) === String(effectiveMyPlayerId);
            setTurn(isMyTurn ? "player" : "enemy");
        } catch (e) {
            console.error("[handleTurnChange] Error:", e);
        }
    };

    // ✅ ИСПРАВЛЕНО: handleGameOver с защитой
    const handleGameOver = (data) => {
        if (!mountedRef.current) return;

        try {
            setMatchOver(true);
            setRoundOver(true);

            const effectiveMyPlayerId = getEffectiveMyPlayerId(data);
            const iWon = effectiveMyPlayerId
                ? String(data.winner) === String(effectiveMyPlayerId)
                : false;

            setRoundWinner(iWon ? "player" : "enemy");

            if (iWon) {
                confetti({ zIndex: 99999, particleCount: 50, spread: 80, origin: { y: 0.4 } });
                prepareClaimCards();
            }
        } catch (e) {
            console.error("[handleGameOver] Error:", e);
        }
    };

    const prepareClaimCards = async () => {
        if (isPvP && matchId) {
            try {
                const token = getStoredToken();
                const res = await apiFetch(`/api/matches/${matchId}/opponent_deposits`, { token });

                if (res && res.deposits && res.deposits.length > 0) {
                    setClaimCards(res.deposits.map((d, i) => ({
                        id: d.token_id || `deposit_${i}`,
                        token_id: d.token_id,
                        nft_contract_id: d.nft_contract_id,
                        index: i,
                        image: d.image || null,
                        imageUrl: d.image || null,
                    })));
                    return;
                }
            } catch (e) {
                console.error("[Game] Failed to load opponent deposits:", e);
            }

            setClaimCards(Array.from({ length: 5 }, (_, i) => ({
                id: `claim_${i}`,
                index: i,
                image: null,
                imageUrl: null,
            })));
        } else {
            setClaimCards(enemyDeck.map((c, i) => ({
                ...c,
                index: i,
                image: c.imageUrl || c.image || null,
                imageUrl: c.imageUrl || c.image || null,
            })));
        }
    };

    const sendPvPMove = (cardIndex, cellIndex) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setWsError("Connection lost, reconnecting...");
            return false;
        }

        try {
            wsRef.current.send(JSON.stringify({
                type: "play_card",
                card_index: cardIndex,
                cell_index: cellIndex,
            }));
            return true;
        } catch (err) {
            setWsError("Failed to send move");
            return false;
        }
    };

    // ==================== Claim Logic ====================
    const onClaimPick = (index) => {
        if (claimDone || claimBusy || claimRevealed) return;
        setClaimPickIndex(index);
        haptic("light");
    };

    const onClaimConfirm = async () => {
        if (claimPickIndex === null || claimBusy || claimDone) return;

        setClaimBusy(true);
        setClaimError("");

        try {
            const token = getStoredToken();
            const pickedCard = claimCards[claimPickIndex] || {};

            if (isPvP && matchId) {
                await apiFetch(`/api/matches/${matchId}/finish`, {
                    method: "POST",
                    token,
                    body: JSON.stringify({
                        winner_user_id: myTgId,
                        winner_near_wallet: nearAccountId || null,
                    }),
                });

                let realImage = pickedCard?.image || pickedCard?.imageUrl;

                try {
                    const depositsRes = await apiFetch(`/api/matches/${matchId}/opponent_deposits`, { token });
                    if (depositsRes?.deposits && depositsRes.deposits[claimPickIndex]) {
                        const realDeposit = depositsRes.deposits[claimPickIndex];
                        realImage = realDeposit.image || realDeposit.imageUrl || realImage;
                    }
                } catch (e) {
                    console.warn("[Claim] Could not fetch deposits for image:", e);
                }

                const res = await apiFetch(`/api/matches/${matchId}/claim`, {
                    method: "POST",
                    token,
                    body: JSON.stringify({
                        pick_index: claimPickIndex,
                        token_id: pickedCard?.token_id || null,
                        nft_contract_id: pickedCard?.nft_contract_id || null,
                    }),
                });

                setClaimedCard({
                    ...pickedCard,
                    ...(res?.claimed_card || {}),
                    image: res?.claimed_card?.image || realImage,
                    imageUrl: res?.claimed_card?.imageUrl || realImage,
                });
            } else {
                const aiCard = enemyDeck[claimPickIndex];
                setClaimedCard({
                    ...aiCard,
                    image: aiCard?.imageUrl || aiCard?.image,
                    imageUrl: aiCard?.imageUrl || aiCard?.image,
                });
            }

            setClaimRevealed(true);
            haptic("medium");

            await new Promise(r => setTimeout(r, 800));

            setClaimDone(true);
            confetti({ zIndex: 99999, particleCount: 40, spread: 70, origin: { y: 0.5 } });

        } catch (e) {
            console.error("[Claim] Error:", e);
            setClaimError(String(e?.message || e));
            setClaimRevealed(false);
        } finally {
            setClaimBusy(false);
        }
    };

    // ==================== Rest of Game Logic ====================

    const refreshStage2Match = async () => {
        if (!isStage2) return;
        try {
            const token = getStoredToken();
            if (!token) return;
            const m = await apiFetch(`/api/matches/${matchId}`, { token });
            setStage2Match(m);
        } catch { }
    };

    useEffect(() => {
        refreshStage2Match();
    }, [matchId, isStage2]);

    useEffect(() => {
        if (isPvP) return;

        let alive = true;

        (async () => {
            try {
                setLoadingEnemyDeck(true);
                const token = getStoredToken();
                const aiDeck = await apiFetch("/api/decks/ai_opponent", { token });
                const cards = Array.isArray(aiDeck)
                    ? aiDeck.map((n, idx) => nftToCard(n, idx))
                    : [];

                if (!alive) return;

                if (cards.length === 5) {
                    setEnemyDeck(cards);
                    setHands(h => ({
                        ...h,
                        enemy: cloneDeckToHand(cards, "enemy"),
                    }));
                } else {
                    const fallback = getFallbackEnemyDeck();
                    setEnemyDeck(fallback);
                    setHands(h => ({
                        ...h,
                        enemy: cloneDeckToHand(fallback, "enemy"),
                    }));
                }
            } catch {
                if (!alive) return;
                const fallback = getFallbackEnemyDeck();
                setEnemyDeck(fallback);
                setHands(h => ({
                    ...h,
                    enemy: cloneDeckToHand(fallback, "enemy"),
                }));
            } finally {
                if (alive) setLoadingEnemyDeck(false);
            }
        })();

        return () => { alive = false; };
    }, [isPvP]);

    useEffect(() => {
        if (!deckOk) return;
        if (isPvP) return;

        setHands((h) => ({
            ...h,
            player: cloneDeckToHand(playerDeck.map((n, idx) => nftToCard(n, idx)), "player"),
        }));
    }, [playerDeck, isPvP]);

    useEffect(() => {
        if (isPvP) return;

        setHands((h) => ({
            ...h,
            enemy: cloneDeckToHand(enemyDeck, "enemy"),
        }));
    }, [enemyDeck, isPvP]);

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
        if (isPvP) return;

        const ed = enemyDeckOverride || enemyDeck;

        setBoard(Array(9).fill(null));
        setBoardElems(makeBoardElements());

        if (deckOk) {
            setHands({
                player: cloneDeckToHand(playerDeck.map((n, idx) => nftToCard(n, idx)), "player"),
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

        setClaimCards([]);
        setClaimPickIndex(null);
        setClaimRevealed(false);
        setClaimDone(false);
        setClaimError("");
        setClaimedCard(null);

        if (!keepSeries) {
            setSeries({ player: 0, enemy: 0 });
            setRoundNo(1);
            setMatchOver(false);
            setStage2Err("");
            setStage2Match(null);
        }
    };

    const resetMatch = () => {
        if (isPvP) {
            onExit();
            return;
        }

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

    const enemyName = isPvP ? "Opponent" : "BunnyBot";
    const enemyAvatar = "/ui/avatar-enemy.png?v=1";

    const canUseMagic = turn === "player" && !roundOver && !matchOver && !isPvP;

    const placeCard = (cellIdx) => {
        if (roundOver || matchOver) return;
        if (turn !== "player") return;
        if (!selected) return;
        if (board[cellIdx]) return;
        if (frozen[cellIdx] > 0) return;

        if (isPvP) {
            const cardIndex = hands.player.findIndex(c => {
                const cId = c.id || c.token_id || c.tokenId;
                const sId = selected.id || selected.token_id || selected.tokenId;
                return String(cId) === String(sId);
            });
            if (cardIndex === -1) {
                console.warn("[placeCard] Card not found in hand:", selected.id);
                return;
            }
            if (sendPvPMove(cardIndex, cellIdx)) {
                setSelected(null);
            }
            return;
        }

        const next = [...board];
        next[cellIdx] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };

        resolvePlacement(cellIdx, next, boardElems);

        setBoard(next);
        setHands((h) => ({
            ...h,
            player: h.player.filter((c) => {
                const cId = c.id || c.token_id || c.tokenId;
                const sId = selected.id || selected.token_id || selected.tokenId;
                return String(cId) !== String(sId);
            }),
        }));
        setSelected(null);
        setSpellMode(null);

        decFrozenAfterCardMove();
        haptic("medium");
        setTurn("enemy");
    };

    const onCellClick = (i) => {
        if (roundOver || matchOver) return;

        if (spellMode === "freeze" && !isPvP) {
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

    // AI turn
    useEffect(() => {
        if (isPvP || turn !== "enemy" || roundOver || matchOver) return;

        const t = setTimeout(() => {
            const curBoard = boardRef.current;
            const curHands = handsRef.current;
            const curFrozen = frozenRef.current;
            const curElems = boardElemsRef.current;

            const empty = curBoard
                .map((c, idx) => (c === null && curFrozen[idx] === 0 ? idx : null))
                .filter(v => v !== null);

            if (!empty.length || !curHands.enemy.length) {
                setTurn("player");
                return;
            }

            let bestScore = -Infinity;
            let bestCell = empty[0];
            let bestCard = curHands.enemy[0];

            for (const card of curHands.enemy) {
                for (const cellIdx of empty) {
                    let score = 0;

                    const cellElem = curElems[cellIdx];
                    if (cellElem && card.element) {
                        if (card.element === cellElem) score += 1;
                        else score -= 1;
                    }

                    // ✅ Используем правильный neighborsOf
                    const neighbors = neighborsOf(cellIdx);

                    for (const { ni, a, b } of neighbors) {
                        const neighbor = curBoard[ni];
                        if (!neighbor) continue;

                        const attackBase = Number(card.values?.[a] ?? 1);
                        const defendBase = Number(neighbor.values?.[b] ?? 1);

                        const myCellElem = curElems[cellIdx] ?? null;
                        const theirCellElem = curElems[ni] ?? null;

                        let attackVal;
                        if (attackBase === ACE_VALUE) {
                            attackVal = ACE_VALUE;
                        } else {
                            const bonus = myCellElem
                                ? (card.element === myCellElem ? 1 : -1)
                                : 0;
                            attackVal = Math.min(9, Math.max(1, attackBase + bonus));
                        }

                        let defendVal;
                        if (defendBase === ACE_VALUE) {
                            defendVal = ACE_VALUE;
                        } else {
                            const bonus = theirCellElem
                                ? (neighbor.element === theirCellElem ? 1 : -1)
                                : 0;
                            defendVal = Math.min(9, Math.max(1, defendBase + bonus));
                        }

                        if (neighbor.owner === "enemy") {
                            score += 0.5;
                        } else if (neighbor.owner === "player") {
                            if (attackVal > defendVal) {
                                score += 5;
                            } else if (attackVal < defendVal) {
                                score -= 0.5;
                            }
                        }
                    }

                    if (cellIdx === 4) score += 1;
                    if ([0, 2, 6, 8].includes(cellIdx)) score += 0.5;
                    score += Math.random() * 0.5;

                    if (score > bestScore) {
                        bestScore = score;
                        bestCell = cellIdx;
                        bestCard = card;
                    }
                }
            }

            const next = [...curBoard];
            next[bestCell] = { ...bestCard, owner: "enemy", placeKey: (bestCard.placeKey || 0) + 1 };
            resolvePlacement(bestCell, next, curElems);

            setBoard(next);
            setHands(h => ({
                ...h,
                enemy: h.enemy.filter(c => {
                    const cId = c.id || c.token_id || c.tokenId;
                    const bId = bestCard.id || bestCard.token_id || bestCard.tokenId;
                    return String(cId) !== String(bId);
                }),
            }));
            decFrozenAfterCardMove();
            setTurn("player");

        }, 600);

        const safety = setTimeout(() => {
            setTurn(cur => cur === "enemy" ? "player" : cur);
        }, 3000);

        return () => { clearTimeout(t); clearTimeout(safety); };
    }, [turn, roundOver, matchOver, isPvP]);

    // Check round over (AI mode)
    useEffect(() => {
        if (isPvP) return;
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
    }, [board, roundOver, matchOver, isPvP]);

    // Check match over (AI mode)
    useEffect(() => {
        if (isPvP) return;
        if (matchOver) return;
        if (series.player >= MATCH_WINS_TARGET || series.enemy >= MATCH_WINS_TARGET) {
            setMatchOver(true);

            if (series.player >= MATCH_WINS_TARGET) {
                prepareClaimCards();
            }

            if (isStage2) refreshStage2Match();
        }
    }, [series, matchOver, isStage2, isPvP]);

    // Confetti on round win
    useEffect(() => {
        if (!roundOver) return;
        if (roundWinner !== "player") return;

        const origin = { x: 0.5, y: 0.35 };
        const timers = [];
        timers.push(setTimeout(() => confetti({ zIndex: 99999, particleCount: 34, spread: 75, startVelocity: 30, origin }), 0));
        timers.push(setTimeout(() => confetti({ zIndex: 99999, particleCount: 22, spread: 95, startVelocity: 26, origin }), 160));
        return () => timers.forEach(clearTimeout);
    }, [roundOver, roundWinner]);

    const onNextRound = () => {
        if (isPvP) return;
        setRoundNo((r) => r + 1);
        startRound({ keepSeries: true });
    };

    const matchWinner =
        series.player >= MATCH_WINS_TARGET ? "player" : series.enemy >= MATCH_WINS_TARGET ? "enemy" : null;

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // ==================== RENDER ====================

    if (isPvP && (!wsConnected || waitingForOpponent)) {
        return (
            <div className="game-root">
                <div className="game-ui tt-layout">
                    <button className="exit" onClick={onExit}>← Меню</button>
                    <div className="game-over">
                        <div className="game-over-box" style={{ minWidth: 320 }}>
                            {wsError ? (
                                <>
                                    <h2 style={{ margin: 0, color: "#ff6b6b" }}>Connection Error</h2>
                                    <div style={{ marginTop: 10, fontSize: 13 }}>{wsError}</div>
                                    <button onClick={onExit} style={{ marginTop: 16 }}>← Back</button>
                                </>
                            ) : !wsConnected ? (
                                <>
                                    <h2 style={{ margin: 0 }}>Connecting...</h2>
                                    <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                                        Establishing connection to match server
                                    </div>
                                </>
                            ) : (
                                <>
                                    <h2 style={{ margin: 0 }}>Waiting for opponent...</h2>
                                    <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                                        You are {myRole === "player1" ? "Player 1" : "Player 2"}
                                    </div>
                                    <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                                        Match ID: {matchId?.slice(0, 8)}...
                                    </div>
                                    <button onClick={onExit} style={{ marginTop: 16 }}>Cancel</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isPvP && reconnectDeadline && !opponentConnected) {
        const remainingMs = reconnectDeadline.getTime() - Date.now();
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

        return (
            <div className="game-root">
                <div className="game-ui tt-layout">
                    <button className="exit" onClick={onExit}>← Меню</button>
                    <div className="game-over">
                        <div className="game-over-box" style={{ minWidth: 320 }}>
                            <h2 style={{ margin: 0, color: "#ffd43b" }}>Opponent Disconnected</h2>
                            <div style={{ marginTop: 10, opacity: 0.9, fontSize: 14 }}>
                                Waiting: {Math.floor(remainingSec / 60)}:{(remainingSec % 60).toString().padStart(2, '0')}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="game-root">
            <div className="game-ui tt-layout">
                <button className="exit" onClick={onExit}>← Меню</button>

                {!deckOk ? (
                    <div style={{ color: "#fff", padding: 20, textAlign: "center", gridColumn: "1 / -1", fontSize: 14 }}>
                        ⚠️ Ошибка: активная колода не содержит 5 карт.
                    </div>
                ) : null}

                {deckOk ? (
                    <>
                        <div className="hud-corner hud-score red hud-near-left">🟥 {boardScore.red}</div>
                        <div className="hud-corner hud-score blue hud-near-right">{boardScore.blue} 🟦</div>

                        <PlayerBadge side="enemy" name={enemyName} avatarUrl={enemyAvatar} active={turn === "enemy"} />
                        <PlayerBadge side="player" name={myName} avatarUrl={myAvatar} active={turn === "player"} />

                        <div className="hand left">
                            <div className="hand-cards-wrap">
                                {hands.enemy.slice(0, 5).map((c, i) => {
                                    const isRevealed = !isPvP && c && enemyRevealId && enemyRevealId === c.id;
                                    const cls = [
                                        "hc-top-left",
                                        "hc-top-right",
                                        "hc-center",
                                        "hc-bot-left",
                                        "hc-bot-right",
                                    ][i];
                                    return (
                                        <div key={c?.id || `enemy_${i}`} className={`hc ${cls}`}>
                                            {isRevealed ? <Card card={c} disabled /> : <Card hidden />}
                                        </div>
                                    );
                                })}
                            </div>
                            {!isPvP && (
                                <div className="hand-magic-row">
                                    <button className="magic-btn freeze" disabled><span className="magic-ic">❄</span></button>
                                    <button className="magic-btn reveal" disabled><span className="magic-ic">👁</span></button>
                                </div>
                            )}
                        </div>

                        <div className="center-col">
                            <div className="board">
                                {board.map((cell, i) => {
                                    const isFrozen = frozen[i] > 0;
                                    const canHighlight =
                                        !roundOver &&
                                        !matchOver &&
                                        !cell &&
                                        !isFrozen &&
                                        turn === "player" &&
                                        ((spellMode === "freeze" && !isPvP) || (spellMode == null && selected));

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

                        <div className="hand right">
                            <div className="hand-cards-wrap">
                                {hands.player.slice(0, 5).map((c, i) => {
                                    const cls = [
                                        "hc-top-left",
                                        "hc-top-right",
                                        "hc-center",
                                        "hc-bot-left",
                                        "hc-bot-right",
                                    ][i];
                                    return (
                                        <div key={c.id} className={`hc ${cls}`}>
                                            <Card
                                                card={c}
                                                selected={selected?.id === c.id}
                                                disabled={roundOver || matchOver || turn !== "player" || (spellMode === "freeze" && !isPvP)}
                                                onClick={() => setSelected((prev) => (prev?.id === c.id ? null : c))}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            {!isPvP && (
                                <div className="hand-magic-row">
                                    <button
                                        className={`magic-btn freeze ${spellMode === "freeze" ? "active" : ""}`}
                                        onClick={onMagicFreeze}
                                        disabled={!canUseMagic || playerSpells.freeze <= 0}
                                    >
                                        <span className="magic-ic">❄</span>
                                        <span className="magic-count">{playerSpells.freeze}</span>
                                    </button>
                                    <button
                                        className="magic-btn reveal"
                                        onClick={onMagicReveal}
                                        disabled={!canUseMagic || playerSpells.reveal <= 0}
                                    >
                                        <span className="magic-ic">👁</span>
                                        <span className="magic-count">{playerSpells.reveal}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {loadingEnemyDeck && !isPvP ? (
                            <div className="game-over">
                                <div className="game-over-box" style={{ minWidth: 320 }}>
                                    <h2 style={{ margin: 0 }}>Загрузка соперника…</h2>
                                </div>
                            </div>
                        ) : null}

                        {(roundOver || matchOver) && (
                            <div className="game-over">
                                <div className="game-over-box" style={{ minWidth: 340, maxWidth: 420 }}>

                                    <h2 style={{ marginBottom: 12, fontSize: 22 }}>
                                        {matchOver ? (
                                            (isPvP ? roundWinner : matchWinner) === "player"
                                                ? "🎉 Победа!"
                                                : "😔 Поражение"
                                        ) : (
                                            roundWinner === "player" ? "🏆 Раунд выигран!" : "💀 Раунд проигран"
                                        )}
                                    </h2>

                                    <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 16 }}>
                                        {isPvP ? (
                                            <>Поле: Вы {boardScore.blue} - {boardScore.red} Противник</>
                                        ) : (
                                            <>Раунд {roundNo} • Серия до {MATCH_WINS_TARGET} • Счёт {series.player}:{series.enemy}</>
                                        )}
                                    </div>

                                    {matchOver && (isPvP ? roundWinner : matchWinner) === "player" && !claimDone && (
                                        <>
                                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#ffd700" }}>
                                                🎁 Выбери 1 карту противника
                                            </div>
                                            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
                                                Карты скрыты — выбирай наугад!
                                            </div>

                                            <div style={{
                                                display: "flex",
                                                gap: 8,
                                                justifyContent: "center",
                                                marginBottom: 16,
                                                flexWrap: "wrap",
                                            }}>
                                                {(claimCards.length > 0 ? claimCards : enemyDeck).map((card, idx) => {
                                                    const isSelected = claimPickIndex === idx;
                                                    const showCard = claimRevealed && isSelected;

                                                    const realImage = claimedCard?.image
                                                        || claimedCard?.imageUrl
                                                        || card?.image
                                                        || card?.imageUrl
                                                        || null;

                                                    return (
                                                        <div
                                                            key={card?.id || card?.token_id || idx}
                                                            onClick={() => onClaimPick(idx)}
                                                            style={{
                                                                cursor: claimRevealed ? "default" : "pointer",
                                                                transform: isSelected ? "scale(1.1) translateY(-4px)" : "scale(1)",
                                                                transition: "all 0.25s ease",
                                                                filter: claimRevealed && !isSelected ? "brightness(0.5)" : "none",
                                                            }}
                                                        >
                                                            {showCard ? (
                                                                <div style={{
                                                                    width: 64,
                                                                    height: 88,
                                                                    borderRadius: 10,
                                                                    overflow: "hidden",
                                                                    border: "3px solid #ffd700",
                                                                    boxShadow: "0 0 20px rgba(255,215,0,0.5)",
                                                                    background: "#1a1a2e",
                                                                }}>
                                                                    <img
                                                                        src={realImage || "/cards/card.jpg"}
                                                                        alt=""
                                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                        onError={(e) => { e.currentTarget.src = "/cards/card.jpg"; }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    className="card back"
                                                                    style={{
                                                                        width: 64,
                                                                        height: 88,
                                                                        border: isSelected
                                                                            ? "3px solid #ffd700"
                                                                            : "2px solid rgba(255,255,255,0.2)",
                                                                        boxShadow: isSelected
                                                                            ? "0 0 20px rgba(255,215,0,0.5)"
                                                                            : "none",
                                                                        borderRadius: 10,
                                                                    }}
                                                                >
                                                                    <div className="card-back-inner">
                                                                        <img
                                                                            className="card-back-logo-img"
                                                                            src="/ui/cardclash-logo.png?v=3"
                                                                            alt=""
                                                                            draggable="false"
                                                                            style={{ width: "70%", height: "auto" }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {!claimRevealed && (
                                                <button
                                                    onClick={onClaimConfirm}
                                                    disabled={claimPickIndex === null || claimBusy}
                                                    style={{
                                                        padding: "12px 28px",
                                                        fontSize: 15,
                                                        fontWeight: 900,
                                                        borderRadius: 14,
                                                        border: "none",
                                                        background: claimPickIndex !== null
                                                            ? "linear-gradient(135deg, #ffd700, #ff8c00)"
                                                            : "rgba(255,255,255,0.1)",
                                                        color: claimPickIndex !== null ? "#000" : "#666",
                                                        cursor: claimPickIndex !== null ? "pointer" : "not-allowed",
                                                        marginBottom: 12,
                                                        boxShadow: claimPickIndex !== null
                                                            ? "0 4px 20px rgba(255,215,0,0.4)"
                                                            : "none",
                                                    }}
                                                >
                                                    {claimBusy ? "⏳ Загрузка..." : "🎁 Забрать карту"}
                                                </button>
                                            )}

                                            {claimRevealed && claimBusy && (
                                                <div style={{ fontSize: 14, color: "#a0d8ff", marginBottom: 12 }}>
                                                    ⏳ Переводим NFT...
                                                </div>
                                            )}

                                            {claimError && (
                                                <div style={{
                                                    fontSize: 12,
                                                    color: "#ff6b6b",
                                                    marginBottom: 12,
                                                    padding: "8px 12px",
                                                    background: "rgba(255,100,100,0.15)",
                                                    borderRadius: 8,
                                                    wordBreak: "break-word",
                                                }}>
                                                    ❌ {claimError}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {matchOver && (isPvP ? roundWinner : matchWinner) === "player" && claimDone && (
                                        <div style={{
                                            fontSize: 15,
                                            color: "#4ade80",
                                            marginBottom: 16,
                                            fontWeight: 700,
                                            padding: "12px 16px",
                                            background: "rgba(74,222,128,0.15)",
                                            borderRadius: 12,
                                        }}>
                                            ✅ Карта получена! Проверь инвентарь.
                                        </div>
                                    )}

                                    {matchOver && (isPvP ? roundWinner : matchWinner) === "enemy" && (
                                        <div style={{
                                            fontSize: 13,
                                            opacity: 0.8,
                                            marginBottom: 16,
                                            padding: "10px 14px",
                                            background: "rgba(255,100,100,0.1)",
                                            borderRadius: 10,
                                        }}>
                                            Противник заберёт 1 твою карту.
                                        </div>
                                    )}

                                    <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                                        {!matchOver && !isPvP && (
                                            <button onClick={onNextRound}>Следующий раунд</button>
                                        )}
                                        {matchOver && (claimDone || (isPvP ? roundWinner : matchWinner) === "enemy") && (
                                            <button onClick={resetMatch}>
                                                {isPvP ? "Выйти" : "Новый матч"}
                                            </button>
                                        )}
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

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

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
    const [imgFailed, setImgFailed] = useState(false);

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
        setImgFailed(false);
    }, [card?.id]);

    if (hidden) {
        return (
            <div className="card back" aria-hidden="true">
                <div className="card-back-inner">
                    <img
                        className="card-back-logo-img"
                        src="/ui/cardclash-logo.png?v=3"
                        alt="CardClash"
                        draggable="false"
                        loading="lazy"
                    />
                </div>
            </div>
        );
    }

    // ✅ Защита от undefined card
    if (!card) return null;

    const raw = card.values || card.stats || { top: 5, right: 5, bottom: 5, left: 5 };
    const cardValues = {
        top: Math.min(ACE_VALUE, Math.max(1, Number(raw.top) || 5)),
        right: Math.min(ACE_VALUE, Math.max(1, Number(raw.right) || 5)),
        bottom: Math.min(ACE_VALUE, Math.max(1, Number(raw.bottom) || 5)),
        left: Math.min(ACE_VALUE, Math.max(1, Number(raw.left) || 5)),
    };

    const elemBonus = (card.element && cellElement && ELEMENTS.includes(card.element))
        ? (card.element === cellElement ? +1 : -1)
        : 0;

    const getCardDisplayValue = (base) => {
        const n = Number(base);
        if (n === ACE_VALUE) return "A";
        if (elemBonus === 0) return n;
        return Math.min(9, Math.max(1, n + elemBonus));
    };

    const getNumStyle = (base) => {
        const n = Number(base);
        if (n === ACE_VALUE) return { color: "#ffd700", fontWeight: 900 };
        if (elemBonus === 0) return {};
        const result = Math.min(9, Math.max(1, n + elemBonus));
        if (result > n) return { color: "#4ade80" };
        if (result < n) return { color: "#f87171" };
        return {};
    };

    const imgSrc = !imgFailed
        ? (card.imageUrl || card.image || card.nftData?.imageUrl || card.nftData?.image || "")
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
            ].join(" ")}
            onClick={disabled ? undefined : onClick}
        >
            <div className="card-anim">
                {imgSrc ? (
                    <img
                        className="card-art-img"
                        src={imgSrc}
                        alt=""
                        draggable="false"
                        loading="lazy"
                        onError={() => setImgFailed(true)}
                    />
                ) : (
                    <div className="card-art-img" style={{
                        background: "linear-gradient(135deg, #1a2a4a, #2a1a4a)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 32,
                    }}>
                        🎴
                    </div>
                )}

                {card.element ? (
                    <div className="card-elem-pill" title={card.element}>
                        <span className="card-elem-ic">{ELEM_ICON[card.element] || "?"}</span>
                    </div>
                ) : null}

                <div className="tt-badge">
                    <span className="tt-num top" style={getNumStyle(cardValues.top)}>
                        {getCardDisplayValue(cardValues.top)}
                    </span>
                    <span className="tt-num left" style={getNumStyle(cardValues.left)}>
                        {getCardDisplayValue(cardValues.left)}
                    </span>
                    <span className="tt-num right" style={getNumStyle(cardValues.right)}>
                        {getCardDisplayValue(cardValues.right)}
                    </span>
                    <span className="tt-num bottom" style={getNumStyle(cardValues.bottom)}>
                        {getCardDisplayValue(cardValues.bottom)}
                    </span>
                </div>
            </div>
        </div>
    );
}