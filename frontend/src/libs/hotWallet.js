const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app
const hotWalletBot = "hot_wallet"; // @hot_wallet username

function getStoredAccountId() {
    try {
        return (localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "").trim();
    } catch {
        return "";
    }
}

function setStoredAccountId(accountId) {
    try {
        localStorage.setItem(LS_NEAR_ACCOUNT_ID, String(accountId || "").trim());
    } catch { }
}

async function waitForTelegram(maxWaitMs = 5000) {
    const start = Date.now();
    while (!window.Telegram?.WebApp) {
        if (Date.now() - start > maxWaitMs) {
            throw new Error("Telegram WebApp не загрузился. Открой через @Cardclashbot в Telegram.");
        }
        await new Promise((r) => setTimeout(r, 100));
    }
    return window.Telegram.WebApp;
}

/**
 * Проверяем URL на наличие accountId (HOT возвращает через query params)
 */
function extractAccountIdFromUrl() {
    try {
        const u = new URL(window.location.href);

        // HOT может вернуть: ?accountId=xxx или ?account_id=xxx или ?near_account_id=xxx
        const accountId =
            u.searchParams.get("accountId") ||
            u.searchParams.get("account_id") ||
            u.searchParams.get("near_account_id") ||
            u.searchParams.get("nearAccountId") ||
            "";

        if (accountId) {
            // очищаем URL от query params (чтобы не мешали при следующем коннекте)
            u.searchParams.delete("accountId");
            u.searchParams.delete("account_id");
            u.searchParams.delete("near_account_id");
            u.searchParams.delete("nearAccountId");
            window.history.replaceState({}, "", u.toString());
        }

        return accountId.trim();
    } catch {
        return "";
    }
}

/**
 * Подключение HOT Wallet через Telegram Mini App.
 * После возврата из HOT читаем accountId из URL или LS.
 */
export async function hotWalletConnect() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");

    const tg = await waitForTelegram();

    // Сначала проверяем, может уже вернулись из HOT (accountId в URL)
    const urlAccountId = extractAccountIdFromUrl();
    if (urlAccountId) {
        setStoredAccountId(urlAccountId);
        return { accountId: urlAccountId };
    }

    // Проверяем LS (может HOT записал напрямую)
    const lsAccountId = getStoredAccountId();
    if (lsAccountId) {
        return { accountId: lsAccountId };
    }

    // Формируем payload для HOT: connect_<yourBotId>_<network>
    const payload = `connect_${encodeURIComponent(botId)}_${networkId}`;

    // ВАЖНО: добавляем return_url чтобы HOT вернул пользователя обратно в игру с accountId
    const returnUrl = encodeURIComponent(window.location.href);
    const url = `https://t.me/${hotWalletBot}/app?startapp=${payload}&return_url=${returnUrl}`;

    try {
        tg.expand?.();
    } catch { }

    return new Promise((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();

            // Перед reject проверяем ещё раз URL и LS (может пользователь уже вернулся)
            const finalUrlAccountId = extractAccountIdFromUrl();
            if (finalUrlAccountId) {
                setStoredAccountId(finalUrlAccountId);
                resolve({ accountId: finalUrlAccountId });
                return;
            }

            const finalLsAccountId = getStoredAccountId();
            if (finalLsAccountId) {
                resolve({ accountId: finalLsAccountId });
                return;
            }

            reject(new Error(
                "HOT Wallet не вернул accountId за 20 секунд.\n\n" +
                "Возможные причины:\n" +
                "1. Ты не подключил аккаунт в HOT (нажми Connect в HOT wallet)\n" +
                "2. HOT не поддерживает return_url callback\n" +
                "3. Блокировка сети (нужен VPN)\n\n" +
                "Попробуй ещё раз или введи accountId вручную (будет позже)."
            ));
        }, 20000); // 20s

        // Следим за возвратом фокуса в игру (когда HOT закрывается)
        const onVisibilityChange = () => {
            if (document.hidden) return; // игра свернулась

            // игра вернулась на передний план — проверяем URL/LS
            setTimeout(() => {
                if (resolved) return;

                const acc = extractAccountIdFromUrl() || getStoredAccountId();
                if (acc) {
                    resolved = true;
                    cleanup();
                    setStoredAccountId(acc);
                    resolve({ accountId: acc });
                }
            }, 300);
        };

        const onFocus = () => {
            setTimeout(() => {
                if (resolved) return;

                const acc = extractAccountIdFromUrl() || getStoredAccountId();
                if (acc) {
                    resolved = true;
                    cleanup();
                    setStoredAccountId(acc);
                    resolve({ accountId: acc });
                }
            }, 300);
        };

        const cleanup = () => {
            clearTimeout(timeout);
            document.removeEventListener("visibilitychange", onVisibilityChange);
            window.removeEventListener("focus", onFocus);
        };

        document.addEventListener("visibilitychange", onVisibilityChange);
        window.addEventListener("focus", onFocus);

        // Открываем HOT
        try {
            if (typeof tg.openTelegramLink === "function") {
                tg.openTelegramLink(url);
            } else if (typeof tg.openLink === "function") {
                tg.openLink(url);
            } else {
                cleanup();
                reject(new Error("Telegram WebApp does not support openTelegramLink/openLink"));
            }
        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

/**
 * Подписание транзакции через HOT.
 */
export async function hotWalletSignAndSendTransaction({ receiverId, actions }) {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing");

    const tg = await waitForTelegram();

    const accountId = getStoredAccountId();
    if (!accountId) throw new Error("Not connected (no accountId in LS)");

    try {
        tg.expand?.();
    } catch { }

    const txData = {
        receiverId,
        actions,
        signerId: accountId,
    };

    const txPayloadEncoded = encodeURIComponent(btoa(JSON.stringify(txData)));
    const payload = `sign_${encodeURIComponent(botId)}_${txPayloadEncoded}`;

    const returnUrl = encodeURIComponent(window.location.href);
    const url = `https://t.me/${hotWalletBot}/app?startapp=${payload}&return_url=${returnUrl}`;

    return new Promise((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();

            // проверяем URL на наличие txHash
            try {
                const u = new URL(window.location.href);
                const txHash = u.searchParams.get("tx_hash") || u.searchParams.get("txHash") || "";
                if (txHash) {
                    resolve({ txHash, outcome: null });
                    return;
                }
            } catch { }

            reject(new Error("HOT Wallet sign timeout (20s)"));
        }, 20000);

        const onVisibilityChange = () => {
            if (document.hidden) return;

            setTimeout(() => {
                if (resolved) return;

                try {
                    const u = new URL(window.location.href);
                    const txHash = u.searchParams.get("tx_hash") || u.searchParams.get("txHash") || "";
                    if (txHash) {
                        resolved = true;
                        cleanup();

                        // очищаем URL
                        u.searchParams.delete("tx_hash");
                        u.searchParams.delete("txHash");
                        window.history.replaceState({}, "", u.toString());

                        resolve({ txHash, outcome: null });
                    }
                } catch { }
            }, 300);
        };

        const cleanup = () => {
            clearTimeout(timeout);
            document.removeEventListener("visibilitychange", onVisibilityChange);
        };

        document.addEventListener("visibilitychange", onVisibilityChange);

        try {
            if (typeof tg.openTelegramLink === "function") {
                tg.openTelegramLink(url);
            } else if (typeof tg.openLink === "function") {
                tg.openLink(url);
            } else {
                cleanup();
                reject(new Error("Telegram WebApp does not support openTelegramLink/openLink"));
            }
        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}