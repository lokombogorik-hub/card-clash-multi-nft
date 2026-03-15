import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { apiFetch } from "./api.js";
import { useWalletConnect } from "./context/WalletConnectContext";

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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const randomFirstTurn = () => (Math.random() < 0.5 ? "player" : "enemy");

const RANKS = [
    { key: "common", label: "C", weight: 50, min: 1, max: 5, elemChance: 1.0 },
    { key: "rare", label: "R", weight: 30, min: 2, max: 7, elemChance: 1.0 },
    { key: "epic", label: "E", weight: 15, min: 3, max: 8, elemChance: 1.0 },
    { key: "legendary", label: "L", weight: 5, min: 4, max: 9, elemChance: 1.0 },
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
    const maxVal = Math.min(r.max, 9);
    const minVal = Math.max(r.min, 1);

    const values = {
        top: randInt(minVal, maxVal),
        right: randInt(minVal, maxVal),
        bottom: randInt(minVal, maxVal),
        left: randInt(minVal, maxVal),
    };

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
    return clamp(base + d, 1, 9);
}

function attackerValueForBattle(attacker, side, aIdx, defender, boardElems) {
    const base = valueForSamePlus(attacker, side, aIdx, boardElems);
    const ed = battleElementDelta(attacker.element, defender.element);
    return clamp(base + ed, 1, 9);
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

    for (const i of adj) {
        if (i.target.owner !== placed.owner && i.pBattle > i.tSP) basicSet.add(i.ni);
    }

    if (RULES.same) {
        const eq = adj.filter((i) => i.pSP === i.tSP);
        if (eq.length >= 2) eq.forEach((i) => sameSet.add(i.ni));
    }

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
    let element = nft.element;
    if (!element) {
        const id = nft.id || nft.key || nft.tokenId || nft.token_id || `nft_${idx}`;
        const hash = String(id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        element = ELEMENTS[hash % ELEMENTS.length];
    }

    return {
        id: nft.id || nft.key || nft.tokenId || nft.token_id || `nft_${idx}`,
        owner: "player",
        values: nft.values || nft.stats || { top: 5, right: 5, bottom: 5, left: 5 },
        imageUrl: nft.imageUrl || nft.image || ART[0],
        rank: nft.rank || nft.rarity || "common",
        rankLabel: nft.rankLabel || "C",
        element: element,
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

export default function Game({ onExit, me, playerDeck, matchId, mode = "ai" }) {
    const revealTimerRef = useRef(null);
    const wsRef = useRef(null);
    const pingIntervalRef = useRef(null);
    const mountedRef = useRef(true);

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

    // ==================== PvP Claim State ====================
    const [pvpClaimCards, setPvpClaimCards] = useState([]);  // 5 карт противника (скрытые)
    const [pvpClaimPickIndex, setPvpClaimPickIndex] = useState(null);  // выбранный индекс (0-4)
    const [pvpClaimRevealed, setPvpClaimRevealed] = useState(false);  // показать выбранную карту
    const [pvpClaimBusy, setPvpClaimBusy] = useState(false);
    const [pvpClaimDone, setPvpClaimDone] = useState(false);
    const [pvpClaimError, setPvpClaimError] = useState("");

    const escrowClaim = async ({ matchId: mId, winnerAccountId, loserNftContractId, loserTokenId }) => {
        const escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
        if (!escrowContractId) throw new Error("Escrow contract not configured");

        const result = await signAndSendTransaction({
            receiverId: escrowContractId,
            actions: [
                {
                    type: "FunctionCall",
                    params: {
                        methodName: "claim",
                        args: {
                            match_id: mId,
                            winner_account_id: winnerAccountId,
                            nft_contract_id: loserNftContractId,
                            token_id: loserTokenId,
                        },
                        gas: "100000000000000",
                        deposit: "0",
                    },
                },
            ],
        });

        const txHash =
            (result && typeof result === "object"
                ? result.transaction_outcome?.id ||
                result.transaction?.hash ||
                result.txHash
                : typeof result === "string"
                    ? result
                    : "") || "";

        return { txHash };
    };

    const [stage2Busy, setStage2Busy] = useState(false);
    const [stage2Err, setStage2Err] = useState("");
    const [stage2Match, setStage2Match] = useState(null);

    const myTgId = me?.id ? Number(me.id) : 0;
    const isStage2 = mode === "pvp" && Boolean(matchId);

    const [enemyDeck, setEnemyDeck] = useState(() => getFallbackEnemyDeck());
    const [loadingEnemyDeck, setLoadingEnemyDeck] = useState(true);

    const [hands, setHands] = useState(() => ({
        player: cloneDeckToHand((playerDeck || []).map((n, idx) => nftToCard(n, idx)), "player"),
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

    const boardRef = useRef(board);
    const handsRef = useRef(hands);
    const frozenRef = useRef(frozen);
    const boardElemsRef = useRef(boardElems);

    useEffect(() => void (boardRef.current = board), [board]);
    useEffect(() => void (handsRef.current = hands), [hands]);
    useEffect(() => void (frozenRef.current = frozen), [frozen]);
    useEffect(() => void (boardElemsRef.current = boardElems), [boardElems]);

    const deckOk = Array.isArray(playerDeck) && playerDeck.length === 5;

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

                try {
                    const data = JSON.parse(event.data);

                    switch (data.type) {
                        case "connected":
                            setWsConnected(true);
                            setMyRole(data.you_are);
                            setMyPlayerId(data.player_id);
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
                            setWsError(data.message);
                            break;

                        case "pong":
                            break;

                        case "ping":
                            try {
                                ws.send(JSON.stringify({ type: "pong" }));
                            } catch (e) { }
                            break;
                    }
                } catch (e) { }
            };

            ws.onerror = () => { };

            ws.onclose = (event) => {
                setWsConnected(false);

                if (!mountedRef.current) return;
                if (matchOver || event.code === 1000) return;

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

    const handleGameState = (data) => {
        if (!mountedRef.current) return;

        const state = data.state;
        setPvpState(state);

        const effectiveMyPlayerId = myPlayerId || (data.you_are === "player1" ? state.player1_id : state.player2_id);

        if (!myPlayerId && effectiveMyPlayerId) {
            setMyPlayerId(effectiveMyPlayerId);
        }

        if (state.board) {
            const newBoard = state.board.map((cell, idx) => {
                if (!cell) return null;
                return {
                    ...cell,
                    values: cell.values || cell.stats || { top: 5, right: 5, bottom: 5, left: 5 },
                    owner: cell.owner === effectiveMyPlayerId ? "player" : "enemy",
                    placeKey: boardRef.current[idx]?.placeKey || 0,
                    captureKey: boardRef.current[idx]?.captureKey || 0,
                };
            });
            setBoard(newBoard);
        }

        if (state.board_elements) {
            setBoardElems(state.board_elements);
        }

        const isMyTurn = String(state.current_turn) === String(effectiveMyPlayerId);
        setTurn(isMyTurn ? "player" : "enemy");

        if (data.your_hand) {
            const myHand = data.your_hand.map((card, idx) => ({
                ...nftToCard(card, idx),
                owner: "player",
            }));
            setHands(h => ({ ...h, player: myHand }));
        }

        const enemyHandCount = data.you_are === "player1"
            ? state.player2_hand_count
            : state.player1_hand_count;

        if (enemyHandCount !== undefined) {
            setHands(h => ({
                ...h,
                enemy: Array(enemyHandCount).fill(null).map((_, i) => ({
                    id: `enemy_hidden_${i}`,
                    owner: "enemy",
                    hidden: true,
                })),
            }));
        }

        if (state.status === "finished") {
            setMatchOver(true);
            setRoundOver(true);
            const iWon = state.winner === effectiveMyPlayerId;
            setRoundWinner(iWon ? "player" : "enemy");
        }

        setLoadingEnemyDeck(false);
    };

    const handleCardPlayed = (data) => {
        if (!mountedRef.current) return;

        const { cell_index, card, captured, player_id } = data;

        const effectiveMyPlayerId = myPlayerId || (myRole === "player1" ? pvpState?.player1_id : pvpState?.player2_id);
        const isMyCard = String(player_id) === String(effectiveMyPlayerId);
        const owner = isMyCard ? "player" : "enemy";

        setBoard(prev => {
            const next = [...prev];
            next[cell_index] = {
                ...nftToCard(card, 0),
                values: card.values || card.stats || { top: 5, right: 5, bottom: 5, left: 5 },
                owner,
                placeKey: Date.now(),
            };

            if (captured && captured.length > 0) {
                for (const idx of captured) {
                    if (next[idx]) {
                        next[idx] = {
                            ...next[idx],
                            owner,
                            captureKey: Date.now(),
                        };
                    }
                }
            }

            return next;
        });

        if (isMyCard) {
            const cardId = card.id || card.token_id || card.tokenId;
            setHands(h => ({
                ...h,
                player: h.player.filter(c => {
                    const cId = c.id || c.token_id || c.tokenId;
                    return cId !== cardId;
                }),
            }));
        } else {
            setHands(h => ({
                ...h,
                enemy: h.enemy.length > 0 ? h.enemy.slice(0, -1) : [],
            }));
        }

        haptic("medium");
    };

    const handleTurnChange = (data) => {
        if (!mountedRef.current) return;

        const effectiveMyPlayerId = myPlayerId || (myRole === "player1" ? pvpState?.player1_id : pvpState?.player2_id);
        const isMyTurn = String(data.current_turn) === String(effectiveMyPlayerId);

        setTurn(isMyTurn ? "player" : "enemy");
    };

    const handleGameOver = (data) => {
        if (!mountedRef.current) return;

        setMatchOver(true);
        setRoundOver(true);

        const effectiveMyPlayerId = myPlayerId || (myRole === "player1" ? pvpState?.player1_id : pvpState?.player2_id);
        const iWon = String(data.winner) === String(effectiveMyPlayerId);
        setRoundWinner(iWon ? "player" : "enemy");

        if (iWon) {
            confetti({ zIndex: 99999, particleCount: 50, spread: 80, origin: { y: 0.4 } });

            // Загружаем карты противника для claim (5 скрытых карт)
            loadOpponentCardsForClaim();
        }
    };

    // Загрузка карт противника из escrow для claim
    const loadOpponentCardsForClaim = async () => {
        try {
            const token = getStoredToken();
            if (!token || !matchId) return;

            // Запрашиваем deposits противника
            const res = await apiFetch(`/api/matches/${matchId}/opponent_deposits`, { token });

            if (res && res.deposits && res.deposits.length > 0) {
                // Есть реальные deposits
                setPvpClaimCards(res.deposits.map((d, i) => ({
                    id: d.token_id || `deposit_${i}`,
                    token_id: d.token_id,
                    nft_contract_id: d.nft_contract_id,
                    imageUrl: d.image || d.imageUrl || ART[0],
                    // Остальное скрыто
                })));
            } else {
                // Fallback: 5 пустых карт (backend ещё не настроен)
                setPvpClaimCards(Array.from({ length: 5 }, (_, i) => ({
                    id: `hidden_${i}`,
                    index: i,
                })));
            }
        } catch (e) {
            console.error("[Game] Failed to load opponent deposits:", e);
            // Fallback
            setPvpClaimCards(Array.from({ length: 5 }, (_, i) => ({
                id: `hidden_${i}`,
                index: i,
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

    // ==================== PvP Claim Logic ====================
    const onPvpClaimPick = (index) => {
        if (pvpClaimDone || pvpClaimBusy || pvpClaimRevealed) return;
        setPvpClaimPickIndex(index);
        haptic("light");
    };

    const onPvpClaimConfirm = async () => {
        if (pvpClaimPickIndex === null || pvpClaimBusy || pvpClaimDone) return;

        setPvpClaimBusy(true);
        setPvpClaimError("");

        try {
            const token = getStoredToken();
            if (!token) throw new Error("No auth token");

            // Сначала показываем выбранную карту (переворачиваем)
            setPvpClaimRevealed(true);
            haptic("medium");

            // Небольшая задержка для анимации
            await new Promise(r => setTimeout(r, 800));

            // Отправляем claim на backend
            const pickedCard = pvpClaimCards[pvpClaimPickIndex];

            const res = await apiFetch(`/api/matches/${matchId}/claim`, {
                method: "POST",
                token,
                body: JSON.stringify({
                    pick_index: pvpClaimPickIndex,
                    token_id: pickedCard?.token_id || null,
                    nft_contract_id: pickedCard?.nft_contract_id || null,
                }),
            });

            if (res.success) {
                setPvpClaimDone(true);
                confetti({ zIndex: 99999, particleCount: 30, spread: 60, origin: { y: 0.5 } });
            } else {
                throw new Error(res.error || "Claim failed");
            }
        } catch (e) {
            setPvpClaimError(String(e?.message || e));
        } finally {
            setPvpClaimBusy(false);
        }
    };

    // ==================== End PvP WebSocket Logic ====================

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
                const cards = Array.isArray(aiDeck) ? aiDeck.map((n, idx) => nftToCard(n, idx)) : [];

                if (!alive) return;

                if (cards.length === 5) setEnemyDeck(cards);
                else setEnemyDeck(getFallbackEnemyDeck());
            } catch {
                if (!alive) return;
                setEnemyDeck(getFallbackEnemyDeck());
            } finally {
                if (alive) setLoadingEnemyDeck(false);
            }
        })();

        return () => {
            alive = false;
        };
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
            const cardIndex = hands.player.findIndex(c => c.id === selected.id);
            if (cardIndex === -1) return;

            if (sendPvPMove(cardIndex, cellIdx)) {
                setSelected(null);
            }
            return;
        }

        const next = [...board];
        next[cellIdx] = { ...selected, owner: "player", placeKey: (selected.placeKey || 0) + 1 };

        const { flippedSpecial } = resolvePlacementTT(cellIdx, next, boardElems);
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

    useEffect(() => {
        if (isPvP) return;
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
    }, [turn, roundOver, matchOver, isPvP]);

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

    useEffect(() => {
        if (isPvP) return;
        if (matchOver) return;
        if (series.player >= MATCH_WINS_TARGET || series.enemy >= MATCH_WINS_TARGET) {
            setMatchOver(true);
            setClaimPickId(null);
            setClaimDone(false);
            if (isStage2) refreshStage2Match();
        }
    }, [series, matchOver, isStage2, isPvP]);

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

    const loserSide = matchWinner === "player" ? "enemy" : matchWinner === "enemy" ? "player" : null;
    const winnerSide = matchWinner;

    const playerDeckCards = useMemo(() => (playerDeck || []).map((n, idx) => nftToCard(n, idx)), [playerDeck]);
    const loserDeck = loserSide === "enemy" ? enemyDeck : loserSide === "player" ? playerDeckCards : [];

    const stage2OpponentDeposits = useMemo(() => {
        if (!isStage2 || !stage2Match) return null;
        const players = stage2Match?.players || [];
        const deposits = stage2Match?.deposits || [];
        const opp = players.find((p) => Number(p.user_id) !== myTgId);
        if (!opp) return [];
        return deposits.filter((d) => Number(d.user_id) === Number(opp.user_id));
    }, [isStage2, stage2Match, myTgId]);

    const onConfirmClaim = async () => {
        if (!matchOver) return;
        if (winnerSide !== "player") return;
        if (!loserSide) return;

        if (!isStage2) {
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
            const picked = deposits.find((d) => String(d.id) === String(claimPickId) && Number(d.user_id) === loserUserId);
            if (!picked) throw new Error("Selected deposit not found");

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

    useEffect(() => {
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // PvP: Show waiting/connecting screen
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

    // PvP: Opponent disconnected
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

                        {isPvP && (
                            <div style={{
                                position: "absolute",
                                top: 12,
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "rgba(255,61,242,0.2)",
                                border: "1px solid rgba(255,61,242,0.5)",
                                borderRadius: 8,
                                padding: "4px 12px",
                                fontSize: 11,
                                fontWeight: 900,
                                color: "#fff",
                                zIndex: 200,
                            }}>
                                ⚔️ PvP {turn === "player" ? "YOUR TURN" : "OPPONENT'S TURN"}
                            </div>
                        )}

                        <PlayerBadge side="enemy" name={enemyName} avatarUrl={enemyAvatar} active={turn === "enemy"} />
                        <PlayerBadge side="player" name={myName} avatarUrl={myAvatar} active={turn === "player"} />

                        <div className="hand left">
                            <div className="hand-grid">
                                {hands.enemy.map((c, i) => {
                                    const { col, row } = posForHandIndex(i);

                                    // AI: всегда скрыто, кроме reveal
                                    // PvP: всегда скрыто
                                    const isRevealed = !isPvP && c && enemyRevealId && enemyRevealId === c.id;

                                    return (
                                        <div key={c?.id || `enemy_${i}`} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
                                            {isRevealed ? (
                                                <Card card={c} disabled />
                                            ) : (
                                                <Card hidden />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {!isPvP && (
                                <div className="magic-column enemy" aria-hidden="true">
                                    <button className="magic-btn freeze" disabled title="Enemy magic (soon)">
                                        <span className="magic-ic">❄</span>
                                    </button>
                                    <button className="magic-btn reveal" disabled title="Enemy magic (soon)">
                                        <span className="magic-ic">👁</span>
                                    </button>
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
                            <div className="hand-grid">
                                {hands.player.map((c, i) => {
                                    const { col, row } = posForHandIndex(i);
                                    return (
                                        <div key={c.id} className={`hand-slot col${col}`} style={{ gridColumn: col, gridRow: row }}>
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
                                <div className="magic-column player">
                                    <button
                                        className={`magic-btn freeze ${spellMode === "freeze" ? "active" : ""}`}
                                        onClick={onMagicFreeze}
                                        disabled={!canUseMagic || playerSpells.freeze <= 0}
                                        title="Freeze"
                                    >
                                        <span className="magic-ic">❄</span>
                                        <span className="magic-count">{playerSpells.freeze}</span>
                                    </button>

                                    <button
                                        className="magic-btn reveal"
                                        onClick={onMagicReveal}
                                        disabled={!canUseMagic || playerSpells.reveal <= 0}
                                        title="Reveal"
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

                        {/* ==================== GAME OVER / CLAIM MODAL ==================== */}
                        {(roundOver || matchOver) && (
                            <div className="game-over">
                                <div className="game-over-box" style={{ minWidth: 340, maxWidth: 400 }}>

                                    {/* PvP Game Over */}
                                    {isPvP && (
                                        <>
                                            <h2 style={{ marginBottom: 8 }}>
                                                {roundWinner === "player" ? "🎉 Victory!" : "😔 Defeat"}
                                            </h2>

                                            <div style={{ opacity: 0.9, fontSize: 13, marginBottom: 16 }}>
                                                Board: You {boardScore.blue} - {boardScore.red} Opponent
                                            </div>

                                            {/* Winner claims 1 card */}
                                            {roundWinner === "player" && !pvpClaimDone && (
                                                <>
                                                    <div style={{
                                                        fontWeight: 700,
                                                        fontSize: 14,
                                                        marginBottom: 12,
                                                        color: "#ffd700"
                                                    }}>
                                                        🎁 Choose 1 card from opponent
                                                    </div>

                                                    <div style={{
                                                        fontSize: 11,
                                                        opacity: 0.7,
                                                        marginBottom: 12
                                                    }}>
                                                        Cards are hidden — pick your luck!
                                                    </div>

                                                    {/* 5 перевёрнутых карт */}
                                                    <div style={{
                                                        display: "flex",
                                                        gap: 8,
                                                        justifyContent: "center",
                                                        marginBottom: 16,
                                                        flexWrap: "wrap",
                                                    }}>
                                                        {(pvpClaimCards.length > 0 ? pvpClaimCards : Array(5).fill(null)).map((card, idx) => {
                                                            const isSelected = pvpClaimPickIndex === idx;
                                                            const showRevealed = pvpClaimRevealed && isSelected;

                                                            return (
                                                                <div
                                                                    key={card?.id || idx}
                                                                    onClick={() => onPvpClaimPick(idx)}
                                                                    style={{
                                                                        cursor: pvpClaimRevealed ? "default" : "pointer",
                                                                        transform: isSelected ? "scale(1.08)" : "scale(1)",
                                                                        transition: "all 0.2s ease",
                                                                        outline: isSelected
                                                                            ? "3px solid #ffd700"
                                                                            : "2px solid transparent",
                                                                        borderRadius: 12,
                                                                        padding: 2,
                                                                    }}
                                                                >
                                                                    {showRevealed && card?.imageUrl ? (
                                                                        // Показываем выбранную карту
                                                                        <div style={{
                                                                            width: 52,
                                                                            height: 72,
                                                                            borderRadius: 10,
                                                                            overflow: "hidden",
                                                                            border: "2px solid #ffd700",
                                                                        }}>
                                                                            <img
                                                                                src={card.imageUrl}
                                                                                alt=""
                                                                                style={{
                                                                                    width: "100%",
                                                                                    height: "100%",
                                                                                    objectFit: "cover",
                                                                                }}
                                                                                onError={(e) => {
                                                                                    e.currentTarget.src = "/cards/card.jpg";
                                                                                }}
                                                                            />
                                                                        </div>
                                                                    ) : (
                                                                        // Рубашка карты
                                                                        <div style={{
                                                                            width: 52,
                                                                            height: 72,
                                                                            background: "linear-gradient(145deg, #1a1a2e, #0a0a15)",
                                                                            borderRadius: 10,
                                                                            border: isSelected
                                                                                ? "2px solid #ffd700"
                                                                                : "2px solid rgba(255,255,255,0.15)",
                                                                            display: "flex",
                                                                            alignItems: "center",
                                                                            justifyContent: "center",
                                                                            boxShadow: isSelected
                                                                                ? "0 0 20px rgba(255,215,0,0.4)"
                                                                                : "none",
                                                                        }}>
                                                                            <span style={{ fontSize: 20 }}>❓</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Кнопка Claim */}
                                                    {!pvpClaimRevealed && (
                                                        <button
                                                            onClick={onPvpClaimConfirm}
                                                            disabled={pvpClaimPickIndex === null || pvpClaimBusy}
                                                            style={{
                                                                padding: "12px 24px",
                                                                fontSize: 14,
                                                                fontWeight: 900,
                                                                borderRadius: 12,
                                                                border: "none",
                                                                background: pvpClaimPickIndex !== null
                                                                    ? "linear-gradient(135deg, #ffd700, #ff8c00)"
                                                                    : "rgba(255,255,255,0.1)",
                                                                color: pvpClaimPickIndex !== null ? "#000" : "#666",
                                                                cursor: pvpClaimPickIndex !== null ? "pointer" : "not-allowed",
                                                                marginBottom: 12,
                                                            }}
                                                        >
                                                            {pvpClaimBusy ? "⏳ Claiming..." : "🎁 Claim Card"}
                                                        </button>
                                                    )}

                                                    {/* После reveal */}
                                                    {pvpClaimRevealed && !pvpClaimDone && (
                                                        <div style={{
                                                            fontSize: 13,
                                                            color: "#4ade80",
                                                            marginBottom: 12,
                                                        }}>
                                                            {pvpClaimBusy ? "⏳ Transferring NFT..." : "✨ Card revealed!"}
                                                        </div>
                                                    )}

                                                    {pvpClaimError && (
                                                        <div style={{
                                                            fontSize: 12,
                                                            color: "#ff6b6b",
                                                            marginBottom: 12,
                                                            wordBreak: "break-word",
                                                        }}>
                                                            ❌ {pvpClaimError}
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            {/* Claim done */}
                                            {roundWinner === "player" && pvpClaimDone && (
                                                <div style={{
                                                    fontSize: 14,
                                                    color: "#4ade80",
                                                    marginBottom: 16,
                                                    fontWeight: 700,
                                                }}>
                                                    ✅ Card claimed! Check your inventory.
                                                </div>
                                            )}

                                            {/* Loser message */}
                                            {roundWinner === "enemy" && (
                                                <div style={{
                                                    fontSize: 13,
                                                    opacity: 0.8,
                                                    marginBottom: 16
                                                }}>
                                                    Opponent will claim 1 of your cards.
                                                </div>
                                            )}

                                            {/* Exit buttons */}
                                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
                                                <button onClick={onExit}>
                                                    {pvpClaimDone || roundWinner === "enemy" ? "Exit" : "Cancel"}
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {/* AI Game Over (existing logic) */}
                                    {!isPvP && (
                                        <>
                                            <h2 style={{ marginBottom: 8 }}>
                                                {matchOver
                                                    ? (matchWinner === "player" ? "Матч выигран" : "Матч проигран")
                                                    : roundWinner === "player"
                                                        ? "Победа"
                                                        : "Поражение"}
                                            </h2>

                                            <div style={{ opacity: 0.9, fontSize: 12, marginBottom: 10 }}>
                                                Раунд {roundNo} • Серия до {MATCH_WINS_TARGET} • Счёт {series.player}:{series.enemy}
                                            </div>

                                            {matchOver && matchWinner && loserSide && (
                                                <>
                                                    <div style={{ fontWeight: 900, fontSize: 12, marginBottom: 8 }}>
                                                        {matchWinner === "player"
                                                            ? "Выбери 1 карту соперника"
                                                            : "Соперник забирает 1 твою карту"}
                                                    </div>

                                                    {matchWinner === "player" && (
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

                                                    {matchWinner === "player" && !claimDone ? (
                                                        <button disabled={!claimPickId || stage2Busy} onClick={onConfirmClaim}>
                                                            {stage2Busy ? "On-chain..." : "Забрать выбранную карту"}
                                                        </button>
                                                    ) : matchWinner === "player" && claimDone ? (
                                                        <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12 }}>
                                                            Карта получена.
                                                        </div>
                                                    ) : null}

                                                    {stage2Err && (
                                                        <div style={{ marginTop: 8, color: "#ffb3b3", fontSize: 12 }}>{stage2Err}</div>
                                                    )}
                                                </>
                                            )}

                                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
                                                {!matchOver && <button onClick={onNextRound}>Следующий раунд</button>}
                                                {matchOver && <button onClick={resetMatch}>Новый матч</button>}
                                                <button onClick={onExit}>Меню</button>
                                            </div>
                                        </>
                                    )}
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

    const cardValues = card?.values || card?.stats || { top: 5, right: 5, bottom: 5, left: 5 };

    // Вычисляем бонус от стихии ячейки (только если карта на поле)
    const elemBonus = (card?.element && cellElement)
        ? (card.element === cellElement ? +1 : -1)
        : 0;

    // Функция для получения отображаемого значения с бонусом (диапазон 1-9)
    const getDisplayValue = (base) => {
        if (elemBonus === 0) return base;
        const result = base + elemBonus;
        // Ограничиваем: если base=9 и бонус +1, остаётся 9; если base=1 и бонус -1, остаётся 1
        return clamp(result, 1, 9);
    };

    // Функция для получения цвета числа
    const getNumStyle = (base) => {
        if (elemBonus === 0) return {};
        const result = base + elemBonus;
        // Проверяем, изменилось ли значение реально (с учётом clamp)
        const clamped = clamp(result, 1, 9);
        if (clamped === base) return {}; // Не изменилось из-за clamp
        if (elemBonus > 0) return { color: "#4ade80" }; // зелёный для бонуса
        return { color: "#f87171" }; // красный для штрафа
    };

    return (
        <div
            className={[
                "card",
                card?.owner === "player" ? "player" : "enemy",
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
                    src={card?.imageUrl || "/cards/card.jpg"}
                    alt=""
                    draggable="false"
                    loading="lazy"
                    onError={(e) => {
                        try {
                            e.currentTarget.src = "/cards/card.jpg";
                        } catch { }
                    }}
                />

                {card?.element ? (
                    <div className="card-elem-pill" title={card.element}>
                        <span className="card-elem-ic">{ELEM_ICON[card.element]}</span>
                    </div>
                ) : null}

                <div className="tt-badge" />
                <span className="tt-num top" style={getNumStyle(cardValues.top)}>
                    {getDisplayValue(cardValues.top)}
                </span>
                <span className="tt-num left" style={getNumStyle(cardValues.left)}>
                    {getDisplayValue(cardValues.left)}
                </span>
                <span className="tt-num right" style={getNumStyle(cardValues.right)}>
                    {getDisplayValue(cardValues.right)}
                </span>
                <span className="tt-num bottom" style={getNumStyle(cardValues.bottom)}>
                    {getDisplayValue(cardValues.bottom)}
                </span>
            </div>
        </div>
    );
}
