import { HereWallet } from "@here-wallet/core";

const networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

// IMPORTANT: for Telegram HOT wallet
// bot username WITHOUT @, plus "/app"
const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // e.g. "Cardclashbot/app"
const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

let herePromise = null;

export async function getHere() {
    if (herePromise) return herePromise;

    herePromise = (async () => {
        // Telegram HOT connect if botId provided
        if (botId) {
            return await HereWallet.connect({
                networkId,
                botId,
                walletId,
            });
        }
        // fallback (non-telegram)
        return await HereWallet.connect({ networkId });
    })();

    return herePromise;
}

/**
 * NO AddKey flow:
 * authenticate() uses signMessage (NEP-413) and returns { accountId }
 */
export async function hereAuthenticate() {
    const here = await getHere();
    return await here.authenticate();
}

export async function hereSignAndSendTransaction({ receiverId, actions }) {
    const here = await getHere();
    return await here.signAndSendTransaction({ receiverId, actions });
}