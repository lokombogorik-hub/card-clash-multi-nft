import { useSyncExternalStore } from "react";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";

const LS_NEAR_NETWORK_ID = "cc_near_network_id";
const LS_NEAR_ACCOUNT_ID = "cc_near_account_id"; // fallback (Telegram flow)

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

function applyFallbackAccountIfPresent() {
    try {
        const accountId = localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "";
        if (!accountId) return false;

        setState({ connected: true, walletAddress: accountId });
        fetchNearBalance(getNearNetworkId(), accountId)
            .then((b) => setState({ balance: b }))
            .catch(() => setState({ balance: 0 }));

        return true;
    } catch {
        return false;
    }
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

// ---------------------------
// NEAR selector singleton
// ---------------------------
let nearInitPromise = null;
let selector = null;
let modal = null;
let storeSubscription = null;

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

        // подписка на selector (полезна в обычном браузере)
        if (!storeSubscription) {
            storeSubscription = selector.store.observable.subscribe((s) => {
                const active =
                    s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;

                if (!active?.accountId) {
                    // если есть fallback аккаунт (telegram-flow) — держим connected
                    if (applyFallbackAccountIfPresent()) return;

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
            // если selector пустой — попробуем fallback из localStorage
            if (!applyFallbackAccountIfPresent()) {
                setState({ connected: false, walletAddress: "", balance: 0 });
            }
        }

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

    // Telegram WebApp: попапы могут быть убиты. Делаем вход через redirect в кошелёк,
    // а обратно возвращаемся через callback URL (App.jsx обработает near_cb=1).
    if (isTelegramWebApp()) {
        const tg = window.Telegram?.WebApp;

        const wallet = await selector.wallet("my-near-wallet");

        const callbackUrl = `${window.location.origin}/?near_cb=1`;

        // Перехватываем window.open (который кошелёк использует под popup),
        // и открываем ссылку через Telegram openLink (обычно уедет во внутренний браузер/системный).
        const originalOpen = window.open;
        window.open = (url) => {
            try {
                if (tg?.openLink) tg.openLink(url);
                else window.location.assign(url);
            } catch {
                window.location.assign(url);
            }
            return { focus() { }, closed: false };
        };

        try {
            await wallet.signIn?.({
                contractId: defaultContractId,
                methodNames: [],
                successUrl: callbackUrl,
                failureUrl: callbackUrl,
            });
            return;
        } finally {
            window.open = originalOpen;
        }
    }

    // Обычный браузер (не Telegram) — показываем модалку
    modal.show();
}

async function disconnectWallet() {
    // чистим fallback (telegram-flow)
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

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

    // если после перезапуска selector пуст — но у нас есть fallback accountId (telegram-flow),
    // показываем как connected
    applyFallbackAccountIfPresent();
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