// frontend/src/libs/walletSelector.js — МИНИМАЛЬНЫЕ ИЗМЕНЕНИЯ

import { HereWallet } from "@here-wallet/core";

export const networkId = "mainnet";
export const RPC_URL = "https://rpc.mainnet.near.org";

let _here = null;
let _herePromise = null;

async function getHere() {
    if (_here) return _here;
    if (_herePromise) return _herePromise;

    _herePromise = (async () => {
        console.log("[HOT] Creating HereWallet instance...");

        const isTelegram = !!(
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData
        );

        console.log("[HOT] isTelegram:", isTelegram);

        const here = await HereWallet.connect({
            networkId: networkId,
            nodeUrl: RPC_URL,
        });

        _here = here;
        console.log("[HOT] Instance ready");
        return here;
    })();

    return _herePromise;
}

export async function connectWallet() {
    const here = await getHere();

    console.log("[HOT] Calling signIn...");

    let accountId = "";

    try {
        const result = await here.signIn({
            contractId: "retardo-s.near",
            methodNames: [],
        });

        if (typeof result === "string") {
            accountId = result;
        } else if (result && typeof result === "object") {
            accountId = result.accountId || result.account_id || "";
        }

        console.log("[HOT] signIn result:", accountId, "raw:", result);
    } catch (err) {
        // Patched wallet.js should prevent this, but just in case
        console.warn("[HOT] signIn error:", err.message);
    }

    // Fallback: try getAccountId
    if (!accountId) {
        try {
            accountId = await here.getAccountId();
            console.log("[HOT] getAccountId fallback:", accountId);
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e.message);
        }
    }

    // Save to localStorage for restore in Telegram
    if (accountId) {
        localStorage.setItem("hot_wallet_account", accountId);
    }

    return { accountId: String(accountId || "") };
}

export async function disconnectWallet() {
    try {
        const here = await getHere();
        await here.signOut();
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }
    _here = null;
    _herePromise = null;
    localStorage.removeItem("hot_wallet_account");
}

export async function getSignedInAccountId() {
    // Try SDK first
    try {
        const here = await getHere();
        const isSignedIn = await here.isSignedIn();
        if (isSignedIn) {
            const accountId = await here.getAccountId();
            console.log("[HOT] restored session:", accountId);
            if (accountId) {
                localStorage.setItem("hot_wallet_account", String(accountId));
                return String(accountId);
            }
        }
    } catch (e) {
        console.warn("[HOT] restore error:", e.message);
    }

    // Fallback: localStorage (important for Telegram WebApp)
    const stored = localStorage.getItem("hot_wallet_account");
    if (stored) {
        console.log("[HOT] restored from localStorage:", stored);
        return stored;
    }

    return "";
}

export async function signAndSendTransaction(params) {
    const here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export async function sendNear({ receiverId, amount }) {
    const here = await getHere();
    const yocto = nearToYocto(amount);

    const result = await here.signAndSendTransaction({
        receiverId: receiverId,
        actions: [
            {
                type: "Transfer",
                params: { deposit: yocto },
            },
        ],
    });

    return { txHash: extractTxHash(result), result };
}

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