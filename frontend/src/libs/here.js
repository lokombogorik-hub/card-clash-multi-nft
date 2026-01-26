import { HereWallet } from "@here-wallet/core";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app (без @)

// строго HOT Wallet miniapp
const walletId = "hot_wallet/app";

let herePromise = null;

async function getHere() {
    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");
    if (!herePromise) {
        herePromise = HereWallet.connect({
            networkId,
            botId,
            walletId,
        });
    }
    return await herePromise;
}

export async function hereAuthenticate() {
    try {
        window.Telegram?.WebApp?.expand?.();
    } catch {
        // ignore
    }

    const here = await getHere();
    const res = await here.authenticate();
    const accountId = String(res?.accountId || "").trim();
    return { ...res, accountId };
}

export async function hereSignAndSendTransaction({ receiverId, actions }) {
    try {
        window.Telegram?.WebApp?.expand?.();
    } catch {
        // ignore
    }

    const here = await getHere();
    return await here.signAndSendTransaction({ receiverId, actions });
}