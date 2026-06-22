import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

// Турниры — премиум «игровой» UI. Бэкенд: /api/tournaments(...)

var GRAD = "linear-gradient(135deg, #667eea, #764ba2)";

function fmtNear(n) {
    if (!n && n !== 0) return "0";
    return (Math.round(Number(n) * 10000) / 10000).toString();
}

var STATUS_LABEL = {
    registration: "Регистрация",
    running: "Идёт",
    finished: "Завершён",
    cancelled: "Отменён",
};

function useCountdown(iso) {
    var [left, setLeft] = useState("");
    useEffect(function () {
        if (!iso) { setLeft(""); return; }
        var tick = function () {
            var ms = new Date(iso).getTime() - Date.now();
            if (ms <= 0) { setLeft("00:00"); return; }
            var s = Math.floor(ms / 1000);
            var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
            var pad = function (x) { return x < 10 ? "0" + x : "" + x; };
            setLeft((h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(ss));
        };
        tick();
        var id = setInterval(tick, 1000);
        return function () { clearInterval(id); };
    }, [iso]);
    return left;
}

function Pill({ status }) {
    return (
        <span className={"t-pill " + status}>
            <span className="dot" />{STATUS_LABEL[status] || status}
        </span>
    );
}

function Bracket({ bracket, me }) {
    if (!bracket || !bracket.rounds || !bracket.rounds.length) return null;
    var nameOf = function (id) {
        if (!id) return "—";
        if (me && String(id) === String(me)) return "Вы";
        return "#" + String(id).slice(-4);
    };
    return (
        <div className="tbracket">
            {bracket.rounds.map(function (r) {
                return (
                    <div key={r.round} className="tbracket-round">
                        <div className="tbracket-round-title">Раунд {r.round}</div>
                        {r.matches.map(function (m) {
                            var w1 = m.winner_id && String(m.winner_id) === String(m.player1_id);
                            var w2 = m.winner_id && String(m.winner_id) === String(m.player2_id);
                            return (
                                <div key={m.id} className={"tbracket-match" + (m.is_third_place ? " third" : "")}>
                                    {m.is_third_place && <div className="tbracket-tag third">За 3-е место</div>}
                                    <div className={"tbracket-row" + (w1 ? " win" : "")}>
                                        <span>{nameOf(m.player1_id)}</span>{w1 && <span>✓</span>}
                                    </div>
                                    <div className={"tbracket-row" + (w2 ? " win" : "")}>
                                        <span>{nameOf(m.player2_id)}</span>{w2 && <span>✓</span>}
                                    </div>
                                    {m.status === "active" && <div className="tbracket-tag live">идёт</div>}
                                    {m.status === "bye" && <div className="tbracket-tag bye">авто-проход</div>}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

function Podium({ winners, me }) {
    var byPlace = {};
    winners.forEach(function (w) { byPlace[w.place] = w; });
    var order = [2, 1, 3];
    var label = function (w) {
        if (!w) return "—";
        return me && String(w.user_id) === String(me) ? "Вы" : "#" + String(w.user_id).slice(-4);
    };
    var medal = { 1: "🥇", 2: "🥈", 3: "🥉" };
    return (
        <div className="t-podium">
            {order.map(function (pl) {
                var w = byPlace[pl];
                if (!w) return null;
                var prize = Number(w.prize_yocto || "0") / 1e24;
                return (
                    <div key={pl} className={"t-pod p" + pl}>
                        <div className="m">{medal[pl]}</div>
                        <div className="n">{label(w)}</div>
                        <div className="p">{fmtNear(prize)} Ⓝ</div>
                    </div>
                );
            })}
        </div>
    );
}

function CreateForm({ token, onCreated }) {
    var [open, setOpen] = useState(false);
    var [name, setName] = useState("Card Clash Cup");
    var [fee, setFee] = useState("1");
    var [minutes, setMinutes] = useState("30");
    var [busy, setBusy] = useState(false);
    var [err, setErr] = useState("");

    var submit = async function () {
        setBusy(true); setErr("");
        try {
            await apiFetch("/api/tournaments", {
                method: "POST", token: token,
                body: JSON.stringify({
                    name: name, entry_fee_near: Number(fee) || 0,
                    prize_distribution: [50, 30, 20],
                    registration_minutes: Number(minutes) || 30,
                }),
            });
            setOpen(false);
            onCreated && onCreated();
        } catch (e) { setErr((e && e.message || e) + ""); }
        finally { setBusy(false); }
    };

    if (!open) {
        return (
            <button className="t-create-toggle" onClick={function () { setOpen(true); }}>
                + Создать турнир
            </button>
        );
    }
    return (
        <div className="t-create">
            <div className="t-create-label">Название</div>
            <input className="t-input" value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Название" />
            <div className="t-create-label">Взнос, NEAR</div>
            <input className="t-input" value={fee} onChange={function (e) { setFee(e.target.value); }} placeholder="1" inputMode="decimal" />
            <div className="t-create-label">Регистрация, минут</div>
            <input className="t-input" value={minutes} onChange={function (e) { setMinutes(e.target.value); }} placeholder="30" inputMode="numeric" />
            {err && <div className="t-err">{err}</div>}
            <div className="t-row">
                <button className="tournament-action-btn" style={{ background: GRAD }} disabled={busy} onClick={submit}>
                    {busy ? "..." : "Создать"}
                </button>
                <button className="t-back" style={{ marginBottom: 0 }} onClick={function () { setOpen(false); }}>Отмена</button>
            </div>
        </div>
    );
}

function TournamentDetail({ tid, token, me, onEnterMatch, onBack }) {
    var ctx = useWalletConnect();
    var [t, setT] = useState(null);
    var [busy, setBusy] = useState(false);
    var [msg, setMsg] = useState("");
    var pollRef = useRef(null);
    var regLeft = useCountdown(t && t.registration_ends_at);

    var load = useCallback(async function () {
        try {
            var d = await apiFetch("/api/tournaments/" + tid, { token: token });
            setT(d);
        } catch (e) { setMsg("Ошибка загрузки: " + (e && e.message || e)); }
    }, [tid, token]);

    useEffect(function () {
        load();
        pollRef.current = setInterval(load, 8000);
        return function () { if (pollRef.current) clearInterval(pollRef.current); };
    }, [load]);

    var register = async function () {
        if (!t) return;
        if (!ctx.connected || !ctx.accountId) { alert("Подключи HOT Wallet!"); return; }
        setBusy(true); setMsg("");
        try {
            var txHash = null;
            if (Number(t.entry_fee_near) > 0) {
                setMsg("⏳ Оплата взноса...");
                var pay = await ctx.sendNear({ receiverId: t.treasury, amount: String(t.entry_fee_near) });
                txHash = (pay && pay.txHash) || "";
                if (!txHash) throw new Error("Транзакция не прошла");
            }
            setMsg("📝 Регистрирую...");
            await apiFetch("/api/tournaments/" + tid + "/register", {
                method: "POST", token: token,
                body: JSON.stringify({ tx_hash: txHash, near_account: ctx.accountId }),
            });
            setMsg("✅ Вы зарегистрированы!");
            await load();
        } catch (e) { setMsg("❌ " + (e && e.message || e)); }
        finally { setBusy(false); }
    };

    if (!t) return <div className="tournament-page-v2"><div className="t-empty">Загрузка...</div></div>;

    var myMatch = t.bracket && t.bracket.my_match;
    var canRegister = t.status === "registration" && !t.am_registered;
    var winners = t.winners || [];

    return (
        <div className="tournament-page-v2">
            <div className="t-back-row"><button className="t-back" onClick={onBack}>← Назад</button></div>

            <div className="t-hero">
                <div className="t-hero-shine" />
                <div className="t-hero-content">
                    <div className="t-hero-icon">🏆</div>
                    <div className="t-hero-title">{t.name}</div>
                    <div className="t-hero-sub">
                        <Pill status={t.status} />
                        {t.status === "registration" && regLeft ? "  ·  до старта " + regLeft : ""}
                    </div>
                    <div className="t-hero-stats">
                        <div className="t-hero-stat"><b>{t.participants_count}{t.max_participants ? "/" + t.max_participants : ""}</b><span>Игроков</span></div>
                        <div className="t-hero-stat"><b>{fmtNear(t.prize_pool_near)}</b><span>Фонд Ⓝ</span></div>
                        <div className="t-hero-stat"><b>{fmtNear(t.entry_fee_near)}</b><span>Взнос Ⓝ</span></div>
                    </div>
                </div>
            </div>

            {msg && <div className="t-msg">{msg}</div>}

            {canRegister && (
                <button className="tournament-action-btn" style={{ background: GRAD }} disabled={busy} onClick={register}>
                    <span className="btn-icon">🎟</span>
                    <span>{busy ? "..." : (Number(t.entry_fee_near) > 0 ? "Участвовать за " + fmtNear(t.entry_fee_near) + " Ⓝ" : "Участвовать (бесплатно)")}</span>
                </button>
            )}
            {t.am_registered && t.status === "registration" && (
                <div className="t-note">✅ Вы зарегистрированы. Ждём старта.</div>
            )}

            {myMatch && (
                <button className="tournament-action-btn" style={{ background: "linear-gradient(135deg,#2f9e44,#37b24d)", marginTop: 4 }}
                    onClick={function () { onEnterMatch(myMatch.match_id); }}>
                    <span className="btn-icon">⚔️</span><span>Играть свой матч</span>
                </button>
            )}

            {t.status === "finished" && winners.length > 0 && (
                <>
                    <div className="t-section-title">Призёры</div>
                    <Podium winners={winners} me={me} />
                    {winners.filter(function (w) { return w.place > 3; }).map(function (w, i) {
                        var prize = Number(w.prize_yocto || "0") / 1e24;
                        return (
                            <div key={i} className={"t-winner-row place-" + w.place}>
                                <span>🏅 {me && String(w.user_id) === String(me) ? "Вы" : "#" + String(w.user_id).slice(-4)}</span>
                                <span className="t-winner-prize">{fmtNear(prize)} Ⓝ {w.paid ? "✓" : ""}</span>
                            </div>
                        );
                    })}
                </>
            )}

            {t.status !== "registration" && t.bracket && (
                <>
                    <div className="t-section-title">Сетка</div>
                    <Bracket bracket={t.bracket} me={me} />
                </>
            )}
        </div>
    );
}

export default function Tournaments({ token, me, onEnterMatch }) {
    var [list, setList] = useState(null);
    var [amAdmin, setAmAdmin] = useState(false);
    var [openId, setOpenId] = useState(null);

    var load = useCallback(async function () {
        try {
            var d = await apiFetch("/api/tournaments", { token: token });
            setList((d && d.tournaments) || []);
            setAmAdmin(!!(d && d.am_admin));
        } catch (e) { setList([]); }
    }, [token]);

    useEffect(function () { load(); }, [load]);

    if (openId) {
        return <TournamentDetail tid={openId} token={token} me={me}
            onEnterMatch={onEnterMatch} onBack={function () { setOpenId(null); load(); }} />;
    }

    var totalPool = (list || []).reduce(function (a, t) { return a + Number(t.prize_pool_near || 0); }, 0);

    return (
        <div className="tournament-page-v2">
            <div className="t-hero">
                <div className="t-hero-shine" />
                <div className="t-hero-content">
                    <div className="t-hero-icon">🏆</div>
                    <div className="t-hero-title">Турниры</div>
                    <div className="t-hero-sub">Сразись за призовой фонд NEAR · сетка на выбывание</div>
                    <div className="t-hero-stats">
                        <div className="t-hero-stat"><b>{(list || []).length}</b><span>Турниров</span></div>
                        <div className="t-hero-stat"><b>{fmtNear(totalPool)}</b><span>Фонд Ⓝ</span></div>
                    </div>
                </div>
            </div>

            {amAdmin && <CreateForm token={token} onCreated={load} />}

            {list === null && <div className="t-empty">Загрузка...</div>}
            {list && list.length === 0 && (
                <div className="t-empty">Пока нет активных турниров.<br />Загляни позже ⚔️</div>
            )}

            {list && list.map(function (t, i) {
                return (
                    <div key={t.id} className="t-card" style={{ animationDelay: (i * 0.07) + "s" }}
                        onClick={function () { setOpenId(t.id); }}>
                        <div className="t-card-accent" />
                        <div className="t-card-body">
                            <div className="t-card-badge">🏆</div>
                            <div className="t-card-mid">
                                <div className="t-card-name">{t.name}</div>
                                <div className="t-card-meta">
                                    <span>👥 {t.participants_count}{t.max_participants ? "/" + t.max_participants : ""}</span>
                                    <span>🎟 {fmtNear(t.entry_fee_near)} Ⓝ</span>
                                </div>
                                <span className="t-card-pool">💰 {fmtNear(t.prize_pool_near)} Ⓝ фонд</span>
                            </div>
                            <Pill status={t.status} />
                        </div>
                    </div>
                );
            })}

            <div className="tournament-bottom-info">
                <div className="bottom-info-icon">💡</div>
                <div className="bottom-info-text">Нажми на турнир, чтобы открыть детали и сетку</div>
            </div>
        </div>
    );
}
