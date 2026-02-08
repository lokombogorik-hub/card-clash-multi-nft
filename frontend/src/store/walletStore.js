import { useEffect, useState } from "react";
import {
    connectWithAccountId,
    disconnectWallet as disconnect,
    getSignedInAccountId,
    signAndSendTransaction as signTx,
    networkId,
    RPC_URL,
} from "../libs/walletSelector";

var escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
var nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();
var API_BASE = (import.meta.env.VITE_API_BASE_URL || "").trim();

function yoctoToNearFloat(yoctoStr) {
    try {
        var yocto = BigInt(yoctoStr || "0");
        var base = 10n ** 24n;
        var whole = yocto / base;
        var frac = yocto % base;
        var fracStr = frac.toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + fracStr);
    } catch (e) { return 0; }
}

async function fetchNearBalance(accountId) {
    var res = await fetch(RPC_URL, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: "b", method: "query",
            params: { request_type: "view_account", finality: "final", account_id: accountId }
        }),
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || json.error) return 0;
    return yoctoToNearFloat((json.result && json.result.amount) || "0");
}

var state = {
    connected: false, walletAddress: "", balance: 0, balanceError: "",
    status: "", lastError: null, nfts: [], nftsError: "",
    nearNetworkId: networkId, rpcUrl: RPC_URL,
    escrowContractId: escrowContractId, nftContractId: nftContractId,
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
        .then(function (b) { setState({ balance: b }); })
        .catch(function () { });
    linkToBackend(id);
}

async function connectHot(accountId) {
    setState({ status: "Verifying account…", lastError: null });
    try {
        var result = await connectWithAccountId(accountId);
        applyAccount(result.accountId);
        setState({ status: "✅ Connected!", lastError: null });
        setTimeout(function () { setState({ status: "" }); }, 2000);
    } catch (e) {
        setState({
            status: "",
            lastError: { name: "Error", message: (e && e.message) || String(e), stack: "" },
        });
        throw e;
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
        if (id) applyAccount(id);
    } catch (e) { }
}

function clearStatus() { setState({ status: "", lastError: null }); }

async function signAndSendTransaction(params) {
    return await signTx(params);
}

async function getUserNFTs() { return []; }
async function sendNear() { throw new Error("Coming soon"); }

export var walletStore = {
    getState: function () { return state; },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    connectHot: connectHot, disconnectWallet: disconnectWallet,
    restoreSession: restoreSession, clearStatus: clearStatus,
    signAndSendTransaction: signAndSendTransaction,
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
        balance: snap.balance, status: snap.status, lastError: snap.lastError,
        nfts: snap.nfts, nftsError: snap.nftsError,
        connectHot: walletStore.connectHot, disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus, restoreSession: walletStore.restoreSession,
        getUserNFTs: walletStore.getUserNFTs, sendNear: walletStore.sendNear,
        signAndSendTransaction: walletStore.signAndSendTransaction,
    };
}