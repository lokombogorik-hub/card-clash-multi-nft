import { useSyncExternalStore } from "react";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const nearNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";
const rpcUrl =
    envRpcUrl ||
    (nearNetworkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

// Контракт должен существовать (для sign-in context)
const envLoginContractId = import.meta.env.VITE_NEAR_LOGIN_CONTRACT_ID || "";
const loginContractId =
    envLoginContractId || (nearNetworkId === "testnet" ? "guest-book.testnet" : "wrap.near");

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

async function fetchNearBalance(accountId) {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "cc-balance",
            method: "query",
            params: { request_type: "view_account", finality: "final", account_id: accountId },
        }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    if (!json) throw new Error("RPC invalid JSON");
    if (json.error) {
        const msg =
            json?.error?.data?.message ||
            json?.error?.message ||
            "NEAR RPC error (account/network mismatch?)";
        throw new Error(msg);
    }
    const amount = json?.result?.amount;
    if (!amount) throw new Error("No amount in RPC response");
    return yoctoToNearFloat(amount);
}

let state = {
    connected: false,
    walletAddress: "",
    network: "near",
    nearNetworkId,
    balance: 0,
    balanceError: "",
    status: "",

    connectWallet: async () => { },
    disconnectWallet: async () => { },
    restoreSession: async () => { },
    setManualAccountId: (_id) => { },
    clearStatus: () => { },
};

const listeners = new Set();
function setState(patch) {
    state = { ...state, ...patch };
    for (const l of listeners) l();
}

function applyAccount(accountId) {
    const id = String(accountId || "").trim();
    if (!id) return;

    setState({ connected: true, walletAddress: id, status: "", balanceError: "" });

    try {
        localStorage.setItem(LS_NEAR_ACCOUNT_ID, id);
    } catch { }

    fetchNearBalance(id)
        .then((b) => setState({ balance: b, balanceError: "" }))
        .catch((e) => setState({ balance: 0, balanceError: String(e?.message || e) }));
}

function applyFromStorage() {
    try {
        const id = localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "";
        if (!id) return false;
        applyAccount(id);
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

let selectorPromise = null;
let selector = null;
let subscription = null;

async function ensureSelector() {
    if (selector) return selector;
    if (selectorPromise) return selectorPromise;

    selectorPromise = (async () => {
        selector = await setupWalletSelector({
            network: nearNetworkId,
            modules: [
                // HERE first (Telegram-friendly)
                setupHereWallet(),
                // fallback
                setupMyNearWallet(),
            ],
        });

        // subscribe to accounts (auto-pick active)
        if (!subscription) {
            subscription = selector.store.observable.subscribe((s) => {
                const active = s.accounts?.find((a) => a.active) || s.accounts?.[0] || null;
                if (active?.accountId) applyAccount(active.accountId);
            });
        }

        // initial sync
        const s0 = selector.store.getState();
        const active0 = s0.accounts?.find((a) => a.active) || s0.accounts?.[0] || null;
        if (active0?.accountId) applyAccount(active0.accountId);

        return selector;
    })();

    return selectorPromise;
}

async function connectWallet() {
    setState({
        status: `Открываю HERE Wallet (${nearNetworkId})…`,
        balanceError: "",
    });

    const sel = await ensureSelector();
    const tg = window.Telegram?.WebApp;

    // HERE wallet id in selector: "here-wallet"
    const wallet = await sel.wallet("here-wallet");

    const originalOpen = window.open;
    window.open = (url) => {
        try {
            tg?.openLink?.(url);
        } catch { }
        try {
            if (!tg?.openLink) window.location.assign(url);
        } catch { }
        return { focus() { }, closed: false };
    };

    try {
        const backUrl = window.location.href;

        // IMPORTANT: do NOT await (Telegram flows can hang)
        wallet
            .signIn?.({
                contractId: loginContractId,
                methodNames: [],
                successUrl: backUrl,
                failureUrl: backUrl,
            })
            ?.catch(() => { });

        setState({
            status:
                "Если HERE открылся в Telegram и ты подтвердил — вернись в игру. Если не подтянулось автоматически, нажми «Я уже подключил».",
        });
    } finally {
        window.open = originalOpen;
    }
}

async function disconnectWallet() {
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

    // попытка signOut (не критично)
    try {
        const sel = await ensureSelector();
        const w = await sel.wallet();
        await w.signOut?.();
    } catch { }

    setState({ connected: false, walletAddress: "", balance: 0, balanceError: "", status: "" });
}

async function restoreSession() {
    await ensureSelector();
    const okUrl = syncFromUrlIfPresent();
    const okLs = applyFromStorage();
    if (okUrl || okLs) setState({ status: "" });
}

function setManualAccountId(accountId) {
    applyAccount(accountId);
}

function clearStatus() {
    setState({ status: "" });
}

state = { ...state, connectWallet, disconnectWallet, restoreSession, setManualAccountId, clearStatus };

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