import { useEffect, useState } from "react";
import {
    connectWallet,
    disconnectWallet as disconnect,
    signAndSendTransaction as signTx,
    getSignedInAccountId,
    networkId,
    RPC_URL,
} from "../libs/walletSelector";

const escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
const nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

const GAS_100_TGAS = "100000000000000";
const GAS_150_TGAS = "150000000000000";
const GAS_300_TGAS = "300000000000000";
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
    const res = await fetch(RPC_URL, {
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
    if (json.error) throw new Error(json?.error?.message || "NEAR RPC error");
    return yoctoToNearFloat(json?.result?.amount || "0");
}

let state = {
    connected: false,
    walletAddress: "",
    nearNetworkId: networkId,
    rpcUrl: RPC_URL,
    escrowContractId,
    nftContractId,
    balance: 0,
    balanceError: "",
    status: "",
    nfts: [],
    nftsError: "",
    lastError: null,
};

const listeners = new Set();
function emit() {
    for (const l of listeners) l();
}

function setState(patch) {
    state = { ...state, ...patch };
    emit();
}

function applyAccount(accountId) {
    const id = String(accountId || "").trim();
    if (!id) return;

    setState({
        connected: true,
        walletAddress: id,
        status: "",
        balanceError: "",
        lastError: null,
    });

    fetchNearBalance(id)
        .then((b) => setState({ balance: b, balanceError: "" }))
        .catch((e) => setState({ balance: 0, balanceError: String(e?.message || e) }));
}

function clearStatus() {
    setState({ status: "", lastError: null });
}

function extractTxHash(outcome) {
    return (
        outcome?.transaction?.hash ||
        outcome?.transaction_outcome?.id ||
        outcome?.final_execution_outcome?.transaction?.hash ||
        null
    );
}

async function signAndSendTransaction({ receiverId, actions }) {
    if (!receiverId) throw new Error("receiverId is required");
    if (!actions || !actions.length) throw new Error("actions are required");
    return await signTx({ receiverId, actions });
}

async function connectHot() {
    setState({ status: "Opening wallet selector…", lastError: null });

    try {
        const { accountId } = await connectWallet();

        if (!accountId) {
            setState({ status: "Please select wallet and sign in", lastError: null });
            return;
        }

        applyAccount(accountId);
        setState({ status: "✅ Connected!", lastError: null });

        await getUserNFTs();

        setTimeout(() => setState({ status: "" }), 2000);

    } catch (e) {
        const errMsg = e?.message || String(e);
        setState({
            status: `Connect failed: ${errMsg}`,
            lastError: { name: e?.name || "Error", message: errMsg, stack: e?.stack || "" },
        });
    }
}

async function disconnectWallet() {
    try { await disconnect(); } catch { }
    setState({
        connected: false,
        walletAddress: "",
        balance: 0,
        balanceError: "",
        status: "",
        nfts: [],
        nftsError: "",
        lastError: null,
    });
}

async function restoreSession() {
    try {
        const id = await getSignedInAccountId();
        if (id) {
            applyAccount(id);
            await getUserNFTs();
        }
    } catch { }
}

async function nftTransferCall({ nftContractId, tokenId, matchId, side, playerA, playerB, receiverId }) {
    const escrowId = (receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing");

    const msg = JSON.stringify({ match_id: matchId, side, player_a: playerA, player_b: playerB });

    const actions = [{
        type: "FunctionCall",
        params: {
            methodName: "nft_transfer_call",
            args: { receiver_id: escrowId, token_id: tokenId, approval_id: null, memo: null, msg },
            gas: GAS_150_TGAS,
            deposit: ONE_YOCTO,
        },
    }];

    const outcome = await signAndSendTransaction({ receiverId: nftContractId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

async function escrowClaim({ matchId, winnerAccountId, loserNftContractId, loserTokenId, receiverId }) {
    const escrowId = (receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing");

    const actions = [{
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
    }];

    const outcome = await signAndSendTransaction({ receiverId: escrowId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

async function getUserNFTs() {
    const accountId = state.walletAddress;
    if (!accountId) return [];
    if (!nftContractId) return [];

    try {
        const res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "cc-get-nfts",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: nftContractId,
                    method_name: "nft_tokens_for_owner",
                    args_base64: btoa(JSON.stringify({ account_id: accountId, from_index: "0", limit: 200 })),
                },
            }),
        });

        const json = await res.json();
        if (json.error) throw new Error(json.error.message || "RPC error");

        const resultBytes = json?.result?.result;
        if (!resultBytes) {
            setState({ nfts: [], nftsError: "" });
            return [];
        }

        const resultString = new TextDecoder().decode(new Uint8Array(resultBytes));
        const tokens = JSON.parse(resultString);

        const mapped = (Array.isArray(tokens) ? tokens : []).map((t) => {
            let extra = {};
            try {
                extra = JSON.parse(t.metadata?.extra || "{}");
            } catch { }

            return {
                chain: "near",
                contractId: nftContractId,
                contract_id: nftContractId,
                tokenId: t.token_id,
                token_id: t.token_id,
                name: t.metadata?.title || `Card #${t.token_id}`,
                imageUrl: t.metadata?.media || "/cards/card.jpg",
                stats: extra.stats || { top: 5, right: 5, bottom: 5, left: 5 },
                element: extra.element || null,
                rarity: extra.rarity || "common",
            };
        });

        setState({ nfts: mapped, nftsError: "" });
        return mapped;
    } catch (e) {
        setState({ nfts: [], nftsError: String(e?.message || e) });
        return [];
    }
}

async function sendNear({ receiverId, amount }) {
    const amountYocto = (parseFloat(amount) * 1e24).toString();
    const actions = [{ type: "Transfer", params: { deposit: amountYocto } }];
    const outcome = await signAndSendTransaction({ receiverId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

export const walletStore = {
    getState: () => state,
    subscribe: (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },

    connectHot,
    disconnectWallet,
    restoreSession,
    clearStatus,

    signAndSendTransaction,
    nftTransferCall,
    escrowClaim,

    getUserNFTs,
    sendNear,
};

export function useWalletStore() {
    const [snap, setSnap] = useState(walletStore.getState());

    useEffect(() => {
        const unsub = walletStore.subscribe(() => setSnap(walletStore.getState()));
        walletStore.restoreSession();
        return unsub;
    }, []);

    return {
        connected: snap.connected,
        accountId: snap.walletAddress,
        walletAddress: snap.walletAddress,
        balance: snap.balance,
        balanceError: snap.balanceError,
        status: snap.status,
        lastError: snap.lastError,
        nfts: snap.nfts,
        nftsError: snap.nftsError,

        connectHot: walletStore.connectHot,
        disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus,
        restoreSession: walletStore.restoreSession,

        sendNear: walletStore.sendNear,
        getUserNFTs: walletStore.getUserNFTs,

        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall,
        escrowClaim: walletStore.escrowClaim,
    };
}