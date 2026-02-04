import { HereWallet } from "@here-wallet/core";

// network / rpc
const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

// telegram ids
const TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
const HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

function logHot(step, message) {
    try {
        window.__HOT_WALLET_ERRORS__ = window.__HOT_WALLET_ERRORS__ || [];
        window.__HOT_WALLET_ERRORS__.push({
            step,
            message,
            time: new Date().toISOString(),
        });
    } catch { }
}

function tgOpen(url) {
    const tg = window.Telegram?.WebApp;
    try {
        // лучший вариант внутри Telegram
        tg?.openTelegramLink?.(url);
        return;
    } catch { }
    try {
        tg?.openLink?.(url);
        return;
    } catch { }
    window.open(url, "_blank", "noopener,noreferrer");
}

let wallet = null;

async function getWallet() {
    if (wallet) return wallet;

    // HereWallet сам умеет открывать нужные ссылки в Telegram,
    // но мы подстрахуемся openUrl.
    wallet = await HereWallet.connect({
        networkId,
        // некоторые версии core игнорируют эти поля — это ок
        walletId: HOT_WALLET_ID,
        telegramBotId: TG_BOT_ID,
        openUrl: (url) => tgOpen(url),
    });

    return wallet;
}

/**
 * HOT/HERE connect (Telegram-safe)
 */
export async function connectHotWallet() {
    logHot("hot:start", "Starting HERE/HOT connect...");
    logHot("hot:env", `ENV: botId=${TG_BOT_ID}, walletId=${HOT_WALLET_ID}, network=${networkId}`);

    const w = await getWallet();

    try {
        logHot("hot:connect_call", "Calling wallet.connect()...");
        const accountId = await w.connect();
        logHot("hot:connect_ok", `Connected: ${accountId || "(empty)"}`);

        if (!accountId) {
            throw new Error("HERE/HOT did not return accountId");
        }

        return { accountId, wallet: w };
    } catch (e) {
        logHot("hot:error", e?.message || String(e));
        throw e;
    }
}

/**
 * MyNearWallet is DISABLED in Telegram WebApp because it redirects to web login/seed.
 */
export async function connectMyNearWallet() {
    throw new Error("MyNearWallet disabled in Telegram WebApp. Use HOT Wallet.");
}

// legacy alias
export async function connectWallet() {
    return connectHotWallet();
}

export async function disconnectWallet() {
    const w = await getWallet();
    try {
        await w.disconnect();
    } catch { }
}

/**
 * signAndSendTransaction format is compatible with your walletStore:
 * actions: [{ type: "FunctionCall"/"Transfer", params: { ... } }]
 */
export async function signAndSendTransaction({ receiverId, actions }) {
    const w = await getWallet();
    const accountId = await w.connect();
    if (!accountId) throw new Error("Wallet not signed in");

    return await w.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}