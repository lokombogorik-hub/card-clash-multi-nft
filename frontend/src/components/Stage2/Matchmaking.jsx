import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api";
import LockEscrowModal from "./LockEscrowModal";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}
// Добавить перед export default function Matchmaking:
function LockWaitTimer({ timeoutMs, onTimeout }) {
    var [secsLeft, setSecsLeft] = useState(Math.ceil((timeoutMs || 180000) / 1000));
    var onTimeoutRef = useRef(onTimeout);
    onTimeoutRef.current = onTimeout;

    useEffect(function () {
        var start = Date.now();
        var total = timeoutMs || 180000;

        var interval = setInterval(function () {
            var elapsed = Date.now() - start;
            var remaining = Math.max(0, Math.ceil((total - elapsed) / 1000));
            setSecsLeft(remaining);
            if (remaining <= 0) {
                clearInterval(interval);
                onTimeoutRef.current?.();
            }
        }, 1000);

        return function () { clearInterval(interval); };
    }, [timeoutMs]);

    var mins = Math.floor(secsLeft / 60);
    var secs = secsLeft % 60;

    return (
        <div style={{
            fontSize: 12, opacity: 0.7, marginTop: 8,
            color: secsLeft < 30 ? "#ff6b6b" : "inherit"
        }}>
            Auto-cancel in {mins}:{secs.toString().padStart(2, "0")}
        </div>
    );
}
export default function Matchmaking({ me, playerDeck, onBack, onMatched }) {
    var [phase, setPhase] = useState("idle"); // idle | searching | found | locking | ready
    var [searchMode, setSearchMode] = useState(null);
    var [matchId, setMatchId] = useState("");
    var [opponentInfo, setOpponentInfo] = useState(null);
    var [showLockModal, setShowLockModal] = useState(false);
    var [waitingForOpponentLock, setWaitingForOpponentLock] = useState(false);
    var [myLockDone, setMyLockDone] = useState(false);
    var pollRef = useRef(null);
    var lockPollRef = useRef(null);

    var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
    var stage2Enabled = Boolean(escrowContractId);

    var stopSearch = function () {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        if (lockPollRef.current) {
            clearInterval(lockPollRef.current);
            lockPollRef.current = null;
        }
        setPhase("idle");
        setSearchMode(null);
        setMatchId("");
        setOpponentInfo(null);
        setShowLockModal(false);
        setWaitingForOpponentLock(false);
        setMyLockDone(false);

        var token = getStoredToken();
        if (token) {
            apiFetch("/api/matchmaking/leave_queue", { method: "POST", token: token }).catch(function () { });
        }
    };

    useEffect(function () {
        return function () {
            if (pollRef.current) clearInterval(pollRef.current);
            if (lockPollRef.current) clearInterval(lockPollRef.current);
        };
    }, []);

    var startAI = function () {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
        onMatched({ mode: "ai", matchId: "" });
    };

    var onPvPClick = function () {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
        startPvPSearch();
    };

    // Step 1: Search for opponent
    var startPvPSearch = async function () {
        var token = getStoredToken();
        if (!token) {
            alert("Нужна авторизация Telegram");
            return;
        }

        setPhase("searching");
        setSearchMode("pvp");

        try {
            var res = await apiFetch("/api/matchmaking/join_queue", {
                method: "POST",
                token: token,
                body: JSON.stringify({ max_elo_diff: 300 }),
            });

            if (res.opponent_id && res.match_id) {
                // Found opponent immediately
                onOpponentFound(res.match_id, res.opponent_id);
                return;
            }

            // Polling for opponent
            pollRef.current = setInterval(async function () {
                try {
                    var r = await apiFetch("/api/matchmaking/join_queue", {
                        method: "POST",
                        token: token,
                        body: JSON.stringify({ max_elo_diff: 500 }),
                    });
                    if (r.opponent_id && r.match_id) {
                        clearInterval(pollRef.current);
                        pollRef.current = null;
                        onOpponentFound(r.match_id, r.opponent_id);
                    }
                } catch (e) {
                    // keep polling
                }
            }, 3000);

        } catch (e) {
            setPhase("idle");
            setSearchMode(null);
            alert("Matchmaking error: " + (e.message || e));
        }
    };

    // Step 2: Opponent found → show lock modal
    var onOpponentFound = function (newMatchId, opponentId) {
        setMatchId(newMatchId);
        setOpponentInfo({ id: opponentId });
        setPhase("found");

        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch (e) { }

        if (stage2Enabled) {
            // Show lock modal
            setTimeout(function () {
                setShowLockModal(true);
            }, 500);
        } else {
            // No escrow — go directly to game
            onMatched({ mode: "pvp", matchId: newMatchId });
        }
    };

    // Step 3: Player locked NFTs → wait for opponent
    var onLockReady = function (data) {
        setShowLockModal(false);
        setMyLockDone(true);
        setPhase("locking");
        setWaitingForOpponentLock(true);

        // Poll for opponent lock
        var token = getStoredToken();
        lockPollRef.current = setInterval(async function () {
            try {
                var matchData = await apiFetch("/api/matches/" + matchId, { token: token });

                // Check if both players locked
                if (matchData.escrow_locked) {
                    clearInterval(lockPollRef.current);
                    lockPollRef.current = null;
                    setWaitingForOpponentLock(false);
                    setPhase("ready");

                    // Go to game!
                    setTimeout(function () {
                        onMatched({ mode: "pvp", matchId: matchId });
                    }, 500);
                }
            } catch (e) {
                // keep polling
            }
        }, 2000);
    };

    // Cancel during any phase
    // СТАЛО:
    var onCancel = function () {
        if (myLockDone && matchId) {
            var token = getStoredToken();
            // [PATCH] Явно запрашиваем возврат NFT при отмене
            apiFetch("/api/matches/" + matchId + "/cancel", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    refund: true,           // явный флаг возврата
                    reason: "player_cancel"
                }),
            }).catch(function (e) {
                console.error("Cancel/refund error:", e);
            });
        }
        stopSearch();
    };

    // ==================== RENDER ====================

    // Phase: Searching for opponent
    if (phase === "searching") {
        return (
            <div className="matchmaking-page">
                <div className="matchmaking-searching">
                    <div className="matchmaking-spinner" />
                    <div className="matchmaking-searching-text">
                        Searching for opponent...
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
                        Finding a worthy challenger
                    </div>
                    <button className="matchmaking-cancel-btn" onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Phase: Found opponent, showing lock modal
    if (phase === "found") {
        return (
            <div className="matchmaking-page">
                <LockEscrowModal
                    open={showLockModal}
                    onClose={onCancel}
                    onReady={onLockReady}
                    me={me}
                    playerDeck={playerDeck}
                    matchId={matchId}
                />

                <div className="matchmaking-searching">
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
                    <div className="matchmaking-searching-text" style={{ color: "#4ade80" }}>
                        Opponent Found!
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                        Lock your NFTs to start the battle
                    </div>
                    {!showLockModal && (
                        <button
                            onClick={function () { setShowLockModal(true); }}
                            style={{
                                marginTop: 16,
                                padding: "12px 24px",
                                borderRadius: 12,
                                border: "none",
                                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                                color: "#000",
                                fontWeight: 900,
                                cursor: "pointer",
                            }}
                        >
                            🔒 Lock NFTs
                        </button>
                    )}
                    <button
                        onClick={onCancel}
                        style={{
                            marginTop: 12,
                            padding: "8px 16px",
                            borderRadius: 8,
                            border: "1px solid rgba(255,255,255,0.2)",
                            background: "transparent",
                            color: "rgba(255,255,255,0.6)",
                            cursor: "pointer",
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Phase: Waiting for opponent to lock
    // СТАЛО — добавлен таймер 3 минуты и кнопка реконнекта:
    if (phase === "locking" && waitingForOpponentLock) {
        return (
            <div className="matchmaking-page">
                <div className="matchmaking-searching">
                    <div className="matchmaking-spinner" />
                    <div style={{ fontSize: 13, color: "#4ade80", marginBottom: 8 }}>
                        ✅ Your NFTs are locked!
                    </div>
                    <div className="matchmaking-searching-text">
                        Waiting for opponent to lock...
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
                        Game will start when both players are ready
                    </div>

                    {/* [PATCH] Таймер ожидания + авто-отмена через 3 минуты */}
                    <LockWaitTimer
                        timeoutMs={180000}
                        onTimeout={function () {
                            // Автоматически отменяем и возвращаем NFT через 3 минуты
                            console.warn("[Matchmaking] opponent lock timeout — auto cancel");
                            onCancel();
                        }}
                    />

                    <button className="matchmaking-cancel-btn" onClick={onCancel}
                        style={{ marginTop: 16 }}>
                        Cancel & Refund NFTs
                    </button>
                </div>
            </div>
        );
    }

    // Phase: Both locked, starting game
    if (phase === "ready") {
        return (
            <div className="matchmaking-page">
                <div className="matchmaking-searching">
                    <div style={{ fontSize: 48, marginBottom: 16 }}>🎮</div>
                    <div className="matchmaking-searching-text" style={{ color: "#4ade80" }}>
                        Both players ready!
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                        Starting game...
                    </div>
                </div>
            </div>
        );
    }

    // Phase: Idle — show mode selection
    return (
        <div className="matchmaking-page">
            <div className="matchmaking-header">
                <button className="matchmaking-back-btn" onClick={onBack}>← Back</button>
                <h2 className="matchmaking-title">
                    <span className="matchmaking-title-icon">⚔️</span>
                    Choose Mode
                </h2>
            </div>

            <div className="matchmaking-modes">
                <div className="matchmaking-mode-card ai" onClick={startAI}>
                    <div className="matchmaking-mode-icon">🤖</div>
                    <div className="matchmaking-mode-name">vs AI</div>
                    <div className="matchmaking-mode-desc">Play against BunnyBot AI opponent. Perfect for practice!</div>
                    <div className="matchmaking-mode-badge">Available</div>
                </div>

                <div className={"matchmaking-mode-card pvp" + (!stage2Enabled ? " pvp-no-escrow" : "")} onClick={onPvPClick}>
                    <div className="matchmaking-mode-icon">⚔️</div>
                    <div className="matchmaking-mode-name">PvP</div>
                    <div className="matchmaking-mode-desc">
                        {stage2Enabled
                            ? "Battle real players! Winner takes 1 NFT from loser."
                            : "Battle real players! (Beta — no NFT stakes)"}
                    </div>
                    <div className="matchmaking-mode-badge">
                        {stage2Enabled ? "🔒 Live" : "Beta"}
                    </div>
                </div>
            </div>

            <div className="matchmaking-info">
                <div className="matchmaking-info-icon">💡</div>
                <div className="matchmaking-info-text">
                    {stage2Enabled
                        ? "PvP Flow: Find opponent → Lock 5 NFTs → Play → Winner claims 1 NFT!"
                        : "AI: practice mode. PvP: find opponent by ELO rating."
                    }
                    {" "}Make sure you have 5 cards in your deck!
                </div>
            </div>
        </div>
    );
}