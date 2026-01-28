import { useEffect, useState } from "react";
import { apiFetch } from "../../api";

export default function Matchmaking({ me, onBack, onMatched }) {
    const [mode, setMode] = useState(null); // null | 'ai' | 'online'
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const getToken = () => {
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
    };

    const onPlayAI = () => {
        // Stage1: мгновенный старт vs AI (без blockchain)
        setMode("ai");
        setTimeout(() => {
            onMatched({ matchId: null }); // null = Stage1 offline
        }, 300);
    };

    const onPlayOnline = async () => {
        // Stage2: создаём матч в DB, ждём соперника, потом lock NFT
        setMode("online");
        setLoading(true);
        setError("");

        try {
            const token = getToken();
            if (!token) {
                throw new Error("Auth token missing");
            }

            // Создаём матч
            const match = await apiFetch("/api/matches/create", {
                method: "POST",
                token,
                body: JSON.stringify({}),
            });

            const matchId = match?.id || match?.match_id;
            if (!matchId) {
                throw new Error("No match ID returned");
            }

            // Симулируем "ожидание соперника" (в реальности тут websocket или polling)
            // Для MVP просто сразу matched
            setTimeout(() => {
                onMatched({ matchId });
            }, 800);
        } catch (e) {
            setError(String(e?.message || e));
            setLoading(false);
        }
    };

    return (
        <div className="matchmaking-page">
            <div className="matchmaking-header">
                <button className="matchmaking-back" onClick={onBack}>
                    ← Назад
                </button>
                <h2 className="matchmaking-title">
                    <span className="matchmaking-icon">⚔️</span>
                    Выбери режим боя
                </h2>
            </div>

            {!mode && (
                <div className="matchmaking-modes">
                    <button className="mode-card mode-ai" onClick={onPlayAI} disabled={loading}>
                        <div className="mode-icon">🤖</div>
                        <div className="mode-title">VS AI</div>
                        <div className="mode-subtitle">
                            Быстрый старт • Без ставок<br />
                            Тренировка и тесты
                        </div>
                        <div className="mode-badge">Stage 1</div>
                    </button>

                    <button className="mode-card mode-online" onClick={onPlayOnline} disabled={loading}>
                        <div className="mode-icon">🌐</div>
                        <div className="mode-title">Online PvP</div>
                        <div className="mode-subtitle">
                            Реальный соперник • Lock NFT<br />
                            Победитель забирает приз
                        </div>
                        <div className="mode-badge mode-badge-stage2">Stage 2</div>
                    </button>
                </div>
            )}

            {loading && (
                <div className="matchmaking-loading">
                    <div className="matchmaking-spinner" />
                    <div className="matchmaking-loading-text">
                        {mode === "ai" ? "Запуск боя с AI..." : "Поиск соперника..."}
                    </div>
                </div>
            )}

            {error && (
                <div className="matchmaking-error">
                    ⚠️ {error}
                </div>
            )}
        </div>
    );
}