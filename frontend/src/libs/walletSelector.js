import { HereWallet, TelegramAppStrategy, WidgetStrategy } from "@here-wallet/core";

const networkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").trim().toLowerCase();
export const networkId = networkIdRaw === "testnet" ? "testnet" : "mainnet";

export const RPC_URL =
    (import.meta.env.VITE_NEAR_RPC_URL || "").trim() ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

let _herePromise = null;

function isTelegramWebApp() {
    try {
        return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe);
    } catch {
        return false;
    }
}

async function getHere() {
    if (_herePromise) return _herePromise;

    const botId = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
    const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

    _herePromise = (async () => {
        const strategy = isTelegramWebApp()
            ? new TelegramAppStrategy(botId, walletId)
            : new WidgetStrategy();

        console.log("[HERE] init", { networkId, RPC_URL, botId, walletId, telegram: isTelegramWebApp() });

        const here = await HereWallet.connect({
            networkId,
            nodeUrl: RPC_URL,
            botId,
            walletId,
            defaultStrategy: strategy,
        });

        return here;
    })();

    return _herePromise;
}

export async function connectWallet() {
    const here = await getHere();

    const contractId =
        (import.meta.env.VITE_NEAR_ALLOWED_SIGNIN_CONTRACT_ID || "").trim() ||
        (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim() ||
        "retardo-s.near";

    console.log("[HERE] signIn", { contractId, networkId });

    // IMPORTANT: this triggers TelegramAppStrategy.request() -> openTelegramLink(...)
    const accountId = await here.signIn({ contractId, methodNames: [] });

    console.log("[HERE] connected", accountId);
    return { accountId };
}

export async function disconnectWallet() {
    const here = await getHere();
    await here.signOut();
}

export async function getSignedInAccountId() {
    const here = await getHere();
    try {
        const ok = await here.isSignedIn();
        if (!ok) return "";
        return await here.getAccountId();
    } catch {
        return "";
    }
}

export async function signAndSendTransaction(params) {
    const here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export async function fetchBalance(accountId) {
    try {
        const res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "b",
                method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId },
            }),
        });

        const json = await res.json();
        if (json.error) return 0;

        const y = BigInt((json.result && json.result.amount) || "0");
        const ONE = 10n ** 24n;
        const whole = y / ONE;
        const frac = (y % ONE).toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + frac);
    } catch {
        return 0;
    }
}