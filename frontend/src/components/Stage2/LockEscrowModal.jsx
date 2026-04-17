import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner, invalidateOwnerCache } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

// PATCH: Timeout для мобильного кошелька.
// HOT Wallet при deep-link redirect: промис signAndSendTransaction зависает.
// TX_TIMEOUT ≠ транзакция не прошла. После timeout идём на backend-check.
function withMobileTxTimeout(promise, ms) {
    ms = ms || 90000;
    return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { reject(new Error("TX_TIMEOUT")); }, ms);
        promise.then(
            function (r) { clearTimeout(t); resolve(r); },
            function (e) { clearTimeout(t); reject(e); }
        );
    });
}

// PATCH: Retry с экспоненциальным backoff: 500 → 1000 → 2000ms
function retryAsync(fn, retries, baseMs) {
    baseMs = baseMs || 500;
    return fn().catch(function (err) {
        if (retries <= 0) throw err;
        return new Promise(function (res) { setTimeout(res, baseMs); })
            .then(function () { return retryAsync(fn, retries - 1, baseMs * 2); });
    });
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck, matchId: existingMatchId }) {
    var ctx = useWalletConnect();
    var walletAddress = ctx.accountId || "";

    var [status, setStatus] = useState("idle");
    var [statusText, setStatusText] = useState("");
    var [error, setError] = useState("");

    // PATCH: Синхронный guard против двойного вызова.
    // useRef меняется синхронно — первый клик ставит true ДО первого await.
    // Второй клик приходит и видит true — уходит немедленно.
    var isLockingRef = useRef(false);
    var didOpenCheckRef = useRef(false);

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

    // PATCH: Recovery check при открытии модала.
    // Если пользователь подписал в кошельке, приложение вернулось из redirect,
    // модал открылся заново в idle — проверяем backend:
    // если deposits уже есть → пропускаем lock → сразу success.
    useEffect(function () {
        if (!open) {
            isLockingRef.current = false;
            didOpenCheckRef.current = false;
            setStatus("idle");
            setStatusText("");
            setError("");
            return;
        }
        if (didOpenCheckRef.current || !existingMatchId) return;
        didOpenCheckRef.current = true;

        (async function () {
            try {
                var t = getStoredToken();
                var matchData = await apiFetch("/api/matches/" + existingMatchId, { token: t });
                if (!matchData) return;

                var myId = String(me?.id || "");
                var isP1 = myId && String(matchData.player1_id) === myId;
                var isP2 = myId && String(matchData.player2_id) === myId;
                var myConfirmed = isP1
                    ? matchData.player1_escrow_confirmed === true
                    : isP2
                        ? matchData.player2_escrow_confirmed === true
                        : false;

                console.warn("[LockEscrow] open check: myId=", myId,
                    "isP1=", isP1, "isP2=", isP2,
                    "myConfirmed=", myConfirmed
                );

                if (myConfirmed) {
                    console.warn("[LockEscrow] already confirmed on backend → skip lock");
                    setStatus("success");
                    setStatusText("Already locked!");
                    setTimeout(function () { onReady?.({ matchId: existingMatchId }); }, 600);
                }
            } catch (e) {
                console.warn("[LockEscrow] open check failed (non-critical):", e?.message);
            }
        })();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    var handleLock = useCallback(async function () {
        // PATCH: Двойная защита — ref (синхронно) + status (для UI)
        if (isLockingRef.current) {
            console.warn("[LockEscrow] GUARD: already locking, skip");
            return;
        }
        if (status === "loading" || status === "success") {
            console.warn("[LockEscrow] GUARD: wrong status =", status);
            return;
        }

        // PATCH: Ставим guard СИНХРОННО до первого await
        isLockingRef.current = true;
        setStatus("loading");
        setError("");

        // Валидация входных данных
        if (!walletAddress) {
            setError("Wallet not connected. Open wallet from main screen.");
            setStatus("error");
            isLockingRef.current = false;
            return;
        }
        if (!escrowContractId) {
            setError("VITE_NEAR_ESCROW_CONTRACT_ID not set");
            setStatus("error");
            isLockingRef.current = false;
            return;
        }
        if (!nftContractId) {
            setError("VITE_NEAR_NFT_CONTRACT_ID not set");
            setStatus("error");
            isLockingRef.current = false;
            return;
        }
        if (deckTokenIds.length !== 5) {
            setError("Need exactly 5 NFTs. Have: " + deckTokenIds.length);
            setStatus("error");
            isLockingRef.current = false;
            return;
        }
        if (!existingMatchId) {
            setError("No match ID");
            setStatus("error");
            isLockingRef.current = false;
            return;
        }

        try {
            // ── Step 1: Verify ownership ───────────────────────────────
            // PATCH: nearNftTokensForOwner теперь кэшируется 30s.
            // Первый вызов: ~2-5s (RPC). Повторные: мгновенно.
            setStatusText("Verifying NFT ownership...");
            console.warn("[LockEscrow] Step 1: ownership check", deckTokenIds);

            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedSet = new Set(owned.map(function (t) { return t.token_id; }));
            var missing = deckTokenIds.filter(function (id) { return !ownedSet.has(id); });

            if (missing.length > 0) {
                throw new Error(
                    "NFTs not in your wallet: [" + missing.join(", ") + "]\n" +
                    "Owned: [" + Array.from(ownedSet).slice(0, 10).join(", ") + "]"
                );
            }
            console.warn("[LockEscrow] Step 1 OK: ownership verified");

            // ── Step 2: Get wallet ─────────────────────────────────────
            setStatusText("Connecting to wallet...");

            // PATCH: ctx.getWallet() — из контекста, с полным fallback.
            // _cachedSelector уже есть (singleton из walletSelector.js),
            // поэтому getWallet() работает даже если React ещё не обновил state.
            if (!ctx.getWallet) {
                throw new Error("getWallet not in context. Update WalletConnectProvider.");
            }

            // PATCH: retry 3x с backoff 500→1000→2000ms
            var wallet = await retryAsync(
                function () {
                    console.warn("[LockEscrow] getWallet attempt...");
                    return ctx.getWallet();
                },
                3, 500
            );
            console.warn("[LockEscrow] Step 2 OK: wallet obtained");

            // ── Step 3: Sign & Send Transaction ───────────────────────
            setStatusText("Sign in wallet (" + deckTokenIds.length + " NFTs to escrow)...");

            // PATCH: memo: null — HOT Wallet mobile иногда падает на строковом memo
            // при обработке deep-link callback
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

            console.warn("[LockEscrow] Step 3: TX →", nftContractId, "actions:", actions.length);

            var txOk = false;
            try {
                var txResult = await withMobileTxTimeout(
                    wallet.signAndSendTransaction({
                        receiverId: nftContractId,
                        actions: actions,
                    }),
                    90000
                );
                txOk = true;
                console.warn("[LockEscrow] Step 3 OK: TX result", txResult);
            } catch (txErr) {
                var txMsg = String(txErr?.message || txErr);
                console.error("[LockEscrow] TX error:", txMsg);

                if (txMsg === "TX_TIMEOUT") {
                    // PATCH: Пользователь мог подписать в кошельке, redirect вернул страницу.
                    // Продолжаем — backend зафиксирует депозиты.
                    setStatusText("Wallet redirect — registering on backend...");
                    console.warn("[LockEscrow] TX_TIMEOUT: continuing to backend");
                } else if (
                    txMsg.toLowerCase().includes("reject") ||
                    txMsg.toLowerCase().includes("cancel") ||
                    txMsg.toLowerCase().includes("denied") ||
                    txMsg.toLowerCase().includes("user ")
                ) {
                    throw new Error("❌ Rejected in wallet. Tap Try Again to retry.");
                } else {
                    throw txErr;
                }
            }

            // ── Step 4: Register deposits ──────────────────────────────
            setStatusText("Registering deposits...");
            console.warn("[LockEscrow] Step 4: register_deposits");

            var token = getStoredToken();

            // PATCH: retry 3x — мобильная сеть нестабильна
            var regResult = await retryAsync(function () {
                return apiFetch("/api/matches/" + existingMatchId + "/register_deposits", {
                    method: "POST",
                    token: token,
                    body: JSON.stringify({
                        token_ids: deckTokenIds,
                        nft_contract_id: nftContractId,
                        images: deckImages,
                        near_wallet: walletAddress,
                    }),
                });
            }, 3, 800);
            console.warn("[LockEscrow] Step 4 OK:", regResult);

            // ── Step 5: Confirm escrow ─────────────────────────────────
            setStatusText("Confirming escrow...");
            console.warn("[LockEscrow] Step 5: confirm_escrow");

            var confResult = await retryAsync(function () {
                return apiFetch("/api/matches/" + existingMatchId + "/confirm_escrow", {
                    method: "POST",
                    token: token,
                    body: JSON.stringify({
                        player_id: String(me?.id || ""),
                        token_ids: deckTokenIds,
                        near_wallet: walletAddress,
                    }),
                });
            }, 3, 800);
            console.warn("[LockEscrow] Step 5 OK:", confResult);

            // PATCH: Инвалидируем кэш NFT — чтобы после игры данные были актуальны
            try { invalidateOwnerCache(nftContractId, walletAddress); } catch (e) { }

            setStatus("success");
            setStatusText("NFTs locked!");
            console.warn("[LockEscrow] ✅ ALL DONE");

            setTimeout(function () { onReady?.({ matchId: existingMatchId }); }, 700);

        } catch (err) {
            console.error("[LockEscrow] FINAL ERROR:", err?.message, err);

            var msg = String(err?.message || err);

            // Форматируем понятно для пользователя
            if (msg.includes("❌")) {
                // уже отформатировано
            } else if (msg === "TX_TIMEOUT" || msg.includes("TX_TIMEOUT")) {
                msg = "⏱ Wallet timeout. If you approved — tap Try Again to check.";
            } else if (msg.includes("not initialized") || msg.includes("selector") || msg.includes("Cannot get wallet")) {
                msg = "🔌 Wallet disconnected. Reload page and reconnect.";
            } else if (msg.includes("not in your wallet") || msg.includes("NFTs not")) {
                // оставляем — информативно
            }

            setError(msg);
            setStatus("error");
        } finally {
            // PATCH: Всегда снимаем guard
            isLockingRef.current = false;
        }

    }, [status, walletAddress, escrowContractId, nftContractId, deckTokenIds, deckImages, existingMatchId, ctx, me, onReady]);

    if (!open) return null;

    var topCards = playerDeck ? playerDeck.slice(0, 3) : [];
    var bottomCards = playerDeck ? playerDeck.slice(3, 5) : [];
    var btnDisabled = status === "loading" || status === "success";

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 99999,
                background: "rgba(0,0,0,0.93)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={status === "loading" ? undefined : onClose}
        >
            <div
                style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "2px solid rgba(255,215,0,0.4)",
                    borderRadius: 24, padding: "28px 24px",
                    maxWidth: 460, width: "100%", textAlign: "center",
                    boxShadow: "0 0 60px rgba(255,215,0,0.2)",
                }}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <h3 style={{ margin: "0 0 14px", fontSize: 22, fontWeight: 900, color: "#fff" }}>
                    🔒 Lock NFTs
                </h3>

                {/* ── IDLE ── */}
                {status === "idle" && (
                    <>
                        <p style={{ margin: "0 0 18px", fontSize: 13, opacity: 0.85, color: "#a0d8ff", lineHeight: 1.5 }}>
                            Lock your 5 NFTs in escrow to start the match.
                            <br />
                            <span style={{ color: "#ffd700" }}>Winner takes 1 NFT from loser!</span>
                        </p>

                        {/* Cards 3+2 */}
                        <div style={{ marginBottom: 18 }}>
                            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 10 }}>
                                {topCards.map(function (card, i) {
                                    return (
                                        <div key={card?.token_id || i} style={{
                                            width: 78, height: 108, borderRadius: 11, overflow: "hidden",
                                            border: "2px solid rgba(255,215,0,0.6)",
                                            boxShadow: "0 3px 12px rgba(255,215,0,0.2)",
                                        }}>
                                            <img src={card?.imageUrl || card?.image || "/cards/card.jpg"} alt=""
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }} />
                                        </div>
                                    );
                                })}
                            </div>
                            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                                {bottomCards.map(function (card, i) {
                                    return (
                                        <div key={card?.token_id || (i + 3)} style={{
                                            width: 78, height: 108, borderRadius: 11, overflow: "hidden",
                                            border: "2px solid rgba(255,215,0,0.6)",
                                            boxShadow: "0 3px 12px rgba(255,215,0,0.2)",
                                        }}>
                                            <img src={card?.imageUrl || card?.image || "/cards/card.jpg"} alt=""
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                                onError={function (e) { e.currentTarget.src = "/cards/card.jpg"; }} />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Info block */}
                        <div style={{
                            fontSize: 10, opacity: 0.45, marginBottom: 18,
                            padding: "8px 12px", background: "rgba(255,255,255,0.03)",
                            borderRadius: 9, textAlign: "left", lineHeight: 1.7,
                        }}>
                            <div>Match: {existingMatchId?.slice(0, 16)}...</div>
                            <div>Escrow: {escrowContractId || "NOT SET"}</div>
                            <div>Wallet: {walletAddress?.slice(0, 22) || "NOT CONNECTED"}...</div>
                            <div>Tokens: {deckTokenIds.slice(0, 3).join(", ")}{deckTokenIds.length > 3 ? "..." : ""}</div>
                        </div>

                        <button
                            onClick={handleLock}
                            disabled={btnDisabled}
                            style={{
                                width: "100%", padding: "15px 20px", borderRadius: 15,
                                border: "none",
                                background: btnDisabled
                                    ? "rgba(255,215,0,0.3)"
                                    : "linear-gradient(135deg, #ffd700, #ff8c00)",
                                color: "#000", fontSize: 17, fontWeight: 900,
                                cursor: btnDisabled ? "not-allowed" : "pointer",
                                boxShadow: btnDisabled ? "none" : "0 5px 20px rgba(255,215,0,0.4)",
                                opacity: btnDisabled ? 0.6 : 1,
                                pointerEvents: btnDisabled ? "none" : "auto",
                                // PATCH: Убираем 300ms задержку нажатия на мобилке
                                touchAction: "manipulation",
                                WebkitTapHighlightColor: "transparent",
                                userSelect: "none",
                            }}
                        >
                            🔒 Lock & Battle!
                        </button>
                    </>
                )}

                {/* ── LOADING ── */}
                {status === "loading" && (
                    <div style={{ padding: "24px 10px", color: "#fff" }}>
                        <div style={{ fontSize: 38, marginBottom: 14 }}>⏳</div>
                        <div style={{ fontSize: 15, marginBottom: 10, fontWeight: 600 }}>{statusText}</div>
                        <div style={{
                            fontSize: 11, opacity: 0.55, padding: "10px 14px",
                            background: "rgba(255,255,255,0.05)", borderRadius: 10, lineHeight: 1.6,
                        }}>
                            {statusText.toLowerCase().includes("sign") || statusText.toLowerCase().includes("wallet")
                                ? "⚠️ Wallet app will open — sign there, then return here"
                                : "Please wait..."}
                        </div>
                    </div>
                )}

                {/* ── SUCCESS ── */}
                {status === "success" && (
                    <div style={{ padding: "24px 10px", color: "#4ade80" }}>
                        <div style={{ fontSize: 46, marginBottom: 14 }}>✅</div>
                        <div style={{ fontSize: 17, fontWeight: 700 }}>NFTs Locked!</div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8 }}>
                            Waiting for opponent...
                        </div>
                    </div>
                )}

                {/* ── ERROR ── */}
                {status === "error" && (
                    <div style={{ padding: "20px 8px" }}>
                        <div style={{ fontSize: 38, marginBottom: 14 }}>❌</div>
                        <div style={{
                            color: "#ff6b6b", marginBottom: 20,
                            wordBreak: "break-word", fontSize: 12,
                            padding: "12px 14px",
                            background: "rgba(255,100,100,0.1)", borderRadius: 11,
                            lineHeight: 1.7, textAlign: "left",
                        }}>
                            {error}
                        </div>
                        <button
                            onClick={function () {
                                // PATCH: Явный сброс ref при Try Again
                                isLockingRef.current = false;
                                didOpenCheckRef.current = true; // не перепроверяем backend
                                setStatus("idle");
                                setError("");
                                setStatusText("");
                            }}
                            style={{
                                padding: "11px 22px", borderRadius: 11,
                                border: "1px solid rgba(255,255,255,0.2)",
                                background: "rgba(255,255,255,0.07)", color: "#fff",
                                cursor: "pointer", fontSize: 14, fontWeight: 600,
                                touchAction: "manipulation",
                                WebkitTapHighlightColor: "transparent",
                            }}
                        >
                            🔄 Try Again
                        </button>
                    </div>
                )}

                {/* ── Cancel button ── */}
                {status !== "loading" && status !== "success" && (
                    <button
                        onClick={onClose}
                        style={{
                            marginTop: 14, padding: "11px 18px", borderRadius: 11,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "transparent",
                            color: "rgba(255,255,255,0.4)", fontSize: 13,
                            cursor: "pointer", width: "100%",
                            touchAction: "manipulation",
                            WebkitTapHighlightColor: "transparent",
                        }}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}