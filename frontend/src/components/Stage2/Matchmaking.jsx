import React, { useEffect, useRef, useState } from "react";
import { apiFetch } from "../../api";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

export default function Matchmaking({ me, onBack, onMatched }) {
    var [searching, setSearching] = useState(false);
    var [searchMode, setSearchMode] = useState(null);
    var pollRef = useRef(null);

    var stopSearch = function () {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setSearching(false);
        setSearchMode(null);

        var token = getStoredToken();
        if (token) {
            apiFetch("/api/matchmaking/leave_queue", { method: "POST", token: token }).catch(function () { });
        }
    };

    useEffect(function () {
        return function () {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    var startAI = function () {
        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }
        onMatched({ mode: "ai", matchId: "" });
    };

    var startPvP = async function () {
        var token = getStoredToken();
        if (!token) {
            alert("Нужна авторизация Telegram");
            return;
        }

        try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium"); } catch (e) { }

        setSearching(true);
        setSearchMode("pvp");

        try {
            var res = await apiFetch("/api/matchmaking/join_queue", {
                method: "POST",
                token: token,
                body: JSON.stringify({ max_elo_diff: 300 }),
            });

            if (res.opponent_id && res.match_id) {
                stopSearch();
                onMatched({ mode: "pvp", matchId: res.match_id });
                return;
            }

            // Poll for match
            pollRef.current = setInterval(async function () {
                try {
                    var r = await apiFetch("/api/matchmaking/join_queue", {
                        method: "POST",
                        token: token,
                        body: JSON.stringify({ max_elo_diff: 500 }),
                    });
                    if (r.opponent_id && r.match_id) {
                        stopSearch();
                        onMatched({ mode: "pvp", matchId: r.match_id });
                    }
                } catch (e) {
                    // keep polling
                }
            }, 3000);

        } catch (e) {
            setSearching(false);
            setSearchMode(null);
            alert("Matchmaking error: " + (e.message || e));
        }
    };

    if (searching) {
        return (
            <div className="matchmaking-page">
                <div className="matchmaking-searching">
                    <div className="matchmaking-spinner" />
                    <div className="matchmaking-searching-text">
                        {searchMode === "pvp" ? "Searching for opponent..." : "Starting..."}
                    </div>
                    <button className="matchmaking-cancel-btn" onClick={stopSearch}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

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

                <div className="matchmaking-mode-card pvp" onClick={startPvP}>
                    <div className="matchmaking-mode-icon">⚔️</div>
                    <div className="matchmaking-mode-name">PvP</div>
                    <div className="matchmaking-mode-desc">Battle real players! Winner takes 1 NFT from loser.</div>
                    <div className="matchmaking-mode-badge">Live</div>
                </div>
            </div>

            <div className="matchmaking-info">
                <div className="matchmaking-info-icon">💡</div>
                <div className="matchmaking-info-text">
                    AI mode: play offline against bot. PvP: matchmaking finds opponent by ELO rating. Make sure you have 5 cards in your deck!
                </div>
            </div>
        </div>
    );
}