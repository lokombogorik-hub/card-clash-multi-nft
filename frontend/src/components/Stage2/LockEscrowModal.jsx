import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck }) {
    var ctx = useWalletConnect();
    var walletAddress = ctx.accountId || "";

    var [status, setStatus] = useState("idle");
    var [error, setError] = useState("");
    var [matchId, setMatchId] = useState("");

    var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
    var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

    var deckTokenIds = useMemo(function () {
        if (!Array.isArray(playerDeck)) return [];
        return playerDeck.map(function (c) { return c.token_id || c.tokenId || ""; }).filter(Boolean);
    }, [playerDeck]);

    useEffect(function () {
        if (!open) {
            setStatus("idle");
            setError("");
            setMatchId("");
        }
    }, [open]);

    var handleLock = async function () {
        if (!walletAddress) {
            setError("Wallet not connected");
            return;
        }

        if (!escrowContractId) {
            setError("Escrow contract not configured (VITE_NEAR_ESCROW_CONTRACT_ID is empty). Deploy escrow first.");
            return;
        }

        if (!nftContractId) {
            setError("NFT contract not configured");
            return;
        }

        if (deckTokenIds.length !== 5) {
            setError("Deck must have exactly 5 cards");
            return;
        }

        setStatus("loading");
        setError("");

        try {
            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedIds = new Set(owned.map(function (t) { return t.token_id; }));

            var missing = deckTokenIds.filter(function (id) { return !ownedIds.has(id); });
            if (missing.length > 0) {
                throw new Error("Missing NFTs: " + missing.join(", "));
            }

            var token = getStoredToken();
            var createRes = await apiFetch("/api/matches/create", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    player1_id: me?.id || null,
                    mode: "pvp",
                }),
            });

            var newMatchId = createRes?.match_id || createRes?.matchId || "";
            if (!newMatchId) throw new Error("Backend didn't return match_id");

            setMatchId(newMatchId);

            if (!ctx.selector) throw new Error("Wallet selector not initialized");
            var wallet = await ctx.selector.wallet();
            if (!wallet) throw new Error("Wallet not available");

            var actions = deckTokenIds.map(function (tokenId) {
                return {
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
                };
            });

            await wallet.signAndSendTransaction({
                receiverId: nftContractId,
                actions: actions,
            });

            setStatus("success");
            setTimeout(function () {
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
                position: "fixed", inset: 0, zIndex: 99999,
                background: "rgba(0,0,0,0.85)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 20, padding: "28px 24px",
                    maxWidth: 400, width: "100%", textAlign: "center",
                }}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <h3 style={{ margin: "0 0 12px", fontSize: 20, fontWeight: 900, color: "#fff" }}>
                    Lock NFTs in Escrow
                </h3>

                {!escrowContractId && (
                    <div style={{
                        margin: "0 0 16px", padding: 12, borderRadius: 10,
                        background: "rgba(255,200,0,0.12)", border: "1px solid rgba(255,200,0,0.35)",
                        color: "#ffd700", fontSize: 12, lineHeight: 1.5,
                    }}>
                        ⚠️ Escrow contract is NOT deployed yet.
                        <br />Set VITE_NEAR_ESCROW_CONTRACT_ID to enable on-chain NFT lock.
                    </div>
                )}

                {status === "idle" && (
                    <>
                        <p style={{ margin: "0 0 20px", fontSize: 13, opacity: 0.7, color: "#a0d8ff" }}>
                            This will lock your 5 NFTs in the escrow contract.
                            <br />Winner takes 1 NFT from loser.
                        </p>
                        <button
                            onClick={handleLock}
                            disabled={!escrowContractId}
                            style={{
                                width: "100%", padding: "14px 20px", borderRadius: 14,
                                border: "1px solid rgba(255,140,0,0.4)",
                                background: escrowContractId
                                    ? "linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))"
                                    : "rgba(255,255,255,0.05)",
                                color: "#fff", fontSize: 16, fontWeight: 900,
                                cursor: escrowContractId ? "pointer" : "not-allowed",
                                opacity: escrowContractId ? 1 : 0.5,
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
                        <div style={{ color: "#ff6b6b", marginBottom: 20, wordBreak: "break-word" }}>{error}</div>
                        <button
                            onClick={function () { setStatus("idle"); setError(""); }}
                            style={{
                                padding: "10px 20px", borderRadius: 10,
                                border: "1px solid rgba(255,255,255,0.2)",
                                background: "rgba(255,255,255,0.05)", color: "#fff", cursor: "pointer",
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 14, padding: "10px 20px", borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.6)", fontSize: 13, cursor: "pointer", width: "100%",
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}