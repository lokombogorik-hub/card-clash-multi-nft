import { useState, useEffect, useCallback, useRef } from "react";
import { TrophyIcon, SwordsIcon, UsersIcon, CoinIcon, CheckIcon } from "../components/Icons";
import { useWalletConnect } from "../context/WalletConnectContext";
import { apiFetch } from "../api";

// Турниры — раскрывающиеся карточки на живой логике + фон-картинка + админ-загрузка фото.
// Бэкенд: /api/tournaments(...)

function fmtNear(n) {
    if (!n && n !== 0) return "0";
    return (Math.round(Number(n) * 10000) / 10000).toString();
}

var STATUS = {
    registration: { label: "Регистрация", badge: "reg", grad: ["#22c55e", "#16a34a"] },
    running: { label: "Идёт", badge: "run", grad: ["#ffb020", "#ff8a00"] },
    finished: { label: "Завершён", badge: "fin", grad: ["#8a93a6", "#5b6273"] },
    cancelled: { label: "Отменён", badge: "cancel", grad: ["#ef4444", "#b91c1c"] },
};
function st(s) { return STATUS[s] || STATUS.finished; }

// Выбор фото с телефона + ресайз -> JPEG dataURL (лёгкий, лезет в БД).
function pickImage(cb) {
    var input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
            var img = new Image();
            img.onload = function () {
                var max = 720, w = img.width, h = img.height;
                if (w > h && w > max) { h = Math.round(h * max / w); w = max; }
                else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
                var c = document.createElement("canvas");
                c.width = w; c.height = h;
                c.getContext("2d").drawImage(img, 0, 0, w, h);
                cb(c.toDataURL("image/jpeg", 0.78));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

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
                                    <div className={"tbracket-row" + (w1 ? " win" : "")}><span>{nameOf(m.player1_id)}</span>{w1 && <span>✓</span>}</div>
                                    <div className={"tbracket-row" + (w2 ? " win" : "")}><span>{nameOf(m.player2_id)}</span>{w2 && <span>✓</span>}</div>
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
    var byPlace = {}; winners.forEach(function (w) { byPlace[w.place] = w; });
    var order = [2, 1, 3];
    var label = function (w) { return !w ? "—" : (me && String(w.user_id) === String(me) ? "Вы" : "#" + String(w.user_id).slice(-4)); };
    var medal = { 1: "🥇", 2: "🥈", 3: "🥉" };
    return (
        <div className="t-podium">
            {order.map(function (pl) {
                var w = byPlace[pl]; if (!w) return null;
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

function TournamentCard({ summary, token, me, amAdmin, onEnterMatch, onChanged, delay, defaultOpen }) {
    var ctx = useWalletConnect();
    var [open, setOpen] = useState(!!defaultOpen);
    var [t, setT] = useState(null);
    var [busy, setBusy] = useState(false);
    var [msg, setMsg] = useState("");
    var pollRef = useRef(null);
    var data = t || summary;
    var s = st(data.status);
    var regLeft = useCountdown(data.registration_ends_at);

    var loadDetail = useCallback(async function () {
        try {
            var d = await apiFetch("/api/tournaments/" + summary.id, { token: token });
            setT(d);
        } catch (_) { }
    }, [summary.id, token]);

    useEffect(function () {
        if (!open) { if (pollRef.current) clearInterval(pollRef.current); return; }
        loadDetail();
        var status = (t || summary).status;
        var interval = status === "running" ? 10000 : status === "registration" ? 25000 : 0;
        if (interval) pollRef.current = setInterval(loadDetail, interval);
        return function () { if (pollRef.current) clearInterval(pollRef.current); };
    }, [open, loadDetail, (t || summary).status]);

    var pool = Number(data.prize_pool_near || 0);
    var dist = data.prize_distribution || [50, 30, 20];
    var medals = ["🥇", "🥈", "🥉"];
    var bg = data.image_url || null;

    var register = async function (e) {
        e.stopPropagation();
        if (!ctx.connected || !ctx.accountId) { alert("Подключи HOT Wallet!"); return; }
        setBusy(true); setMsg("");
        try {
            var txHash = null;
            if (Number(data.entry_fee_near) > 0) {
                setMsg("Оплата взноса…");
                var pay = await ctx.sendNear({ receiverId: data.treasury, amount: String(data.entry_fee_near) });
                txHash = (pay && pay.txHash) || "";
                if (!txHash) throw new Error("Транзакция не прошла");
            }
            setMsg("📝 Регистрирую...");
            await apiFetch("/api/tournaments/" + summary.id + "/register", {
                method: "POST", token: token,
                body: JSON.stringify({ tx_hash: txHash, near_account: ctx.accountId }),
            });
            setMsg("Вы в турнире!");
            await loadDetail(); onChanged && onChanged();
        } catch (err) { setMsg(String(err && err.message || err)); }
        finally { setBusy(false); }
    };

    var changeBg = function (e) {
        e.stopPropagation();
        pickImage(async function (dataUrl) {
            setBusy(true); setMsg("🖼 Сохраняю фон...");
            try {
                await apiFetch("/api/tournaments/" + summary.id + "/image", {
                    method: "POST", token: token,
                    body: JSON.stringify({ image_url: dataUrl }),
                });
                setMsg("Фон обновлён");
                await loadDetail(); onChanged && onChanged();
            } catch (err) { setMsg(String(err && err.message || err)); }
            finally { setBusy(false); }
        });
    };

    var deleteTournament = function (e) {
        e.stopPropagation();
        if (typeof window !== "undefined" && !window.confirm("Удалить турнир «" + data.name + "»? Действие необратимо.")) return;
        setBusy(true); setMsg("Удаляю…");
        apiFetch("/api/tournaments/" + summary.id, { method: "DELETE", token: token })
            .then(function () { onChanged && onChanged(); })
            .catch(function (err) { setMsg(String(err && err.message || err)); setBusy(false); });
    };

    var myMatch = t && t.bracket && t.bracket.my_match;
    var winners = (t && t.winners) || [];

    var renderAction = function () {
        if (data.status === "registration") {
            if (t && t.am_registered) return <button className="tournament-action-btn t-act-done" disabled><span style={{display:"inline-flex",alignItems:"center",gap:6}}><CheckIcon size={15} /> Вы в турнире — ждём старта</span></button>;
            return (
                <button className="tournament-action-btn t-act-reg" disabled={busy} onClick={register}>
                    <span className="btn-icon"><CoinIcon size={16} /></span>
                    <span>{busy ? "..." : (Number(data.entry_fee_near) > 0 ? "Участвовать за " + fmtNear(data.entry_fee_near) + " Ⓝ" : "Участвовать (бесплатно)")}</span>
                </button>
            );
        }
        if (data.status === "running" && myMatch) {
            return (
                <button className="tournament-action-btn t-act-play" onClick={function (e) { e.stopPropagation(); onEnterMatch(myMatch.match_id); }}>
                    <span className="btn-icon"><SwordsIcon size={16} /></span><span>Играть свой матч</span>
                </button>
            );
        }
        return null;
    };

    return (
        <div className={"tournament-card-v2" + (open ? " expanded" : "")} style={{ animationDelay: delay + "s" }}
            onClick={function () { setOpen(!open); }}>
            {bg && <div className="t-card-bg" style={{ backgroundImage: "url(" + bg + ")" }} />}
            {bg && <div className="t-card-bg-overlay" />}
            {!bg && <div className="tournament-card-glow" style={{ background: "linear-gradient(135deg, " + s.grad[0] + "40, " + s.grad[1] + "40)" }} />}
            <div className="t-card-shine" />
            <div className="tournament-card-main">
                <div className="tournament-avatar-wrap">
                    <div className="tournament-avatar-ring" style={{ background: "linear-gradient(135deg, " + s.grad[0] + ", " + s.grad[1] + ")" }}>
                        <div className="tournament-avatar">
                            {bg ? <img src={bg} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="t-ava-emoji"><TrophyIcon size={26} /></div>}
                        </div>
                    </div>
                    <div className={"tournament-avatar-badge " + s.badge}>{s.label}</div>
                </div>
                <div className="tournament-card-info">
                    <div className="tournament-card-title-row"><h3>{data.name}</h3></div>
                    <p className="tournament-card-subtitle">
                        {data.status === "registration" && regLeft ? "до старта " + regLeft : "Single Elimination"}
                    </p>
                    <div className="tournament-quick-stats">
                        <div className="quick-stat"><span className="quick-stat-icon"><UsersIcon size={15} /></span><span>{data.participants_count}{data.max_participants ? "/" + data.max_participants : ""}</span></div>
                        <div className="quick-stat"><span className="quick-stat-icon"><CoinIcon size={15} /></span><span>{fmtNear(data.entry_fee_near)} Ⓝ</span></div>
                        <div className="quick-stat prize"><span className="quick-stat-icon"><CoinIcon size={15} /></span><span>{fmtNear(pool)} Ⓝ</span></div>
                    </div>
                </div>
                <div className={"tournament-expand-arrow" + (open ? " rotated" : "")}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" /></svg>
                </div>
            </div>

            {open && (
                <div className="tournament-expanded">
                    <div className="tournament-divider" />
                    {msg && <div className="t-msg">{msg}</div>}

                    <div className="tournament-prize-section">
                        <div className="prize-section-title">Призовой фонд · {fmtNear(pool)} Ⓝ</div>
                        <div className="prize-places">
                            {dist.slice(0, 3).map(function (pct, i) {
                                return (
                                    <div key={i} className={"prize-place place-" + (i + 1)}>
                                        <span className="place-icon">{medals[i]}</span>
                                        <span className="place-amount">{fmtNear(pool * pct / 100)} Ⓝ</span>
                                        <span className="place-pct">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="tournament-format-section">
                        <div className="format-item"><span className="format-icon"><SwordsIcon size={14} /></span><span className="format-label">Формат:</span><span className="format-value">Single Elimination</span></div>
                        <div className="format-item"><span className="format-icon"><UsersIcon size={14} /></span><span className="format-label">Участники:</span><span className="format-value">{data.participants_count}{data.max_participants ? " / " + data.max_participants : " (без лимита)"}</span></div>
                        <div className="format-item"><span className="format-icon"><CoinIcon size={14} /></span><span className="format-label">Взнос:</span><span className="format-value">{fmtNear(data.entry_fee_near)} Ⓝ</span></div>
                        {data.status === "registration" && regLeft &&
                            <div className="format-item"><span className="format-icon"><CoinIcon size={14} /></span><span className="format-label">До старта:</span><span className="format-value">{regLeft}</span></div>}
                    </div>

                    {renderAction()}

                    {amAdmin && (
                        <button className="t-photo-btn" style={{ marginTop: 10 }} disabled={busy} onClick={changeBg}>
                            🖼 {bg ? "Сменить фон" : "Поставить фон с телефона"}
                        </button>
                    )}

                    {amAdmin && (
                        <button className="t-del-btn" disabled={busy} onClick={deleteTournament}>
                            Удалить турнир
                        </button>
                    )}

                    {data.status === "finished" && winners.length > 0 && (
                        <>
                            <div className="t-section-title">Призёры</div>
                            <Podium winners={winners} me={me} />
                        </>
                    )}

                    {t && data.status !== "registration" && t.bracket && (
                        <>
                            <div className="t-section-title">Сетка</div>
                            <Bracket bracket={t.bracket} me={me} />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function CreateForm({ token, onCreated }) {
    var [open, setOpen] = useState(false);
    var [name, setName] = useState("Card Clash Cup");
    var [fee, setFee] = useState("1");
    var [minutes, setMinutes] = useState("30");
    var [image, setImage] = useState("");
    var [busy, setBusy] = useState(false);
    var [err, setErr] = useState("");

    var submit = async function () {
        setBusy(true); setErr("");
        try {
            await apiFetch("/api/tournaments", {
                method: "POST", token: token,
                body: JSON.stringify({
                    name: name, entry_fee_near: Number(fee) || 0,
                    prize_distribution: [50, 30, 20], registration_minutes: Number(minutes) || 30,
                    image_url: image || null,
                }),
            });
            setOpen(false); setImage("");
            onCreated && onCreated();
        } catch (e) { setErr((e && e.message || e) + ""); }
        finally { setBusy(false); }
    };

    if (!open) return <button className="t-create-toggle" onClick={function () { setOpen(true); }}>+ Создать турнир</button>;
    return (
        <div className="t-create">
            <div className="t-create-label">Название</div>
            <input className="t-input" value={name} onChange={function (e) { setName(e.target.value); }} placeholder="Название" />
            <div className="t-create-label">Взнос, NEAR</div>
            <input className="t-input" value={fee} onChange={function (e) { setFee(e.target.value); }} placeholder="1" inputMode="decimal" />
            <div className="t-create-label">Регистрация, минут</div>
            <input className="t-input" value={minutes} onChange={function (e) { setMinutes(e.target.value); }} placeholder="30" inputMode="numeric" />
            <div className="t-create-label">Фон турнира (необязательно)</div>
            {image && <img className="t-photo-preview" src={image} alt="" />}
            <button className="t-photo-btn" onClick={function () { pickImage(setImage); }}>🖼 {image ? "Сменить фото" : "Выбрать фото с телефона"}</button>
            {err && <div className="t-err">{err}</div>}
            <div className="t-row">
                <button className="tournament-action-btn t-act-reg" disabled={busy} onClick={submit}>{busy ? "..." : "Создать"}</button>
                <button className="t-back" style={{ marginBottom: 0 }} onClick={function () { setOpen(false); }}>Отмена</button>
            </div>
        </div>
    );
}

export default function Tournaments({ token, me, onEnterMatch, initialOpenId }) {
    var [list, setList] = useState(null);
    var [amAdmin, setAmAdmin] = useState(false);

    var load = useCallback(async function () {
        try {
            var d = await apiFetch("/api/tournaments", { token: token });
            setList((d && d.tournaments) || []);
            setAmAdmin(!!(d && d.am_admin));
        } catch (e) { setList([]); }
    }, [token]);

    useEffect(function () { load(); }, [load]);

    var totalPool = (list || []).reduce(function (a, t) { return a + Number(t.prize_pool_near || 0); }, 0);

    return (
        <div className="tournament-page-v2">
            <div className="tournament-header">
                <h2 className="tournament-title"><span className="tournament-title-icon" style={{display:"inline-flex",verticalAlign:"middle"}}><TrophyIcon size={22} /></span>Турниры</h2>
                <div className="tournament-subtitle">Сражайся за призовой фонд NEAR</div>
            </div>

            <div className="tournament-stats-row">
                <div className="tournament-stat-chip"><span className="stat-chip-icon"><SwordsIcon size={15} /></span><span>{(list || []).length} турниров</span></div>
                <div className="tournament-stat-chip"><span className="stat-chip-icon">💎</span><span>{fmtNear(totalPool)} Ⓝ фонд</span></div>
            </div>

            {amAdmin && <CreateForm token={token} onCreated={load} />}

            {list === null && <div className="t-empty">Загрузка...</div>}
            {list && list.length === 0 && <div className="t-empty">Пока нет активных турниров.<br />Загляни позже</div>}

            <div className="tournament-list-v2">
                {list && list.map(function (t, i) {
                    return <TournamentCard key={t.id} summary={t} token={token} me={me} amAdmin={amAdmin}
                        onEnterMatch={onEnterMatch} onChanged={load} delay={i * 0.08}
                        defaultOpen={initialOpenId && String(initialOpenId) === String(t.id)} />;
                })}
            </div>

            <div className="tournament-bottom-info">
                <div className="bottom-info-icon">💡</div>
                <div className="bottom-info-text">Нажми на турнир, чтобы открыть детали, сетку и регистрацию</div>
            </div>
        </div>
    );
}
