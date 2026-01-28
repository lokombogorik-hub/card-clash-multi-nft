import { useState } from "react";

export default function Matchmaking({ me, onBack, onMatched }) {
    const [mode, setMode] = useState(null); // "ai" | "pvp"
    const [searching, setSearching] = useState(false);

    const handleAI = () => {
        setMode("ai");
        setSearching(true);
        setTimeout(() => {
            setSearching(false);
            onMatched({ matchId: "" }); // Stage1 (no matchId = AI)
        }, 800);
    };

    const handlePvP = () => {
        setMode("pvp");
        setSearching(true);
        // TODO: integrate backend matchmaking
        setTimeout(() => {
            setSearching(false);
            alert("PvP matchmaking coming soon!");
            setMode(null);
        }, 2000);
    };

    if (searching) {
        return (
            <div className="matchmaking-page">
                <div className="matchmaking-searching">
                    <div className="matchmaking-spinner" />
                    <div className="matchmaking-searching-text">
                        {mode === "ai" ? "Preparing AI opponent..." : "Searching for player..."}
                    </div>
                    <button className="matchmaking-cancel-btn" onClick={() => { setSearching(false); setMode(null); }}>
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="matchmaking-page">
            {/* Header */}
            <div className="matchmaking-header">
                <button className="matchmaking-back-btn" onClick={onBack}>
                    ← Back
                </button>
                <h2 className="matchmaking-title">
                    <span className="matchmaking-title-icon">⚔️</span>
                    Choose Game Mode
                </h2>
            </div>

            {/* Mode Cards */}
            <div className="matchmaking-modes">
                {/* AI Mode */}
                <button className="matchmaking-mode-card ai" onClick={handleAI}>
                    <div className="matchmaking-mode-icon">🤖</div>
                    <div className="matchmaking-mode-name">vs AI</div>
                    <div className="matchmaking-mode-desc">
                        Practice against BunnyBot
                    </div>
                    <div className="matchmaking-mode-badge">Free Play</div>
                </button>

                {/* PvP Mode */}
                <button className="matchmaking-mode-card pvp" onClick={handlePvP}>
                    <div className="matchmaking-mode-icon">👥</div>
                    <div className="matchmaking-mode-name">PvP</div>
                    <div className="matchmaking-mode-desc">
                        Battle real players for NFTs
                    </div>
                    <div className="matchmaking-mode-badge coming-soon">Coming Soon</div>
                </button>
            </div>

            {/* Info */}
            <div className="matchmaking-info">
                <div className="matchmaking-info-icon">ℹ️</div>
                <div className="matchmaking-info-text">
                    In PvP mode, both players lock 5 NFTs. Winner takes 1 NFT from loser (Stage2 on-chain).
                </div>
            </div>
        </div>
    );
}