import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app

// ВАЖНО: строго HOT Wallet (не herewalletbot)
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

/**
 * Ждём появления Telegram WebApp
 */
async function waitForTelegram(maxWaitMs = 5000) {
    const start = Date.now();

    while (!window.Telegram?.WebApp) {
        if (Date.now() - start > maxWaitMs) {
            throw new Error(
                "Telegram WebApp не загрузился. Открой приложение через @Cardclashbot в Telegram."
            );
        }
        await new Promise((r) => setTimeout(r, 100));
    }

    return window.Telegram.WebApp;
}

/**
 * Инициализируем HERE core с HOT Wallet ID
 */
async function getHereInstance() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");

    await waitForTelegram();

    if (!hereInstance) {
        hereInstance = await HereWallet.connect({
            networkId,
            botId,
            walletId, // HOT Wallet
        });
    }

    return hereInstance;
}

/**
 * Подключение HOT Wallet через HERE core (правильный способ без QR).
 * HERE core сам открывает @hot_wallet mini app и возвращает accountId.
 */
export async function hotWalletConnect() {
    const here = await getHereInstance();

    try {
        window.Telegram?.WebApp?.expand?.();
    } catch { }

    // authenticate() откроет @hot_wallet и вернёт { accountId, publicKey, signature }
    const result = await here.authenticate();

    const accountId = String(result?.accountId || "").trim();
    if (!accountId) {
        throw new Error("HOT Wallet returned no accountId");
    }

    setStoredAccountId(accountId);
    return { accountId };
}

/**
 * Подписание транзакции через HERE core (HOT Wallet)
 */
export async function hotWalletSignAndSendTransaction({ receiverId, actions }) {
    const here = await getHereInstance();

    const accountId = getStoredAccountId();
    if (!accountId) throw new Error("Not connected (no accountId in LS)");

    try {
        window.Telegram?.WebApp?.expand?.();
    } catch { }

    // signAndSendTransaction откроет HOT для подписи и вернёт outcome
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