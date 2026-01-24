import { useSyncExternalStore } from "react";

import * as WalletSelectorCore from "@near-wallet-selector/core";
import * as MyNearWalletPkg from "@near-wallet-selector/my-near-wallet";
import * as HereWalletPkg from "@near-wallet-selector/here-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";

const setupWalletSelector =
    WalletSelectorCore.setupWalletSelector ||
    WalletSelectorCore.default?.setupWalletSelector;

const setupMyNearWallet =
    MyNearWalletPkg.setupMyNearWallet ||
    MyNearWalletPkg.default?.setupMyNearWallet ||
    MyNearWalletPkg.default;

const setupHereWallet =
    HereWalletPkg.setupHereWallet ||
    HereWalletPkg.default?.setupHereWallet ||
    HereWalletPkg.default;

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const nearNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";
const rpcUrl =
    envRpcUrl ||
    (nearNetworkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const envLoginContractId = import.meta.env.VITE_NEAR_LOGIN_CONTRACT_ID || "";
const loginContractId =
    envLoginContractId || (nearNetworkId === "testnet" ? "guest-book.testnet" : "wrap.near");

const escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();

const GAS_100_TGAS = "100000000000000";
const GAS_150_TGAS = "150000000000000";
const ONE_YOCTO = "1";

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
    rpcUrl,
    escrowContractId,

    balance: 0,
    balanceError: "",
    status: "",

    connectWallet: async () => { },
    disconnectWallet: async () => { },
    restoreSession: async () => { },
    setManualAccountId: (_id) => { },
    clearStatus: () => { },

    signAndSendTransaction: async (_tx) => { },
    nftTransferCall: async (_p) => { },
    escrowClaim: async (_p) => { },
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
    // wallet возвращает account_id в url (иногда)
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
let modal = null;
let subscription = null;

async function ensureSelector() {
    if (selector) return selector;
    if (selectorPromise) return selectorPromise;

    selectorPromise = (async () => {
        if (!setupWalletSelector) throw new Error("setupWalletSelector export not found");
        if (!setupHereWallet) throw new Error("setupHereWallet export not found");
        if (!setupMyNearWallet) throw new Error("setupMyNearWallet export not found");

        selector = await setupWalletSelector({
            network: nearNetworkId,
            modules: [
                // show both in modal (like CapsGameBot)
                setupHereWallet(),
                setupMyNearWallet(),
            ],
        });

        modal = setupModal(selector, {
            contractId: loginContractId,
            theme: "dark",
        });

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

async function connectWallet(_provider = "near") {
    try {
        setState({ status: `Выбор кошелька (${nearNetworkId})…`, balanceError: "" });

        await ensureSelector();

        // open modal picker
        modal?.show?.();

        setState({ status: "" });
    } catch (e) {
        setState({ status: `Wallet modal error: ${String(e?.message || e)}` });
    }
}

async function disconnectWallet() {
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

    try {
        await ensureSelector();
        const w = await selector.wallet();
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

function extractTxHash(outcome) {
    return (
        outcome?.transaction?.hash ||
        outcome?.transaction_outcome?.id ||
        outcome?.final_execution_outcome?.transaction?.hash ||
        null
    );
}

// wallet-selector actions format
async function signAndSendTransaction({ receiverId, actions }) {
    if (!receiverId) throw new Error("receiverId is required");
    if (!actions || !actions.length) throw new Error("actions are required");

    await ensureSelector();
    const w = await selector.wallet(); // active wallet
    if (!w?.signAndSendTransaction) throw new Error("Wallet does not support signAndSendTransaction");

    return await w.signAndSendTransaction({ receiverId, actions });
}

async function nftTransferCall({ nftContractId, tokenId, matchId, side, playerA, playerB, receiverId }) {
    const escrowId = (receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing (VITE_NEAR_ESCROW_CONTRACT_ID)");
    if (!nftContractId) throw new Error("nftContractId is required");
    if (!tokenId) throw new Error("tokenId is required");
    if (!matchId) throw new Error("matchId is required");
    if (side !== "A" && side !== "B") throw new Error('side must be "A" or "B"');
    if (!playerA || !playerB) throw new Error("playerA/playerB are required");

    const msg = JSON.stringify({ match_id: matchId, side, player_a: playerA, player_b: playerB });

    const actions = [
        {
            type: "FunctionCall",
            params: {
                methodName: "nft_transfer_call",
                args: {
                    receiver_id: escrowId,
                    token_id: tokenId,
                    approval_id: null,
                    memo: null,
                    msg,
                },
                gas: GAS_150_TGAS,
                deposit: ONE_YOCTO,
            },
        },
    ];

    const outcome = await signAndSendTransaction({ receiverId: nftContractId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

async function escrowClaim({ matchId, winnerAccountId, loserNftContractId, loserTokenId, receiverId }) {
    const escrowId = (receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing (VITE_NEAR_ESCROW_CONTRACT_ID)");
    if (!matchId) throw new Error("matchId is required");
    if (!winnerAccountId) throw new Error("winnerAccountId is required");
    if (!loserNftContractId) throw new Error("loserNftContractId is required");
    if (!loserTokenId) throw new Error("loserTokenId is required");

    const actions = [
        {
            type: "FunctionCall",
            params: {
                methodName: "claim",
                args: {
                    match_id: matchId,
                    winner: winnerAccountId,
                    loser_nft_contract_id: loserNftContractId,
                    loser_token_id: loserTokenId,
                },
                gas: GAS_100_TGAS,
                deposit: "0",
            },
        },
    ];

    const outcome = await signAndSendTransaction({ receiverId: escrowId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

state = {
    ...state,
    connectWallet,
    disconnectWallet,
    restoreSession,
    setManualAccountId,
    clearStatus,
    signAndSendTransaction,
    nftTransferCall,
    escrowClaim,
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