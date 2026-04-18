import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

function withMobileTxTimeout(promise, timeoutMs) {
    var ms = timeoutMs || 120000;
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            reject(new Error(
                "TX_TIMEOUT: Wallet did not respond in " + (ms / 1000) + "s. " +
                "If you signed in wallet app — check match status."
            ));
        }, ms);
        promise.then(function (r) {
            clearTimeout(timer);
            resolve(r);
        }).catch(function (e) {
            clearTimeout(timer);
            reject(e);
        });
    });
}

function retryAsync(fn, retries, delayMs) {
    return fn().catch(function (err) {
        if (retries <= 0) throw err;
        return new Promise(function (resolve) {
            setTimeout(resolve, delayMs || 700);
        }).then(function () {
            return retryAsync(fn, retries - 1, delayMs);
        });
    });
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck, matchId: existingMatchId }) {
    var ctx = useWalletConnect();
    var walletAddress = ctx.accountId || "";

    var [status, setStatus] = useState("idle");
    var [statusText, setStatusText] = useState("");
    var [error, setError] = useState("");

    // [ЕДИНСТВЕННАЯ ПРАВКА] Guard от двойного клика
    var isLockingRef = useRef(false);

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
            isLockingRef.current = false; // [ПРАВКА] Сброс при закрытии
            setStatus("idle");
            setStatusText("");
            setError("");
        }
    }, [open]);

    var handleLock = useCallback(async function () {
        // [ПРАВКА] Guard
        if (isLockingRef.current) {
            console.warn("[LockEscrow] already locking, skip");
            return;
        }
        if (status === "loading" || status === "success") {
            console.warn("[LockEscrow] wrong status, skip");
            return;
        }

        isLockingRef.current = true; // [ПРАВКА] Ставим guard ДО await

        if (!walletAddress) {
            setError("Wallet not connected. AccountId: " + (ctx.accountId || "null"));
            isLockingRef.current = false;
            return;
        }
        if (!escrowContractId) {
            setError("Escrow contract not configured (VITE_NEAR_ESCROW_CONTRACT_ID)");
            isLockingRef.current = false;
            return;
        }
        if (!nftContractId) {
            setError("NFT contract not configured (VITE_NEAR_NFT_CONTRACT_ID)");
            isLockingRef.current = false;
            return;
        }
        if (deckTokenIds.length !== 5) {
            setError("Deck must have 5 cards. Have: " + deckTokenIds.length);
            isLockingRef.current = false;
            return;
        }
        if (!existingMatchId) {
            setError("No match ID provided");
            isLockingRef.current = false;
            return;
        }

        setStatus("loading");
        setStatusText("Checking NFT ownership...");
        setError("");

        try {
            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedIds = new Set(owned.map(function (t) { return t.token_id; }));
            var missing = deckTokenIds.filter(function (id) { return !ownedIds.has(id); });
            if (missing.length > 0) {
                throw new Error("You don't own these NFTs: " + missing.join(", "));
            }

            setStatusText("Opening wallet...");

            setStatusText("Opening wallet...");

            // PATCH: Ждём selector до 5 секунд (на мобилке после redirect он появляется с задержкой)
            var maxWait = 5000;
            var waited = 0;
            var interval = 200;
            while (!ctx.selector && waited < maxWait) {
                await new Promise(function (r) { setTimeout(r, interval); });
                waited += interval;
            }

            if (!ctx.selector) {
                throw new Error("Selector not ready after " + (maxWait / 1000) + "s. Reload page.");
            }

            var selectorState = null;
            try {
                selectorState = ctx.selector.store.getState();
            } catch (e) {
                throw new Error("Cannot read selector state: " + (e?.message || e));
            }

            var selectedWalletId = selectorState?.selectedWalletId || null;
            var isSignedIn = selectorState?.accounts?.length > 0;

            if (!isSignedIn) {
                throw new Error("Not signed in. Reconnect wallet from main screen.");
            }

            setStatusText("Getting wallet: " + (selectedWalletId || "hot-wallet") + "...");

            var wallet = null;

            // Попытка 1: selectedWalletId с retry
            if (selectedWalletId) {
                for (var attempt = 0; attempt < 3; attempt++) {
                    try {
                        wallet = await ctx.selector.wallet(selectedWalletId);
                        if (wallet) break;
                    } catch (e) {
                        console.warn("[Lock] wallet(" + selectedWalletId + ") attempt " + (attempt + 1) + " failed:", e?.message);
                        if (attempt < 2) await new Promise(function (r) { setTimeout(r, 800); });
                    }
                }
            }

            // Попытка 2: hot-wallet fallback
            if (!wallet) {
                for (var attempt = 0; attempt < 3; attempt++) {
                    try {
                        wallet = await ctx.selector.wallet("hot-wallet");
                        if (wallet) break;
                    } catch (e) {
                        console.warn("[Lock] hot-wallet attempt " + (attempt + 1) + " failed:", e?.message);
                        if (attempt < 2) await new Promise(function (r) { setTimeout(r, 800); });
                    }
                }
            }

            if (!wallet) {
                throw new Error("Cannot get wallet after 6 attempts. Reload page and reconnect.");
            }

            if (!wallet) {
                try {
                    wallet = await retryAsync(
                        function () { return ctx.selector.wallet("hot-wallet"); },
                        2,
                        600
                    );
                } catch (e) {
                    walletError = (walletError ? walletError + " | " : "") +
                        "hot-wallet failed after retries: " + (e?.message || e);
                    console.warn("[LockEscrow]", walletError);
                }
            }

            if (!wallet) {
                throw new Error(
                    "Cannot get wallet. " + (walletError || "Unknown error") +
                    ". Try reconnecting wallet from main screen."
                );
            }

            setStatusText("Sending " + deckTokenIds.length + " NFTs to escrow...");

            var actions = deckTokenIds.map(function (tokenId) {
                return {
                    type: "FunctionCall",
                    params: {
                        methodName: "nft_transfer",
                        args: {
                            receiver_id: escrowContractId,
                            token_id: String(tokenId),
                            memo: null,
                        },
                        gas: "30000000000000",
                        deposit: "1",
                    },
                };
            });

            var txResult;
            try {
                txResult = await withMobileTxTimeout(
                    wallet.signAndSendTransaction({
                        receiverId: nftContractId,
                        actions: actions,
                    }),
                    120000
                );
                console.warn("[LockEscrow] TX result:", txResult);
            } catch (txErr) {
                console.error("[LockEscrow] TX error:", txErr?.message, txErr);

                if (txErr.message && txErr.message.indexOf("TX_TIMEOUT") === 0) {
                    setStatusText("Wallet redirect detected, checking backend...");
                    console.warn("[LockEscrow] TX_TIMEOUT — proceeding to backend check");
                } else {
                    throw txErr;
                }
            }

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

            setStatusText("Confirming escrow...");

            await apiFetch("/api/matches/" + existingMatchId + "/confirm_escrow", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    player_id: String(me?.id || ""),
                    token_ids: deckTokenIds,
                    near_wallet: walletAddress,
                }),
            });

            setStatus("success");
            setStatusText("NFTs locked!");

            setTimeout(function () {
                onReady?.({ matchId: existingMatchId });
            }, 800);

        } catch (err) {
            console.error("[LockEscrow] error:", err);

            var userMessage = String(err?.message || err);

            if (
                userMessage.includes("User rejected") ||
                userMessage.includes("user rejected") ||
                userMessage.toLowerCase().includes("rejected") ||
                userMessage.toLowerCase().includes("cancelled") ||
                userMessage.toLowerCase().includes("canceled")
            ) {
                userMessage = "❌ Transaction rejected in wallet. Please try again.";
            } else if (userMessage.indexOf("TX_TIMEOUT") === 0) {
                userMessage = "⏱ Wallet did not respond. If you signed in wallet app — tap Try Again to check status.";
            } else if (userMessage.includes("Кошелёк не определён") || userMessage.includes("Cannot get wallet")) {
                userMessage = "🔌 Wallet disconnected. Please reload the page and reconnect.";
            }

            setError(userMessage);
            setStatus("error");

        } finally {
            isLockingRef.current = false; // [ПРАВКА] Снимаем guard
        }

    }, [
        status, walletAddress, escrowContractId, nftContractId,
        deckTokenIds, deckImages, existingMatchId, ctx, me, onReady
    ]);

    if (!open) return null;

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

                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 12 }}>
                                {topCards.map(function (card, i) {
                                    return (
                                        <div key={card?.token_id || card?.tokenId || i} style={{
                                            width: 80, height: 110, borderRadius: 12, overflow: "hidden",
                                            border: "3px solid rgba(255,215,0,0.6)",
                                            boxShadow: "0 4px 15px rgba(255,215,0,0.25)",
                                        }}>
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
                            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                                {bottomCards.map(function (card, i) {
                                    return (
                                        <div key={card?.token_id || card?.tokenId || (i + 3)} style={{
                                            width: 80, height: 110, borderRadius: 12, overflow: "hidden",
                                            border: "3px solid rgba(255,215,0,0.6)",
                                            boxShadow: "0 4px 15px rgba(255,215,0,0.25)",
                                        }}>
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

                        <div style={{
                            fontSize: 11, opacity: 0.5, marginBottom: 20,
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.03)", borderRadius: 10,
                        }}>
                            Match: {existingMatchId?.slice(0, 12)}...
                            <br />
                            Escrow: {escrowContractId}
                            <br />
                            Wallet: {walletAddress?.slice(0, 16)}...
                        </div>

                        <button
                            onClick={handleLock}
                            disabled={status === "loading" || status === "success"}
                            style={{
                                width: "100%", padding: "16px 24px", borderRadius: 16,
                                border: "none",
                                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                                color: "#000", fontSize: 18, fontWeight: 900,
                                cursor: "pointer",
                                boxShadow: "0 6px 25px rgba(255,215,0,0.4)",
                                opacity: (status === "loading" || status === "success") ? 0.5 : 1,
                                pointerEvents: (status === "loading" || status === "success") ? "none" : "auto",
                            }}
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
                            fontSize: 12, opacity: 0.6,
                            padding: "10px 14px",
                            background: "rgba(255,255,255,0.05)", borderRadius: 10,
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
                            color: "#ff6b6b", marginBottom: 24,
                            wordBreak: "break-word", fontSize: 13,
                            padding: "14px 16px",
                            background: "rgba(255,100,100,0.12)", borderRadius: 12,
                            lineHeight: 1.6, textAlign: "left",
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