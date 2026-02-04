import { HereWallet } from "@here-wallet/core";

const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
const HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

function logHot(step, message, extra) {
    try {
        window.__HOT_WALLET_ERRORS__ = window.__HOT_WALLET_ERRORS__ || [];
        window.__HOT_WALLET_ERRORS__.push({
            step,
            message,
            extra,
            time: new Date().toISOString(),
        });
    } catch { }
}

function tgOpen(url) {
    const tg = window.Telegram?.WebApp;
    try {
        tg?.openTelegramLink?.(url);
        return;
    } catch { }
    try {
        tg?.openLink?.(url);
        return;
    } catch { }
    window.open(url, "_blank", "noopener,noreferrer");
}

function walletBotUsernameFromId(walletId) {
    // "herewalletbot/app" -> "herewalletbot"
    const s = String(walletId || "").trim();
    const username = s.split("/")[0].trim();
    return username || "herewalletbot";
}

function openHereWalletTelegram() {
    const username = walletBotUsernameFromId(HOT_WALLET_ID);

    // startapp payload: можно передать network, чтобы кошелек был в нужной сети
    // HERE понимает startapp, остальное зависит от бота/версии
    const payload = encodeURIComponent(`network=${networkId}`);

    const url = `https://t.me/${username}?startapp=${payload}`;
    logHot("hot:deeplink", "Opening HERE wallet via Telegram deep link", { url });
    tgOpen(url);
}

let wallet = null;

async function getWallet() {
    if (wallet) return wallet;

    wallet = await HereWallet.connect({
        networkId,
        walletId: HOT_WALLET_ID,
        telegramBotId: TG_BOT_ID,
        rpcUrl: RPC_URL,
        openUrl: (url) => tgOpen(url),
    });

    return wallet;
}

async function trySignIn(w) {
    if (typeof w.connect === "function") {
        logHot("hot:connect_api", "Using wallet.connect()");
        return await w.connect();
    }
    if (typeof w.signIn === "function") {
        logHot("hot:connect_api", "Using wallet.signIn()");
        return await w.signIn();
    }
    if (typeof w.getAccounts === "function") {
        logHot("hot:connect_api", "Using wallet.getAccounts()");
        const acc = await w.getAccounts();
        return acc?.[0]?.accountId || "";
    }
    return "";
}

export async function connectHotWallet() {
    logHot("hot:start", "Starting HERE/HOT connect...");
    logHot("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId, RPC_URL });

    const w = await getWallet();

    try {
        logHot("hot:connect_call", "Attempting sign in...");
        const res = await trySignIn(w);

        const accountId =
            typeof res === "string"
                ? res
                : res?.accountId || res?.account_id || "";

        if (accountId) {
            logHot("hot:connect_ok", `Connected: ${accountId}`);
            return { accountId, wallet: w };
        }

        // если ничего не вернулось — откроем deeplink
        logHot("hot:connect_empty", "No accountId returned, opening deeplink...");
        openHereWalletTelegram();
        return { accountId: "", wallet: w };
    } catch (e) {
        const msg = e?.message || String(e);
        logHot("hot:signin_throw", msg, { stack: e?.stack });

        // fallback для TG WebView: Load failed => открываем deeplink
        if (msg.toLowerCase().includes("load failed")) {
            logHot("hot:fallback", "signIn failed with Load failed, using Telegram deeplink fallback");
            openHereWalletTelegram();
            return { accountId: "", wallet: w };
        }

        logHot("hot:error", msg, { stack: e?.stack });
        throw e;
    }
}

export async function connectMyNearWallet() {
    throw new Error("MyNearWallet disabled in Telegram WebApp. Use HOT Wallet.");
}

export async function connectWallet() {
    return connectHotWallet();
}

export async function disconnectWallet() {
    const w = await getWallet();
    try {
        if (typeof w.disconnect === "function") await w.disconnect();
        else if (typeof w.signOut === "function") await w.signOut();
    } catch { }
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const w = await getWallet();

    // На случай если пользователь не залогинен — дернем connectHotWallet (она откроет deeplink)
    const { accountId } = await connectHotWallet();
    if (!accountId) throw new Error("Wallet not signed in yet. Complete login in HERE wallet and return.");

    if (typeof w.signAndSendTransaction !== "function") {
        logHot("hot:no_sign", "wallet.signAndSendTransaction missing");
        throw new Error("HERE wallet API mismatch: signAndSendTransaction missing");
    }

    return await w.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}