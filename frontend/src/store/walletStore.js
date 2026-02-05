import { useEffect, useState } from "react";
import {
    connectWallet,
    connectHotWallet,
    connectMyNearWallet,
    disconnectWallet as disconnect,
    signAndSendTransaction as signTx,
    getSignedInAccountId,
} from "../libs/nearWallet";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const nearNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";
const rpcUrl =
    envRpcUrl ||
    (nearNetworkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const escrowContractId = (import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID || "").trim();
const nftContractId = (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim();

const GAS_100_TGAS = "100000000000000";
const GAS_150_TGAS = "150000000000000";
const GAS_300_TGAS = "300000000000000";
const ONE_YOCTO = "1";
const MINT_DEPOSIT = "100000000000000000000000"; // 0.1 NEAR

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
    if (json.error) throw new Error(json?.error?.message || "NEAR RPC error");
    return yoctoToNearFloat(json?.result?.amount || "0");
}

function isLikelyNearAccountId(s) {
    const v = String(s || "").trim();
    if (!v) return false;
    if (v.length < 2 || v.length > 64) return false;
    if (v.toLowerCase() !== v) return false;
    if (!/^[a-z0-9._-]+$/.test(v)) return false;
    return true;
}

function extractAccountIdFromUrl() {
    try {
        const u = new URL(window.location.href);
        const cands = [
            u.searchParams.get("account_id"),
            u.searchParams.get("accountId"),
            u.searchParams.get("near_account_id"),
        ].filter(Boolean);

        if (cands.length) {
            const v = String(cands[0]).trim();
            if (isLikelyNearAccountId(v)) return v;
        }

        const hash = (u.hash || "").replace(/^#/, "");
        if (hash) {
            const p = new URLSearchParams(hash);
            const hv =
                p.get("account_id") ||
                p.get("accountId") ||
                p.get("near_account_id") ||
                "";
            if (isLikelyNearAccountId(hv)) return hv;
        }
    } catch { }
    return "";
}

function extractAccountIdFromLocalStorageScan() {
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            const lk = k.toLowerCase();
            if (!lk.includes("here") && !lk.includes("hot") && !lk.includes("wallet")) continue;
            const val = localStorage.getItem(k);
            if (!val) continue;

            if (isLikelyNearAccountId(val)) return val;

            try {
                const j = JSON.parse(val);
                const cand =
                    j?.accountId ||
                    j?.account_id ||
                    j?.nearAccountId ||
                    j?.near_account_id ||
                    "";
                if (isLikelyNearAccountId(cand)) return cand;
            } catch { }
        }
    } catch { }
    return "";
}

let state = {
    connected: false,
    walletAddress: "",
    nearNetworkId,
    rpcUrl,
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

    try {
        localStorage.setItem(LS_NEAR_ACCOUNT_ID, id);
    } catch { }

    fetchNearBalance(id)
        .then((b) => setState({ balance: b, balanceError: "" }))
        .catch((e) => setState({ balance: 0, balanceError: String(e?.message || e) }));
}

function restoreFromStorage() {
    try {
        const id = localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "";
        if (!id) return false;
        applyAccount(id);
        return true;
    } catch {
        return false;
    }
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
    setState({ status: "Opening HOT Wallet…", lastError: null });

    try {
        const { accountId } = await connectHotWallet();

        if (!accountId) {
            setState({ status: "HOT Wallet opened. Complete login and return to the game…", lastError: null });
            return;
        }

        applyAccount(accountId);
        setState({ status: "", lastError: null });

        await getUserNFTs();
    } catch (e) {
        const errMsg = e?.message || String(e);
        setState({
            status: `HOT Connect failed: ${errMsg}`,
            lastError: { name: e?.name || "Error", message: errMsg, stack: e?.stack || "" },
        });
    }
}

async function connectMyNear() {
    setState({ status: "Opening MyNearWallet…", lastError: null });

    try {
        const { accountId } = await connectMyNearWallet();
        if (!accountId) throw new Error("MyNearWallet не вернул accountId");
        applyAccount(accountId);
        setState({ status: "", lastError: null });
        await getUserNFTs();
    } catch (e) {
        const errMsg = e?.message || String(e);
        setState({
            status: `MyNear Connect failed: ${errMsg}`,
            lastError: { name: e?.name || "Error", message: errMsg, stack: e?.stack || "" },
        });
    }
}

async function disconnectWallet() {
    try { await disconnect(); } catch { }
    try { localStorage.removeItem(LS_NEAR_ACCOUNT_ID); } catch { }
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
    if (restoreFromStorage()) {
        await getUserNFTs();
        return;
    }

    const fromUrl = extractAccountIdFromUrl();
    if (fromUrl) {
        applyAccount(fromUrl);
        await getUserNFTs();
        return;
    }

    const fromLs = extractAccountIdFromLocalStorageScan();
    if (fromLs) {
        applyAccount(fromLs);
        await getUserNFTs();
        return;
    }

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
    if (!escrowId) throw new Error("Escrow contract id missing (VITE_NEAR_ESCROW_CONTRACT_ID)");

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
    if (!escrowId) throw new Error("Escrow contract id missing (VITE_NEAR_ESCROW_CONTRACT_ID)");

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

// ✅ ВАЖНО: nft.examples.testnet использует nft_mint (не mint_card)
async function mintCard() {
    if (!nftContractId) throw new Error("NFT contract id missing (VITE_NEAR_NFT_CONTRACT_ID)");
    if (!state.walletAddress) throw new Error("Wallet not connected");

    const tokenId = `card_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    // Генерируем случайные статы для Triple Triad
    const stats = {
        top: Math.floor(Math.random() * 10) + 1,
        right: Math.floor(Math.random() * 10) + 1,
        bottom: Math.floor(Math.random() * 10) + 1,
        left: Math.floor(Math.random() * 10) + 1,
    };

    const elements = ["Fire", "Water", "Earth", "Wind", "Ice", "Thunder", "Holy", "Poison"];
    const element = elements[Math.floor(Math.random() * elements.length)];

    const actions = [{
        type: "FunctionCall",
        params: {
            methodName: "nft_mint",
            args: {
                token_id: tokenId,
                receiver_id: state.walletAddress,
                metadata: {
                    title: `Card #${tokenId.slice(-6)}`,
                    description: `Top:${stats.top} Right:${stats.right} Bottom:${stats.bottom} Left:${stats.left}`,
                    media: null,
                    extra: JSON.stringify({
                        stats,
                        element,
                        rarity: ["common", "rare", "epic", "legendary"][Math.floor(Math.random() * 4)],
                    }),
                },
            },
            gas: GAS_300_TGAS,
            deposit: MINT_DEPOSIT,
        },
    }];

    const outcome = await signAndSendTransaction({ receiverId: nftContractId, actions });
    await getUserNFTs();
    return { outcome, txHash: extractTxHash(outcome), tokenId };
}

async function mintPack() {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await mintCard());
    return results;
}

async function getUserNFTs() {
    const accountId = state.walletAddress;
    if (!accountId) return [];
    if (!nftContractId) return [];

    try {
        const res = await fetch(rpcUrl, {
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

        // ✅ Преобразуем в формат фронта
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
    connectMyNear,
    disconnectWallet,
    restoreSession,
    clearStatus,

    signAndSendTransaction,
    nftTransferCall,
    escrowClaim,

    mintCard,
    mintPack,
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
        connectMyNear: walletStore.connectMyNear,
        disconnectWallet: walletStore.disconnectWallet,
        clearStatus: walletStore.clearStatus,
        restoreSession: walletStore.restoreSession,

        sendNear: walletStore.sendNear,
        mintCard: walletStore.mintCard,
        mintPack: walletStore.mintPack,
        getUserNFTs: walletStore.getUserNFTs,

        signAndSendTransaction: walletStore.signAndSendTransaction,
        nftTransferCall: walletStore.nftTransferCall,
        escrowClaim: walletStore.escrowClaim,
    };
}