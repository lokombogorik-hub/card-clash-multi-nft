import { useSyncExternalStore } from "react";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

const LS_NEAR_NETWORK_ID = "cc_near_network_id";

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

function isTelegramWebApp() {
    try {
        return !!window.Telegram?.WebApp;
    } catch {
        return false;
    }
}

function yoctoToNearFloat(yoctoStr) {
    try {
        const yocto = BigInt(yoctoStr || "0");
        const base = 10n ** 24n;
        const whole = yocto / base;
        const frac = yocto % base;

        // первые 6 знаков после запятой (дальше UI сделает toFixed(4))
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
    network: "near", // для текущего UI
    nearNetworkId: getNearNetworkId(), // mainnet | testnet
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

// ---------------------------
// NEAR selector singleton
// ---------------------------
let nearInitPromise = null;
let selector = null;
let modal = null;
let storeSubscription = null;

function syncFromUrlIfPresent() {
    // после возврата с кошелька иногда прилетает account_id в query
    // + убираем “стремную” ссылку из адресной строки
    try {
        const url = new URL(window.location.href);

        const accountId =
            url.searchParams.get("account_id") ||
            url.searchParams.get("accountId") ||
            "";

        if (!accountId) return;

        setState({ connected: true, walletAddress: accountId });

        fetchNearBalance(getNearNetworkId(), accountId)
            .then((b) => setState({ balance: b }))
            .catch(() => setState({ balance: 0 }));

        url.searchParams.delete("account_id");
        url.searchParams.delete("accountId");
        window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    } catch {
        // ignore
    }
}

async function ensureNear() {
    if (selector && modal) return { selector, modal };
    if (nearInitPromise) return nearInitPromise;

    nearInitPromise = (async () => {
        const nearNetworkId = getNearNetworkId();

        selector = await setupWalletSelector({
            network: nearNetworkId,
            modules: [setupMyNearWallet()],
        });

        modal = setupModal(selector, {
            contractId: defaultContractId,
            theme: "dark",
        });

        setState({ nearNetworkId });

        if (!storeSubscription) {
            storeSubscription = selector.store.observable.subscribe((s) => {
                const active =
                    s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;

                if (!active?.accountId) {
                    setState({
                        connected: false,
                        walletAddress: "",
                        balance: 0,
                    });
                    return;
                }

                setState({
                    connected: true,
                    walletAddress: active.accountId,
                });

                fetchNearBalance(getNearNetworkId(), active.accountId)
                    .then((b) => setState({ balance: b }))
                    .catch(() => setState({ balance: 0 }));
            });
        }

        // initial sync
        const s = selector.store.getState();
        const active =
            s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;

        if (active?.accountId) {
            setState({
                connected: true,
                walletAddress: active.accountId,
            });
            try {
                const b = await fetchNearBalance(nearNetworkId, active.accountId);
                setState({ balance: b });
            } catch {
                setState({ balance: 0 });
            }
        } else {
            setState({ connected: false, walletAddress: "", balance: 0 });
        }

        // подхват аккаунта из URL, если прилетел после редиректа
        syncFromUrlIfPresent();

        return { selector, modal };
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

    const { selector, modal } = await ensureNear();

    // В Telegram WebView попапы режутся. Делаем redirect вместо window.open().
    if (isTelegramWebApp()) {
        const wallet = await selector.wallet("my-near-wallet");

        const originalOpen = window.open;
        window.open = (url) => {
            window.location.assign(url);
            // возвращаем "похожий на window" объект, чтобы модуль не ругался на blocked
            return { focus() { }, closed: false };
        };

        try {
            await wallet.signIn?.({
                contractId: defaultContractId,
                methodNames: [],
                successUrl: window.location.href,
                failureUrl: window.location.href,
            });
            return;
        } finally {
            window.open = originalOpen;
        }
    }

    // Обычный браузер — используем модалку
    modal.show();
}

async function disconnectWallet() {
    if (!selector) {
        setState({ connected: false, walletAddress: "", balance: 0 });
        return;
    }

    try {
        const w = await selector.wallet();
        await w.signOut();
    } catch {
        // ignore
    } finally {
        setState({ connected: false, walletAddress: "", balance: 0 });
    }
}

async function restoreSession() {
    await ensureNear();
    syncFromUrlIfPresent();
}

async function switchNetwork(net) {
    // пока только "near" (UI показывает селектор только если сетей > 1)
    if (net !== "near") throw new Error(`Unsupported network: ${net}`);
}

// стабильные ссылки на actions
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