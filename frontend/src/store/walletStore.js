import { useSyncExternalStore } from "react";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

const LS_NEAR_NETWORK_ID = "cc_near_network_id";
const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase(); // mainnet | testnet
const defaultNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envContractId = import.meta.env.VITE_NEAR_CONTRACT_ID || "";
const defaultContractId =
    envContractId ||
    (defaultNetworkId === "testnet" ? "cardclash.testnet" : "cardclash.near");

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";

function getNearNetworkId() {
    const fromLs = (localStorage.getItem(LS_NEAR_NETWORK_ID) || "").toLowerCase();
    if (fromLs === "testnet" || fromLs === "mainnet") return fromLs;
    return defaultNetworkId;
}

function getRpcUrl(networkId) {
    if (envRpcUrl) return envRpcUrl;
    return networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org";
}

function yoctoToNearFloat(yoctoStr) {
    try {
        const yocto = BigInt(yoctoStr || "0");
        const base = 10n ** 24n;
        const whole = yocto / base;
        const frac = yocto % base;

        // первые 6 знаков после запятой (дальше UI делает toFixed(4))
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

// ---------------------------
// tiny external store (без zustand)
// ---------------------------
let state = {
    connected: false,
    walletAddress: "",
    network: "near",
    nearNetworkId: getNearNetworkId(),
    balance: 0,
    availableNetworks: ["near"],

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

    setState({ connected: true, walletAddress: accountId });

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
    // MyNearWallet после логина может вернуть ?account_id=...&all_keys=... и т.п.
    try {
        const url = new URL(window.location.href);
        const p = url.searchParams;

        const accountId = p.get("account_id") || p.get("accountId") || "";
        if (!accountId) return false;

        applyAccount(accountId);

        // чистим "стремную ссылку"
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

// ---------------------------
// NEAR selector singleton
// ---------------------------
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
                const active =
                    s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;

                if (!active?.accountId) {
                    // если selector пустой — пробуем fallback из localStorage
                    if (!applyFallbackFromStorage()) {
                        setState({ connected: false, walletAddress: "", balance: 0 });
                    }
                    return;
                }

                applyAccount(active.accountId);
            });
        }

        // initial
        const s0 = selector.store.getState();
        const active0 =
            s0.accounts?.find((a) => a.active) || s0.accounts?.[0] || null;

        if (active0?.accountId) applyAccount(active0.accountId);
        else {
            // сначала попробуем account_id из URL, затем localStorage
            if (!syncFromUrlIfPresent()) applyFallbackFromStorage();
        }

        return selector;
    })();

    return nearInitPromise;
}

// ---------------------------
// Actions
// ---------------------------
async function connectWallet(network) {
    if (network && network !== "near") {
        throw new Error(`Unsupported network: ${network}`);
    }

    const sel = await ensureNear();
    const wallet = await sel.wallet("my-near-wallet");

    // ВАЖНО: никаких popup / tg.openLink.
    // Делаем redirect в ЭТОМ ЖЕ WebView/вкладке => кошелек вернет обратно сам на successUrl.
    const originalOpen = window.open;
    window.open = (url) => {
        window.location.assign(url);
        return { focus() { }, closed: false };
    };

    try {
        const backUrl = window.location.href; // вернёт сюда же, но уже с account_id
        await wallet.signIn?.({
            contractId: defaultContractId,
            methodNames: [],
            successUrl: backUrl,
            failureUrl: backUrl,
        });
    } finally {
        window.open = originalOpen;
    }
}

async function disconnectWallet() {
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

    // пытаемся разлогинить selector (если доступен)
    try {
        if (selector) {
            const w = await selector.wallet();
            await w.signOut();
        }
    } catch {
        // ignore
    }

    setState({ connected: false, walletAddress: "", balance: 0 });
}

async function restoreSession() {
    await ensureNear();
    // если вернулись с кошелька и URL содержит account_id — подхватим
    syncFromUrlIfPresent();
    // если selector пустой — fallback
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