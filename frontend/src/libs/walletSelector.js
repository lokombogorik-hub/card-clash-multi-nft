import { HereWallet } from "@here-wallet/core";

var envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
var networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

var TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
var HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

function tgOpen(url) {
    var tg = window.Telegram && window.Telegram.WebApp;
    try {
        if (tg && tg.openTelegramLink) {
            tg.openTelegramLink(url);
            console.log("[HOT] openTelegramLink:", url);
            return true;
        }
    } catch (e) {
        console.warn("[HOT] openTelegramLink failed:", e.message);
    }
    try {
        if (tg && tg.openLink) {
            tg.openLink(url, { try_instant_view: false });
            console.log("[HOT] openLink:", url);
            return true;
        }
    } catch (e) {
        console.warn("[HOT] openLink failed:", e.message);
    }
    window.open(url, "_blank", "noopener,noreferrer");
    console.log("[HOT] window.open:", url);
    return false;
}

var wallet = null;
var isConnecting = false;

async function getWallet() {
    if (wallet) return wallet;

    console.log("[HOT] Initializing HereWallet...", { networkId: networkId, RPC_URL: RPC_URL });

    try {
        wallet = await HereWallet.connect({
            networkId: networkId,
            walletId: HOT_WALLET_ID,
            telegramBotId: TG_BOT_ID,
            rpcUrl: RPC_URL,
            openUrl: function (url) {
                console.log("[HOT] SDK openUrl callback:", url);
                tgOpen(url);
            },
        });

        console.log("[HOT] HereWallet initialized OK");
        return wallet;
    } catch (e) {
        console.error("[HOT] HereWallet.connect() failed:", e.message);
        wallet = null;
        throw e;
    }
}

async function getSignedInAccountId() {
    try {
        var w = await getWallet();

        if (typeof w.isSignedIn === "function") {
            var signedIn = await w.isSignedIn();
            if (!signedIn) return "";
        }

        if (typeof w.getAccountId === "function") {
            var id = await w.getAccountId();
            if (id) return String(id);
        }

        if (typeof w.getAccounts === "function") {
            var accounts = await w.getAccounts();
            if (accounts && accounts.length > 0) {
                var accId = accounts[0].accountId || accounts[0];
                if (accId) return String(accId);
            }
        }
    } catch (e) {
        console.warn("[HOT] getSignedInAccountId error:", e.message);
    }

    return "";
}

async function connectWallet() {
    if (isConnecting) {
        throw new Error("Connection already in progress");
    }

    isConnecting = true;
    console.log("[HOT] Starting connect...", { networkId: networkId });

    try {
        var w = await getWallet();

        // Проверяем уже авторизован
        var existingId = await getSignedInAccountId();
        if (existingId) {
            console.log("[HOT] Already signed in:", existingId);
            isConnecting = false;
            return { accountId: existingId };
        }

        if (typeof w.signIn !== "function") {
            throw new Error("HOT Wallet SDK: signIn method not found");
        }

        console.log("[HOT] Calling signIn...");

        var res = null;
        try {
            res = await w.signIn({
                contractId: (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim() || undefined,
            });
        } catch (e) {
            var msg = String(e && e.message || "").toLowerCase();
            console.warn("[HOT] signIn error:", e.message);

            if (msg.indexOf("load failed") !== -1 || msg.indexOf("user reject") !== -1) {
                console.log("[HOT] User needs to authorize in HOT Wallet");
                isConnecting = false;
                return { accountId: "" };
            }

            throw e;
        }

        var accountId = "";
        if (typeof res === "string") {
            accountId = res;
        } else if (res && typeof res === "object") {
            accountId = res.accountId || res.account_id || "";
        }

        if (!accountId) {
            // Пробуем получить после signIn
            accountId = await getSignedInAccountId();
        }

        if (accountId) {
            console.log("[HOT] Connected:", accountId);
        } else {
            console.log("[HOT] No account yet, user needs to complete auth in HOT Wallet");
        }

        isConnecting = false;
        return { accountId: accountId };

    } catch (e) {
        isConnecting = false;
        console.error("[HOT] Connect error:", e.message);
        throw e;
    }
}

async function disconnectWallet() {
    try {
        var w = await getWallet();
        if (typeof w.signOut === "function") {
            await w.signOut();
        }
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }
    wallet = null;
    isConnecting = false;
}

async function signAndSendTransaction(params) {
    var w = await getWallet();

    var accountId = await getSignedInAccountId();
    if (!accountId) {
        throw new Error("Wallet not signed in");
    }

    var result = await w.signAndSendTransaction({
        signerId: accountId,
        receiverId: params.receiverId,
        actions: params.actions,
    });

    return result;
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};