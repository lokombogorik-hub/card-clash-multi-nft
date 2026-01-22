import { useSyncExternalStore } from "react";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

const LS_NEAR_NETWORK_ID = "cc_near_network_id";
const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const defaultNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envContractId = import.meta.env.VITE_NEAR_CONTRACT_ID || "";
const defaultContractId =
    envContractId || (defaultNetworkId === "testnet" ? "cardclash.testnet" : "cardclash.near");

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";

function getNearNetworkId() {
    const fromLs = (localStorage.getItem(LS_NEAR_NETWORK_ID) || "").toLowerCase();
    if (fromLs === "testnet" || fromLs === "mainnet") return fromLs;
    return defaultNetworkId;
}

function getRpcUrl(networkId) {
    if (envRpcUrl) return envRpcUrl;
    return networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org";
}

function yoctoToNearFloat(yoctoStr) {
    try {
        const yocto = BigInt(yoctoStr || "0");
        const base = 10n ** 24n;
        const whole = yocto / base;
        const frac = yocto % base;
        const fracStr = frac.toString().padStart(24, "0").slice(0, 6);
        return Number(`${whole.toString()}.${fracStr}`);
    } catch {
        return 0;
    }
}

async function fetchNearBalance(networkId, accountId) {
    const rpcUrl = getRpcUrl(networkId);

    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "cc-balance",
            method: "query",
            params: {
                request_type: "view_account",
                finality: "final",
                account_id: accountId,
            },
        }),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`NEAR RPC error: ${res.status} ${text}`);
    }

    const json = await res.json();
    const amount = json?.result?.amount;
    return yoctoToNearFloat(amount);
}

let state = {
    connected: false,
    walletAddress: "",
    network: "near",
    nearNetworkId: getNearNetworkId(),
    balance: 0,
    availableNetworks: ["near"],
    status: "",

    connectWallet: async (_network) => { },
    disconnectWallet: async () => { },
    switchNetwork: async (_network) => { },
    restoreSession: async () => { },
};

const listeners = new Set();
function setState(patch) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
}

function applyAccount(accountId) {
    if (!accountId) return;

    setState({ connected: true, walletAddress: accountId, status: "" });

    try {
        localStorage.setItem(LS_NEAR_ACCOUNT_ID, accountId);
    } catch { }

    fetchNearBalance(getNearNetworkId(), accountId)
        .then((b) => setState({ balance: b }))
        .catch(() => setState({ balance: 0 }));
}

function applyFallbackFromStorage() {
    try {
        const accountId = localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "";
        if (!accountId) return false;
        applyAccount(accountId);
        return true;
    } catch {
        return false;
    }
}

function syncFromUrlIfPresent() {
    try {
        const url = new URL(window.location.href);
        const p = url.searchParams;

        const accountId = p.get("account_id") || p.get("accountId") || "";
        if (!accountId) return false;

        applyAccount(accountId);

        const keysToRemove = [
            "account_id",
            "accountId",
            "all_keys",
            "public_key",
            "meta",
            "errorCode",
            "errorMessage",
            "transactionHashes",
            "signInErrorType",
        ];
        for (const k of keysToRemove) p.delete(k);

        window.history.replaceState({}, "", url.pathname + (p.toString() ? `?${p.toString()}` : "") + url.hash);
        return true;
    } catch {
        return false;
    }
}

let nearInitPromise = null;
let selector = null;
let storeSubscription = null;

async function ensureNear() {
    if (selector) return selector;
    if (nearInitPromise) return nearInitPromise;

    nearInitPromise = (async () => {
        const nearNetworkId = getNearNetworkId();

        selector = await setupWalletSelector({
            network: nearNetworkId,
            modules: [setupMyNearWallet()],
        });

        setState({ nearNetworkId });

        if (!storeSubscription) {
            storeSubscription = selector.store.observable.subscribe((s) => {
                const active = s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;

                if (!active?.accountId) {
                    if (!applyFallbackFromStorage()) {
                        setState({ connected: false, walletAddress: "", balance: 0 });
                    }
                    return;
                }

                applyAccount(active.accountId);
            });
        }

        const s0 = selector.store.getState();
        const active0 = s0.accounts?.find((a) => a.active) || s0.accounts?.[0] || null;

        if (active0?.accountId) applyAccount(active0.accountId);
        else {
            if (!syncFromUrlIfPresent()) applyFallbackFromStorage();
        }

        return selector;
    })();

    return nearInitPromise;
}

async function connectWallet(network) {
    if (network && network !== "near") throw new Error(`Unsupported network: ${network}`);

    setState({ status: "Открываю кошелёк…" });

    const sel = await ensureNear();
    const wallet = await sel.wallet("my-near-wallet");

    const originalOpen = window.open;
    window.open = (url) => {
        // В Telegram WebView попапы режутся — редиректим
        window.location.assign(url);
        return { focus() { }, closed: false };
    };

    try {
        const backUrl = window.location.href;

        // ВАЖНО: НЕ await — иначе “висим” навсегда в WebView
        wallet
            .signIn?.({
                contractId: defaultContractId,
                methodNames: [],
                successUrl: backUrl,
                failureUrl: backUrl,
            })
            ?.catch(() => { });

        setState({ status: "Заверши вход в MyNearWallet и вернись в игру." });
    } finally {
        window.open = originalOpen;
    }
}

async function disconnectWallet() {
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

    try {
        if (selector) {
            const w = await selector.wallet();
            await w.signOut();
        }
    } catch { }

    setState({ connected: false, walletAddress: "", balance: 0, status: "" });
}

async function restoreSession() {
    await ensureNear();
    syncFromUrlIfPresent();
    applyFallbackFromStorage();
}

async function switchNetwork(net) {
    if (net !== "near") throw new Error(`Unsupported network: ${net}`);
}

state = {
    ...state,
    connectWallet,
    disconnectWallet,
    restoreSession,
    switchNetwork,
};

export function useWalletStore() {
    return useSyncExternalStore(
        (cb) => {
            listeners.add(cb);
            return () => listeners.delete(cb);
        },
        () => state,
        () => state
    );
}