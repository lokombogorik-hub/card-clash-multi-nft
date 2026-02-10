import { HereWallet, TelegramAppStrategy, WidgetStrategy } from "@here-wallet/core";

export const networkId = "mainnet"; // FORCE MAINNET (no env ambiguity)

export const RPC_URL =
    (import.meta.env.VITE_NEAR_RPC_URL || "").trim() || "https://rpc.mainnet.near.org";

let _herePromise = null;

function isTelegramWebApp() {
    try {
        return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe);
    } catch {
        return false;
    }
}

function getStartParam() {
    try {
        return (
            window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
            window.Telegram?.WebApp?.initDataUnsafe?.startParam ||
            ""
        );
    } catch {
        return "";
    }
}

async function getHere() {
    if (_herePromise) return _herePromise;

    // IMPORTANT: bot username MUST be lowercase in tg links
    const botId = String(import.meta.env.VITE_TG_BOT_ID || "cardclashbot/app")
        .trim()
        .toLowerCase();

    const walletId = String(import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app")
        .trim()
        .toLowerCase();

    _herePromise = (async () => {
        const telegram = isTelegramWebApp();
        const startParam = getStartParam();

        console.log("[HERE] init", { networkId, RPC_URL, botId, walletId, telegram, startParam });

        const strategy = telegram ? new TelegramAppStrategy(botId, walletId) : new WidgetStrategy();

        const here = await HereWallet.connect({
            networkId,
            nodeUrl: RPC_URL,
            botId,
            walletId,
            defaultStrategy: strategy,
        });

        // Log signed-in state after connect() processed possible "hot-..." return
        try {
            const ok = await here.isSignedIn();
            const aid = ok ? await here.getAccountId().catch(() => "") : "";
            console.log("[HERE] post-connect signedIn:", ok, "accountId:", aid);
        } catch (e) {
            console.log("[HERE] post-connect check failed:", e?.message || String(e));
        }

        return here;
    })();

    return _herePromise;
}

export async function connectWallet() {
    const here = await getHere();

    const contractId =
        String(import.meta.env.VITE_NEAR_ALLOWED_SIGNIN_CONTRACT_ID || "retardo-s.near")
            .trim()
            .toLowerCase();

    console.log("[HERE] signIn", { contractId, networkId });

    // This should open HERE wallet on Telegram and come back via start_param
    const accountId = await here.signIn({ contractId, methodNames: [] });

    console.log("[HERE] signIn result accountId:", accountId);

    return { accountId: String(accountId || "") };
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