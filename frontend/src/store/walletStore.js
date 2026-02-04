import { connectWallet, connectHotWallet, connectMyNearWallet, disconnectWallet as disconnect, signAndSendTransaction as signTx } from "../libs/nearWallet";

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

    setState({ connected: true, walletAddress: id, status: "", balanceError: "", lastError: null });

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

async function connectHot() {
    setState({ status: "Opening HOT Wallet…", lastError: null });

    try {
        const { accountId } = await connectHotWallet();

        if (!accountId) {
            const err = new Error("HOT Wallet не вернул accountId");
            setState({ status: `Connect failed: ${err.message}`, lastError: err });
            return;
        }

        applyAccount(accountId);
        setState({ status: "", lastError: null });
    } catch (e) {
        console.error("[walletStore] HOT connect failed:", e);

        const errMsg = e?.message || String(e);
        const errStack = e?.stack || "";
        const errName = e?.name || "Error";

        setState({
            status: `HOT Connect failed: ${errMsg}`,
            lastError: {
                name: errName,
                message: errMsg,
                stack: errStack,
                raw: e,
            }
        });
    }
}

async function connectMyNear() {
    setState({ status: "Opening MyNearWallet…", lastError: null });

    try {
        const { accountId } = await connectMyNearWallet();

        if (!accountId) {
            const err = new Error("MyNearWallet не вернул accountId");
            setState({ status: `Connect failed: ${err.message}`, lastError: err });
            return;
        }

        applyAccount(accountId);
        setState({ status: "", lastError: null });
    } catch (e) {
        console.error("[walletStore] MyNear connect failed:", e);

        const errMsg = e?.message || String(e);
        const errStack = e?.stack || "";
        const errName = e?.name || "Error";

        setState({
            status: `MyNear Connect failed: ${errMsg}`,
            lastError: {
                name: errName,
                message: errMsg,
                stack: errStack,
                raw: e,
            }
        });
    }
}

async function disconnectWallet() {
    try {
        await disconnect();
    } catch { }
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }
    setState({ connected: false, walletAddress: "", balance: 0, balanceError: "", status: "", lastError: null });
}

async function restoreSession() {
    restoreFromStorage();
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

async function nftTransferCall({ nftContractId, tokenId, matchId, side, playerA, playerB, receiverId }) {
    const escrowId = (receiverId || escrowContractId || "").trim();
    if (!escrowId) throw new Error("Escrow contract id missing (VITE_NEAR_ESCROW_CONTRACT_ID)");

    const msg = JSON.stringify({ match_id: matchId, side, player_a: playerA, player_b: playerB });

    const actions = [
        {
            type: "FunctionCall",
            params: {
                methodName: "nft_transfer_call",
                args: { receiver_id: escrowId, token_id: tokenId, approval_id: null, memo: null, msg },
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

// ==================== NEW: NFT MINT ====================

async function mintCard() {
    if (!nftContractId) throw new Error("NFT contract id missing (VITE_NEAR_NFT_CONTRACT_ID)");

    const tokenId = `card_${Date.now()}_${state.walletAddress}`;

    const actions = [
        {
            type: "FunctionCall",
            params: {
                methodName: "nft_mint",
                args: {
                    token_id: tokenId,
                    receiver_id: state.walletAddress,
                    metadata: {
                        title: `Card #${Date.now()}`,
                        description: "Card Clash NFT",
                        media: "",
                        extra: JSON.stringify({
                            rarity: ['common', 'rare', 'epic', 'legendary'][Math.floor(Math.random() * 4)],
                            power: Math.floor(Math.random() * 100),
                        }),
                    },
                },
                gas: GAS_300_TGAS,
                deposit: "100000000000000000000000", // 0.1 NEAR for storage
            },
        },
    ];

    const outcome = await signAndSendTransaction({ receiverId: nftContractId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

async function mintPack() {
    if (!nftContractId) throw new Error("NFT contract id missing (VITE_NEAR_NFT_CONTRACT_ID)");

    const results = [];
    for (let i = 0; i < 5; i++) {
        const result = await mintCard();
        results.push(result);
    }
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
                    args_base64: btoa(JSON.stringify({ account_id: accountId })),
                },
            }),
        });

        const json = await res.json();
        if (json.error) throw new Error(json.error.message || "RPC error");

        const resultBytes = json?.result?.result;
        if (!resultBytes) return [];

        const resultString = new TextDecoder().decode(new Uint8Array(resultBytes));
        return JSON.parse(resultString);
    } catch (e) {
        console.error("[walletStore] getUserNFTs error:", e);
        return [];
    }
}

async function sendNear({ receiverId, amount }) {
    if (!receiverId) throw new Error("receiverId is required");
    if (!amount || isNaN(parseFloat(amount))) throw new Error("amount must be a valid number");

    const amountYocto = (parseFloat(amount) * 1e24).toString();

    const actions = [
        {
            type: "Transfer",
            params: {
                deposit: amountYocto,
            },
        },
    ];

    const outcome = await signAndSendTransaction({ receiverId, actions });
    return { outcome, txHash: extractTxHash(outcome) };
}

// ==================== EXPORT ====================

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

    // NEW
    mintCard,
    mintPack,
    getUserNFTs,
    sendNear,
};