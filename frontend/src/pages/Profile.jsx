import { useEffect, useState } from "react";
import { CoinIcon, SwordsIcon, TrophyIcon, XIcon, GemIcon, BoltIcon } from "../components/Icons";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

var RANK_COLORS = { "Новичок": "#8a93a6", "Мастер": "#3b82f6", "Профи": "#f59e0b", "Легенда": "#a855f7" };

function displayName(me) {
    if (!me) return "Guest";
    if (me.username) return "@" + me.username;
    var full = [me.first_name, me.last_name].filter(Boolean).join(" ").trim();
    return full || "Guest";
}
function avatarUrl(me) {
    if (me && me.photo_url) return me.photo_url;
    return null;
}
function timeAgo(iso) {
    if (!iso) return "";
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "только что";
    if (s < 3600) return Math.floor(s / 60) + " мин назад";
    if (s < 86400) return Math.floor(s / 3600) + " ч назад";
    return Math.floor(s / 86400) + " дн назад";
}
var MODE = { tournament: "Турнир", pvp: "PvP", ai: "AI" };
var RES = { win: "W", loss: "L", draw: "=", cancelled: "×" };
var RES_TXT = { win: "Победа", loss: "Поражение", draw: "Ничья", cancelled: "Отменён" };

function MatchRow({ m }) {
    var [open, setOpen] = useState(false);
    var initial = (m.opponent_name || "?").replace(/^@/, "").charAt(0).toUpperCase();
    return (
        <div>
            <div className={"pf-match " + m.result} onClick={function () { setOpen(!open); }}>
                <div className="pf-res">{RES[m.result] || "•"}</div>
                {m.opponent_photo
                    ? <img className="pf-mava" src={m.opponent_photo} alt="" referrerPolicy="no-referrer" onError={function (e) { e.currentTarget.style.display = "none"; }} />
                    : <div className="pf-mava">{initial}</div>}
                <div className="pf-mmid">
                    <div className="pf-mname">{m.opponent_name}</div>
                    <div className="pf-mmeta">{(MODE[m.mode] || m.mode)} · {timeAgo(m.finished_at)}</div>
                </div>
            </div>
            {open && (
                <div className="pf-mexp">
                    <div className="row"><span>Результат</span><span>{RES_TXT[m.result] || m.result}</span></div>
                    <div className="row"><span>Режим</span><span>{MODE[m.mode] || m.mode}</span></div>
                    <div className="row"><span>Ходов</span><span>{m.moves || 0}</span></div>
                    <div className="row"><span>Когда</span><span>{m.finished_at ? new Date(m.finished_at).toLocaleString() : "—"}</span></div>
                    <div className="row"><span>ID матча</span><span style={{ fontFamily: "monospace", fontSize: 10 }}>{String(m.match_id).slice(0, 14)}…</span></div>
                </div>
            )}
        </div>
    );
}

export default function Profile({ token, me }) {
    var { accountId, balance, connected } = useWalletConnect();
    var [profile, setProfile] = useState(null);
    var [matches, setMatches] = useState(null);
    var [loading, setLoading] = useState(true);
    var [avatarOk, setAvatarOk] = useState(true);
    var [coins, setCoins] = useState(0);

    useEffect(function () {
        if (!token) { setLoading(false); return; }
        var alive = true;
        apiFetch("/api/users/me", { token: token })
            .then(function (d) { if (alive) setProfile(d); })
            .catch(function (e) { console.error("Profile load error:", e); })
            .finally(function () { if (alive) setLoading(false); });
        apiFetch("/api/matches/history?limit=20", { token: token })
            .then(function (d) { if (alive) setMatches((d && d.matches) || []); })
            .catch(function () { if (alive) setMatches([]); });
        apiFetch("/api/coins/me", { token: token })
            .then(function (d) { if (alive && d) setCoins(d.balance || 0); })
            .catch(function () { });
        return function () { alive = false; };
    }, [token]);

    var name = displayName(me);
    var av = avatarUrl(me);
    var initials = name.replace(/^@/, "").charAt(0).toUpperCase() || "?";
    var rankColor = profile ? (RANK_COLORS[profile.rank] || "#8a93a6") : "#8a93a6";
    var prog = profile && profile.next_rank ? (profile.progress_to_next || 0) : 100;

    return (
        <div className="pf">
            <div className="pf-hero">
                <div className="pf-shine" />
                <div className="pf-hero-in">
                    <div className="pf-ring" style={{ "--p": prog, background: "conic-gradient(" + rankColor + " calc(" + prog + " * 1%), rgba(255,255,255,0.12) 0)" }}>
                        {av && avatarOk
                            ? <img className="pf-ava" src={av} alt="" referrerPolicy="no-referrer" onError={function () { setAvatarOk(false); }} />
                            : <div className="pf-ava">{initials}</div>}
                    </div>
                    <div className="pf-name">{name}</div>
                    {profile && (
                        <div className="pf-rankchip" style={{ borderColor: rankColor, color: rankColor }}>
                            <span>{profile.rank_icon || ""}</span><span>{profile.rank}</span>
                        </div>
                    )}
                    {me && me.id && <div className="pf-id">ID: {me.id}</div>}
                </div>

                {profile && (
                    <div className="pf-rating">
                        <div className="pf-rating-num">{profile.elo_rating}</div>
                        <div className="pf-rating-lbl">Рейтинг</div>
                        <div className="pf-coins" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><CoinIcon size={14} /> {coins} ClashCoin</div>
                        {profile.next_rank && (
                            <div className="pf-prog">
                                <div className="pf-prog-bar"><div className="pf-prog-fill" style={{ width: prog + "%" }} /></div>
                                <div className="pf-prog-txt">До «{profile.next_rank}»: {profile.points_to_next} очков</div>
                            </div>
                        )}
                    </div>
                )}

                <div className="pf-wallet">
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,.5)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 3 }}>Кошелёк</div>
                        <div className="acc">{connected ? accountId : "Не подключён"}</div>
                    </div>
                    {connected && <div className="bal">{Number(balance).toFixed(2)} Ⓝ</div>}
                </div>
            </div>

            {loading ? (
                <div className="pf-empty">Загрузка профиля…</div>
            ) : profile ? (
                <>
                    <div className="pf-tiles">
                        <div className="pf-tile" style={{ "--c": "#78c8ff" }}>
                            <div className="pf-tile-ic"><SwordsIcon size={22} /></div>
                            <div className="pf-tile-val">{(profile.pvp_wins || 0) + (profile.pvp_losses || 0)}</div>
                            <div className="pf-tile-lbl">Игр</div>
                        </div>
                        <div className="pf-tile" style={{ "--c": "#4ade80" }}>
                            <div className="pf-tile-ic"><TrophyIcon size={22} /></div>
                            <div className="pf-tile-val">{profile.pvp_wins || 0}</div>
                            <div className="pf-tile-lbl">Побед</div>
                        </div>
                        <div className="pf-tile" style={{ "--c": "#f87171" }}>
                            <div className="pf-tile-ic"><XIcon size={22} /></div>
                            <div className="pf-tile-val">{profile.pvp_losses || 0}</div>
                            <div className="pf-tile-lbl">Поражений</div>
                        </div>
                        <div className="pf-tile" style={{ "--c": "#ffd76a" }}>
                            <div className="pf-tile-ic"><GemIcon size={22} /></div>
                            <div className="pf-tile-val">{profile.win_rate || 0}%</div>
                            <div className="pf-tile-lbl">Винрейт</div>
                        </div>
                    </div>

                    <div className="pf-sec">История матчей</div>
                    {matches === null ? (
                        <div className="pf-empty">Загрузка…</div>
                    ) : matches.length === 0 ? (
                        <div className="pf-empty">Пока нет сыгранных матчей. Сыграй первый бой!</div>
                    ) : (
                        <div className="pf-matches">
                            {matches.map(function (m) { return <MatchRow key={m.match_id} m={m} />; })}
                        </div>
                    )}

                    <div className="pf-sec">Достижения</div>
                    <div className="pf-ach">
                        {[
                            { ok: (profile.pvp_wins || 0) >= 1, ic: <TrophyIcon size={22} />, nm: "Первая победа" },
                            { ok: (profile.pvp_wins || 0) >= 10, ic: <BoltIcon size={22} />, nm: "10 побед" },
                            { ok: (profile.total_matches || 0) >= 50, ic: <SwordsIcon size={22} />, nm: "50 матчей" },
                            { ok: connected, ic: <CoinIcon size={22} />, nm: "Кошелёк" },
                            { ok: (profile.elo_rating || 0) >= 1200, ic: <SwordsIcon size={22} />, nm: "Мастер" },
                            { ok: (profile.elo_rating || 0) >= 1500, ic: <TrophyIcon size={22} />, nm: "Профи" },
                        ].map(function (a, i) {
                            return (
                                <div key={i} className={"pf-ach-item" + (a.ok ? "" : " locked")}>
                                    <div className="pf-ach-ic">{a.ic}</div>
                                    <div className="pf-ach-nm">{a.nm}</div>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : (
                <div className="pf-empty">Не удалось загрузить профиль</div>
            )}
        </div>
    );
}
