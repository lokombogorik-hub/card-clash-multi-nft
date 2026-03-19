import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck, matchId: existingMatchId }) {
    var ctx = useWalletConnect();
    var walletAddress = ctx.accountId || "";

    var [status, setStatus] = useState("idle");
    var [statusText, setStatusText] = useState("");
    var [error, setError] = useState("");

    var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
    var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

    var deckTokenIds = useMemo(function () {
        if (!Array.isArray(playerDeck)) return [];
        return playerDeck.map(function (c) { return c.token_id || c.tokenId || ""; }).filter(Boolean);
    }, [playerDeck]);

    var deckImages = useMemo(function () {
        if (!Array.isArray(playerDeck)) return [];
        return playerDeck.map(function (c) { return c.imageUrl || c.image || ""; });
    }, [playerDeck]);

    useEffect(function () {
        if (!open) {
            setStatus("idle");
            setStatusText("");
            setError("");
        }
    }, [open]);

    var handleLock = async function () {
        if (!walletAddress) {
            setError("Wallet not connected");
            return;
        }

        if (!escrowContractId) {
            setError("Escrow contract not configured");
            return;
        }

        if (!nftContractId) {
            setError("NFT contract not configured");
            return;
        }

        if (deckTokenIds.length !== 5) {
            setError("Deck must have exactly 5 cards. You have " + deckTokenIds.length);
            return;
        }

        if (!existingMatchId) {
            setError("No match ID provided");
            return;
        }

        setStatus("loading");
        setStatusText("Checking NFT ownership...");
        setError("");

        try {
            // Step 1: Verify ownership
            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedIds = new Set(owned.map(function (t) { return t.token_id; }));

            var missing = deckTokenIds.filter(function (id) { return !ownedIds.has(id); });
            if (missing.length > 0) {
                throw new Error("You don't own these NFTs: " + missing.join(", "));
            }

            // Step 2: Lock NFTs in escrow using nft_transfer (not nft_transfer_call)
            setStatusText("Locking NFTs in escrow...");

            if (!ctx.selector) throw new Error("Wallet selector not initialized");
            var wallet = await ctx.selector.wallet();
            if (!wallet) throw new Error("Wallet not available");

            // Use nft_transfer instead of nft_transfer_call
            // nft_transfer works with regular wallets (no smart contract needed)
            var actions = deckTokenIds.map(function (tokenId) {
                return {
                    type: "FunctionCall",
                    params: {
                        methodName: "nft_transfer",
                        args: {
                            receiver_id: escrowContractId,
                            token_id: tokenId,
                            memo: "CardClash match: " + existingMatchId,
                        },
                        gas: "30000000000000",
                        deposit: "1",
                    },
                };
            });

            await wallet.signAndSendTransaction({
                receiverId: nftContractId,
                actions: actions,
            });

            // Step 3: Register deposits on backend
            setStatusText("Registering deposits...");

            var token = getStoredToken();
            await apiFetch("/api/matches/" + existingMatchId + "/register_deposits", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    token_ids: deckTokenIds,
                    nft_contract_id: nftContractId,
                    images: deckImages,
                    near_wallet: walletAddress,
                }),
            });

            // Step 4: Confirm escrow
            setStatusText("Confirming...");

            await apiFetch("/api/matches/" + existingMatchId + "/confirm_escrow", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    player_id: String(me?.id || ""),
                    token_ids: deckTokenIds,
                    near_wallet: walletAddress,
                }),
            });

            // Success!
            setStatus("success");
            setStatusText("NFTs locked!");

            setTimeout(function () {
                onReady?.({ matchId: existingMatchId });
            }, 800);

        } catch (err) {
            console.error("[LockEscrow] error:", err);
            setError(String(err?.message || err));
            setStatus("error");
        }
    };

    if (!open) return null;

    // Разбиваем карты: 3 сверху, 2 снизу
    var topCards = playerDeck ? playerDeck.slice(0, 3) : [];
    var bottomCards = playerDeck ? playerDeck.slice(3, 5) : [];

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 99999,
                background: "rgba(0,0,0,0.92)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "2px solid rgba(255,215,0,0.4)",
                    borderRadius: 24, padding: "32px 28px",
                    maxWidth: 480, width: "100%", textAlign: "center",
                    boxShadow: "0 0 60px rgba(255,215,0,0.2)",
                }}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <h3 style={{ margin: "0 0 16px", fontSize: 24, fontWeight: 900, color: "#fff" }}>
                    🔒 Lock NFTs
                </h3>

                {status === "idle" && (
                    <>
                        <p style={{ margin: "0 0 20px", fontSize: 14, opacity: 0.85, color: "#a0d8ff", lineHeight: 1.5 }}>
                            Lock your 5 NFTs in escrow to start the match.
                            <br />
                            <span style={{ color: "#ffd700" }}>Winner takes 1 NFT from loser!</span>
                        </p>

                        {/* Show deck cards - 3 top + 2 bottom, BIGGER */}
                        <div style={{ marginBottom: 20 }}>
                            {/* Top row: 3 cards */}
                            <div style={{
                                display: "flex",
                                gap: 12,
                                justifyContent: "center",
                                marginBottom: 12,
                            }}>
                                {topCards.map(function (card, i) {
                                    return (
                                        <div
                                            key={card?.token_id || card?.tokenId || i}
                                            style={{
                                                width: 80,
                                                height: 110,
                                                borderRadius: 12,
                                                overflow: "hidden",
                                                border: "3px solid rgba(255,215,0,0.6)",
                                                boxShadow: "0 4px 15px rgba(255,215,0,0.25)",
                                                transition: "transform 0.2s",
                                            }}
                                        >
                                            <img
                                                src={card?.imageUrl || card?.image || "/cards/card.jpg"}
                                                alt=""
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Bottom row: 2 cards */}
                            <div style={{
                                display: "flex",
                                gap: 12,
                                justifyContent: "center",
                            }}>
                                {bottomCards.map(function (card, i) {
                                    return (
                                        <div
                                            key={card?.token_id || card?.tokenId || (i + 3)}
                                            style={{
                                                width: 80,
                                                height: 110,
                                                borderRadius: 12,
                                                overflow: "hidden",
                                                border: "3px solid rgba(255,215,0,0.6)",
                                                boxShadow: "0 4px 15px rgba(255,215,0,0.25)",
                                                transition: "transform 0.2s",
                                            }}
                                        >
                                            <img
                                                src={card?.imageUrl || card?.image || "/cards/card.jpg"}
                                                alt=""
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Match info */}
                        <div style={{
                            fontSize: 11,
                            opacity: 0.5,
                            marginBottom: 20,
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.03)",
                            borderRadius: 10,
                        }}>
                            Match ID: {existingMatchId?.slice(0, 12)}...
                            <br />
                            Escrow: {escrowContractId}
                        </div>

                        <button
                            onClick={handleLock}
                            style={{
                                width: "100%", padding: "16px 24px", borderRadius: 16,
                                border: "none",
                                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                                color: "#000", fontSize: 18, fontWeight: 900,
                                cursor: "pointer",
                                boxShadow: "0 6px 25px rgba(255,215,0,0.4)",
                                transition: "transform 0.15s, box-shadow 0.15s",
                            }}
                            onMouseOver={function (e) { e.currentTarget.style.transform = "scale(1.02)"; }}
                            onMouseOut={function (e) { e.currentTarget.style.transform = "scale(1)"; }}
                        >
                            🔒 Lock & Battle!
                        </button>
                    </>
                )}

                {status === "loading" && (
                    <div style={{ padding: 30, color: "#fff" }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
                        <div style={{ fontSize: 16, marginBottom: 10, fontWeight: 600 }}>{statusText}</div>
                        <div style={{
                            fontSize: 12,
                            opacity: 0.6,
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.05)",
                            borderRadius: 10,
                        }}>
                            Please confirm in your wallet
                        </div>
                    </div>
                )}

                {status === "success" && (
                    <div style={{ padding: 30, color: "#4ade80" }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
                        <div style={{ fontSize: 18, fontWeight: 700 }}>NFTs Locked!</div>
                        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                            Waiting for opponent...
                        </div>
                    </div>
                )}

                {status === "error" && (
                    <div style={{ padding: 24 }}>
                        <div style={{ fontSize: 40, marginBottom: 16 }}>❌</div>
                        <div style={{
                            color: "#ff6b6b",
                            marginBottom: 24,
                            wordBreak: "break-word",
                            fontSize: 14,
                            padding: "14px 16px",
                            background: "rgba(255,100,100,0.12)",
                            borderRadius: 12,
                            lineHeight: 1.5,
                        }}>
                            {error}
                        </div>
                        <button
                            onClick={function () { setStatus("idle"); setError(""); }}
                            style={{
                                padding: "12px 24px", borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.25)",
                                background: "rgba(255,255,255,0.08)", color: "#fff",
                                cursor: "pointer", fontSize: 14, fontWeight: 600,
                            }}
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {status !== "loading" && status !== "success" && (
                    <button
                        onClick={onClose}
                        style={{
                            marginTop: 16, padding: "12px 20px", borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "transparent",
                            color: "rgba(255,255,255,0.5)", fontSize: 14,
                            cursor: "pointer", width: "100%",
                        }}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}