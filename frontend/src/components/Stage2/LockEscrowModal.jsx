import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { apiFetch } from "../../api.js";
import { useWalletConnect } from "../../context/WalletConnectContext";
import { nearNftTokensForOwner } from "../../libs/nearNft.js";

function getStoredToken() {
    try {
        return localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    } catch (e) { return ""; }
}

// PATCH: Timeout-wrapper для мобильных кошельков.
// HOT Wallet на мобилке делает deep-link redirect → промис зависает навсегда.
// Через timeoutMs бросаем специальную ошибку TX_TIMEOUT.
// Это НЕ значит что транзакция не прошла — пользователь мог подписать в кошельке,
// но промис не вернулся из-за редиректа. Дальше идём на backend-check.
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

// PATCH: Retry helper. На мобилке selector.wallet() может не быть готов сразу
// после deep-link возврата. Ретраем с паузой.
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

    // PATCH: Ref-guard против двойного вызова handleLock.
    // State обновляется асинхронно — между двумя кликами state ещё "idle".
    // Ref меняется синхронно — первый клик ставит true ДО первого await.
    var isLockingRef = useRef(false);

    // PATCH: Ref для отслеживания — проверяли ли уже backend статус при маунте.
    // Если пользователь уже подписал транзакцию в кошельке (мобильный redirect),
    // но модал открылся заново — не показываем "idle", а сразу "success".
    var didCheckBackendRef = useRef(false);

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

    // PATCH: При открытии модала — проверяем backend статус матча.
    // Это recovery для случая когда пользователь подписал транзакцию в кошельке,
    // приложение вернулось из deep-link redirect, модал открылся снова в idle.
    // Если backend уже знает что deposits зарегистрированы — пропускаем lock.
    useEffect(function () {
        if (!open) {
            // Сбрасываем всё при закрытии
            isLockingRef.current = false;
            didCheckBackendRef.current = false;
            setStatus("idle");
            setStatusText("");
            setError("");
            return;
        }

        // Проверяем backend только один раз при открытии
        if (didCheckBackendRef.current) return;
        didCheckBackendRef.current = true;

        if (!existingMatchId) return;

        (async function () {
            try {
                var t = getStoredToken();
                var matchData = await apiFetch("/api/matches/" + existingMatchId, { token: t });
                if (!matchData) return;

                var myId = String(me?.id || "");
                var p1Id = String(matchData.player1_id || "");
                var p2Id = String(matchData.player2_id || "");

                var myEscrowConfirmed = false;
                if (myId && myId === p1Id) {
                    myEscrowConfirmed = matchData.player1_escrow_confirmed === true;
                } else if (myId && myId === p2Id) {
                    myEscrowConfirmed = matchData.player2_escrow_confirmed === true;
                }

                if (myEscrowConfirmed) {
                    // PATCH: Уже залочено — показываем success и вызываем onReady
                    console.warn("[LockEscrow] Backend says already locked — skipping lock");
                    setStatus("success");
                    setStatusText("NFTs already locked!");
                    setTimeout(function () {
                        onReady?.({ matchId: existingMatchId });
                    }, 800);
                } else {
                    // PATCH: Ещё не залочено — Debug лог
                    console.warn("[LockEscrow] Backend: not yet locked for player", myId,
                        "p1_confirmed:", matchData.player1_escrow_confirmed,
                        "p2_confirmed:", matchData.player2_escrow_confirmed
                    );
                }
            } catch (e) {
                // Не критично — просто логируем
                console.warn("[LockEscrow] Backend check on open failed:", e?.message);
            }
        })();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // PATCH: useCallback чтобы функция не пересоздавалась на каждый рендер
    var handleLock = useCallback(async function () {
        // PATCH: Синхронная проверка ref — работает даже если state ещё не обновился
        if (isLockingRef.current) {
            console.warn("[LockEscrow] handleLock: already locking (ref guard) — skipped");
            return;
        }
        // Дополнительная проверка state
        if (status === "loading" || status === "success") {
            console.warn("[LockEscrow] handleLock: wrong status =", status, "— skipped");
            return;
        }

        // PATCH: Ставим guard СИНХРОННО до первого await
        isLockingRef.current = true;

        // Базовые проверки
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
            // Step 1: Проверка владения
            console.warn("[LockEscrow] Step 1: checking ownership for", deckTokenIds);
            var owned = await nearNftTokensForOwner(nftContractId, walletAddress);
            var ownedIds = new Set(owned.map(function (t) { return t.token_id; }));
            var missing = deckTokenIds.filter(function (id) { return !ownedIds.has(id); });
            if (missing.length > 0) {
                throw new Error("You don't own these NFTs: " + missing.join(", "));
            }
            console.warn("[LockEscrow] Step 1 OK: all NFTs owned");

            // Step 2: Получаем кошелёк
            setStatusText("Opening wallet...");

            if (!ctx.selector) {
                throw new Error("Selector is null. Wallet not initialized.");
            }

            // PATCH: Читаем selector state с защитой
            var selectorState = null;
            try {
                selectorState = ctx.selector.store.getState();
            } catch (e) {
                throw new Error("Cannot read selector state: " + (e?.message || e));
            }

            // PATCH: Debug-лог selector state — критично для диагностики мобильных проблем
            console.warn("[LockEscrow] selector state:", JSON.stringify({
                selectedWalletId: selectorState?.selectedWalletId,
                accountsCount: selectorState?.accounts?.length,
                modules: selectorState?.modules?.map(function (m) { return m.id; }),
            }));

            var selectedWalletId = selectorState?.selectedWalletId || null;
            var isSignedIn = Array.isArray(selectorState?.accounts) && selectorState.accounts.length > 0;

            if (!isSignedIn) {
                throw new Error("Not signed in to any wallet. Please reconnect wallet from main screen.");
            }

            setStatusText("Getting wallet: " + (selectedWalletId || "hot-wallet") + "...");

            // PATCH: Получаем wallet с retry.
            // На мобилке после deep-link redirect selector может быть не готов первые 1-2 секунды.
            var wallet = null;
            var walletError = null;

            // Пробуем selectedWalletId с 3 попытками
            if (selectedWalletId) {
                try {
                    wallet = await retryAsync(
                        function () {
                            console.warn("[LockEscrow] trying wallet:", selectedWalletId);
                            return ctx.selector.wallet(selectedWalletId);
                        },
                        3,    // 3 повтора
                        800   // 800ms между попытками
                    );
                    console.warn("[LockEscrow] got wallet:", selectedWalletId);
                } catch (e) {
                    walletError = "wallet(" + selectedWalletId + ") failed: " + (e?.message || e);
                    console.warn("[LockEscrow]", walletError);
                }
            }

            // PATCH: Fallback на hot-wallet с retry
            if (!wallet) {
                try {
                    wallet = await retryAsync(
                        function () {
                            console.warn("[LockEscrow] fallback to hot-wallet");
                            return ctx.selector.wallet("hot-wallet");
                        },
                        3,
                        800
                    );
                    console.warn("[LockEscrow] got fallback wallet: hot-wallet");
                } catch (e) {
                    walletError = (walletError ? walletError + " | " : "") +
                        "hot-wallet failed: " + (e?.message || e);
                    console.warn("[LockEscrow]", walletError);
                }
            }

            if (!wallet) {
                throw new Error(
                    "Cannot get wallet. " + (walletError || "Unknown error") +
                    ". Try reconnecting wallet from main screen."
                );
            }

            // Step 3: Отправляем транзакцию
            setStatusText("Sending " + deckTokenIds.length + " NFTs to escrow...");
            console.warn("[LockEscrow] Step 3: sending tx to", nftContractId, "tokens:", deckTokenIds);

            // PATCH: actions с memo: null
            // Некоторые мобильные кошельки (HOT Wallet) падают на non-null строковом memo
            // при обработке deep-link. null безопаснее.
            var actions = deckTokenIds.map(function (tokenId) {
                return {
                    type: "FunctionCall",
                    params: {
                        methodName: "nft_transfer",
                        args: {
                            receiver_id: escrowContractId,
                            token_id: String(tokenId),
                            // PATCH: memo: null — надёжнее на мобилке чем строка
                            memo: null,
                        },
                        // PATCH: Явные строки — некоторые wallet-selector версии
                        // не принимают number для gas/deposit
                        gas: "30000000000000",
                        deposit: "1",
                    },
                };
            });

            // PATCH: Оборачиваем в timeout 120s.
            // Если кошелёк делает redirect — промис зависает.
            // TX_TIMEOUT ≠ ошибка транзакции. Идём дальше на backend-check.
            var txResult;
            try {
                txResult = await withMobileTxTimeout(
                    wallet.signAndSendTransaction({
                        receiverId: nftContractId,
                        actions: actions,
                    }),
                    120000
                );
                console.warn("[LockEscrow] TX OK:", txResult);
            } catch (txErr) {
                console.error("[LockEscrow] TX error:", txErr?.message);

                if (txErr.message && txErr.message.indexOf("TX_TIMEOUT") === 0) {
                    // PATCH: Timeout после redirect — не критично, идём дальше
                    setStatusText("Wallet redirect detected, registering on backend...");
                    console.warn("[LockEscrow] TX_TIMEOUT — trying backend registration anyway");
                    // txResult = undefined — ok, backend примет
                } else {
                    // Обычная ошибка кошелька — пробрасываем
                    throw txErr;
                }
            }

            // Step 4: Регистрируем депозиты на backend
            setStatusText("Registering deposits...");
            console.warn("[LockEscrow] Step 4: register_deposits");

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

            // Step 5: Подтверждаем escrow
            setStatusText("Confirming escrow...");
            console.warn("[LockEscrow] Step 5: confirm_escrow");

            await apiFetch("/api/matches/" + existingMatchId + "/confirm_escrow", {
                method: "POST",
                token: token,
                body: JSON.stringify({
                    player_id: String(me?.id || ""),
                    token_ids: deckTokenIds,
                    near_wallet: walletAddress,
                }),
            });

            // Успех!
            setStatus("success");
            setStatusText("NFTs locked!");
            console.warn("[LockEscrow] SUCCESS — all steps done");

            setTimeout(function () {
                onReady?.({ matchId: existingMatchId });
            }, 800);

        } catch (err) {
            console.error("[LockEscrow] FINAL ERROR:", err?.message, err);

            // PATCH: Человекочитаемые сообщения
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
            } else if (
                userMessage.includes("Cannot get wallet") ||
                userMessage.includes("Кошелёк не определён")
            ) {
                userMessage = "🔌 Wallet disconnected. Please reload the page and reconnect.";
            }

            setError(userMessage);
            setStatus("error");

        } finally {
            // PATCH: Всегда снимаем ref-guard
            isLockingRef.current = false;
        }

    }, [
        // PATCH: status в deps — чтобы guard по status работал актуально
        status, walletAddress, escrowContractId, nftContractId,
        deckTokenIds, deckImages, existingMatchId, ctx, me, onReady
    ]);

    if (!open) return null;

    var topCards = playerDeck ? playerDeck.slice(0, 3) : [];
    var bottomCards = playerDeck ? playerDeck.slice(3, 5) : [];

    // PATCH: Кнопка Lock заблокирована если isLockingRef.current ИЛИ status loading/success.
    // Для UI используем status (ref не триггерит ре-рендер).
    var isButtonDisabled = status === "loading" || status === "success";

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

                        {/* Карты 3 + 2 */}
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

                        {/* Match info */}
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
                            onClick={function () {
                                // PATCH: При "Try Again" — сбрасываем ref тоже
                                isLockingRef.current = false;
                                setStatus("idle");
                                setError("");
                            }}
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