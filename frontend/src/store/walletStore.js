import { useEffect, useState } from "react";
import {
    connectWallet,
    disconnectWallet as disconnect,
    signAndSendTransaction as signTx,
    getSignedInAccountId,
    networkId,
    RPC_URL,
} from "../libs/walletSelector";

var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();
var API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

var GAS_100_TGAS = "100000000000000";
var GAS_150_TGAS = "150000000000000";
var ONE_YOCTO = "1";

function yoctoToNearFloat(yoctoStr) {
    try {
        var yocto = BigInt(yoctoStr || "0");
        var base = 10n ** 24n;
        var whole = yocto / base;
        var frac = yocto % base;
        var fracStr = frac.toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + fracStr);
    } catch (e) {
        return 0;
    }
}

async function fetchNearBalance(accountId) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: "cc-balance", method: "query",
            params: { request_type: "view_account", finality: "final", account_id: accountId },
        }),
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok) throw new Error("RPC HTTP " + res.status);
    if (!json) throw new Error("RPC invalid JSON");
    if (json.error) throw new Error((json.error && json.error.message) || "NEAR RPC error");
    return yoctoToNearFloat((json.result && json.result.amount) || "0");
}

function extractTxHash(outcome) {
    if (!outcome) return null;
    if (outcome.transaction && outcome.transaction.hash) return outcome.transaction.hash;
    if (outcome.transaction_outcome && outcome.transaction_outcome.id) return outcome.transaction_outcome.id;
    return null;
}

var state = {
    connected: false, walletAddress: "", nearNetworkId: networkId, rpcUrl: RPC_URL,
    escrowContractId: escrowContractId, nftContractId: nftContractId,
    balance: 0, balanceError: "", status: "", nfts: [], nftsError: "", lastError: null,
};

var listeners = new Set();
function emit() { listeners.forEach(function (l) { l(); }); }
function setState(patch) { state = Object.assign({}, state, patch); emit(); }

async function linkToBackend(accountId) {
    if (!accountId || !API_BASE) return;
    var token = localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    if (!token) return;
    try {
        await fetch(API_BASE + "/api/near/link", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ accountId: accountId }),
        });
    } catch (e) { }
}

function applyAccount(accountId) {
    var id = String(accountId || "").trim();
    if (!id) return;
    setState({ connected: true, walletAddress: id, status: "", balanceError: "", lastError: null });
    fetchNearBalance(id)
        .then(function (b) { setState({ balance: b, balanceError: "" }); })
        .catch(function (e) { setState({ balance: 0, balanceError: String(e && e.message || e) }); });
    linkToBackend(id);
}

function clearStatus() { setState({ status: "", lastError: null }); }

async function connectHot() {
    setState({ status: "Connecting to HOT Wallet…", lastError: null });

    try {
        var result = await connectWallet();
        var accountId = result.accountId;

        if (!accountId) {
            setState({ status: "Please confirm in HOT Wallet, then tap Connect again", lastError: null });

            // Запускаем polling — проверяем каждые 2 сек не подключился ли
            var pollCount = 0;
            var maxPoll = 90; // 3 минуты
            var pollTimer = setInterval(async function () {
                pollCount++;
                if (pollCount > maxPoll) {
                    clearInterval(pollTimer);
                    setState({ status: "Timeout. Please try again." });
                    return;
                }
                try {
                    var id = await getSignedInAccountId();
                    if (id) {
                        clearInterval(pollTimer);
                        applyAccount(id);
                        setState({ status: "✅ Connected!", lastError: null });
                        await getUserNFTs();
                        setTimeout(function () { setState({ status: "" }); }, 2000);
                    }
                } catch (e) { }
            }, 2000);

            return;
        }

        applyAccount(accountId);
        setState({ status: "✅ Connected!", lastError: null });
        await getUserNFTs();
        setTimeout(function () { setState({ status: "" }); }, 2000);
    } catch (e) {
        var errMsg = (e && e.message) || String(e);
        console.error("[Wallet] connect failed:", e);
        setState({
            status: "Connect failed: " + errMsg,
            lastError: { name: (e && e.name) || "Error", message: errMsg, stack: (e && e.stack) || "" },
        });
    }
}

async function disconnectWallet() {
    try { await disconnect(); } catch (e) { }
    setState({
        connected: false, walletAddress: "", balance: 0, balanceError: "",
        status: "", nfts: [], nftsError: "", lastError: null,
    });
}

async function restoreSession() {
    try {
        var id = await getSignedInAccountId();
        if (id) {
            applyAccount(id);
            await getUserNFTs();
        }
    } catch (e) { }
}

async function signAndSendTransaction(params) {
    if (!params.receiverId) throw new Error("receiverId is required");
    if (!params.actions || !params.actions.length) throw new Error("actions are required");
    return await signTx({ receiverId: params.receiverId, actions: params.actions });
}

async function nftTransferCall(params) {
    var escrowId = (params.receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing");
    var msg = JSON.stringify({ match_id: params.matchId, side: params.side, player_a: params.playerA, player_b: params.playerB });
    var actions = [{ type: "FunctionCall", params: { methodName: "nft_transfer_call", args: { receiver_id: escrowId, token_id: params.tokenId, approval_id: null, memo: null, msg: msg }, gas: GAS_150_TGAS, deposit: ONE_YOCTO } }];
    var outcome = await signAndSendTransaction({ receiverId: params.nftContractId, actions: actions });
    return { outcome: outcome, txHash: extractTxHash(outcome) };
}

async function escrowClaim(params) {
    var escrowId = (params.receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing");
    var actions = [{ type: "FunctionCall", params: { methodName: "claim", args: { match_id: params.matchId, winner: params.winnerAccountId, loser_nft_contract_id: params.loserNftContractId, loser_token_id: params.loserTokenId }, gas: GAS_100_TGAS, deposit: "0" } }];
    var outcome = await signAndSendTransaction({ receiverId: escrowId, actions: actions });
    return { outcome: outcome, txHash: extractTxHash(outcome) };
}

async function getUserNFTs() {
    var accountId = state.walletAddress;
    if (!accountId || !nftContractId) return [];
    try {
        var res = await fetch(RPC_URL, {
            method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: "nfts", method: "query", params: { request_type: "call_function", finality: "final", account_id: nftContractId, method_name: "nft_tokens_for_owner", args_base64: btoa(JSON.stringify({ account_id: accountId, from_index: "0", limit: 200 })) } }),
        });
        var json = await res.json();
        if (json.error) throw new Error(json.error.message || "RPC error");
        var resultBytes = json && json.result && json.result.result;
        if (!resultBytes) { setState({ nfts: [], nftsError: "" }); return []; }
        var resultString = new TextDecoder().decode(new Uint8Array(resultBytes));
        var tokens = JSON.parse(resultString);
        var mapped = (Array.isArray(tokens) ? tokens : []).map(function (t) {
            var extra = {};
            try { extra = JSON.parse((t.metadata && t.metadata.extra) || "{}"); } catch (e) { }
            return { chain: "near", contractId: nftContractId, contract_id: nftContractId, tokenId: t.token_id, token_id: t.token_id, name: (t.metadata && t.metadata.title) || ("Card #" + t.token_id), imageUrl: (t.metadata && t.metadata.media) || "/cards/card.jpg", stats: (extra && extra.stats) || { top: 5, right: 5, bottom: 5, left: 5 }, element: (extra && extra.element) || null, rarity: (extra && extra.rarity) || "common" };
        });
        setState({ nfts: mapped, nftsError: "" });
        return mapped;
    } catch (e) {
        setState({ nfts: [], nftsError: String((e && e.message) || e) });
        return [];
    }
}

async function sendNear(params) {
    var amountYocto = (parseFloat(params.amount) * 1e24).toFixed(0);
    var actions = [{ type: "Transfer", params: { deposit: amountYocto } }];
    var outcome = await signAndSendTransaction({ receiverId: params.receiverId, actions: actions });
    return { outcome: outcome, txHash: extractTxHash(outcome) };
}

export var walletStore = {
    getState: function () { return state; },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    connectHot: connectHot, disconnectWallet: disconnectWallet, restoreSession: restoreSession, clearStatus: clearStatus,
    signAndSendTransaction: signAndSendTransaction, nftTransferCall: nftTransferCall, escrowClaim: escrowClaim,
    getUserNFTs: getUserNFTs, sendNear: sendNear,
};

export function useWalletStore() {
    var snapState = useState(walletStore.getState());
    var snap = snapState[0];
    var setSnap = snapState[1];
    useEffect(function () {
        var unsub = walletStore.subscribe(function () { setSnap(walletStore.getState()); });
        walletStore.restoreSession();
        return unsub;
    }, []);
    return {
        connected: snap.connected, accountId: snap.walletAddress, walletAddress: snap.walletAddress,
        balance: snap.balance, balanceError: snap.balanceError, status: snap.status, lastError: snap.lastError,
        nfts: snap.nfts, nftsError: snap.nftsError,
        connectHot: walletStore.connectHot, disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus, restoreSession: walletStore.restoreSession,
        sendNear: walletStore.sendNear, getUserNFTs: walletStore.getUserNFTs,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall, escrowClaim: walletStore.escrowClaim,
    };
}