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

const LS_NFT_CONTRACTS_V1 = "cc_stage2_nft_contracts_v1";

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
    const { connected, accountId, escrowContractId, nftTransferCall } = useWalletStore();

    const token = useMemo(() => getStoredToken(), []);
    const myTgId = me?.id ? Number(me.id) : 0;

    const [step, setStep] = useState(1); // 1: matchmaking, 2: pick NFTs, 3: locking
    const [matchId, setMatchId] = useState("");
    const [match, setMatch] = useState(null);
    const [joinId, setJoinId] = useState("");

    const [selectedNfts, setSelectedNfts] = useState([]); // array of 5 NFT objects
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    // NFT picker
    const [savedContracts, setSavedContracts] = useState(() => loadSavedContracts());
    const [nftContractId, setNftContractId] = useState(savedContracts?.[0] || "");
    const [nftBusy, setNftBusy] = useState(false);
    const [nftErr, setNftErr] = useState("");
    const [nfts, setNfts] = useState([]);

    const refreshMatch = async (id) => {
        const mid = (id || matchId || "").trim();
        if (!mid) return;
        const m = await apiFetch(`/api/matches/${mid}`, { token: token || getStoredToken() });
        setMatch(m);
    };

    // Create match on open
    useEffect(() => {
        if (!open) return;
        setErr("");
        setStep(1);
        setSelectedNfts([]);

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

    const onLoadNfts = async (contractIdParam) => {
        const cid = String(contractIdParam || nftContractId || "").trim();
        setNftErr("");
        setNfts([]);

        if (!connected || !accountId) {
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
                accountId: accountId,
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
        const key = `${item.contractId}::${item.tokenId}`;

        // Check if already selected
        const alreadyIdx = selectedNfts.findIndex((n) => `${n.contractId}::${n.tokenId}` === key);

        if (alreadyIdx !== -1) {
            // Deselect
            setSelectedNfts((prev) => prev.filter((_, i) => i !== alreadyIdx));
        } else {
            // Select (max 5)
            if (selectedNfts.length >= 5) {
                setErr("Максимум 5 NFT. Сначала убери одну карту.");
                return;
            }
            setSelectedNfts((prev) => [...prev, item]);
            setErr("");
        }

        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch { }
    };

    const onRemoveNft = (idx) => {
        setSelectedNfts((prev) => prev.filter((_, i) => i !== idx));
    };

    const canProceedToLock = bothPlayersReady && selectedNfts.length === 5;

    const onLock = async () => {
        if (!canProceedToLock) return;
        setErr("");
        setBusy(true);
        setStep(3);

        try {
            for (let i = 0; i < selectedNfts.length; i++) {
                const nft = selectedNfts[i];

                const { txHash } = await nftTransferCall({
                    nftContractId: nft.contractId.trim(),
                    tokenId: nft.tokenId.trim(),
                    matchId,
                    side: mySide,
                    playerA,
                    playerB,
                });

                await apiFetch(`/api/matches/${matchId}/deposit`, {
                    method: "POST",
                    token: token || getStoredToken(),
                    body: JSON.stringify({
                        nft_contract_id: nft.contractId.trim(),
                        token_id: nft.tokenId.trim(),
                        tx_hash: txHash || null,
                    }),
                });
            }

            await refreshMatch(matchId);
            onReady?.({ matchId });
        } catch (e) {
            setErr(String(e?.message || e));
            setStep(2);
        } finally {
            setBusy(false);
        }
    };

    const selectedSet = useMemo(() => {
        const s = new Set();
        for (const n of selectedNfts) {
            s.add(`${n.contractId}::${n.tokenId}`);
        }
        return s;
    }, [selectedNfts]);

    if (!open) return null;

    return (
        <div className="lock-escrow-modal-backdrop" onClick={onClose}>
            <div className="lock-escrow-modal-box" onClick={(e) => e.stopPropagation()}>
                <button className="lock-escrow-modal-close" onClick={onClose} disabled={busy}>
                    ✕
                </button>

                <h2 className="lock-escrow-modal-title">🔒 Stage2: Lock 5 NFTs</h2>

                {/* STEP 1: Matchmaking */}
                {step === 1 && (
                    <div className="lock-escrow-step">
                        <div className="lock-escrow-section">
                            <div className="lock-escrow-section-title">📋 Match Info</div>
                            <div className="lock-escrow-info-grid">
                                <div className="lock-escrow-info-item">
                                    <div className="lock-escrow-info-label">Match ID</div>
                                    <div className="lock-escrow-info-value">{matchId ? short(matchId) : "..."}</div>
                                </div>
                                <div className="lock-escrow-info-item">
                                    <div className="lock-escrow-info-label">Your Side</div>
                                    <div className="lock-escrow-info-value">{mySide || "?"}</div>
                                </div>
                                <div className="lock-escrow-info-item">
                                    <div className="lock-escrow-info-label">Player A</div>
                                    <div className="lock-escrow-info-value">{playerA ? short(playerA) : "(waiting)"}</div>
                                </div>
                                <div className="lock-escrow-info-item">
                                    <div className="lock-escrow-info-label">Player B</div>
                                    <div className="lock-escrow-info-value">{playerB ? short(playerB) : "(waiting)"}</div>
                                </div>
                            </div>
                        </div>

                        {!bothPlayersReady && (
                            <div className="lock-escrow-warning">
                                ⚠️ Нужно 2 игрока с подключённым NEAR кошельком.
                                <br />
                                Скопируй Match ID и отправь другу, пусть он нажмёт <b>Join</b>.
                            </div>
                        )}

                        <div className="lock-escrow-section">
                            <div className="lock-escrow-section-title">👥 Join Match</div>
                            <div className="lock-escrow-join-row">
                                <input
                                    value={joinId}
                                    onChange={(e) => setJoinId(e.target.value)}
                                    placeholder="Paste Match ID to join"
                                    className="lock-escrow-input"
                                />
                                <button
                                    onClick={onJoin}
                                    disabled={busy || !joinId.trim()}
                                    className="lock-escrow-btn secondary"
                                >
                                    Join
                                </button>
                            </div>
                        </div>

                        {err && <div className="lock-escrow-error">{err}</div>}

                        <div className="lock-escrow-actions">
                            <button
                                onClick={() => refreshMatch(matchId)}
                                disabled={busy || !matchId}
                                className="lock-escrow-btn secondary"
                            >
                                Refresh Match
                            </button>
                            {bothPlayersReady && (
                                <button
                                    onClick={() => setStep(2)}
                                    disabled={busy}
                                    className="lock-escrow-btn primary"
                                >
                                    Next: Pick 5 NFTs →
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* STEP 2: Pick NFTs */}
                {step === 2 && (
                    <div className="lock-escrow-step">
                        {/* Selected NFTs (5 slots) */}
                        <div className="lock-escrow-section">
                            <div className="lock-escrow-section-title">
                                🎴 Selected NFTs ({selectedNfts.length}/5)
                            </div>

                            <div className="lock-escrow-selected-grid">
                                {Array.from({ length: 5 }, (_, i) => {
                                    const nft = selectedNfts[i];
                                    if (!nft) {
                                        return (
                                            <div key={i} className="lock-escrow-slot empty">
                                                <div className="lock-escrow-slot-number">#{i + 1}</div>
                                                <div className="lock-escrow-slot-placeholder">Empty</div>
                                            </div>
                                        );
                                    }

                                    const media = normalizeMediaUrl(nft?.metadata?.media);
                                    const title = String(nft?.metadata?.title || nft?.tokenId || "");

                                    return (
                                        <div key={i} className="lock-escrow-slot filled">
                                            <button
                                                className="lock-escrow-slot-remove"
                                                onClick={() => onRemoveNft(i)}
                                                title="Remove"
                                            >
                                                ✕
                                            </button>
                                            <div className="lock-escrow-slot-number">#{i + 1}</div>
                                            <div className="lock-escrow-slot-image">
                                                {media ? (
                                                    <img
                                                        src={media}
                                                        alt={title}
                                                        draggable="false"
                                                        onError={(e) => {
                                                            try {
                                                                e.currentTarget.style.display = "none";
                                                            } catch { }
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="lock-escrow-slot-no-image">No Image</div>
                                                )}
                                            </div>
                                            <div className="lock-escrow-slot-title">{title}</div>
                                            <div className="lock-escrow-slot-id">{nft.tokenId}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* NFT Picker */}
                        <div className="lock-escrow-section">
                            <div className="lock-escrow-section-title">🔍 Pick NFTs from NEAR</div>

                            <div className="lock-escrow-picker-controls">
                                <input
                                    value={nftContractId}
                                    onChange={(e) => setNftContractId(e.target.value)}
                                    placeholder="NFT Contract ID (e.g. coolcats.near)"
                                    className="lock-escrow-input"
                                />
                                <button
                                    onClick={() => onLoadNfts()}
                                    disabled={nftBusy || !String(nftContractId || "").trim()}
                                    className="lock-escrow-btn secondary"
                                >
                                    {nftBusy ? "Loading..." : "Load NFTs"}
                                </button>
                            </div>

                            {savedContracts?.length > 0 && (
                                <div className="lock-escrow-recent">
                                    <div className="lock-escrow-recent-label">Recent collections:</div>
                                    <div className="lock-escrow-recent-chips">
                                        {savedContracts.map((cid) => (
                                            <button
                                                key={cid}
                                                onClick={() => {
                                                    setNftContractId(cid);
                                                    onLoadNfts(cid);
                                                }}
                                                disabled={nftBusy}
                                                className="lock-escrow-chip"
                                            >
                                                {short(cid)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {nftErr && <div className="lock-escrow-error">{nftErr}</div>}

                            {nfts.length > 0 && (
                                <div className="lock-escrow-nft-grid">
                                    {nfts.map((nft) => {
                                        const key = `${nft.contractId}::${nft.tokenId}`;
                                        const isSelected = selectedSet.has(key);
                                        const media = normalizeMediaUrl(nft?.metadata?.media);
                                        const title = String(nft?.metadata?.title || nft?.tokenId || "");

                                        return (
                                            <button
                                                key={key}
                                                onClick={() => onSelectNft(nft)}
                                                disabled={busy}
                                                className={`lock-escrow-nft-card ${isSelected ? "selected" : ""}`}
                                            >
                                                <div className="lock-escrow-nft-image">
                                                    {media ? (
                                                        <img
                                                            src={media}
                                                            alt={title}
                                                            draggable="false"
                                                            onError={(e) => {
                                                                try {
                                                                    e.currentTarget.style.display = "none";
                                                                } catch { }
                                                            }}
                                                        />
                                                    ) : (
                                                        <div className="lock-escrow-nft-no-image">No Image</div>
                                                    )}
                                                </div>
                                                {isSelected && (
                                                    <div className="lock-escrow-nft-check">✓</div>
                                                )}
                                                <div className="lock-escrow-nft-title">{title}</div>
                                                <div className="lock-escrow-nft-id">{nft.tokenId}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {!nfts.length && !nftBusy && (
                                <div className="lock-escrow-hint">
                                    Введи Contract ID коллекции и нажми <b>Load NFTs</b>
                                </div>
                            )}
                        </div>

                        {err && <div className="lock-escrow-error">{err}</div>}

                        <div className="lock-escrow-actions">
                            <button
                                onClick={() => setStep(1)}
                                disabled={busy}
                                className="lock-escrow-btn secondary"
                            >
                                ← Back to Match
                            </button>
                            <button
                                onClick={onLock}
                                disabled={!canProceedToLock || busy}
                                className="lock-escrow-btn primary"
                            >
                                Lock 5 NFTs & Start Game 🔒
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3: Locking */}
                {step === 3 && (
                    <div className="lock-escrow-step">
                        <div className="lock-escrow-loading">
                            <div className="lock-escrow-loading-spinner" />
                            <div className="lock-escrow-loading-text">
                                Locking NFTs to escrow...
                                <br />
                                Please confirm transactions in your NEAR wallet.
                            </div>
                        </div>
                        {err && <div className="lock-escrow-error">{err}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}