import React, { useEffect, useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

export default function Profile({ token }) {
    const { accountId, balance, connected } = useWalletConnect();
    const [stats, setStats] = useState({
        matches: 0,
        wins: 0,
        elo: 1000,
        nfts_count: 0,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) {
            setLoading(false);
            return;
        }
        let alive = true;
        apiFetch("/api/users/me", { token })
            .then((data) => {
                if (!alive) return;
                setStats({
                    matches: data.total_matches || 0,
                    wins: data.wins || 0,
                    elo: data.elo_rating || 1000,
                    nfts_count: data.nfts_count || 0,
                });
            })
            .catch(() => { })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [token]);

    const initials = accountId ? accountId.charAt(0).toUpperCase() : "?";

    return (
        <div className="profile-page">
            <div className="profile-header-card">
                <div className="profile-avatar-wrapper">
                    <div className="profile-avatar-ring" />
                    <div className="profile-avatar-fallback">{initials}</div>
                </div>
                <h2 className="profile-name">
                    {connected ? "Active Player" : "Guest"}
                </h2>
                <p className="profile-tg-id">NEAR Protocol Player</p>

                <div className="profile-wallet-box">
                    <div className="profile-wallet-label">CONNECTED WALLET</div>
                    <div className="profile-wallet-account">
                        {connected ? accountId : "Not Connected"}
                    </div>
                    {connected && (
                        <div className="profile-wallet-balance">
                            {Number(balance).toFixed(4)} Ⓝ
                        </div>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="profile-loading">
                    <div className="profile-loading-spinner" />
                    <div>Loading stats...</div>
                </div>
            ) : (
                <div className="profile-stats-grid">
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">⚔️</div>
                        <div className="profile-stat-value">{stats.matches}</div>
                        <div className="profile-stat-label">Matches</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">🏆</div>
                        <div className="profile-stat-value">{stats.wins}</div>
                        <div className="profile-stat-label">Wins</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">⭐</div>
                        <div className="profile-stat-value">{stats.elo}</div>
                        <div className="profile-stat-label">ELO Rating</div>
                    </div>
                    <div className="profile-stat-card">
                        <div className="profile-stat-icon">🎴</div>
                        <div className="profile-stat-value">{stats.nfts_count}</div>
                        <div className="profile-stat-label">NFT Cards</div>
                    </div>
                </div>
            )}

            <div className="profile-achievements">
                <div className="profile-section-title">🏅 Achievements</div>
                <div className="profile-achievements-grid">
                    <div
                        className={`profile-achievement ${stats.wins >= 1 ? "" : "locked"
                            }`}
                    >
                        <div className="profile-achievement-icon">🥇</div>
                        <div className="profile-achievement-name">First Win</div>
                    </div>
                    <div
                        className={`profile-achievement ${stats.wins >= 10 ? "" : "locked"
                            }`}
                    >
                        <div className="profile-achievement-icon">⚡</div>
                        <div className="profile-achievement-name">10 Wins</div>
                    </div>
                    <div
                        className={`profile-achievement ${stats.matches >= 50 ? "" : "locked"
                            }`}
                    >
                        <div className="profile-achievement-icon">🎯</div>
                        <div className="profile-achievement-name">50 Matches</div>
                    </div>
                    <div
                        className={`profile-achievement ${connected ? "" : "locked"
                            }`}
                    >
                        <div className="profile-achievement-icon">🔗</div>
                        <div className="profile-achievement-name">Wallet Linked</div>
                    </div>
                    <div
                        className={`profile-achievement ${stats.elo >= 1200 ? "" : "locked"
                            }`}
                    >
                        <div className="profile-achievement-icon">💎</div>
                        <div className="profile-achievement-name">ELO 1200+</div>
                    </div>
                    <div className="profile-achievement locked">
                        <div className="profile-achievement-icon">🌟</div>
                        <div className="profile-achievement-name">Coming Soon</div>
                    </div>
                </div>
            </div>
        </div>
    );
}