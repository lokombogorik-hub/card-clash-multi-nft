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

function yoctoToNearFloat(s) {
    try { var y = BigInt(s || "0"), b = 10n ** 24n; return Number((y / b).toString() + "." + (y % b).toString().padStart(24, "0").slice(0, 6)); }
    catch (e) { return 0; }
}

async function fetchNearBalance(id) {
    var r = await fetch(RPC_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "b", method: "query", params: { request_type: "view_account", finality: "final", account_id: id } })
    });
    var j = await r.json().catch(function () { return null; });
    if (!r.ok || !j || j.error) return 0;
    return yoctoToNearFloat((j.result && j.result.amount) || "0");
}

var state = {
    connected: false, walletAddress: "", balance: 0, balanceError: "",
    status: "", lastError: null, nfts: [], nftsError: "",
    nearNetworkId: networkId, rpcUrl: RPC_URL,
    escrowContractId: escrowContractId, nftContractId: nftContractId,
};
var listeners = new Set();
function emit() { listeners.forEach(function (l) { l(); }); }
function setState(p) { state = Object.assign({}, state, p); emit(); }

async function linkToBackend(accountId) {
    if (!accountId || !API_BASE) return;
    var token = localStorage.getItem("token") || localStorage.getItem("accessToken") || localStorage.getItem("access_token") || "";
    if (!token) return;
    try { await fetch(API_BASE + "/api/near/link", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ accountId: accountId }) }); } catch (e) { }
}

function applyAccount(id) {
    id = String(id || "").trim(); if (!id) return;
    setState({ connected: true, walletAddress: id, status: "", balanceError: "", lastError: null });
    fetchNearBalance(id).then(function (b) { setState({ balance: b }); }).catch(function () { });
    linkToBackend(id);
}

function clearStatus() { setState({ status: "", lastError: null }); }

async function connectHot() {
    setState({ status: "Opening HOT Wallet…", lastError: null });
    try {
        var result = await connectWallet();
        if (result.accountId) {
            applyAccount(result.accountId);
            setState({ status: "✅ Connected!", lastError: null });
            setTimeout(function () { setState({ status: "" }); }, 2000);
        } else {
            setState({ status: "Confirm in HOT Wallet and return", lastError: null });
        }
    } catch (e) {
        var msg = (e && e.message) || String(e);
        var low = msg.toLowerCase();
        if (low.indexOf("load failed") !== -1 || low.indexOf("reject") !== -1 || low.indexOf("cancel") !== -1) {
            setState({ status: "Confirm in HOT Wallet, then return here", lastError: null });
            return;
        }
        setState({ status: "Error: " + msg, lastError: { name: "Error", message: msg, stack: (e && e.stack) || "" } });
    }
}

async function disconnectWallet() {
    try { await disconnect(); } catch (e) { }
    setState({ connected: false, walletAddress: "", balance: 0, balanceError: "", status: "", nfts: [], nftsError: "", lastError: null });
}

async function restoreSession() {
    try { var id = await getSignedInAccountId(); if (id) applyAccount(id); } catch (e) { }
}

async function signAndSendTransaction(p) {
    if (!p.receiverId) throw new Error("receiverId required");
    if (!p.actions || !p.actions.length) throw new Error("actions required");
    return await signTx({ receiverId: p.receiverId, actions: p.actions });
}

async function nftTransferCall(p) {
    var eid = (p.receiverId || escrowContractId || "").trim(); if (!eid) throw new Error("Escrow missing");
    var msg = JSON.stringify({ match_id: p.matchId, side: p.side, player_a: p.playerA, player_b: p.playerB });
    return await signAndSendTransaction({ receiverId: p.nftContractId, actions: [{ type: "FunctionCall", params: { methodName: "nft_transfer_call", args: { receiver_id: eid, token_id: p.tokenId, approval_id: null, memo: null, msg: msg }, gas: GAS_150_TGAS, deposit: ONE_YOCTO } }] });
}

async function escrowClaim(p) {
    var eid = (p.receiverId || escrowContractId || "").trim(); if (!eid) throw new Error("Escrow missing");
    return await signAndSendTransaction({ receiverId: eid, actions: [{ type: "FunctionCall", params: { methodName: "claim", args: { match_id: p.matchId, winner: p.winnerAccountId, loser_nft_contract_id: p.loserNftContractId, loser_token_id: p.loserTokenId }, gas: GAS_100_TGAS, deposit: "0" } }] });
}

async function getUserNFTs() { return []; }
async function sendNear(p) {
    var y = (parseFloat(p.amount) * 1e24).toFixed(0);
    return await signAndSendTransaction({ receiverId: p.receiverId, actions: [{ type: "Transfer", params: { deposit: y } }] });
}

export var walletStore = {
    getState: function () { return state; },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    connectHot: connectHot, disconnectWallet: disconnectWallet, restoreSession: restoreSession, clearStatus: clearStatus,
    signAndSendTransaction: signAndSendTransaction, nftTransferCall: nftTransferCall, escrowClaim: escrowClaim,
    getUserNFTs: getUserNFTs, sendNear: sendNear,
};

export function useWalletStore() {
    var ss = useState(walletStore.getState()), snap = ss[0], setSnap = ss[1];
    useEffect(function () {
        var unsub = walletStore.subscribe(function () { setSnap(walletStore.getState()); });
        walletStore.restoreSession();
        return unsub;
    }, []);
    return {
        connected: snap.connected, accountId: snap.walletAddress, walletAddress: snap.walletAddress,
        balance: snap.balance, status: snap.status, lastError: snap.lastError,
        nfts: snap.nfts, nftsError: snap.nftsError,
        connectHot: walletStore.connectHot, disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus, restoreSession: walletStore.restoreSession,
        sendNear: walletStore.sendNear, getUserNFTs: walletStore.getUserNFTs,
        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall, escrowClaim: walletStore.escrowClaim,
    };
}