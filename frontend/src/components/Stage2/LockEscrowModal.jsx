import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api.js";
import { useWalletStore } from "../../store/walletStore";

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

function short(s) {
    if (!s) return "";
    if (s.length <= 14) return s;
    return `${s.slice(0, 8)}…${s.slice(-5)}`;
}

const LS_MAP_PREFIX = "cc_stage2_deposit_map_v1:";

function loadRowFromLS(cardKey) {
    try {
        const raw = localStorage.getItem(LS_MAP_PREFIX + cardKey);
        if (!raw) return { contractId: "", tokenId: "" };
        const j = JSON.parse(raw);
        return { contractId: j.contractId || "", tokenId: j.tokenId || "" };
    } catch {
        return { contractId: "", tokenId: "" };
    }
}

function saveRowToLS(cardKey, row) {
    try {
        localStorage.setItem(LS_MAP_PREFIX + cardKey, JSON.stringify(row));
    } catch { }
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck }) {
    const { connected, walletAddress, escrowContractId, nftTransferCall } = useWalletStore();

    const token = useMemo(() => getStoredToken(), []);
    const myTgId = me?.id ? Number(me.id) : 0;

    const [matchId, setMatchId] = useState("");
    const [match, setMatch] = useState(null);

    const [joinId, setJoinId] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const deckKeys = useMemo(() => {
        if (!Array.isArray(playerDeck)) return [];
        return playerDeck.map((c, idx) => String(c?.key || c?.tokenId || c?.id || `deck_${idx}`));
    }, [playerDeck]);

    const [rows, setRows] = useState(() => deckKeys.map((k) => loadRowFromLS(k)));

    useEffect(() => {
        setRows(deckKeys.map((k) => loadRowFromLS(k)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckKeys.join("|")]);

    const refreshMatch = async (id) => {
        const mid = (id || matchId || "").trim();
        if (!mid) return;
        const m = await apiFetch(`/api/matches/${mid}`, { token: token || getStoredToken() });
        setMatch(m);
    };

    useEffect(() => {
        if (!open) return;
        setErr("");

        const run = async () => {
            setBusy(true);
            try {
                const r = await apiFetch("/api/matches/create", {
                    method: "POST",
                    token: token || getStoredToken(),
                    body: JSON.stringify({}),
                });
                setMatchId(r?.matchId || "");
                setMatch(null);
                if (r?.matchId) await refreshMatch(r.matchId);
            } catch (e) {
                setErr(String(e?.message || e));
            } finally {
                setBusy(false);
            }
        };

        run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const players = match?.players || [];
    const mePlayer = players.find((p) => Number(p.user_id) === myTgId) || null;
    const mySide = mePlayer?.side || "";
    const playerA = players.find((p) => p.side === "A")?.near_account_id || "";
    const playerB = players.find((p) => p.side === "B")?.near_account_id || "";
    const bothPlayersReady = Boolean(playerA && playerB && players.length === 2);

    const canLock =
        open &&
        connected &&
        walletAddress &&
        escrowContractId &&
        matchId &&
        bothPlayersReady &&
        Array.isArray(rows) &&
        rows.length === 5 &&
        rows.every((r) => r.contractId.trim() && r.tokenId.trim()) &&
        (mySide === "A" || mySide === "B");

    const onJoin = async () => {
        const id = joinId.trim();
        if (!id) return;
        setErr("");
        setBusy(true);
        try {
            await apiFetch(`/api/matches/${id}/join`, {
                method: "POST",
                token: token || getStoredToken(),
            });
            setMatchId(id);
            await refreshMatch(id);
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    const onLock = async () => {
        if (!canLock) return;
        setErr("");
        setBusy(true);

        try {
            for (let i = 0; i < rows.length; i++) {
                const r = rows[i];

                const { txHash } = await nftTransferCall({
                    nftContractId: r.contractId.trim(),
                    tokenId: r.tokenId.trim(),
                    matchId,
                    side: mySide,
                    playerA,
                    playerB,
                });

                await apiFetch(`/api/matches/${matchId}/deposit`, {
                    method: "POST",
                    token: token || getStoredToken(),
                    body: JSON.stringify({
                        nft_contract_id: r.contractId.trim(),
                        token_id: r.tokenId.trim(),
                        tx_hash: txHash || null,
                    }),
                });
            }

            await refreshMatch(matchId);
            onReady?.({ matchId });
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 25000,
                background: "rgba(0,0,0,0.72)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 14,
            }}
        >
            <div
                style={{
                    width: "min(820px, 96vw)",
                    maxHeight: "min(86vh, 820px)",
                    overflow: "auto",
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(10,10,14,0.92)",
                    color: "#fff",
                    padding: 14,
                    backdropFilter: "blur(10px)",
                }}
            >
                <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Stage2 • Lock 5 NFTs to Escrow</div>
                        <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
                            Escrow: <span style={{ fontFamily: "monospace" }}>{escrowContractId || "(not set)"}</span>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={busy}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            fontWeight: 800,
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.10)",
                            }}
                        >
                            Match: <span style={{ fontFamily: "monospace" }}>{matchId ? short(matchId) : "…"}</span>
                        </div>

                        <button
                            onClick={() => refreshMatch(matchId)}
                            disabled={busy || !matchId}
                            style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.10)",
                                color: "#fff",
                                fontWeight: 800,
                            }}
                        >
                            Refresh
                        </button>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Players</div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                            Your TG id: <span style={{ fontFamily: "monospace" }}>{myTgId || "?"}</span> • side:{" "}
                            <span style={{ fontFamily: "monospace" }}>{mySide || "?"}</span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                            A: <span style={{ fontFamily: "monospace" }}>{playerA || "(not linked)"}</span>
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.9 }}>
                            B: <span style={{ fontFamily: "monospace" }}>{playerB || "(not linked)"}</span>
                        </div>
                        {!bothPlayersReady ? (
                            <div style={{ fontSize: 12, opacity: 0.85 }}>
                                Нужно 2 игрока и у обоих должен быть привязан near_account_id (через WalletConnector).
                                <br />
                                Скопируй matchId и отправь другу, пусть он нажмёт Join.
                            </div>
                        ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <input
                            value={joinId}
                            onChange={(e) => setJoinId(e.target.value)}
                            placeholder="Enter matchId to join"
                            style={{
                                flex: "1 1 240px",
                                padding: "10px 10px",
                                borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.14)",
                                background: "rgba(0,0,0,0.35)",
                                color: "#fff",
                                outline: "none",
                                fontFamily: "monospace",
                            }}
                        />
                        <button
                            onClick={onJoin}
                            disabled={busy || !joinId.trim()}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontWeight: 900,
                            }}
                        >
                            Join
                        </button>
                    </div>

                    <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Lock 5 NFTs (contractId + tokenId)</div>
                        <div style={{ fontSize: 12, opacity: 0.85 }}>
                            Пока deck моковый — contractId/tokenId вводим вручную (свои реальные NFT на NEAR). Сохраняется локально.
                        </div>

                        <div style={{ display: "grid", gap: 8 }}>
                            {deckKeys.map((k, idx) => (
                                <div key={k} style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
                                    <input
                                        value={rows[idx]?.contractId || ""}
                                        onChange={(e) => {
                                            const next = rows.slice();
                                            next[idx] = { ...(next[idx] || {}), contractId: e.target.value };
                                            setRows(next);
                                            saveRowToLS(k, next[idx]);
                                        }}
                                        placeholder="nft contract (e.g. coolcats.near)"
                                        style={{
                                            padding: "10px 10px",
                                            borderRadius: 12,
                                            border: "1px solid rgba(255,255,255,0.14)",
                                            background: "rgba(0,0,0,0.35)",
                                            color: "#fff",
                                            outline: "none",
                                            fontFamily: "monospace",
                                        }}
                                    />
                                    <input
                                        value={rows[idx]?.tokenId || ""}
                                        onChange={(e) => {
                                            const next = rows.slice();
                                            next[idx] = { ...(next[idx] || {}), tokenId: e.target.value };
                                            setRows(next);
                                            saveRowToLS(k, next[idx]);
                                        }}
                                        placeholder="token_id"
                                        style={{
                                            padding: "10px 10px",
                                            borderRadius: 12,
                                            border: "1px solid rgba(255,255,255,0.14)",
                                            background: "rgba(0,0,0,0.35)",
                                            color: "#fff",
                                            outline: "none",
                                            fontFamily: "monospace",
                                        }}
                                    />
                                    <div style={{ opacity: 0.8, fontSize: 12, fontFamily: "monospace" }}>#{idx + 1}</div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={onLock}
                            disabled={!canLock || busy}
                            style={{
                                padding: "12px 14px",
                                borderRadius: 14,
                                background: canLock ? "linear-gradient(90deg,#2563eb,#7c3aed)" : "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.14)",
                                color: "#fff",
                                fontWeight: 900,
                                opacity: busy ? 0.8 : 1,
                            }}
                        >
                            {busy ? "Locking..." : "Lock 5 NFTs (nft_transfer_call)"}
                        </button>

                        {err ? (
                            <div style={{ padding: 10, borderRadius: 12, background: "rgba(120,20,20,0.75)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}>
                                {err}
                            </div>
                        ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
                        <button
                            onClick={() => onReady?.({ matchId })}
                            disabled={!matchId || busy}
                            style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(255,255,255,0.08)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontWeight: 900,
                            }}
                        >
                            Continue to Game
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}