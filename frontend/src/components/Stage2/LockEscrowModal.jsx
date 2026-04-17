import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner, invalidateOwnerCache } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

// PATCH: Timeout для TX — на мобилке кошелёк делает deep-link redirect,
// промис signAndSendTransaction зависает навсегда.
// TX_TIMEOUT ≠ ошибка транзакции — пользователь мог подписать!
function withMobileTxTimeout(promise, timeoutMs) {
    var ms = timeoutMs || 90000; // PATCH: 90s вместо 120s — быстрее даём фидбек
    return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () {
            reject(new Error("TX_TIMEOUT"));
        }, ms);
        promise.then(function (r) { clearTimeout(timer); resolve(r); })
            .catch(function (e) { clearTimeout(timer); reject(e); });
    });
}

// PATCH: Retry с экспоненциальным backoff
// delay: 500 → 1000 → 2000ms
function retryAsync(fn, retries, baseDelayMs) {
    var delay = baseDelayMs || 500;
    return fn().catch(function (err) {
        if (retries <= 0) throw err;
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
            .then(function () { return retryAsync(fn, retries - 1, delay * 2); });
    });
}

export default function LockEscrowModal({ open, onClose, onReady, me, playerDeck, matchId: existingMatchId }) {
    var ctx = useWalletConnect();
    var walletAddress = ctx.accountId || "";

    var [status, setStatus] = useState("idle");
    var [statusText, setStatusText] = useState("");
    var [error, setError] = useState("");

    // PATCH: isLockingRef — синхронный guard против двойного вызова.
    // State обновляется асинхронно, ref — синхронно.
    // Первый клик ставит ref=true ДО первого await → второй клик видит true.
    var isLockingRef = useRef(false);

    // PATCH: didCheckRef — проверяем backend статус только один раз при открытии.
    var didCheckRef = useRef(false);

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

    // PATCH: При открытии — recovery check.
    // Если пользователь подписал транзакцию в кошельке (mobile redirect),
    // но приложение перезапустилось и модал открылся снова в idle —
    // проверяем backend: вдруг deposits уже зарегистрированы.
    useEffect(function () {
        if (!open) {
            isLockingRef.current = false;
            didCheckRef.current = false;
            setStatus("idle");
            setStatusText("");
            setError("");
            return;
        }
        if (didCheckRef.current || !existingMatchId) return;
        didCheckRef.current = true;

        (async function () {
            try {
                var t = getStoredToken();
                var matchData = await apiFetch("/api/matches/" + existingMatchId, { token: t });
                if (!matchData) return;

                var myId = String(me?.id || "");
                var p1Confirmed = matchData.player1_escrow_confirmed === true;
                var p2Confirmed = matchData.player2_escrow_confirmed === true;
                var isP1 = myId && String(matchData.player1_id) === myId;
                var isP2 = myId && String(matchData.player2_id) === myId;
                var myConfirmed = isP1 ? p1Confirmed : isP2 ? p2Confirmed : false;

                console.warn("[LockEscrow] open check: myId=", myId,
                    "isP1=", isP1, "isP2=", isP2,
                    "myConfirmed=", myConfirmed,
                    "escrow_locked=", matchData.escrow_locked
                );

                if (myConfirmed) {
                    // PATCH: Уже залочено — сразу success без лока
                    setStatus("success");
                    setStatusText("NFTs already locked!");
                    setTimeout(function () { onReady?.({ matchId: existingMatchId }); }, 600);
                }
            } catch (e) {
                // Не критично — модал просто остаётся в idle
                console.warn("[LockEscrow] open check error:", e?.message);
            }
        })();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    var handleLock = useCallback(async function () {
        // PATCH: Синхронная проверка ref — самая надёжная защита от двойного клика
        if (isLockingRef.current) {
            console.warn("[LockEscrow] BLOCKED: already locking (ref guard)");
            return;
        }
        if (status === "loading" || status === "success") {
            console.warn("[LockEscrow] BLOCKED: wrong status =", status);
            return;
        }

        // PATCH: Ставим guard СИНХРОННО — до первого await
        isLockingRef.current = true;

        // Валидация
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
            setError("No match ID");
            isLockingRef.current = false;
            return;
        }

        setStatus("loading");
        setError("");

        try {
            // ── Step 1: Проверка владения ──────────────────────────────
            // PATCH: nearNftTokensForOwner теперь кэшируется 30s —
            // повторные вызовы мгновенные
            setStatusText("Verifying NFT ownership...");
            console.warn("[LockEscrow] Step 1: checking ownership", deckTokenIds);

            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedIds = new Set(owned.map(function (t) { return t.token_id; }));
            var missing = deckTokenIds.filter(function (id) { return !ownedIds.has(id); });
            if (missing.length > 0) {
                throw new Error("NFTs not owned: " + missing.join(", ") +
                    ". Owned: [" + Array.from(ownedIds).join(", ") + "]");
            }
            console.warn("[LockEscrow] Step 1 OK: all NFTs verified");

            // ── Step 2: Получаем кошелёк ───────────────────────────────
            setStatusText("Connecting to wallet...");

            // PATCH: Используем ctx.getWallet() — единая функция с fallback цепочкой.
            // Она сама разберётся: selectedWalletId → hot-wallet → первый доступный.
            // На мобилке после redirect selector уже в кэше (_selectorInstance),
            // getWallet работает мгновенно.
            var getWalletFn = ctx.getWallet;
            if (!getWalletFn) {
                throw new Error("getWallet not available in context. WalletConnectProvider version mismatch.");
            }

            var wallet = null;

            // PATCH: getWallet с retry (3 попытки, 500→1000→2000ms)
            // На мобилке selector может быть не полностью готов сразу после маунта
            wallet = await retryAsync(
                function () {
                    console.warn("[LockEscrow] calling getWallet...");
                    return getWalletFn();
                },
                3,
                500
            );

            if (!wallet) {
                throw new Error("getWallet returned null/undefined after retries");
            }
            console.warn("[LockEscrow] Step 2 OK: wallet obtained");

            // ── Step 3: Транзакция ─────────────────────────────────────
            setStatusText("Sign transaction in wallet (" + deckTokenIds.length + " NFTs)...");

            // PATCH: actions с memo: null.
            // HOT Wallet на мобилке иногда падает при non-null строковом memo
            // в deep-link обработке.
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

            console.warn("[LockEscrow] Step 3: signAndSendTransaction →", nftContractId);
            console.warn("[LockEscrow] actions:", JSON.stringify(actions));

            var txResult;
            var txSuccess = false;

            try {
                // PATCH: Timeout 90s — после этого предполагаем что TX прошёл через redirect
                txResult = await withMobileTxTimeout(
                    wallet.signAndSendTransaction({
                        receiverId: nftContractId,
                        actions: actions,
                    }),
                    90000
                );
                txSuccess = true;
                console.warn("[LockEscrow] Step 3 OK: TX result", txResult);
            } catch (txErr) {
                var txErrMsg = String(txErr?.message || txErr);
                console.error("[LockEscrow] TX error:", txErrMsg);

                if (txErrMsg === "TX_TIMEOUT") {
                    // PATCH: Timeout после deep-link redirect.
                    // Пользователь мог подписать в кошельке.
                    // Идём дальше — backend примет register_deposits.
                    setStatusText("Wallet redirect detected — registering on backend...");
                    console.warn("[LockEscrow] TX_TIMEOUT: proceeding to backend registration");
                    txSuccess = false; // неизвестно — но продолжаем
                } else if (
                    txErrMsg.toLowerCase().includes("reject") ||
                    txErrMsg.toLowerCase().includes("cancel") ||
                    txErrMsg.toLowerCase().includes("denied") ||
                    txErrMsg.toLowerCase().includes("user ")
                ) {
                    // Явный отказ пользователя — не продолжаем
                    throw new Error("❌ Transaction rejected in wallet.");
                } else {
                    // Другие ошибки — пробрасываем
                    throw txErr;
                }
            }

            // ── Step 4: Регистрация на backend ────────────────────────
            setStatusText("Registering deposits...");
            console.warn("[LockEscrow] Step 4: register_deposits");

            var token = getStoredToken();

            // PATCH: register_deposits с retry (3 попытки).
            // Мобильная сеть нестабильна — первый запрос может упасть.
            await retryAsync(
                function () {
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
                },
                3,
                800
            );
            console.warn("[LockEscrow] Step 4 OK");

            // ── Step 5: Confirm escrow ────────────────────────────────
            setStatusText("Confirming escrow...");
            console.warn("[LockEscrow] Step 5: confirm_escrow");

            // PATCH: confirm_escrow с retry
            await retryAsync(
                function () {
                    return apiFetch("/api/matches/" + existingMatchId + "/confirm_escrow", {
                        method: "POST",
                        token: token,
                        body: JSON.stringify({
                            player_id: String(me?.id || ""),
                            token_ids: deckTokenIds,
                            near_wallet: walletAddress,
                        }),
                    });
                },
                3,
                800
            );
            console.warn("[LockEscrow] Step 5 OK");

            // PATCH: Инвалидируем кэш NFT — чтобы после игры данные были свежие
            try {
                invalidateOwnerCache(nftContractId, walletAddress);
            } catch (e) { }

            // Успех!
            setStatus("success");
            setStatusText("NFTs locked!");
            console.warn("[LockEscrow] ALL STEPS DONE ✓");

            setTimeout(function () {
                onReady?.({ matchId: existingMatchId });
            }, 700);

        } catch (err) {
            console.error("[LockEscrow] FINAL ERROR:", err?.message, err);

            var userMessage = String(err?.message || err);

            // PATCH: Уже залочено (race condition — второй игрок залочил первым)
            if (userMessage.includes("Already locked") || userMessage.includes("already confirmed")) {
                setStatus("success");
                setStatusText("Already locked!");
                setTimeout(function () { onReady?.({ matchId: existingMatchId }); }, 700);
                return;
            }

            if (userMessage.includes("❌")) {
                // Уже отформатировано
            } else if (userMessage.includes("TX_TIMEOUT")) {
                userMessage = "⏱ Wallet timeout. If you approved in wallet app — tap Try Again.";
            } else if (
                userMessage.includes("Cannot get") ||
                userMessage.includes("not initialized") ||
                userMessage.includes("Selector")
            ) {
                userMessage = "🔌 Wallet not connected. Reload page and reconnect wallet.";
            } else if (userMessage.includes("not owned") || userMessage.includes("don't own")) {
                // Оставляем как есть — информативно
            }

            setError(userMessage);
            setStatus("error");

        } finally {
            // PATCH: Всегда снимаем ref-guard
            isLockingRef.current = false;
        }

    }, [
        status, walletAddress, escrowContractId, nftContractId,
        deckTokenIds, deckImages, existingMatchId, ctx, me, onReady
    ]);

    if (!open) return null;

    var topCards = playerDeck ? playerDeck.slice(0, 3) : [];
    var bottomCards = playerDeck ? playerDeck.slice(3, 5) : [];
    var isButtonDisabled = status === "loading" || status === "success";

    return (
        <div
            style={{
                position: "fixed", inset: 0, zIndex: 99999,
                background: "rgba(0,0,0,0.92)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
            onClick={status === "loading" ? undefined : onClose}
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
                            textAlign: "left",
                        }}>
                            <div>Match: {existingMatchId?.slice(0, 16)}...</div>
                            <div>Escrow: {escrowContractId || "NOT SET"}</div>
                            <div>Wallet: {walletAddress?.slice(0, 20) || "NOT CONNECTED"}...</div>
                            <div>NFTs: {deckTokenIds.join(", ")}</div>
                        </div>

                        <button
                            onClick={handleLock}
                            disabled={isButtonDisabled}
                            style={{
                                width: "100%", padding: "16px 24px", borderRadius: 16,
                                border: "none",
                                background: "linear-gradient(135deg, #ffd700, #ff8c00)",
                                color: "#000", fontSize: 18, fontWeight: 900,
                                cursor: isButtonDisabled ? "not-allowed" : "pointer",
                                boxShadow: "0 6px 25px rgba(255,215,0,0.4)",
                                opacity: isButtonDisabled ? 0.5 : 1,
                                pointerEvents: isButtonDisabled ? "none" : "auto",
                                // PATCH: Убираем задержку нажатия на мобилке
                                touchAction: "manipulation",
                                WebkitTapHighlightColor: "transparent",
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
                            {statusText.includes("wallet") || statusText.includes("Sign")
                                ? "⚠️ If wallet app opens — sign there, then return here"
                                : "Processing..."}
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
                            onClick={function () {
                                // PATCH: Явный сброс ref при "Try Again"
                                isLockingRef.current = false;
                                setStatus("idle");
                                setError("");
                                setStatusText("");
                            }}
                            style={{
                                padding: "12px 24px", borderRadius: 12,
                                border: "1px solid rgba(255,255,255,0.25)",
                                background: "rgba(255,255,255,0.08)", color: "#fff",
                                cursor: "pointer", fontSize: 14, fontWeight: 600,
                                touchAction: "manipulation",
                            }}
                        >
                            🔄 Try Again
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
                            touchAction: "manipulation",
                        }}
                    >
                        Cancel
                    </button>
                )}
            </div>
        </div>
    );
}