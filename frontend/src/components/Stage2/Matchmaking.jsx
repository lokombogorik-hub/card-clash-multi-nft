import { useMemo, useState } from "react";
import { apiFetch } from "../../api.js";

function getStoredToken() {
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
}

export default function Matchmaking({ me, onBack, onMatched }) {
    const token = useMemo(() => getStoredToken(), []);
    const myTgId = me?.id ? Number(me.id) : 0;

    const [matchId, setMatchId] = useState("");
    const [joinId, setJoinId] = useState("");
    const [match, setMatch] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const refresh = async (id) => {
        const mid = (id || matchId || "").trim();
        if (!mid) return;
        const m = await apiFetch(`/api/matches/${mid}`, { token });
        setMatch(m);
    };

    const onCreate = async () => {
        setErr("");
        setBusy(true);
        try {
            const r = await apiFetch("/api/matches/create", {
                method: "POST",
                token,
                body: JSON.stringify({}),
            });
            setMatchId(r.matchId);
            setMatch(null);
            await refresh(r.matchId);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    const onJoin = async () => {
        const id = joinId.trim();
        if (!id) return;
        setErr("");
        setBusy(true);
        try {
            await apiFetch(`/api/matches/${id}/join`, { method: "POST", token });
            setMatchId(id);
            await refresh(id);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    const players = match?.players || [];
    const ready = players.length === 2 && players.every((p) => p.near_account_id);

    return (
        <div className="page" style={{ paddingTop: 10 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={onBack} style={{ padding: "10px 12px" }}>
                    ← Назад
                </button>
                <div style={{ fontWeight: 900 }}>Поиск соперника</div>
            </div>

            <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <button onClick={onCreate} disabled={busy} style={{ fontWeight: 900 }}>
                    Создать матч
                </button>

                {matchId ? (
                    <div
                        style={{
                            padding: 10,
                            borderRadius: 12,
                            background: "rgba(0,0,0,0.35)",
                            border: "1px solid rgba(255,255,255,0.12)",
                        }}
                    >
                        <div style={{ fontSize: 12, opacity: 0.85 }}>Match ID</div>
                        <div style={{ fontFamily: "monospace", wordBreak: "break-all", marginTop: 6 }}>
                            {matchId}
                        </div>

                        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                            <button
                                onClick={() => {
                                    try {
                                        navigator.clipboard.writeText(matchId);
                                    } catch { }
                                }}
                            >
                                Copy
                            </button>
                            <button onClick={() => refresh(matchId)} disabled={busy}>
                                Refresh
                            </button>
                        </div>
                    </div>
                ) : null}

                <div
                    style={{
                        padding: 10,
                        borderRadius: 12,
                        background: "rgba(0,0,0,0.25)",
                        border: "1px solid rgba(255,255,255,0.12)",
                    }}
                >
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Присоединиться к матчу</div>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            value={joinId}
                            onChange={(e) => setJoinId(e.target.value)}
                            placeholder="вставь matchId"
                            style={{
                                flex: 1,
                                padding: "10px 10px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(0,0,0,0.35)",
                                color: "#fff",
                                outline: "none",
                                fontFamily: "monospace",
                            }}
                        />
                        <button onClick={onJoin} disabled={busy || !joinId.trim()}>
                            Join
                        </button>
                    </div>
                </div>

                {match ? (
                    <div
                        style={{
                            padding: 10,
                            borderRadius: 12,
                            background: "rgba(0,0,0,0.25)",
                            border: "1px solid rgba(255,255,255,0.12)",
                        }}
                    >
                        <div style={{ fontWeight: 900 }}>Статус</div>
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                            players: {players.length}/2 • near linked:{" "}
                            {players.filter((p) => p.near_account_id).length}/2
                        </div>

                        <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 12 }}>
                            {players.map((p) => (
                                <div key={p.user_id} style={{ fontFamily: "monospace", opacity: 0.9 }}>
                                    {p.side}: tg={p.user_id} • near={p.near_account_id || "(not linked)"}
                                    {Number(p.user_id) === myTgId ? "  (you)" : ""}
                                </div>
                            ))}
                        </div>

                        <button
                            style={{ marginTop: 12, fontWeight: 900 }}
                            disabled={!ready}
                            onClick={() => onMatched({ matchId })}
                            title={!ready ? "Нужно 2 игрока и привязанный near_account_id у обоих" : ""}
                        >
                            Перейти к lock NFT
                        </button>
                    </div>
                ) : null}

                {err ? (
                    <div style={{ padding: 10, borderRadius: 12, background: "rgba(120,20,20,0.7)" }}>
                        {err}
                    </div>
                ) : null}
            </div>
        </div>
    );
}