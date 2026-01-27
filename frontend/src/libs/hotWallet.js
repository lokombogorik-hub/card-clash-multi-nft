const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app
const hotDomain = "hot_wallet"; // строго @hot_wallet

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

/**
 * Ждём появления Telegram WebApp (если загружается async)
 */
async function waitForTelegram(maxWaitMs = 5000) {
    const start = Date.now();

    while (!window.Telegram?.WebApp) {
        if (Date.now() - start > maxWaitMs) {
            throw new Error(
                "Telegram WebApp не загрузился. Убедись, что открыл приложение через бота в Telegram (не напрямую по URL)."
            );
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    return window.Telegram.WebApp;
}

/**
 * Открываем HOT Wallet mini app напрямую (без HERE core / QR).
 */
export async function hotWalletConnect() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");

    const tg = await waitForTelegram();

    try {
        tg.expand?.();
    } catch { }

    const payload = `auth_${encodeURIComponent(botId)}_${networkId}`;
    const url = `https://t.me/${hotDomain}/app?startapp=${payload}`;

    if (typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(url);
    } else if (typeof tg.openLink === "function") {
        tg.openLink(url);
    } else {
        throw new Error("Telegram WebApp does not support openTelegramLink/openLink");
    }

    return new Promise((resolve, reject) => {
        let tries = 0;
        const maxTries = 60; // ~15s

        const poll = setInterval(() => {
            tries += 1;

            const accountId = getStoredAccountId();
            if (accountId) {
                clearInterval(poll);
                resolve({ accountId });
                return;
            }

            try {
                const u = new URL(window.location.href);
                const acc =
                    u.searchParams.get("near_account_id") ||
                    u.searchParams.get("accountId") ||
                    u.searchParams.get("account_id") ||
                    "";
                if (acc) {
                    clearInterval(poll);
                    setStoredAccountId(acc);
                    resolve({ accountId: acc });
                    return;
                }
            } catch { }

            if (tries >= maxTries) {
                clearInterval(poll);
                reject(new Error("HOT Wallet connect timeout (user did not return or cancelled)"));
            }
        }, 250);
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

    const txPayload = btoa(
        JSON.stringify({
            receiverId,
            actions,
            signerId: accountId,
        })
    );

    const payload = `sign_${encodeURIComponent(botId)}_${encodeURIComponent(txPayload)}`;
    const url = `https://t.me/${hotDomain}/app?startapp=${payload}`;

    if (typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(url);
    } else if (typeof tg.openLink === "function") {
        tg.openLink(url);
    } else {
        throw new Error("Telegram WebApp does not support openTelegramLink/openLink");
    }

    return new Promise((resolve, reject) => {
        let tries = 0;
        const maxTries = 60;

        const poll = setInterval(() => {
            tries += 1;

            try {
                const u = new URL(window.location.href);
                const txHash = u.searchParams.get("tx_hash") || u.searchParams.get("txHash") || "";
                if (txHash) {
                    clearInterval(poll);
                    resolve({ txHash });
                    return;
                }
            } catch { }

            if (tries >= maxTries) {
                clearInterval(poll);
                reject(new Error("HOT Wallet sign timeout"));
            }
        }, 250);
    });
}