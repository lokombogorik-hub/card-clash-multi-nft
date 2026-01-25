import { HereWallet } from "@here-wallet/core";

const networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

// HOT Telegram Wallet интеграция (как в README)
const BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // например "YourBot/app"
const WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

let herePromise = null;

export async function getHere() {
    if (herePromise) return herePromise;

    // If botId not set, fallback to default connect()
    herePromise = (async () => {
        if (BOT_ID) {
            return await HereWallet.connect({
                networkId,
                botId: BOT_ID,
                walletId: WALLET_ID,
            });
        }
        return await HereWallet.connect({ networkId });
    })();

    return herePromise;
}

/**
 * Login WITHOUT AddKey.
 * Uses authenticate() which internally uses signMessage (NEP-413) and returns accountId.
 */
export async function hereAuthenticate() {
    const here = await getHere();
    return await here.authenticate(); // { accountId }
}

export async function hereSignAndSendTransaction({ receiverId, actions }) {
    const here = await getHere();
    return await here.signAndSendTransaction({ receiverId, actions });
}