import React, { useEffect, useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

function getDisplayName(me) {
    if (!me) return "Guest";
    if (me.username) return "@" + me.username;
    var full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
    return full || "Guest";
}

function getAvatarUrl(me) {
    if (!me) return null;
    if (me.photo_url) return me.photo_url;
    if (me.username) return "https://t.me/i/userpic/320/" + me.username + ".jpg";
    return null;
}

export default function Profile({ token, me }) {
    var { accountId, balance, connected } = useWalletConnect();
    var [stats, setStats] = useState({
        matches: 0,
        wins: 0,
        elo: 1000,
        nfts_count: 0,
    });
    var [loading, setLoading] = useState(true);
    var [avatarOk, setAvatarOk] = useState(true);

    useEffect(function () {
        if (!token) {
            setLoading(false);
            return;
        }
        var alive = true;
        apiFetch("/api/users/me", { token: token })
            .then(function (data) {
                if (!alive) return;
                setStats({
                    matches: data.total_matches || 0,
                    wins: data.wins || 0,
                    elo: data.elo_rating || 1000,
                    nfts_count: data.nfts_count || 0,
                });
            })
            .catch(function () { })
            .finally(function () {
                if (alive) setLoading(false);
            });
        return function () {
            alive = false;
        };
    }, [token]);

    var displayName = getDisplayName(me);
    var avatarUrl = getAvatarUrl(me);
    var initials = displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?";
    var tgId = me && me.id ? "ID: " + me.id : "";

    return (
        <div className="profile-page">
            <div className="profile-header-card">
                <div className="profile-avatar-wrapper">
                    <div className="profile-avatar-ring" />
                    {avatarUrl && avatarOk ? (
                        <img
                            className="profile-avatar"
                            src={avatarUrl}
                            alt=""
                            draggable="false"
                            referrerPolicy="no-referrer"
                            onError={function () { setAvatarOk(false); }}
                        />
                    ) : (
                        <div className="profile-avatar-fallback">{initials}</div>
                    )}
                </div>
                <h2 className="profile-name">{displayName}</h2>
                {tgId && <p className="profile-tg-id">{tgId}</p>}

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
                    {!connected && (
                        <div className="profile-wallet-disconnected">
                            Подключи кошелёк на главной странице
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
                    <div className={"profile-achievement" + (stats.wins >= 1 ? "" : " locked")}>
                        <div className="profile-achievement-icon">🥇</div>
                        <div className="profile-achievement-name">First Win</div>
                    </div>
                    <div className={"profile-achievement" + (stats.wins >= 10 ? "" : " locked")}>
                        <div className="profile-achievement-icon">⚡</div>
                        <div className="profile-achievement-name">10 Wins</div>
                    </div>
                    <div className={"profile-achievement" + (stats.matches >= 50 ? "" : " locked")}>
                        <div className="profile-achievement-icon">🎯</div>
                        <div className="profile-achievement-name">50 Matches</div>
                    </div>
                    <div className={"profile-achievement" + (connected ? "" : " locked")}>
                        <div className="profile-achievement-icon">🔗</div>
                        <div className="profile-achievement-name">Wallet Linked</div>
                    </div>
                    <div className={"profile-achievement" + (stats.elo >= 1200 ? "" : " locked")}>
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