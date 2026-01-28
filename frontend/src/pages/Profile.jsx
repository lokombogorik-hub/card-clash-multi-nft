import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import { useWalletStore } from "../store/useWalletStore";

function readTelegramUser() {
    try {
        return window.Telegram?.WebApp?.initDataUnsafe?.user || null;
    } catch {
        return null;
    }
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

export default function Profile({ token }) {
    const me = readTelegramUser();
    const myName = getPlayerName(me);
    const myAvatar = getPlayerAvatarUrl(me);
    const initials = initialsFrom(myName);

    const { connected: nearConnected, accountId: nearAccountId, balance: nearBalance } = useWalletStore();

    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const [imgOk, setImgOk] = useState(Boolean(myAvatar));

    useEffect(() => {
        if (!token) return;
        let alive = true;

        (async () => {
            setLoading(true);
            try {
                const r = await apiFetch("/api/users/me/stats", { token });
                if (!alive) return;
                setStats(r);
            } catch {
                if (!alive) return;
                setStats(null);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [token]);

    const wins = stats?.wins || 0;
    const losses = stats?.losses || 0;
    const total = wins + losses;
    const winrate = total > 0 ? Math.round((wins / total) * 100) : 0;

    return (
        <div className="profile-page">
            {/* Header Card */}
            <div className="profile-header-card">
                {/* Avatar */}
                <div className="profile-avatar-wrapper">
                    {myAvatar && imgOk ? (
                        <img
                            className="profile-avatar"
                            src={myAvatar}
                            alt={myName}
                            draggable="false"
                            referrerPolicy="no-referrer"
                            onError={() => setImgOk(false)}
                        />
                    ) : (
                        <div className="profile-avatar-fallback">{initials}</div>
                    )}
                    <div className="profile-avatar-ring" />
                </div>

                {/* Name & Telegram ID */}
                <div className="profile-name">{myName}</div>
                <div className="profile-tg-id">Telegram ID: {me?.id || "N/A"}</div>

                {/* NEAR Wallet */}
                <div className="profile-wallet-box">
                    <div className="profile-wallet-label">NEAR Wallet</div>
                    {nearConnected && nearAccountId ? (
                        <>
                            <div className="profile-wallet-account">{nearAccountId}</div>
                            <div className="profile-wallet-balance">{nearBalance} Ⓝ</div>
                        </>
                    ) : (
                        <div className="profile-wallet-disconnected">
                            Not connected • Tap "Connect Wallet" on Home
                        </div>
                    )}
                </div>
            </div>

            {/* Stats Grid */}
            <div className="profile-stats-grid">
                <div className="profile-stat-card">
                    <div className="profile-stat-icon">🏆</div>
                    <div className="profile-stat-value">{wins}</div>
                    <div className="profile-stat-label">Wins</div>
                </div>

                <div className="profile-stat-card">
                    <div className="profile-stat-icon">💀</div>
                    <div className="profile-stat-value">{losses}</div>
                    <div className="profile-stat-label">Losses</div>
                </div>

                <div className="profile-stat-card">
                    <div className="profile-stat-icon">📊</div>
                    <div className="profile-stat-value">{winrate}%</div>
                    <div className="profile-stat-label">Winrate</div>
                </div>

                <div className="profile-stat-card">
                    <div className="profile-stat-icon">🎴</div>
                    <div className="profile-stat-value">{stats?.nfts_count || 0}</div>
                    <div className="profile-stat-label">NFTs</div>
                </div>
            </div>

            {/* Loading */}
            {loading && (
                <div className="profile-loading">
                    <div className="profile-loading-spinner" />
                    <div>Loading stats...</div>
                </div>
            )}

            {/* Achievements (future) */}
            <div className="profile-achievements">
                <div className="profile-section-title">🏅 Achievements</div>
                <div className="profile-achievements-grid">
                    <div className="profile-achievement locked">
                        <div className="profile-achievement-icon">🔒</div>
                        <div className="profile-achievement-name">First Blood</div>
                    </div>
                    <div className="profile-achievement locked">
                        <div className="profile-achievement-icon">🔒</div>
                        <div className="profile-achievement-name">Combo Master</div>
                    </div>
                    <div className="profile-achievement locked">
                        <div className="profile-achievement-icon">🔒</div>
                        <div className="profile-achievement-name">NFT Collector</div>
                    </div>
                </div>
            </div>
        </div>
    );
}