import { useState, useEffect, useCallback, useRef } from "react";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

// Страница турниров: реальная регистрация (взнос в NEAR), сетка single-elim,
// вход в свой матч (переиспользует PvP-движок), призовой фонд.
// Бэкенд-роуты: /api/tournaments(...)

function fmtNear(n) {
    if (!n && n !== 0) return "0";
    return (Math.round(Number(n) * 10000) / 10000).toString();
}

function useCountdown(iso) {
    var [left, setLeft] = useState("");
    useEffect(function () {
        if (!iso) { setLeft(""); return; }
        var tick = function () {
            var ms = new Date(iso).getTime() - Date.now();
            if (ms <= 0) { setLeft("00:00"); return; }
            var s = Math.floor(ms / 1000);
            var h = Math.floor(s / 3600);
            var m = Math.floor((s % 3600) / 60);
            var ss = s % 60;
            var pad = function (x) { return x < 10 ? "0" + x : "" + x; };
            setLeft((h > 0 ? pad(h) + ":" : "") + pad(m) + ":" + pad(ss));
        };
        tick();
        var id = setInterval(tick, 1000);
        return function () { clearInterval(id); };
    }, [iso]);
    return left;
}

var STATUS_LABEL = {
    registration: "Регистрация открыта",
    running: "Идёт",
    finished: "Завершён",
    cancelled: "Отменён",
};

function Bracket({ bracket, me }) {
    if (!bracket || !bracket.rounds || !bracket.rounds.length) return null;
    var nameOf = function (id) {
        if (!id) return "—";
        if (me && String(id) === String(me)) return "Вы";
        return "#" + String(id).slice(-4);
    };
    return (
        <div style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 6 }}>
            {bracket.rounds.map(function (r) {
                return (
                    <div key={r.round} style={{ minWidth: 150 }}>
                        <div style={{ color: "#9fd0ff", fontSize: 12, marginBottom: 6, textAlign: "center" }}>
                            Раунд {r.round}
                        </div>
                        {r.matches.map(function (m) {
                            var win1 = m.winner_id && String(m.winner_id) === String(m.player1_id);
                            var win2 = m.winner_id && String(m.winner_id) === String(m.player2_id);
                            var row = function (pid, win) {
                                return (
                                    <div style={{
                                        display: "flex", justifyContent: "space-between",
                                        padding: "4px 8px", fontSize: 12,
                                        color: win ? "#fff" : "rgba(255,255,255,.7)",
                                        fontWeight: win ? 700 : 400,
                                        background: win ? "rgba(80,200,120,.18)" : "transparent",
                                        borderRadius: 6,
                                    }}>
                                        <span>{nameOf(pid)}</span>
                                        {win && <span>✓</span>}
                                    </div>
                                );
                            };
                            return (
                                <div key={m.id} style={{
                                    border: "1px solid rgba(255,255,255,.12)", borderRadius: 8,
                                    padding: 4, marginBottom: 8,
                                    background: m.is_third_place ? "rgba(205,127,50,.10)" : "rgba(255,255,255,.04)",
                                }}>
                                    {m.is_third_place && <div style={{ fontSize: 10, color: "#cd7f32", textAlign: "center" }}>За 3-е место</div>}
                                    {row(m.player1_id, win1)}
                                    {row(m.player2_id, win2)}
                                    {m.status === "active" && <div style={{ fontSize: 10, color: "#ffd76a", textAlign: "center" }}>идёт</div>}
                                    {m.status === "bye" && <div style={{ fontSize: 10, color: "#9aa", textAlign: "center" }}>авто-проход</div>}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
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
        } catch (e) {
            setMsg("Ошибка загрузки: " + (e && e.message || e));
        }
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
        } catch (e) {
            setMsg("❌ " + (e && e.message || e));
        } finally {
            setBusy(false);
        }
    };

    if (!t) return <div style={{ color: "#fff", padding: 20 }}>Загрузка...</div>;

    var myMatch = t.bracket && t.bracket.my_match;
    var canRegister = t.status === "registration" && !t.am_registered;
    var winners = t.winners || [];

    return (
        <div style={{ padding: "12px 14px", color: "#fff" }}>
            <button onClick={onBack} style={{
                background: "rgba(255,255,255,.1)", border: "none", color: "#fff",
                borderRadius: 8, padding: "6px 12px", marginBottom: 12, cursor: "pointer",
            }}>← Назад</button>

            <h2 style={{ margin: "0 0 4px" }}>{t.name}</h2>
            <div style={{ color: "#9fd0ff", fontSize: 13, marginBottom: 12 }}>
                {STATUS_LABEL[t.status] || t.status}
                {t.status === "registration" && regLeft ? " · до старта " + regLeft : ""}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
                <Chip icon="👥" text={t.participants_count + (t.max_participants ? "/" + t.max_participants : "")} />
                <Chip icon="🎟" text={"Взнос: " + fmtNear(t.entry_fee_near) + " Ⓝ"} />
                <Chip icon="💰" text={"Фонд: " + fmtNear(t.prize_pool_near) + " Ⓝ"} />
                <Chip icon="🏆" text={"Призы: " + (t.prize_distribution || []).join("/") + "%"} />
            </div>

            {msg && <div style={{ marginBottom: 12, fontSize: 13, color: "#ffd76a" }}>{msg}</div>}

            {canRegister && (
                <button onClick={register} disabled={busy} style={btnStyle(busy)}>
                    {busy ? "..." : (Number(t.entry_fee_near) > 0
                        ? "Участвовать за " + fmtNear(t.entry_fee_near) + " Ⓝ"
                        : "Участвовать (бесплатно)")}
                </button>
            )}
            {t.am_registered && t.status === "registration" && (
                <div style={{ color: "#7CFC9A", marginBottom: 12 }}>✅ Вы зарегистрированы. Ждём старта.</div>
            )}

            {myMatch && (
                <button onClick={function () { onEnterMatch(myMatch.match_id); }} style={btnStyle(false, "#2f9e44")}>
                    ⚔️ Играть свой матч
                </button>
            )}

            {t.status !== "registration" && t.bracket && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ color: "#9fd0ff", fontSize: 13, marginBottom: 8 }}>Сетка</div>
                    <Bracket bracket={t.bracket} me={me} />
                </div>
            )}

            {t.status === "finished" && winners.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <div style={{ color: "#9fd0ff", fontSize: 13, marginBottom: 8 }}>Призёры</div>
                    {winners.map(function (w, i) {
                        var medal = ["🥇", "🥈", "🥉", "🏅"][w.place - 1] || "🏅";
                        var prize = Number(w.prize_yocto || "0") / 1e24;
                        return (
                            <div key={i} style={{
                                display: "flex", justifyContent: "space-between",
                                padding: "8px 12px", marginBottom: 6, borderRadius: 8,
                                background: "rgba(255,255,255,.06)",
                            }}>
                                <span>{medal} {me && String(w.user_id) === String(me) ? "Вы" : "#" + String(w.user_id).slice(-4)}</span>
                                <span style={{ color: "#7CFC9A" }}>
                                    {fmtNear(prize)} Ⓝ {w.paid ? "✓" : ""}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Chip({ icon, text }) {
    return (
        <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,.08)", borderRadius: 999,
            padding: "5px 12px", fontSize: 12,
        }}>
            <span>{icon}</span><span>{text}</span>
        </div>
    );
}

function btnStyle(disabled, bg) {
    return {
        width: "100%", padding: "12px", borderRadius: 12, border: "none",
        color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 12,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.6 : 1,
        background: bg || "linear-gradient(135deg,#667eea,#764ba2)",
    };
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
        } catch (e) {
            setErr((e && e.message || e) + " (нужны права админа: TOURNAMENT_ADMIN_IDS)");
        } finally { setBusy(false); }
    };

    if (!open) {
        return (
            <button onClick={function () { setOpen(true); }} style={{
                background: "rgba(255,255,255,.08)", border: "1px dashed rgba(255,255,255,.25)",
                color: "#cde", borderRadius: 10, padding: "10px", width: "100%",
                marginBottom: 14, cursor: "pointer", fontSize: 13,
            }}>+ Создать турнир (админ)</button>
        );
    }
    var inp = { width: "100%", padding: 9, borderRadius: 8, border: "1px solid rgba(255,255,255,.2)", background: "rgba(0,0,0,.25)", color: "#fff", marginBottom: 8 };
    return (
        <div style={{ background: "rgba(255,255,255,.05)", borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <input style={inp} value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Название" />
            <input style={inp} value={fee} onChange={function (e) { setFee(e.target.value); }} placeholder="Взнос, NEAR" inputMode="decimal" />
            <input style={inp} value={minutes} onChange={function (e) { setMinutes(e.target.value); }} placeholder="Регистрация, минут" inputMode="numeric" />
            {err && <div style={{ color: "#ff8a8a", fontSize: 12, marginBottom: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={submit} disabled={busy} style={btnStyle(busy)}>Создать</button>
                <button onClick={function () { setOpen(false); }} style={{ ...btnStyle(false, "rgba(255,255,255,.15)"), width: 100 }}>Отмена</button>
            </div>
        </div>
    );
}

export default function Tournaments({ token, me, onEnterMatch }) {
    var [list, setList] = useState(null);
    var [openId, setOpenId] = useState(null);

    var load = useCallback(async function () {
        try {
            var d = await apiFetch("/api/tournaments", { token: token });
            setList((d && d.tournaments) || []);
        } catch (e) {
            setList([]);
        }
    }, [token]);

    useEffect(function () { load(); }, [load]);

    if (openId) {
        return <TournamentDetail tid={openId} token={token} me={me}
            onEnterMatch={onEnterMatch} onBack={function () { setOpenId(null); load(); }} />;
    }

    return (
        <div style={{ padding: "12px 14px", color: "#fff" }}>
            <h2 style={{ margin: "0 0 4px" }}><span style={{ marginRight: 8 }}>🏆</span>Турниры</h2>
            <div style={{ color: "#9fd0ff", fontSize: 13, marginBottom: 14 }}>Платный вход · призовой фонд NEAR · сетка на выбывание</div>

            <CreateForm token={token} onCreated={load} />

            {list === null && <div>Загрузка...</div>}
            {list && list.length === 0 && (
                <div style={{ opacity: .7, fontSize: 14, padding: "20px 0" }}>
                    Пока нет турниров. Создай первый (нужны права админа).
                </div>
            )}
            {list && list.map(function (t) {
                return (
                    <div key={t.id} onClick={function () { setOpenId(t.id); }} style={{
                        background: "rgba(255,255,255,.06)", borderRadius: 14,
                        padding: 14, marginBottom: 10, cursor: "pointer",
                        border: "1px solid rgba(255,255,255,.08)",
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontWeight: 700, fontSize: 16 }}>{t.name}</div>
                            <div style={{
                                fontSize: 11, padding: "3px 9px", borderRadius: 999,
                                background: t.status === "registration" ? "rgba(80,200,120,.2)" :
                                    t.status === "running" ? "rgba(255,200,80,.2)" : "rgba(255,255,255,.12)",
                                color: t.status === "registration" ? "#7CFC9A" :
                                    t.status === "running" ? "#ffd76a" : "#ccc",
                            }}>{STATUS_LABEL[t.status] || t.status}</div>
                        </div>
                        <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "rgba(255,255,255,.75)" }}>
                            <span>👥 {t.participants_count}{t.max_participants ? "/" + t.max_participants : ""}</span>
                            <span>🎟 {fmtNear(t.entry_fee_near)} Ⓝ</span>
                            <span>💰 {fmtNear(t.prize_pool_near)} Ⓝ</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
