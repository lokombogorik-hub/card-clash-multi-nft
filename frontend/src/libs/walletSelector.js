// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";

export const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
export const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || "https://rpc.mainnet.near.org";

const TREASURY = "retardo-s.near";

// ─── Singleton ───────────────────────────────────────────
let _selectorPromise = null;

function getSelector() {
    if (_selectorPromise) return _selectorPromise;

    console.log("[WS] init wallet-selector", { networkId });

    _selectorPromise = setupWalletSelector({
        network: networkId,
        modules: [setupHereWallet()],
    }).catch((err) => {
        console.error("[WS] init failed:", err);
        _selectorPromise = null;
        throw err;
    });

    return _selectorPromise;
}

// ─── Get active wallet or null ───────────────────────────
async function getWallet() {
    const selector = await getSelector();
    const state = selector.store.getState();
    if (!state.selectedWalletId) return null;
    try {
        return await selector.wallet(state.selectedWalletId);
    } catch {
        return null;
    }
}

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    const selector = await getSelector();
    const wallet = await selector.wallet("here-wallet");

    console.log("[WS] signIn via here-wallet...");

    const accounts = await wallet.signIn({
        contractId: TREASURY,
        methodNames: [],
    });

    const accountId = accounts?.[0]?.accountId || "";
    console.log("[WS] connected:", accountId);
    return { accountId: String(accountId) };
}

// ─── Disconnect ──────────────────────────────────────────
export async function disconnectWallet() {
    const wallet = await getWallet();
    if (wallet) {
        try {
            await wallet.signOut();
        } catch (e) {
            console.warn("[WS] signOut error:", e.message);
        }
    }
}

// ─── Restore ─────────────────────────────────────────────
export async function getSignedInAccountId() {
    try {
        const selector = await getSelector();
        const state = selector.store.getState();
        const acc = state.accounts?.[0];
        return acc?.accountId || "";
    } catch {
        return "";
    }
}

// ─── Sign & Send Transaction ─────────────────────────────
export async function signAndSendTransaction(params) {
    const wallet = await getWallet();
    if (!wallet) throw new Error("Wallet not connected");

    return await wallet.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

// ─── Send NEAR (transfer) ───────────────────────────────
export async function sendNear({ receiverId, amount }) {
    const wallet = await getWallet();
    if (!wallet) throw new Error("Wallet not connected");

    const yocto = nearToYocto(amount);
    console.log("[WS] sendNear:", { receiverId, amount, yocto });

    const result = await wallet.signAndSendTransaction({
        receiverId,
        actions: [
            {
                type: "Transfer",
                params: { deposit: yocto },
            },
        ],
    });

    return { txHash: extractTxHash(result), result };
}

// ─── Balance via RPC ─────────────────────────────────────
export async function fetchBalance(accountId) {
    try {
        const res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "b",
                method: "query",
                params: {
                    request_type: "view_account",
                    finality: "final",
                    account_id: accountId,
                },
            }),
        });
        const json = await res.json();
        if (json.error) return 0;
        return yoctoToNear(json?.result?.amount || "0");
    } catch {
        return 0;
    }
}

// ─── Helpers ─────────────────────────────────────────────
function nearToYocto(near) {
    const s = String(near).split(".");
    const whole = s[0] || "0";
    const frac = (s[1] || "").padEnd(24, "0").slice(0, 24);
    return whole + frac;
}

function yoctoToNear(yocto) {
    const ONE = 10n ** 24n;
    const y = BigInt(yocto || "0");
    const w = y / ONE;
    const f = (y % ONE).toString().padStart(24, "0").slice(0, 6);
    return Number(w.toString() + "." + f);
}

function extractTxHash(result) {
    if (!result) return "";
    if (typeof result === "string") return result;
    if (result.transaction_outcome?.id) return result.transaction_outcome.id;
    if (result.transaction?.hash) return result.transaction.hash;
    if (result.txHash) return result.txHash;
    return "";
}