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

const ACE_VALUE = 10;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const randomFirstTurn = () => (Math.random() < 0.5 ? "player" : "enemy");

const RANKS = [
    { key: "common", label: "C", weight: 50, min: 1, max: 5, aceChance: 0 },
    { key: "rare", label: "R", weight: 30, min: 2, max: 7, aceChance: 0 },
    { key: "epic", label: "E", weight: 15, min: 3, max: 8, aceChance: 0.15 },
    { key: "legendary", label: "L", weight: 5, min: 4, max: 9, aceChance: 0.4 },
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

function safeNum(val, fallback = 5) {
    const n = Number(val);
    return isNaN(n) ? fallback : Math.min(ACE_VALUE, Math.max(1, n));
}

function genCard(owner, id) {
    const r = weightedPick(RANKS);
    const values = {
        top: randInt(r.min, r.max),
        right: randInt(r.min, r.max),
        bottom: randInt(r.min, r.max),
        left: randInt(r.min, r.max),
    };
    if (r.aceChance > 0 && Math.random() < r.aceChance) {
        const sides = ["top", "right", "bottom", "left"];
        values[pick(sides)] = ACE_VALUE;
    }
    return {
        id,
        owner,
        values,
        imageUrl: ART[Math.floor(Math.random() * ART.length)],
        rank: r.key,
        rankLabel: r.label,
        element: pick(ELEMENTS),
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

function resolvePlacement(placedIdx, grid, boardElems) {
    const placed = grid[placedIdx];
    if (!placed) return [];
    const flipped = [];

    for (const { ni, a, b } of neighborsOf(placedIdx)) {
        const target = grid[ni];
        if (!target || target.owner === placed.owner) continue;

        const attackBase = safeNum(placed.values?.[a]);
        const defendBase = safeNum(target.values?.[b]);

        const placedElem = boardElems?.[placedIdx] ?? null;
        const targetElem = boardElems?.[ni] ?? null;

        const attackVal = attackBase === ACE_VALUE ? ACE_VALUE
            : clamp(attackBase + (placedElem ? (placed.element === placedElem ? 1 : -1) : 0), 1, 9);
        const defendVal = defendBase === ACE_VALUE ? ACE_VALUE
            : clamp(defendBase + (targetElem ? (target.element === targetElem ? 1 : -1) : 0), 1, 9);

        if (attackVal > defendVal) {
            grid[ni] = { ...target, owner: placed.owner, captureKey: (target.captureKey || 0) + 1 };
            flipped.push(ni);
        }
    }
    return flipped;
}

function normalizeCard(raw, owner, prevCard) {
    if (!raw) return null;

    const rv = raw.values || raw.stats || {};
    const values = {
        top: safeNum(rv.top),
        right: safeNum(rv.right),
        bottom: safeNum(rv.bottom),
        left: safeNum(rv.left),
    };

    let element = raw.element;
    if (!element || !ELEMENTS.includes(element)) {
        const id = String(raw.id || raw.token_id || raw.tokenId || Math.random());
        const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        element = ELEMENTS[hash % ELEMENTS.length];
    }

    const imageUrl =
        raw.imageUrl ||
        raw.image ||
        raw.metadata?.media ||
        raw.metadata?.image ||
        raw.nftData?.imageUrl ||
        raw.nftData?.image ||
        "";

    const rankKey = raw.rank || raw.rarity?.key || raw.rarity || "common";

    return {
        id: raw.id || raw.token_id || raw.tokenId || `card_${Math.random()}`,
        owner: owner || raw.owner || "player",
        values,
        imageUrl,
        rank: rankKey,
        rankLabel: raw.rankLabel || rankKey[0]?.toUpperCase() || "C",
        element,
        placeKey: prevCard?.placeKey ?? 0,
        captureKey: prevCard?.captureKey ?? 0,
        nftData: raw,
    };
}

function makeBoardElements() {
    if (!RULES.elementalSquares) return Array(9).fill(null);
    return Array.from({ length: 9 }, () =>
        Math.random() < 0.38 ? pick(ELEMENTS) : null
    );
}

function cloneDeckToHand(deck, owner) {
    return (deck || []).map(c => ({ ...c, owner, placeKey: 0, captureKey: 0 }));
}

function getStoredToken() {
    try {
        return (
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            ""
        );
    } catch { return ""; }
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

    const myPlayerIdRef = useRef(null);
    const myRoleRef = useRef(null);
    const pvpStateRef = useRef(null);

    const { accountId: nearAccountId } = useWalletConnect();

    // ── WS state ──────────────────────────────────
    const [wsConnected, setWsConnected] = useState(false);
    const [wsError, setWsError] = useState("");
    const [pvpState, setPvpState] = useState(null);
    const [myRole, setMyRole] = useState(null);
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [opponentConnected, setOpponentConnected] = useState(false);
    const [waitingForOpponent, setWaitingForOpponent] = useState(false);
    const [reconnectDeadline, setReconnectDeadline] = useState(null);

    const isPvP = mode === "pvp" && Boolean(matchId);
    const isStage2 = isPvP;

    // ── Claim state ───────────────────────────────
    const [claimCards, setClaimCards] = useState([]);
    const [claimLoading, setClaimLoading] = useState(false); // ← ДОБАВЛЕНО
    const [claimPickIndex, setClaimPickIndex] = useState(null);
    const [claimRevealed, setClaimRevealed] = useState(false);
    const [claimBusy, setClaimBusy] = useState(false);
    const [claimDone, setClaimDone] = useState(false);
    const [claimError, setClaimError] = useState("");
    const [claimedCard, setClaimedCard] = useState(null);

    const myTgId = me?.id ? Number(me.id) : 0;

    // ── Game state ────────────────────────────────
    const [enemyDeck, setEnemyDeck] = useState(() => getFallbackEnemyDeck());
    const [loadingEnemyDeck, setLoadingEnemyDeck] = useState(true);
    const [stage2Match, setStage2Match] = useState(null);

    const [hands, setHands] = useState(() => ({
        player: cloneDeckToHand(
            Array.isArray(playerDeck) && playerDeck.length === 5
                ? playerDeck.map((n, i) => normalizeCard(n, "player", null))
                : [],
            "player"
        ),
        enemy: cloneDeckToHand(getFallbackEnemyDeck(), "enemy"),
    }));

    const [boardElems, setBoardElems] = useState(() => makeBoardElements());
    const [board, setBoard] = useState(() => Array(9).fill(null));
    const [selected, setSelected] = useState(null);

    const [turn, setTurn] = useState(() => randomFirstTurn());
    const [series, setSeries] = useState({ player: 0, enemy: 0 });
    const [roundNo, setRoundNo] = useState(1);
    const [roundOver, setRoundOver] = useState(false);
    const [roundWinner, setRoundWinner] = useState(null);
    const [matchOver, setMatchOver] = useState(false);

    const [spellMode, setSpellMode] = useState(null);
    const [frozen, setFrozen] = useState(() => Array(9).fill(0));
    const [enemyRevealId, setEnemyRevealId] = useState(null);
    const [playerSpells, setPlayerSpells] = useState({ freeze: 1, reveal: 1 });

    const boardRef = useRef(board);
    const handsRef = useRef(hands);
    const frozenRef = useRef(frozen);
    const boardElemsRef = useRef(boardElems);

    useEffect(() => void (boardRef.current = board), [board]);
    useEffect(() => void (handsRef.current = hands), [hands]);
    useEffect(() => void (frozenRef.current = frozen), [frozen]);
    useEffect(() => void (boardElemsRef.current = boardElems), [boardElems]);

    useEffect(() => { myPlayerIdRef.current = myPlayerId; }, [myPlayerId]);
    useEffect(() => { myRoleRef.current = myRole; }, [myRole]);
    useEffect(() => { pvpStateRef.current = pvpState; }, [pvpState]);

    const deckOk = Array.isArray(playerDeck) && playerDeck.length === 5;

    // ══════════════════════════════════════════════
    // PvP HELPERS
    // ══════════════════════════════════════════════

    const getEffectiveMyPlayerId = (data) => {
        if (myPlayerIdRef.current) return myPlayerIdRef.current;
        const role = myRoleRef.current || data?.you_are;
        const state = pvpStateRef.current || data?.state;
        if (role && state) {
            return role === "player1" ? state.player1_id : state.player2_id;
        }
        return null;
    };

    const haptic = (kind = "light") => {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind); } catch { }
    };

    // ══════════════════════════════════════════════
    // WS HANDLERS
    // ══════════════════════════════════════════════

    const handleGameState = (data) => {
        if (!mountedRef.current) return;
        try {
            const state = data.state;
            if (!state) return;

            setWaitingForOpponent(false);
            setOpponentConnected(true);
            setPvpState(state);
            pvpStateRef.current = state;

            let myId = myPlayerIdRef.current;
            if (!myId) {
                const role = myRoleRef.current || data.you_are;
                myId = role === "player1" ? state.player1_id : state.player2_id;
                if (myId) {
                    setMyPlayerId(myId);
                    myPlayerIdRef.current = myId;
                }
            }

            if (Array.isArray(state.board)) {
                setBoard(prev => state.board.map((cell, idx) => {
                    if (!cell) return null;
                    const owner = (myId && String(cell.owner) === String(myId)) ? "player" : "enemy";
                    return normalizeCard(cell, owner, prev[idx]);
                }));
            }

            if (Array.isArray(state.board_elements)) {
                setBoardElems(state.board_elements);
            }

            if (state.current_turn != null) {
                const isMyTurn = myId ? String(state.current_turn) === String(myId) : false;
                setTurn(isMyTurn ? "player" : "enemy");
            }

            const myHand = Array.isArray(data.your_hand)
                ? data.your_hand
                    .filter(c => c != null)
                    .map((c, i) => normalizeCard(c, "player", null))
                : null;

            const role = myRoleRef.current || data.you_are;
            const enemyCount = role === "player1"
                ? (state.player2_hand_count ?? 0)
                : (state.player1_hand_count ?? 0);

            const enemyHand = Array(Math.max(0, enemyCount)).fill(null).map((_, i) => ({
                id: `enemy_hidden_${i}_${Date.now()}`,
                owner: "enemy",
                hidden: true,
                values: { top: 5, right: 5, bottom: 5, left: 5 },
            }));

            setHands(h => ({
                player: myHand !== null ? myHand : h.player,
                enemy: enemyHand,
            }));

            if (state.status === "finished") {
                setMatchOver(true);
                setRoundOver(true);
                if (myId) {
                    const iWon = String(state.winner) === String(myId);
                    setRoundWinner(iWon ? "player" : "enemy");
                    if (iWon) {
                        confetti({ zIndex: 99999, particleCount: 50, spread: 80, origin: { y: 0.4 } });
                        prepareClaimCards();
                    }
                }
            }

            setLoadingEnemyDeck(false);
        } catch (e) {
            console.error("[handleGameState]", e);
        }
    };

    const handleCardPlayed = (data) => {
        if (!mountedRef.current) return;
        try {
            const { cell_index, card, captured, player_id } = data;
            if (cell_index == null || !card) return;
            if (cell_index < 0 || cell_index > 8) return;

            const myId = getEffectiveMyPlayerId(data);
            const isMyCard = myId ? String(player_id) === String(myId) : false;
            const owner = isMyCard ? "player" : "enemy";

            const parsedCard = normalizeCard(card, owner, null);
            parsedCard.placeKey = Date.now();

            setBoard(prev => {
                const next = [...prev];
                next[cell_index] = parsedCard;
                if (Array.isArray(captured)) {
                    const t = Date.now();
                    for (const idx of captured) {
                        if (typeof idx !== "number" || idx < 0 || idx > 8) continue;
                        if (next[idx]) {
                            next[idx] = { ...next[idx], owner, captureKey: t + idx };
                        }
                    }
                }
                return next;
            });

            if (!isMyCard) {
                setHands(h => ({
                    ...h,
                    enemy: h.enemy.length > 0 ? h.enemy.slice(0, -1) : [],
                }));
            }

            haptic("medium");
        } catch (e) {
            console.error("[handleCardPlayed]", e);
        }
    };

    const handleTurnChange = (data) => {
        if (!mountedRef.current) return;
        try {
            const myId = getEffectiveMyPlayerId(data);
            if (!myId) return;
            setTurn(String(data.current_turn) === String(myId) ? "player" : "enemy");
        } catch (e) {
            console.error("[handleTurnChange]", e);
        }
    };

    const handleGameOver = (data) => {
        if (!mountedRef.current) return;
        try {
            setMatchOver(true);
            setRoundOver(true);
            const myId = getEffectiveMyPlayerId(data);
            const iWon = myId ? String(data.winner) === String(myId) : false;
            setRoundWinner(iWon ? "player" : "enemy");
            if (iWon) {
                confetti({ zIndex: 99999, particleCount: 50, spread: 80, origin: { y: 0.4 } });
                prepareClaimCards();
            }
        } catch (e) {
            console.error("[handleGameOver]", e);
        }
    };

    // ══════════════════════════════════════════════
    // WS CONNECTION
    // ══════════════════════════════════════════════

    useEffect(() => {
        if (!isPvP || !matchId) return;
        mountedRef.current = true;

        const token = getStoredToken();
        if (!token) { setWsError("No auth token"); return; }

        const apiUrl = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";
        if (!apiUrl) { setWsError("No API URL configured"); return; }

        const wsUrl = apiUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + `/ws/match/${matchId}`;

        let ws = null;
        let reconnectAttempts = 0;
        let reconnectTimeout = null;
        const MAX_RECONNECTS = 5;

        const connect = () => {
            if (!mountedRef.current) return;
            try {
                ws = new WebSocket(wsUrl);
                wsRef.current = ws;
            } catch {
                setWsError("Failed to connect");
                return;
            }

            ws.onopen = () => {
                if (!mountedRef.current) { ws.close(); return; }
                reconnectAttempts = 0;
                setWsError("");
                try { ws.send(JSON.stringify({ type: "auth", token })); } catch { }
            };

            ws.onmessage = (event) => {
                if (!mountedRef.current) return;
                let data;
                try { data = JSON.parse(event.data); }
                catch (e) { console.error("[WS] parse error", e); return; }

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
                            try {
                                if (wsRef.current?.readyState === WebSocket.OPEN)
                                    wsRef.current.send(JSON.stringify({ type: "get_state" }));
                            } catch { }
                            break;

                        case "player_disconnected":
                            setOpponentConnected(false);
                            if (data.reconnect_deadline)
                                setReconnectDeadline(new Date(data.reconnect_deadline));
                            break;

                        case "game_start":
                            setWaitingForOpponent(false);
                            setOpponentConnected(true);
                            break;

                        case "game_state":
                            setWaitingForOpponent(false);
                            setOpponentConnected(true);
                            handleGameState(data);
                            break;

                        case "card_played": handleCardPlayed(data); break;
                        case "turn_change": handleTurnChange(data); break;
                        case "game_over": handleGameOver(data); break;

                        case "error":
                            setWsError(data.message || "Unknown error");
                            break;

                        case "ping":
                            try { ws.send(JSON.stringify({ type: "pong" })); } catch { }
                            break;

                        case "pong": break;
                        default:
                            console.log("[WS] unknown:", data.type);
                    }
                } catch (e) {
                    console.error("[WS] handler error:", data?.type, e);
                }
            };

            ws.onerror = (e) => console.error("[WS] error", e);

            ws.onclose = (event) => {
                setWsConnected(false);
                if (!mountedRef.current || event.code === 1000) return;
                if (reconnectAttempts < MAX_RECONNECTS) {
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
            if (wsRef.current?.readyState === WebSocket.OPEN)
                try { wsRef.current.send(JSON.stringify({ type: "ping" })); } catch { }
        }, 15000);

        return () => {
            mountedRef.current = false;
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close(1000, "unmounted");
                wsRef.current = null;
            }
        };
    }, [isPvP, matchId]);

    // ══════════════════════════════════════════════
    // CLAIM LOGIC
    // ══════════════════════════════════════════════

    // СТАЛО — добавь ref-guard от двойного вызова:
    // Добавь рядом с другими refs в начале компонента:
    const prepareClaimCalledRef = useRef(false);

    // И саму функцию измени:
    const prepareClaimCards = async () => {
        // [PATCH] Guard от двойного вызова (handleGameState + handleGameOver)
        if (prepareClaimCalledRef.current) {
            console.warn("[prepareClaimCards] already called — skipped");
            return;
        }
        prepareClaimCalledRef.current = true;

        setClaimLoading(true);
        if (isPvP && matchId) {
            try {
                const token = getStoredToken();
                const res = await apiFetch(`/api/matches/${matchId}/opponent_deposits`, { token });
                if (res?.deposits?.length > 0) {
                    setClaimCards(res.deposits.map((d, i) => ({
                        id: d.token_id || `deposit_${i}`,
                        token_id: d.token_id,
                        nft_contract_id: d.nft_contract_id,
                        index: i,
                        image: d.image || null,
                        imageUrl: d.image || null,
                    })));
                    setClaimLoading(false);
                    return;
                }
            } catch (e) { console.error("[prepareClaimCards]", e); }
            setClaimCards(Array.from({ length: 5 }, (_, i) => ({
                id: `claim_${i}`, index: i, image: null, imageUrl: null,
            })));
        } else {
            setClaimCards(enemyDeck.map((c, i) => ({
                ...c, index: i,
                image: c.imageUrl || c.image || null,
                imageUrl: c.imageUrl || c.image || null,
            })));
        }
        setClaimLoading(false);
    };
    const onClaimPick = (index) => {
        if (claimDone || claimBusy || claimRevealed) return;
        setClaimPickIndex(index);
        haptic("light");
    };

    // ← ИСПРАВЛЕНО: убран дублирующий запрос opponent_deposits
    const onClaimConfirm = async () => {
        if (claimPickIndex === null || claimBusy || claimDone) return;
        setClaimBusy(true);
        setClaimError("");
        try {
            const token = getStoredToken();
            const pickedCard = claimCards[claimPickIndex] || {};

            if (isPvP && matchId) {
                // Imagen уже есть в claimCards — не грузим повторно
                const realImage = pickedCard?.image || pickedCard?.imageUrl || null;

                await apiFetch(`/api/matches/${matchId}/finish`, {
                    method: "POST", token,
                    body: JSON.stringify({
                        winner_user_id: myTgId,
                        winner_near_wallet: nearAccountId || null,
                    }),
                });

                const res = await apiFetch(`/api/matches/${matchId}/claim`, {
                    method: "POST", token,
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
                setClaimedCard({ ...aiCard, image: aiCard?.imageUrl, imageUrl: aiCard?.imageUrl });
            }

            setClaimRevealed(true);
            haptic("medium");
            await new Promise(r => setTimeout(r, 800));
            setClaimDone(true);
            confetti({ zIndex: 99999, particleCount: 40, spread: 70, origin: { y: 0.5 } });
        } catch (e) {
            console.error("[claim]", e);
            setClaimError(String(e?.message || e));
            setClaimRevealed(false);
        } finally {
            setClaimBusy(false);
        }
    };

    // ══════════════════════════════════════════════
    // AI / GAME LOGIC
    // ══════════════════════════════════════════════

    const sendPvPMove = (cardIndex, cellIndex) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            setWsError("Connection lost");
            return false;
        }
        try {
            wsRef.current.send(JSON.stringify({ type: "play_card", card_index: cardIndex, cell_index: cellIndex }));
            return true;
        } catch {
            setWsError("Failed to send move");
            return false;
        }
    };

    const refreshStage2Match = async () => {
        if (!isStage2) return;
        try {
            const token = getStoredToken();
            if (!token) return;
            const m = await apiFetch(`/api/matches/${matchId}`, { token });
            setStage2Match(m);
        } catch { }
    };

    useEffect(() => { refreshStage2Match(); }, [matchId, isStage2]);

    useEffect(() => {
        if (isPvP) return;
        let alive = true;
        (async () => {
            try {
                setLoadingEnemyDeck(true);
                const token = getStoredToken();
                const aiDeck = await apiFetch("/api/decks/ai_opponent", { token });
                const cards = Array.isArray(aiDeck)
                    ? aiDeck.map(n => normalizeCard(n, "enemy", null))
                    : [];
                if (!alive) return;
                if (cards.length === 5) {
                    setEnemyDeck(cards);
                    setHands(h => ({ ...h, enemy: cloneDeckToHand(cards, "enemy") }));
                } else {
                    const fb = getFallbackEnemyDeck();
                    setEnemyDeck(fb);
                    setHands(h => ({ ...h, enemy: cloneDeckToHand(fb, "enemy") }));
                }
            } catch {
                if (!alive) return;
                const fb = getFallbackEnemyDeck();
                setEnemyDeck(fb);
                setHands(h => ({ ...h, enemy: cloneDeckToHand(fb, "enemy") }));
            } finally {
                if (alive) setLoadingEnemyDeck(false);
            }
        })();
        return () => { alive = false; };
    }, [isPvP]);

    useEffect(() => {
        if (!deckOk || isPvP) return;
        setHands(h => ({
            ...h,
            player: cloneDeckToHand(
                playerDeck.map(n => normalizeCard(n, "player", null)),
                "player"
            ),
        }));
    }, [playerDeck, isPvP]);

    useEffect(() => {
        if (isPvP) return;
        setHands(h => ({ ...h, enemy: cloneDeckToHand(enemyDeck, "enemy") }));
    }, [enemyDeck, isPvP]);

    const clearReveal = () => {
        if (revealTimerRef.current) { clearTimeout(revealTimerRef.current); revealTimerRef.current = null; }
        setEnemyRevealId(null);
    };

    useEffect(() => () => { if (revealTimerRef.current) clearTimeout(revealTimerRef.current); }, []);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const decFrozen = () => setFrozen(prev => prev.map(v => v > 0 ? v - 1 : 0));

    const startRound = ({ keepSeries = true, enemyDeckOverride = null } = {}) => {
        if (isPvP) return;
        prepareClaimCalledRef.current = false;
        const ed = enemyDeckOverride || enemyDeck;
        setBoard(Array(9).fill(null));
        setBoardElems(makeBoardElements());
        if (deckOk) {
            setHands({
                player: cloneDeckToHand(playerDeck.map(n => normalizeCard(n, "player", null)), "player"),
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
        setClaimLoading(false); // ← ДОБАВЛЕНО
        if (!keepSeries) {
            setSeries({ player: 0, enemy: 0 });
            setRoundNo(1);
            setMatchOver(false);
            setStage2Match(null);
        }
    };

    const resetMatch = () => {
        if (isPvP) { onExit(); return; }
        const newEnemy = Array.from({ length: 5 }, (_, i) => genCard("enemy", `e${Date.now()}_${i}`));
        setEnemyDeck(newEnemy);
        setTimeout(() => startRound({ keepSeries: false, enemyDeckOverride: newEnemy }), 0);
    };

    const boardScore = useMemo(() => board.reduce(
        (a, c) => { if (c) c.owner === "player" ? a.blue++ : a.red++; return a; },
        { red: 0, blue: 0 }
    ), [board]);

    const canUseMagic = turn === "player" && !roundOver && !matchOver && !isPvP;

    const placeCard = (cellIdx) => {
        if (roundOver || matchOver || turn !== "player" || !selected) return;
        if (board[cellIdx] || frozen[cellIdx] > 0) return;

        if (isPvP) {
            const cardIndex = hands.player.findIndex(c =>
                String(c.id || c.token_id || c.tokenId) ===
                String(selected.id || selected.token_id || selected.tokenId)
            );
            if (cardIndex === -1) return;
            if (sendPvPMove(cardIndex, cellIdx)) setSelected(null);
            return;
        }

        const next = [...board];
        next[cellIdx] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };
        resolvePlacement(cellIdx, next, boardElems);
        setBoard(next);
        setHands(h => ({
            ...h,
            player: h.player.filter(c =>
                String(c.id || c.token_id) !== String(selected.id || selected.token_id)
            ),
        }));
        setSelected(null);
        setSpellMode(null);
        decFrozen();
        haptic("medium");
        setTurn("enemy");
    };

    const onCellClick = (i) => {
        if (roundOver || matchOver) return;
        if (spellMode === "freeze" && !isPvP) {
            if (turn !== "player" || playerSpells.freeze <= 0 || board[i] || frozen[i] > 0) return;
            setFrozen(prev => { const n = [...prev]; n[i] = FREEZE_DURATION_MOVES; return n; });
            setPlayerSpells(s => ({ ...s, freeze: Math.max(0, s.freeze - 1) }));
            setSpellMode(null);
            setTurn("enemy");
            haptic("light");
            return;
        }
        placeCard(i);
    };

    const onMagicFreeze = () => {
        if (!canUseMagic || playerSpells.freeze <= 0) return;
        haptic("light");
        setSelected(null);
        setSpellMode(m => m === "freeze" ? null : "freeze");
    };

    const onMagicReveal = () => {
        if (!canUseMagic || playerSpells.reveal <= 0 || !hands.enemy.length) return;
        haptic("light");
        const c = hands.enemy[Math.floor(Math.random() * hands.enemy.length)];
        setEnemyRevealId(c.id);
        if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
        revealTimerRef.current = setTimeout(() => { setEnemyRevealId(null); revealTimerRef.current = null; }, REVEAL_MS);
        setSelected(null);
        setSpellMode(null);
        setPlayerSpells(s => ({ ...s, reveal: Math.max(0, s.reveal - 1) }));
        setTurn("enemy");
    };

    // AI ход
    useEffect(() => {
        if (isPvP || turn !== "enemy" || roundOver || matchOver) return;

        const t = setTimeout(() => {
            const curBoard = boardRef.current;
            const curHands = handsRef.current;
            const curFrozen = frozenRef.current;
            const curElems = boardElemsRef.current;

            const empty = curBoard
                .map((c, idx) => c === null && curFrozen[idx] === 0 ? idx : null)
                .filter(v => v !== null);

            if (!empty.length || !curHands.enemy.length) { setTurn("player"); return; }

            let bestScore = -Infinity, bestCell = empty[0], bestCard = curHands.enemy[0];

            for (const card of curHands.enemy) {
                for (const cellIdx of empty) {
                    let score = 0;
                    const cellElem = curElems[cellIdx];
                    if (cellElem && card.element) score += card.element === cellElem ? 1 : -1;

                    for (const { ni, a, b } of neighborsOf(cellIdx)) {
                        const nb = curBoard[ni];
                        if (!nb) continue;
                        const atk = safeNum(card.values?.[a]);
                        const def = safeNum(nb.values?.[b]);
                        const atkElem = curElems[cellIdx];
                        const defElem = curElems[ni];
                        const atkVal = atk === ACE_VALUE ? ACE_VALUE : clamp(atk + (atkElem ? (card.element === atkElem ? 1 : -1) : 0), 1, 9);
                        const defVal = def === ACE_VALUE ? ACE_VALUE : clamp(def + (defElem ? (nb.element === defElem ? 1 : -1) : 0), 1, 9);
                        if (nb.owner === "enemy") score += 0.5;
                        else if (atkVal > defVal) score += 5;
                        else if (atkVal < defVal) score -= 0.5;
                    }

                    if (cellIdx === 4) score += 1;
                    if ([0, 2, 6, 8].includes(cellIdx)) score += 0.5;
                    score += Math.random() * 0.5;

                    if (score > bestScore) { bestScore = score; bestCell = cellIdx; bestCard = card; }
                }
            }

            const next = [...curBoard];
            next[bestCell] = { ...bestCard, owner: "enemy", placeKey: (bestCard.placeKey || 0) + 1 };
            resolvePlacement(bestCell, next, curElems);
            setBoard(next);
            setHands(h => ({
                ...h,
                enemy: h.enemy.filter(c =>
                    String(c.id || c.token_id) !== String(bestCard.id || bestCard.token_id)
                ),
            }));
            decFrozen();
            setTurn("player");
        }, 600);

        const safety = setTimeout(() => setTurn(cur => cur === "enemy" ? "player" : cur), 3000);
        return () => { clearTimeout(t); clearTimeout(safety); };
    }, [turn, roundOver, matchOver, isPvP]);

    useEffect(() => {
        if (isPvP || roundOver || matchOver) return;
        if (board.some(c => c === null)) return;
        const blue = board.filter(c => c?.owner === "player").length;
        const red = board.filter(c => c?.owner === "enemy").length;
        const w = blue > red ? "player" : "enemy";
        setRoundWinner(w);
        setRoundOver(true);
        setSeries(s => ({ ...s, [w]: s[w] + 1 }));
    }, [board, roundOver, matchOver, isPvP]);

    useEffect(() => {
        if (isPvP || matchOver) return;
        if (series.player >= MATCH_WINS_TARGET || series.enemy >= MATCH_WINS_TARGET) {
            setMatchOver(true);
            if (series.player >= MATCH_WINS_TARGET) prepareClaimCards();
            if (isStage2) refreshStage2Match();
        }
    }, [series, matchOver, isStage2, isPvP]);

    useEffect(() => {
        if (!roundOver || roundWinner !== "player") return;
        const origin = { x: 0.5, y: 0.35 };
        const t1 = setTimeout(() => confetti({ zIndex: 99999, particleCount: 34, spread: 75, startVelocity: 30, origin }), 0);
        const t2 = setTimeout(() => confetti({ zIndex: 99999, particleCount: 22, spread: 95, startVelocity: 26, origin }), 160);
        return () => { clearTimeout(t1); clearTimeout(t2); };
    }, [roundOver, roundWinner]);

    const onNextRound = () => { if (isPvP) return; setRoundNo(r => r + 1); startRound({ keepSeries: true }); };
    const matchWinner = series.player >= MATCH_WINS_TARGET ? "player" : series.enemy >= MATCH_WINS_TARGET ? "enemy" : null;

    const myName = getPlayerName(me);
    const myAvatar = getPlayerAvatarUrl(me);

    // ══════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════

    if (isPvP && !wsConnected) {
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
                            ) : (
                                <>
                                    <h2 style={{ margin: 0 }}>Connecting...</h2>
                                    <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                                        Connecting to match server...
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isPvP && wsConnected && waitingForOpponent) {
        return (
            <div className="game-root">
                <div className="game-ui tt-layout">
                    <button className="exit" onClick={onExit}>← Меню</button>
                    <div className="game-over">
                        <div className="game-over-box" style={{ minWidth: 320 }}>
                            <h2 style={{ margin: 0 }}>Waiting for opponent...</h2>
                            <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                                You are {myRole === "player1" ? "Player 1" : "Player 2"}
                            </div>
                            <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                                Match ID: {matchId?.slice(0, 8)}...
                            </div>
                            <button onClick={onExit} style={{ marginTop: 16 }}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (isPvP && reconnectDeadline && !opponentConnected) {
        const sec = Math.max(0, Math.ceil((reconnectDeadline.getTime() - Date.now()) / 1000));
        return (
            <div className="game-root">
                <div className="game-ui tt-layout">
                    <button className="exit" onClick={onExit}>← Меню</button>
                    <div className="game-over">
                        <div className="game-over-box" style={{ minWidth: 320 }}>
                            <h2 style={{ margin: 0, color: "#ffd43b" }}>Opponent Disconnected</h2>
                            <div style={{ marginTop: 10, opacity: 0.9, fontSize: 14 }}>
                                Waiting: {Math.floor(sec / 60)}:{(sec % 60).toString().padStart(2, "0")}
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

                {!deckOk && (
                    <div style={{ color: "#fff", padding: 20, textAlign: "center", gridColumn: "1/-1", fontSize: 14 }}>
                        ⚠️ Ошибка: активная колода не содержит 5 карт.
                    </div>
                )}

                {deckOk && (<>
                    <div className="hud-corner hud-score red hud-near-left">🟥 {boardScore.red}</div>
                    <div className="hud-corner hud-score blue hud-near-right">{boardScore.blue} 🟦</div>

                    <PlayerBadge side="enemy" name={isPvP ? "Opponent" : "BunnyBot"} avatarUrl="/ui/avatar-enemy.png?v=1" active={turn === "enemy"} />
                    <PlayerBadge side="player" name={myName} avatarUrl={myAvatar} active={turn === "player"} />

                    <div className="hand left">
                        <div className="hand-cards-wrap">
                            {hands.enemy.slice(0, 5).map((c, i) => {
                                const revealed = !isPvP && c && enemyRevealId === c.id;
                                const cls = ["hc-top-left", "hc-top-right", "hc-center", "hc-bot-left", "hc-bot-right"][i];
                                return (
                                    <div key={c?.id || `enemy_${i}`} className={`hc ${cls}`}>
                                        {revealed ? <Card card={c} disabled /> : <Card hidden />}
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
                                const canHL = !roundOver && !matchOver && !cell && !isFrozen && turn === "player"
                                    && ((spellMode === "freeze" && !isPvP) || (spellMode == null && selected));
                                const elem = boardElems[i];
                                return (
                                    <div
                                        key={i}
                                        className={`cell ${canHL ? "highlight" : ""} ${isFrozen ? "frozen" : ""}`}
                                        onClick={() => onCellClick(i)}
                                        title={isFrozen ? `Frozen (${frozen[i]})` : elem ? `Element: ${elem}` : undefined}
                                    >
                                        {elem && <div className="elem-bg" aria-hidden>{ELEM_ICON[elem]}</div>}
                                        {cell && <Card card={cell} cellElement={elem} />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="hand right">
                        <div className="hand-cards-wrap">
                            {hands.player.slice(0, 5).map((c, i) => {
                                const cls = ["hc-top-left", "hc-top-right", "hc-center", "hc-bot-left", "hc-bot-right"][i];
                                return (
                                    <div key={c.id} className={`hc ${cls}`}>
                                        <Card
                                            card={c}
                                            selected={selected?.id === c.id}
                                            disabled={roundOver || matchOver || turn !== "player" || (spellMode === "freeze" && !isPvP)}
                                            onClick={() => setSelected(prev => prev?.id === c.id ? null : c)}
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

                    {loadingEnemyDeck && !isPvP && (
                        <div className="game-over">
                            <div className="game-over-box" style={{ minWidth: 320 }}>
                                <h2 style={{ margin: 0 }}>Загрузка соперника…</h2>
                            </div>
                        </div>
                    )}

                    {(roundOver || matchOver) && (
                        <div className="game-over">
                            <div className="game-over-box" style={{ minWidth: 340, maxWidth: 420 }}>
                                <h2 style={{ marginBottom: 12, fontSize: 22 }}>
                                    {matchOver
                                        ? (isPvP ? roundWinner : matchWinner) === "player" ? "🎉 Победа!" : "😔 Поражение"
                                        : roundWinner === "player" ? "🏆 Раунд выигран!" : "💀 Раунд проигран"
                                    }
                                </h2>

                                <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 16 }}>
                                    {isPvP
                                        ? <>Поле: Вы {boardScore.blue} - {boardScore.red} Противник</>
                                        : <>Раунд {roundNo} • Серия до {MATCH_WINS_TARGET} • Счёт {series.player}:{series.enemy}</>
                                    }
                                </div>

                                {/* ← ИСПРАВЛЕНО: один источник карт + лоадер */}
                                {matchOver && (isPvP ? roundWinner : matchWinner) === "player" && !claimDone && (
                                    <>
                                        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: "#ffd700" }}>
                                            🎁 Выбери 1 карту противника
                                        </div>
                                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 14 }}>
                                            Карты скрыты — выбирай наугад!
                                        </div>

                                        {claimLoading ? (
                                            <div style={{ padding: 20, opacity: 0.7, fontSize: 14 }}>
                                                ⏳ Загрузка карт...
                                            </div>
                                        ) : (
                                            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
                                                {claimCards.map((card, idx) => {
                                                    const isSel = claimPickIndex === idx;
                                                    const showCard = claimRevealed && isSel;
                                                    const realImg = claimedCard?.image || claimedCard?.imageUrl || card?.image || card?.imageUrl || null;
                                                    return (
                                                        <div
                                                            key={card?.id || card?.token_id || idx}
                                                            onClick={() => onClaimPick(idx)}
                                                            style={{
                                                                cursor: claimRevealed ? "default" : "pointer",
                                                                transform: isSel ? "scale(1.1) translateY(-4px)" : "scale(1)",
                                                                transition: "all 0.25s ease",
                                                                filter: claimRevealed && !isSel ? "brightness(0.5)" : "none",
                                                            }}
                                                        >
                                                            {showCard ? (
                                                                <div style={{ width: 64, height: 88, borderRadius: 10, overflow: "hidden", border: "3px solid #ffd700", boxShadow: "0 0 20px rgba(255,215,0,0.5)", background: "#1a1a2e" }}>
                                                                    <img
                                                                        src={realImg || "/cards/card.jpg"}
                                                                        alt=""
                                                                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                                        onError={e => { e.currentTarget.src = "/cards/card.jpg"; }}
                                                                    />
                                                                </div>
                                                            ) : (
                                                                <div className="card back" style={{ width: 64, height: 88, border: isSel ? "3px solid #ffd700" : "2px solid rgba(255,255,255,0.2)", boxShadow: isSel ? "0 0 20px rgba(255,215,0,0.5)" : "none", borderRadius: 10 }}>
                                                                    <div className="card-back-inner">
                                                                        <img className="card-back-logo-img" src="/ui/cardclash-logo.png?v=3" alt="" draggable="false" style={{ width: "70%", height: "auto" }} />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {!claimRevealed && !claimLoading && (
                                            <button
                                                onClick={onClaimConfirm}
                                                disabled={claimPickIndex === null || claimBusy}
                                                style={{ padding: "12px 28px", fontSize: 15, fontWeight: 900, borderRadius: 14, border: "none", background: claimPickIndex !== null ? "linear-gradient(135deg,#ffd700,#ff8c00)" : "rgba(255,255,255,0.1)", color: claimPickIndex !== null ? "#000" : "#666", cursor: claimPickIndex !== null ? "pointer" : "not-allowed", marginBottom: 12 }}
                                            >
                                                {claimBusy ? "⏳ Загрузка..." : "🎁 Забрать карту"}
                                            </button>
                                        )}
                                        {claimRevealed && claimBusy && (
                                            <div style={{ fontSize: 14, color: "#a0d8ff", marginBottom: 12 }}>⏳ Переводим NFT...</div>
                                        )}
                                        {claimError && (
                                            <div style={{ fontSize: 12, color: "#ff6b6b", marginBottom: 12, padding: "8px 12px", background: "rgba(255,100,100,0.15)", borderRadius: 8, wordBreak: "break-word" }}>
                                                ❌ {claimError}
                                            </div>
                                        )}
                                    </>
                                )}

                                {matchOver && (isPvP ? roundWinner : matchWinner) === "player" && claimDone && (
                                    <div style={{ fontSize: 15, color: "#4ade80", marginBottom: 16, fontWeight: 700, padding: "12px 16px", background: "rgba(74,222,128,0.15)", borderRadius: 12 }}>
                                        ✅ Карта получена! Проверь инвентарь.
                                    </div>
                                )}

                                {matchOver && (isPvP ? roundWinner : matchWinner) === "enemy" && (
                                    <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 16, padding: "10px 14px", background: "rgba(255,100,100,0.1)", borderRadius: 10 }}>
                                        Противник заберёт 1 твою карту.
                                    </div>
                                )}

                                <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                                    {!matchOver && !isPvP && <button onClick={onNextRound}>Следующий раунд</button>}
                                    {matchOver && (claimDone || (isPvP ? roundWinner : matchWinner) === "enemy") && (
                                        <button onClick={resetMatch}>{isPvP ? "Выйти" : "Новый матч"}</button>
                                    )}
                                    <button onClick={onExit}>Меню</button>
                                </div>
                            </div>
                        </div>
                    )}
                </>)}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════ */

function PlayerBadge({ side, name, avatarUrl, active }) {
    const [imgOk, setImgOk] = useState(Boolean(avatarUrl));
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
                <div className="player-badge-avatar-fallback">{initialsFrom(name)}</div>
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

    useEffect(() => { setImgFailed(false); }, [card?.id]);

    if (hidden) {
        return (
            <div className="card back" aria-hidden="true">
                <div className="card-back-inner">
                    <img className="card-back-logo-img" src="/ui/cardclash-logo.png?v=3" alt="" draggable="false" loading="lazy" />
                </div>
            </div>
        );
    }

    if (!card) return null;

    const raw = card.values || card.stats || {};
    const cv = {
        top: safeNum(raw.top),
        right: safeNum(raw.right),
        bottom: safeNum(raw.bottom),
        left: safeNum(raw.left),
    };

    const elemBonus = (card.element && cellElement && ELEMENTS.includes(card.element))
        ? (card.element === cellElement ? 1 : -1) : 0;

    const displayVal = (base) => {
        const n = safeNum(base);
        if (n === ACE_VALUE) return "A";
        if (elemBonus === 0) return n;
        return Math.min(9, Math.max(1, n + elemBonus));
    };

    const numStyle = (base) => {
        const n = safeNum(base);
        if (n === ACE_VALUE) return { color: "#ffd700", fontWeight: 900 };
        if (elemBonus === 0) return {};
        const r = Math.min(9, Math.max(1, n + elemBonus));
        if (r > n) return { color: "#4ade80" };
        if (r < n) return { color: "#f87171" };
        return {};
    };

    const imgSrc = !imgFailed
        ? (card.imageUrl || card.image || card.nftData?.imageUrl || card.nftData?.image || "")
        : "";

    return (
        <div
            className={["card", card.owner === "player" ? "player" : "enemy",
                selected ? "selected" : "", disabled ? "disabled" : "",
                placedAnim ? "is-placed" : "", capturedAnim ? "is-captured" : "",
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
                    <div className="card-art-img" style={{ background: "linear-gradient(135deg,#1a2a4a,#2a1a4a)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
                        🎴
                    </div>
                )}

                {card.element && (
                    <div className="card-elem-pill" title={card.element}>
                        <span className="card-elem-ic">{ELEM_ICON[card.element] || "?"}</span>
                    </div>
                )}

                <div className="tt-badge">
                    <span className="tt-num top" style={numStyle(cv.top)}>{displayVal(cv.top)}</span>
                    <span className="tt-num left" style={numStyle(cv.left)}>{displayVal(cv.left)}</span>
                    <span className="tt-num right" style={numStyle(cv.right)}>{displayVal(cv.right)}</span>
                    <span className="tt-num bottom" style={numStyle(cv.bottom)}>{displayVal(cv.bottom)}</span>
                </div>
            </div>
        </div>
    );
}