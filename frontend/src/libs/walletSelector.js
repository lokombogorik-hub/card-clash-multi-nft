import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";

const networkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").trim().toLowerCase();
const networkId = networkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

let _selectorPromise = null;

async function getSelector() {
    if (_selectorPromise) return _selectorPromise;

    const botId = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
    const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

    console.log("[WS] init:", { networkId, RPC_URL, botId, walletId });

    _selectorPromise = setupWalletSelector({
        network: networkId,
        modules: [
            setupHereWallet({
                walletOptions: { botId, walletId },
            }),
        ],
    });

    return _selectorPromise;
}

async function connectWallet() {
    const selector = await getSelector();
    const wallet = await selector.wallet("here-wallet");

    const contractId =
        (import.meta.env.VITE_NEAR_ALLOWED_SIGNIN_CONTRACT_ID || "").trim() ||
        (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim() ||
        "retardo-s.near";

    console.log("[WS] signIn:", { networkId, contractId });

    const accounts = await wallet.signIn({ contractId, methodNames: [] });

    console.log("[WS] signIn accounts:", accounts);

    const accountId = accounts && accounts[0] ? accounts[0].accountId : "";
    return { accountId };
}

async function disconnectWallet() {
    const selector = await getSelector();
    const wallet = await selector.wallet("here-wallet");
    await wallet.signOut();
}

async function getSignedInAccountId() {
    const selector = await getSelector();
    const state = selector.store.getState();
    const active = (state.accounts || []).find((a) => a.active) || (state.accounts || [])[0];
    return active ? active.accountId : "";
}

async function signAndSendTransaction(params) {
    const selector = await getSelector();
    const wallet = await selector.wallet("here-wallet");
    return await wallet.signAndSendTransaction(params);
}

async function fetchBalance(accountId) {
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

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
    fetchBalance,
};