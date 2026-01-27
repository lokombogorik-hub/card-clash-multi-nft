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
 * Подключение HOT Wallet через Telegram Mini App deep link.
 * HOT вернёт accountId через WebApp callback.
 */
export async function hotWalletConnect() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");

    const tg = await waitForTelegram();

    // Формируем payload для HOT: connect_<yourBotId>_<network>
    const payload = `connect_${encodeURIComponent(botId)}_${networkId}`;
    const url = `https://t.me/${hotWalletBot}/app?startapp=${payload}`;

    try {
        tg.expand?.();
    } catch { }

    return new Promise((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error("HOT Wallet connect timeout (15s). Пользователь отменил или HOT не вернул данные."));
        }, 15000);

        // Слушаем возврат данных от HOT через Telegram WebApp API
        const onDataReceived = (event) => {
            if (resolved) return;

            try {
                const data = event?.data || event?.detail?.data || "";
                if (!data) return;

                // HOT может вернуть JSON вида { "near_account_id": "user.near" }
                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    // если не JSON, пробуем parse как query string
                    const params = new URLSearchParams(data);
                    parsed = {
                        near_account_id: params.get("near_account_id") || params.get("accountId") || "",
                    };
                }

                const accountId = String(parsed?.near_account_id || parsed?.accountId || "").trim();
                if (!accountId) return;

                resolved = true;
                cleanup();
                setStoredAccountId(accountId);
                resolve({ accountId });
            } catch (err) {
                console.error("[HOT] Failed to parse data from HOT Wallet:", err);
            }
        };

        // Слушаем событие возврата в игру
        const onViewportChanged = () => {
            // Когда пользователь вернулся из HOT, проверяем LS (HOT может записать напрямую)
            setTimeout(() => {
                if (resolved) return;
                const accountId = getStoredAccountId();
                if (accountId) {
                    resolved = true;
                    cleanup();
                    resolve({ accountId });
                }
            }, 300);
        };

        const cleanup = () => {
            clearTimeout(timeout);
            try {
                tg.offEvent?.("web_app_data_received", onDataReceived);
                tg.offEvent?.("viewportChanged", onViewportChanged);
            } catch { }
        };

        // Подписываемся на события
        try {
            tg.onEvent?.("web_app_data_received", onDataReceived);
            tg.onEvent?.("viewportChanged", onViewportChanged);
        } catch (err) {
            console.warn("[HOT] Failed to subscribe to Telegram events:", err);
        }

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

    // Формируем payload для подписи транзакции
    const txData = {
        receiverId,
        actions,
        signerId: accountId,
    };

    const txPayloadEncoded = encodeURIComponent(btoa(JSON.stringify(txData)));
    const payload = `sign_${encodeURIComponent(botId)}_${txPayloadEncoded}`;
    const url = `https://t.me/${hotWalletBot}/app?startapp=${payload}`;

    return new Promise((resolve, reject) => {
        let resolved = false;
        const timeout = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            reject(new Error("HOT Wallet sign timeout (15s)"));
        }, 15000);

        const onDataReceived = (event) => {
            if (resolved) return;

            try {
                const data = event?.data || event?.detail?.data || "";
                if (!data) return;

                let parsed = null;
                try {
                    parsed = JSON.parse(data);
                } catch {
                    const params = new URLSearchParams(data);
                    parsed = {
                        txHash: params.get("tx_hash") || params.get("txHash") || "",
                    };
                }

                const txHash = String(parsed?.txHash || parsed?.tx_hash || "").trim();
                if (!txHash) return;

                resolved = true;
                cleanup();
                resolve({ txHash, outcome: parsed });
            } catch (err) {
                console.error("[HOT] Failed to parse tx result:", err);
            }
        };

        const cleanup = () => {
            clearTimeout(timeout);
            try {
                tg.offEvent?.("web_app_data_received", onDataReceived);
            } catch { }
        };

        try {
            tg.onEvent?.("web_app_data_received", onDataReceived);
        } catch { }

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