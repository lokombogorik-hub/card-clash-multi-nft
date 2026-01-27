import { connectWallet, disconnectWallet as disconnect, signAndSendTransaction as signTx } from "../libs/nearWallet";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const nearNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envRpcUrl = import.meta.env.VITE_NEAR_RPC_URL || "";
const rpcUrl =
    envRpcUrl ||
    (nearNetworkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

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
    if (json.error) throw new Error(json?.error?.message || "NEAR RPC error");
    return yoctoToNearFloat(json?.result?.amount || "0");
}

let state = {
    connected: false,
    walletAddress: "",
    nearNetworkId,
    rpcUrl,
    escrowContractId,

    balance: 0,
    balanceError: "",
    status: "",
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

    setState({ connected: true, walletAddress: id, status: "", balanceError: "" });

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
    setState({ status: "Opening wallet selector…" });

    try {
        const { accountId } = await connectWallet();

        if (!accountId) {
            setState({ status: "Кошелёк не вернул accountId. Попробуй ещё раз." });
            return;
        }

        applyAccount(accountId);
        setState({ status: "" });
    } catch (e) {
        console.error("[walletStore] connect failed:", e);
        setState({ status: `Connect failed: ${e?.message || e}` });
    }
}

async function disconnectWallet() {
    try {
        await disconnect();
    } catch { }
    setState({ connected: false, walletAddress: "", balance: 0, balanceError: "", status: "" });
}

async function restoreSession() {
    restoreFromStorage();
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
};