import React, { useEffect, useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

export default function Profile({ token }) {
    const { accountId, balance, connected } = useWalletConnect();
    const [stats, setStats] = useState({
        matches: 0,
        wins: 0,
        elo: 1000,
        nfts_count: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!token) return;
        apiFetch("/api/users/me", { token })
            .then(data => {
                setStats({
                    matches: data.total_matches || 0,
                    wins: data.wins || 0,
                    elo: data.elo_rating || 1000,
                    nfts_count: data.nfts_count || 0
                });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [token]);

    const initials = accountId ? accountId.charAt(0).toUpperCase() : "?";

    return (
        <div className="profile-page">
            <div className="profile-header-card">
                <div className="profile-avatar-wrapper">
                    <div className="profile-avatar-ring" />
                    <div className="profile-avatar-fallback">{initials}</div>
                </div>
                <h2 className="profile-name">{connected ? "Active Player" : "Guest"}</h2>
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
        </div>
    );
}