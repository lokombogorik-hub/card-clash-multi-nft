import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
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

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck }) {
    const { accountId, selector } = useWalletConnect();
    const walletAddress = accountId || "";

    const [status, setStatus] = useState("idle");
    const [error, setError] = useState("");
    const [matchId, setMatchId] = useState("");

    const escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
    const nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

    const deckTokenIds = useMemo(() => {
        if (!Array.isArray(playerDeck)) return [];
        return playerDeck.map((c) => c.token_id || c.tokenId || "").filter(Boolean);
    }, [playerDeck]);

    useEffect(() => {
        if (!open) {
            setStatus("idle");
            setError("");
            setMatchId("");
        }
    }, [open]);

    const handleLock = async () => {
        if (!walletAddress) {
            setError("Wallet not connected");
            return;
        }

        if (!escrowContractId || !nftContractId) {
            setError("Escrow or NFT contract not configured");
            return;
        }

        if (deckTokenIds.length !== 5) {
            setError("Deck must have exactly 5 cards");
            return;
        }

        setStatus("loading");
        setError("");

        try {
            // 1) Check NFT ownership
            const owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            const ownedIds = new Set(owned.map((t) => t.token_id));

            const missing = deckTokenIds.filter((id) => !ownedIds.has(id));
            if (missing.length > 0) {
                throw new Error(`Missing NFTs: ${missing.join(", ")}`);
            }

            // 2) Create match on backend
            const token = getStoredToken();
            const createRes = await apiFetch("/api/matches/create", {
                method: "POST",
                token,
                body: JSON.stringify({
                    player1_id: me?.id || null,
                    mode: "pvp",
                }),
            });

            const newMatchId = createRes?.match_id || createRes?.matchId || "";
            if (!newMatchId) throw new Error("Backend didn't return match_id");

            setMatchId(newMatchId);

            // 3) Transfer NFTs to escrow via nft_transfer_call
            if (!selector) throw new Error("Wallet selector not initialized");
            const wallet = await selector.wallet();
            if (!wallet) throw new Error("Wallet not available");

            const actions = deckTokenIds.map((tokenId) => ({
                type: "FunctionCall",
                params: {
                    methodName: "nft_transfer_call",
                    args: {
                        receiver_id: escrowContractId,
                        token_id: tokenId,
                        msg: JSON.stringify({ match_id: newMatchId }),
                    },
                    gas: "100000000000000",
                    deposit: "1",
                },
            }));

            await wallet.signAndSendTransaction({
                receiverId: nftContractId,
                actions,
            });

            setStatus("success");
            setTimeout(() => {
                onReady?.({ matchId: newMatchId });
            }, 1000);
        } catch (err) {
            console.error("[LockEscrow] error:", err);
            setError(String(err?.message || err));
            setStatus("error");
        }
    };

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "rgba(0,0,0,0.85)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 20,
                    padding: "28px 24px",
                    maxWidth: 400,
                    width: "100%",
                    textAlign: "center",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h3 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#fff" }}>
                    Lock NFTs in Escrow
                </h3>

                {status === "idle" && (
                    <>
                        <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.7, color: "#a0d8ff" }}>
                            This will lock your 5 NFTs in the escrow contract.
                            <br />
                            Winner takes 1 NFT from loser.
                        </p>
                        <button
                            onClick={handleLock}
                            style={{
                                width: "100%",
                                padding: "14px 20px",
                                borderRadius: 14,
                                border: "1px solid rgba(255,140,0,0.4)",
                                background: "linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))",
                                color: "#fff",
                                fontSize: 16,
                                fontWeight: 900,
                                cursor: "pointer",
                            }}
                        >
                            🔒 Lock & Start
                        </button>
                    </>
                )}

                {status === "loading" && (
                    <div style={{ padding: 20, color: "#fff" }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
                        <div>Locking NFTs...</div>
                    </div>
                )}

                {status === "success" && (
                    <div style={{ padding: 20, color: "#0f0" }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
                        <div>NFTs locked! Starting match...</div>
                    </div>
                )}

                {status === "error" && (
                    <div style={{ padding: 20 }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>❌</div>
                        <div style={{ color: "#ff6b6b", marginBottom: 20 }}>{error}</div>
                        <button
                            onClick={() => {
                                setStatus("idle");
                                setError("");
                            }}
                            style={{
                                padding: "10px 20px",
                                borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.2)",
                                background: "rgba(255,255,255,0.05)",
                                color: "#fff",
                                cursor: "pointer",
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 14,
                        padding: "10px 20px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.6)",
                        fontSize: 13,
                        cursor: "pointer",
                        width: "100%",
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}