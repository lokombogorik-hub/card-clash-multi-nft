import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app
const walletId = "hot_wallet/app";

let hereInstance = null;

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
 * Блокируем внешние загрузки HERE (иконки/стили могут быть заблокированы в РФ)
 */
function blockExternalFetches() {
    if (window.__CC_BLOCKED_EXTERNAL_FETCHES__) return;
    window.__CC_BLOCKED_EXTERNAL_FETCHES__ = true;

    const origFetch = window.fetch?.bind(window);
    if (!origFetch) return;

    window.fetch = (input, init) => {
        try {
            const url = typeof input === 'string' ? input : (input?.url || '');

            // блокируем загрузку HERE wallet UI assets (они могут быть на blocked CDN)
            if (
                url.includes('herewallet.app') ||
                url.includes('hotwallet.app') ||
                url.includes('tgapp.') ||
                url.includes('unpkg.com') ||
                url.includes('jsdelivr.net')
            ) {
                console.warn('[HOT] Blocked external fetch (may be censored in Russia):', url);
                // возвращаем пустой успешный ответ, чтобы не ломать HERE core
                return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
            }
        } catch { }

        return origFetch(input, init);
    };
}

async function getHereInstance() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");

    await waitForTelegram();
    blockExternalFetches();

    if (!hereInstance) {
        hereInstance = await HereWallet.connect({
            networkId,
            botId,
            walletId,
        });
    }

    return hereInstance;
}

export async function hotWalletConnect() {
    const here = await getHereInstance();

    try {
        window.Telegram?.WebApp?.expand?.();
    } catch { }

    // authenticate() откроет @hot_wallet и вернёт accountId
    const result = await here.authenticate();

    const accountId = String(result?.accountId || "").trim();
    if (!accountId) {
        throw new Error("HOT Wallet returned no accountId");
    }

    setStoredAccountId(accountId);
    return { accountId };
}

export async function hotWalletSignAndSendTransaction({ receiverId, actions }) {
    const here = await getHereInstance();

    const accountId = getStoredAccountId();
    if (!accountId) throw new Error("Not connected (no accountId in LS)");

    try {
        window.Telegram?.WebApp?.expand?.();
    } catch { }

    const outcome = await here.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });

    const txHash =
        outcome?.transaction?.hash ||
        outcome?.transaction_outcome?.id ||
        outcome?.final_execution_outcome?.transaction?.hash ||
        null;

    return { outcome, txHash };
}