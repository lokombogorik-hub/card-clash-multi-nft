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

function listMethods(obj) {
    try {
        const keys = new Set();
        for (const k in obj) keys.add(k);
        Object.getOwnPropertyNames(obj).forEach((k) => keys.add(k));
        const proto = Object.getPrototypeOf(obj);
        if (proto) Object.getOwnPropertyNames(proto).forEach((k) => keys.add(k));
        return Array.from(keys).sort();
    } catch {
        return [];
    }
}

function safeStringify(x) {
    try {
        return JSON.stringify(x);
    } catch {
        return String(x);
    }
}

async function ensureSignedIn(w) {
    // 1) new API
    if (typeof w.connect === "function") {
        logHot("hot:connect_api", "Using wallet.connect()");
        const accountId = await w.connect();
        logHot("hot:connect_result", "wallet.connect() result", {
            type: typeof accountId,
            value: String(accountId || ""),
        });
        return accountId || "";
    }

    // 2) old API: signIn
    if (typeof w.signIn === "function") {
        logHot("hot:connect_api", "Using wallet.signIn()");

        let res;
        try {
            res = await w.signIn();
        } catch (e) {
            logHot("hot:signin_throw", e?.message || String(e), { stack: e?.stack });
            throw e;
        }

        logHot("hot:signin_result", "wallet.signIn() raw result", {
            type: typeof res,
            value: typeof res === "string" ? res : safeStringify(res),
        });

        if (typeof res === "string") return res;
        if (res?.accountId) return res.accountId;
        if (res?.account_id) return res.account_id;

        // some versions store account id on wallet after signin
        if (typeof w.getAccounts === "function") {
            const accounts = await w.getAccounts().catch(() => []);
            logHot("hot:getaccounts_after_signin", "wallet.getAccounts() after signIn", { accounts });
            const id = accounts?.[0]?.accountId || "";
            if (id) return id;
        }
    }

    // 3) try getAccounts without signIn
    if (typeof w.getAccounts === "function") {
        logHot("hot:connect_api", "Using wallet.getAccounts()");
        const accounts = await w.getAccounts();
        logHot("hot:getaccounts_result", "wallet.getAccounts() result", { accounts });
        const accountId = accounts?.[0]?.accountId || "";
        if (accountId) return accountId;
    }

    // 4) try accountId/getAccountId
    if (typeof w.accountId === "function") {
        logHot("hot:connect_api", "Using wallet.accountId()");
        const id = await w.accountId();
        logHot("hot:accountid_result", "wallet.accountId() result", { id });
        if (id) return id;
    }
    if (typeof w.getAccountId === "function") {
        logHot("hot:connect_api", "Using wallet.getAccountId()");
        const id = await w.getAccountId();
        logHot("hot:getaccountid_result", "wallet.getAccountId() result", { id });
        if (id) return id;
    }

    const methods = listMethods(w);
    logHot("hot:no_api", "No supported connect method on wallet object", { methods });
    throw new Error("HERE wallet API mismatch: no connect/signIn/getAccounts method found");
}

export async function connectHotWallet() {
    logHot("hot:start", "Starting HERE/HOT connect...");
    logHot("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId, RPC_URL });

    const w = await getWallet();

    try {
        logHot("hot:connect_call", "Ensuring signed in...");
        const accountId = await ensureSignedIn(w);
        logHot("hot:connect_ok", `Connected: ${accountId || "(empty)"}`);

        if (!accountId) {
            const methods = listMethods(w);
            logHot("hot:connect_empty", "Connected but accountId empty", { methods });
            throw new Error("HERE/HOT did not return accountId");
        }

        return { accountId, wallet: w };
    } catch (e) {
        logHot("hot:error", e?.message || String(e), { stack: e?.stack });
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
        if (typeof w.disconnect === "function") {
            await w.disconnect();
            return;
        }
        if (typeof w.signOut === "function") {
            await w.signOut();
            return;
        }
    } catch { }
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const w = await getWallet();
    const accountId = await ensureSignedIn(w);
    if (!accountId) throw new Error("Wallet not signed in");

    if (typeof w.signAndSendTransaction !== "function") {
        const methods = listMethods(w);
        logHot("hot:no_sign", "wallet.signAndSendTransaction is missing", { methods });
        throw new Error("HERE wallet API mismatch: signAndSendTransaction is missing");
    }

    return await w.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}