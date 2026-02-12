// frontend/src/libs/walletSelector.js — ПОЛНАЯ ЗАМЕНА

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

        // Detect if we are inside Telegram WebApp
        const isTelegram = !!(
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData
        );

        console.log("[HOT] isTelegram:", isTelegram);

        // HereWallet.connect() auto-detects Telegram environment
        // Inside Telegram — uses injected provider (HOT app)
        // Outside — uses widget/QR
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

// ─── Connect ─────────────────────────────────────────────
export async function connectWallet() {
    const here = await getHere();

    console.log("[HOT] Calling signIn...");

    // signIn returns account ID string
    const result = await here.signIn({
        contractId: "retardo-s.near",
        methodNames: [],
    });

    // result can be string or object depending on version
    let accountId = "";

    if (typeof result === "string") {
        accountId = result;
    } else if (result && typeof result === "object") {
        // Could be { accountId } or { account_id }
        accountId = result.accountId || result.account_id || "";
    }

    console.log("[HOT] signIn result:", accountId, "raw:", result);

    // If signIn didn't return account, try getAccountId
    if (!accountId) {
        try {
            accountId = await here.getAccountId();
            console.log("[HOT] getAccountId fallback:", accountId);
        } catch (e) {
            console.warn("[HOT] getAccountId failed:", e.message);
        }
    }

    return { accountId: String(accountId || "") };
}

// ─── Disconnect ──────────────────────────────────────────
export async function disconnectWallet() {
    try {
        const here = await getHere();
        await here.signOut();
    } catch (e) {
        console.warn("[HOT] signOut error:", e.message);
    }
    _here = null;
    _herePromise = null;
}

// ─── Restore session ────────────────────────────────────
export async function getSignedInAccountId() {
    try {
        const here = await getHere();

        const isSignedIn = await here.isSignedIn();
        if (!isSignedIn) return "";

        const accountId = await here.getAccountId();
        console.log("[HOT] restored session:", accountId);
        return String(accountId || "");
    } catch (e) {
        console.warn("[HOT] restore error:", e.message);
        return "";
    }
}

// ─── Sign and Send Transaction ──────────────────────────
export async function signAndSendTransaction(params) {
    const here = await getHere();

    console.log("[HOT] signAndSendTransaction:", params.receiverId);

    const result = await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });

    return result;
}

// ─── Send NEAR (simple transfer) ────────────────────────
export async function sendNear({ receiverId, amount }) {
    const here = await getHere();

    const yocto = nearToYocto(amount);
    console.log("[HOT] sendNear:", { receiverId, amount, yocto });

    const result = await here.signAndSendTransaction({
        receiverId: receiverId,
        actions: [
            {
                type: "Transfer",
                params: { deposit: yocto },
            },
        ],
    });

    const txHash = extractTxHash(result);
    return { txHash, result };
}

// ─── Fetch balance via RPC ──────────────────────────────
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