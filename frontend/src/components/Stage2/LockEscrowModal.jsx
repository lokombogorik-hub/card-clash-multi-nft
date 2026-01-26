import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api.js";
import { useWalletStore } from "../../store/useWalletStore";
import { nearNftTokensForOwner } from "../../libs/nearNft.js";

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
const LS_NFT_CONTRACTS_V1 = "cc_stage2_nft_contracts_v1";

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

function loadSavedContracts() {
    try {
        const raw = localStorage.getItem(LS_NFT_CONTRACTS_V1);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        return arr.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 12);
    } catch {
        return [];
    }
}

function saveContracts(list) {
    try {
        localStorage.setItem(LS_NFT_CONTRACTS_V1, JSON.stringify(list));
    } catch { }
}

function normalizeMediaUrl(media) {
    const m = String(media || "").trim();
    if (!m) return "";
    if (m.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${m.slice("ipfs://".length)}`;
    if (m.startsWith("ar://")) return `https://arweave.net/${m.slice("ar://".length)}`;
    return m;
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

    // NFT picker state
    const [savedContracts, setSavedContracts] = useState(() => loadSavedContracts());
    const [nftContractId, setNftContractId] = useState(savedContracts?.[0] || "");
    const [nftBusy, setNftBusy] = useState(false);
    const [nftErr, setNftErr] = useState("");
    const [nfts, setNfts] = useState([]);
    const [activeSlot, setActiveSlot] = useState(0);

    useEffect(() => {
        setRows(deckKeys.map((k) => loadRowFromLS(k)));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckKeys.join("|")]);

    useEffect(() => {
        // keep activeSlot in [0..4]
        if (!Array.isArray(deckKeys) || deckKeys.length === 0) return;
        if (activeSlot < 0) setActiveSlot(0);
        if (activeSlot > deckKeys.length - 1) setActiveSlot(deckKeys.length - 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deckKeys.length]);

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

    const updateRow = (idx, patch) => {
        setRows((prev) => {
            const next = prev.slice();
            next[idx] = { ...(next[idx] || { contractId: "", tokenId: "" }), ...(patch || {}) };
            const key = deckKeys[idx];
            if (key) saveRowToLS(key, next[idx]);
            return next;
        });
    };

    const pickNextSlot = () => {
        // prefer first empty slot
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i] || {};
            if (!String(r.contractId || "").trim() || !String(r.tokenId || "").trim()) return i;
        }
        return activeSlot;
    };

    const onLoadNfts = async (contractIdParam) => {
        const cid = String(contractIdParam || nftContractId || "").trim();
        setNftErr("");
        setNfts([]);

        if (!connected || !walletAddress) {
            setNftErr("Сначала подключи HOT Wallet (нужен accountId).");
            return;
        }
        if (!cid) {
            setNftErr("Укажи NFT contractId (коллекцию).");
            return;
        }

        setNftBusy(true);
        try {
            const list = await nearNftTokensForOwner({
                nftContractId: cid,
                accountId: walletAddress,
                fromIndex: "0",
                limit: 60,
            });

            setNfts(
                list.map((t) => ({
                    contractId: cid,
                    tokenId: t.token_id,
                    metadata: t.metadata || null,
                }))
            );

            // save to recent list
            setSavedContracts((prev) => {
                const next = [cid, ...(prev || [])].map((x) => String(x).trim()).filter(Boolean);
                const uniq = [];
                for (const x of next) if (!uniq.includes(x)) uniq.push(x);
                const sliced = uniq.slice(0, 12);
                saveContracts(sliced);
                return sliced;
            });
        } catch (e) {
            setNftErr(String(e?.message || e));
        } finally {
            setNftBusy(false);
        }
    };

    const onSelectNft = (item) => {
        const slot = pickNextSlot();
        // avoid duplicates in 5 slots: if already selected elsewhere, replace there
        const dupIdx = rows.findIndex(
            (r) =>
                String(r?.contractId || "").trim() === String(item.contractId || "").trim() &&
                String(r?.tokenId || "").trim() === String(item.tokenId || "").trim()
        );

        if (dupIdx !== -1 && dupIdx !== slot) {
            updateRow(dupIdx, { contractId: "", tokenId: "" });
        }

        updateRow(slot, { contractId: item.contractId, tokenId: item.tokenId });
        setActiveSlot(slot);
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch { }
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

    const selectedSet = useMemo(() => {
        const s = new Set();
        for (const r of rows || []) {
            const c = String(r?.contractId || "").trim();
            const t = String(r?.tokenId || "").trim();
            if (c && t) s.add(`${c}::${t}`);
        }
        return s;
    }, [rows]);

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
                    width: "min(920px, 96vw)",
                    maxHeight: "min(88vh, 920px)",
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
                        <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4 }}>
                            Wallet:{" "}
                            <span style={{ fontFamily: "monospace" }}>
                                {connected && walletAddress ? walletAddress : "(not connected)"}
                            </span>
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

                <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
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

                    {/* NFT picker */}
                    <div style={{ display: "grid", gap: 10 }}>
                        <div style={{ fontWeight: 900, fontSize: 13 }}>Pick your NFTs (from NEAR) → fill 5 slots</div>

                        <div style={{ display: "grid", gap: 8 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                <input
                                    value={nftContractId}
                                    onChange={(e) => setNftContractId(e.target.value)}
                                    placeholder="NFT contractId (collection) e.g. coolcats.near"
                                    style={{
                                        flex: "1 1 320px",
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
                                    onClick={() => onLoadNfts()}
                                    disabled={nftBusy || !String(nftContractId || "").trim()}
                                    style={{
                                        padding: "10px 12px",
                                        borderRadius: 12,
                                        background: "rgba(255,255,255,0.08)",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        color: "#fff",
                                        fontWeight: 900,
                                        opacity: nftBusy ? 0.8 : 1,
                                    }}
                                >
                                    {nftBusy ? "Loading..." : "Load NFTs"}
                                </button>
                            </div>

                            {savedContracts?.length ? (
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {savedContracts.map((cid) => (
                                        <button
                                            key={cid}
                                            onClick={() => {
                                                setNftContractId(cid);
                                                onLoadNfts(cid);
                                            }}
                                            disabled={nftBusy}
                                            style={{
                                                padding: "6px 10px",
                                                borderRadius: 999,
                                                background: "rgba(255,255,255,0.06)",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                color: "#fff",
                                                fontFamily: "monospace",
                                                fontSize: 12,
                                                cursor: "pointer",
                                                opacity: nftBusy ? 0.7 : 1,
                                            }}
                                            title="Load from recent"
                                        >
                                            {short(cid)}
                                        </button>
                                    ))}
                                </div>
                            ) : null}

                            {nftErr ? (
                                <div style={{ padding: 10, borderRadius: 12, background: "rgba(120,20,20,0.75)", border: "1px solid rgba(255,255,255,0.12)", fontSize: 12 }}>
                                    {nftErr}
                                </div>
                            ) : null}

                            {/* slots */}
                            <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontWeight: 900, fontSize: 13 }}>Slots (click to choose active)</div>
                                <div style={{ display: "grid", gap: 8 }}>
                                    {deckKeys.map((k, idx) => {
                                        const r = rows[idx] || { contractId: "", tokenId: "" };
                                        const isActive = idx === activeSlot;
                                        return (
                                            <div
                                                key={k}
                                                onClick={() => setActiveSlot(idx)}
                                                style={{
                                                    display: "grid",
                                                    gridTemplateColumns: "auto 1fr auto",
                                                    gap: 10,
                                                    alignItems: "center",
                                                    padding: 10,
                                                    borderRadius: 12,
                                                    border: isActive ? "1px solid rgba(124,58,237,0.75)" : "1px solid rgba(255,255,255,0.12)",
                                                    background: isActive ? "rgba(124,58,237,0.14)" : "rgba(0,0,0,0.25)",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <div style={{ fontFamily: "monospace", opacity: 0.9 }}>#{idx + 1}</div>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.95, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                        {r.contractId ? r.contractId : "(empty)"} {r.tokenId ? ` • ${r.tokenId}` : ""}
                                                    </div>
                                                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                                                        Active slot: {isActive ? "yes" : "no"}
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        updateRow(idx, { contractId: "", tokenId: "" });
                                                    }}
                                                    disabled={busy || nftBusy}
                                                    style={{
                                                        padding: "8px 10px",
                                                        borderRadius: 10,
                                                        background: "rgba(255,255,255,0.06)",
                                                        border: "1px solid rgba(255,255,255,0.12)",
                                                        color: "#fff",
                                                        fontWeight: 900,
                                                        cursor: "pointer",
                                                        opacity: busy || nftBusy ? 0.7 : 1,
                                                    }}
                                                    title="Clear slot"
                                                >
                                                    Clear
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* NFT grid */}
                            <div style={{ display: "grid", gap: 8 }}>
                                <div style={{ fontWeight: 900, fontSize: 13 }}>
                                    NFTs in collection:{" "}
                                    <span style={{ fontFamily: "monospace" }}>
                                        {String(nftContractId || "").trim() ? short(String(nftContractId).trim()) : "(not set)"}
                                    </span>{" "}
                                    • found:{" "}
                                    <span style={{ fontFamily: "monospace" }}>{nfts.length}</span>
                                </div>

                                {nfts.length ? (
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                                            gap: 10,
                                        }}
                                    >
                                        {nfts.map((it) => {
                                            const media = normalizeMediaUrl(it?.metadata?.media);
                                            const title = String(it?.metadata?.title || it?.tokenId || "");
                                            const key = `${it.contractId}::${it.tokenId}`;
                                            const selected = selectedSet.has(key);

                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => onSelectNft(it)}
                                                    disabled={busy}
                                                    style={{
                                                        textAlign: "left",
                                                        padding: 10,
                                                        borderRadius: 14,
                                                        border: selected ? "1px solid rgba(34,197,94,0.75)" : "1px solid rgba(255,255,255,0.12)",
                                                        background: selected ? "rgba(34,197,94,0.12)" : "rgba(0,0,0,0.32)",
                                                        color: "#fff",
                                                        cursor: "pointer",
                                                        opacity: busy ? 0.7 : 1,
                                                        display: "grid",
                                                        gap: 8,
                                                    }}
                                                    title={`Select ${it.contractId} #${it.tokenId}`}
                                                >
                                                    <div
                                                        style={{
                                                            width: "100%",
                                                            aspectRatio: "1 / 1",
                                                            borderRadius: 12,
                                                            overflow: "hidden",
                                                            background: "rgba(255,255,255,0.06)",
                                                            border: "1px solid rgba(255,255,255,0.10)",
                                                            display: "grid",
                                                            placeItems: "center",
                                                        }}
                                                    >
                                                        {media ? (
                                                            <img
                                                                src={media}
                                                                alt=""
                                                                draggable="false"
                                                                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                                                onError={(e) => {
                                                                    try {
                                                                        e.currentTarget.style.display = "none";
                                                                    } catch { }
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{ fontFamily: "monospace", opacity: 0.65, fontSize: 12 }}>
                                                                no media
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 900, fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                            {title || `Token ${it.tokenId}`}
                                                        </div>
                                                        <div style={{ fontFamily: "monospace", fontSize: 11, opacity: 0.75 }}>
                                                            {it.tokenId}
                                                        </div>
                                                        <div style={{ fontSize: 11, opacity: 0.7 }}>
                                                            fills slot #{(pickNextSlot() || 0) + 1}
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, opacity: 0.8 }}>
                                        Нажми <b>Load NFTs</b> (контракт должен поддерживать <span style={{ fontFamily: "monospace" }}>nft_tokens_for_owner</span>).
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Lock */}
                    <div style={{ display: "grid", gap: 8 }}>
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