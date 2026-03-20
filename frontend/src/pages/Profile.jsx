import React, { useEffect, useState } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var RANK_COLORS = {
    "Новичок": "#6b7280",
    "Мастер": "#3b82f6",
    "Профи": "#f59e0b",
    "Легенда": "#a855f7"
};

function getDisplayName(me) {
    if (!me) return "Guest";
    if (me.username) return "@" + me.username;
    var full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
    return full || "Guest";
}

function getAvatarUrl(me) {
    if (!me) return null;
    // Сначала photo_url из профиля бэкенда
    if (me.photo_url) return me.photo_url;
    // Потом Telegram CDN
    if (me.username) return "https://t.me/i/userpic/320/" + me.username + ".jpg";
    // Потом UI Avatars как fallback
    var name = [me.first_name, me.last_name].filter(Boolean).join("+") || "User";
    return "https://ui-avatars.com/api/?name=" + name + "&background=1a2232&color=78c8ff&size=128";
}

export default function Profile({ token, me }) {
    var { accountId, balance, connected } = useWalletConnect();
    var [profile, setProfile] = useState(null);
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
                setProfile(data);
            })
            .catch(function (e) {
                console.error("Profile load error:", e);
            })
            .finally(function () {
                if (alive) setLoading(false);
            });
        return function () { alive = false; };
    }, [token]);

    var displayName = getDisplayName(me);
    var avatarUrl = getAvatarUrl(me);
    var initials = displayName.replace(/^@/, "").charAt(0).toUpperCase() || "?";
    var tgId = me && me.id ? "ID: " + me.id : "";

    var rankColor = profile ? (RANK_COLORS[profile.rank] || "#6b7280") : "#6b7280";

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
                            crossOrigin="anonymous"
                            referrerPolicy="no-referrer"
                            onError={function () { setAvatarOk(false); }}
                        />
                    ) : (
                        <div className="profile-avatar-fallback">{initials}</div>
                    )}
                </div>
                <h2 className="profile-name">{displayName}</h2>
                {tgId && <p className="profile-tg-id">{tgId}</p>}

                {/* Rank Section */}
                {profile && (
                    <div className="profile-rank-section">
                        <div
                            className="profile-rank-badge"
                            style={{
                                borderColor: rankColor,
                                boxShadow: "0 0 12px " + rankColor + "50"
                            }}
                        >
                            <span className="profile-rank-icon">{profile.rank_icon}</span>
                            <span className="profile-rank-name" style={{ color: rankColor }}>
                                {profile.rank}
                            </span>
                        </div>

                        <div className="profile-rating">
                            <span className="profile-rating-value">{profile.elo_rating}</span>
                            <span className="profile-rating-label">рейтинг</span>
                        </div>

                        {profile.next_rank && (
                            <div className="profile-rank-progress">
                                <div className="profile-rank-progress-bar">
                                    <div
                                        className="profile-rank-progress-fill"
                                        style={{
                                            width: profile.progress_to_next + "%",
                                            background: rankColor
                                        }}
                                    />
                                </div>
                                <div className="profile-rank-progress-text">
                                    До {profile.next_rank}: {profile.points_to_next} очков
                                </div>
                            </div>
                        )}
                    </div>
                )}

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
                    <div>Загрузка профиля...</div>
                </div>
            ) : profile ? (
                <>
                    <div className="profile-stats-grid">
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">⚔️</div>
                            <div className="profile-stat-value">{profile.pvp_wins + profile.pvp_losses}</div>
                            <div className="profile-stat-label">PvP игр</div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">🏆</div>
                            <div className="profile-stat-value">{profile.pvp_wins}</div>
                            <div className="profile-stat-label">Побед</div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">💔</div>
                            <div className="profile-stat-value">{profile.pvp_losses}</div>
                            <div className="profile-stat-label">Поражений</div>
                        </div>
                        <div className="profile-stat-card">
                            <div className="profile-stat-icon">📊</div>
                            <div className="profile-stat-value">{profile.win_rate}%</div>
                            <div className="profile-stat-label">Винрейт</div>
                        </div>
                    </div>

                    {/* Ranks Info */}
                    {profile.all_ranks && (
                        <div className="profile-ranks-info">
                            <div className="profile-section-title">🎖️ Система рангов</div>
                            <div className="profile-ranks-list">
                                {profile.all_ranks.map(function (rank) {
                                    var isCurrent = profile.rank === rank.name;
                                    var color = RANK_COLORS[rank.name] || "#6b7280";
                                    return (
                                        <div
                                            key={rank.name}
                                            className={"profile-rank-item" + (isCurrent ? " current" : "")}
                                            style={{ borderColor: isCurrent ? color : "rgba(255,255,255,0.1)" }}
                                        >
                                            <span className="rank-icon">{rank.icon}</span>
                                            <span className="rank-name" style={{ color: isCurrent ? color : "#fff" }}>
                                                {rank.name}
                                            </span>
                                            <span className="rank-range">{rank.min}+</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="profile-achievements">
                        <div className="profile-section-title">🏅 Достижения</div>
                        <div className="profile-achievements-grid">
                            <div className={"profile-achievement" + (profile.pvp_wins >= 1 ? "" : " locked")}>
                                <div className="profile-achievement-icon">🥇</div>
                                <div className="profile-achievement-name">Первая победа</div>
                            </div>
                            <div className={"profile-achievement" + (profile.pvp_wins >= 10 ? "" : " locked")}>
                                <div className="profile-achievement-icon">⚡</div>
                                <div className="profile-achievement-name">10 побед</div>
                            </div>
                            <div className={"profile-achievement" + (profile.total_matches >= 50 ? "" : " locked")}>
                                <div className="profile-achievement-icon">🎯</div>
                                <div className="profile-achievement-name">50 матчей</div>
                            </div>
                            <div className={"profile-achievement" + (connected ? "" : " locked")}>
                                <div className="profile-achievement-icon">🔗</div>
                                <div className="profile-achievement-name">Кошелёк</div>
                            </div>
                            <div className={"profile-achievement" + (profile.elo_rating >= 1200 ? "" : " locked")}>
                                <div className="profile-achievement-icon">⚔️</div>
                                <div className="profile-achievement-name">Мастер</div>
                            </div>
                            <div className={"profile-achievement" + (profile.elo_rating >= 1500 ? "" : " locked")}>
                                <div className="profile-achievement-icon">🏆</div>
                                <div className="profile-achievement-name">Профи</div>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="profile-loading">
                    <div>Не удалось загрузить профиль</div>
                </div>
            )}
        </div>
    );
}