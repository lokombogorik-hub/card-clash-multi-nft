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
    const s = String(walletId || "").trim();
    const username = s.split("/")[0].trim();
    return username || "herewalletbot";
}

function openHereWalletTelegram() {
    const username = walletBotUsernameFromId(HOT_WALLET_ID);
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

/**
 * Silent check: DO NOT call signIn/connect here.
 * Only tries to read already-authorized account from wallet storage/session.
 */
export async function getSignedInAccountId() {
    const w = await getWallet();

    try {
        if (typeof w.getAccounts === "function") {
            const accounts = await w.getAccounts();
            const id = accounts?.[0]?.accountId || "";
            logHot("hot:silent_accounts", "getAccounts()", { id });
            return id;
        }
    } catch (e) {
        logHot("hot:silent_accounts_err", e?.message || String(e));
    }

    try {
        if (typeof w.getAccountId === "function") {
            const id = await w.getAccountId();
            logHot("hot:silent_getAccountId", "getAccountId()", { id });
            return id || "";
        }
    } catch (e) {
        logHot("hot:silent_getAccountId_err", e?.message || String(e));
    }

    try {
        if (typeof w.accountId === "function") {
            const id = await w.accountId();
            logHot("hot:silent_accountId", "accountId()", { id });
            return id || "";
        }
    } catch (e) {
        logHot("hot:silent_accountId_err", e?.message || String(e));
    }

    return "";
}

/**
 * Active connect: MAY call signIn/connect and MAY open deeplink.
 * Call ONLY from user click.
 */
export async function connectHotWallet() {
    logHot("hot:start", "Starting HERE/HOT connect (active)...");
    logHot("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId, RPC_URL });

    const w = await getWallet();

    try {
        // Some versions have connect()
        if (typeof w.connect === "function") {
            logHot("hot:connect_api", "Using wallet.connect()");
            const id = await w.connect();
            if (id) return { accountId: id, wallet: w };
        }

        // Old versions: signIn()
        if (typeof w.signIn === "function") {
            logHot("hot:connect_api", "Using wallet.signIn()");
            const res = await w.signIn();
            const accountId =
                typeof res === "string" ? res : res?.accountId || res?.account_id || "";

            if (accountId) return { accountId, wallet: w };

            // maybe wallet now has accounts
            const silentId = await getSignedInAccountId();
            if (silentId) return { accountId: silentId, wallet: w };
        }

        // If no id - open deeplink
        openHereWalletTelegram();
        return { accountId: "", wallet: w };
    } catch (e) {
        const msg = e?.message || String(e);
        logHot("hot:error", msg, { stack: e?.stack });

        if (msg.toLowerCase().includes("load failed")) {
            openHereWalletTelegram();
            return { accountId: "", wallet: w };
        }

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

    // IMPORTANT: do not auto-open deeplink here.
    // If not signed in, throw and UI should ask user to connect.
    const accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Wallet not signed in. Click Connect HOT Wallet.");

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