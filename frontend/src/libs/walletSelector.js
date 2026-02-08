var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";

async function verifyAccount(accountId) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "verify",
            method: "query",
            params: {
                request_type: "view_account",
                finality: "final",
                account_id: accountId,
            },
        }),
    });
    var json = await res.json();
    return !json.error;
}

async function connectWithAccountId(accountId) {
    accountId = String(accountId || "").trim().toLowerCase();
    if (!accountId) throw new Error("Enter your account ID");
    if (accountId.length < 2 || accountId.length > 64) throw new Error("Invalid account ID length");
    if (!/^[a-z0-9._-]+$/.test(accountId)) throw new Error("Invalid characters in account ID");

    var exists = await verifyAccount(accountId);
    if (!exists) throw new Error("Account not found on NEAR " + networkId);

    currentAccountId = accountId;
    localStorage.setItem(STORAGE_KEY, accountId);
    return { accountId: accountId };
}

async function disconnectWallet() {
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
}

async function getSignedInAccountId() {
    if (currentAccountId) return currentAccountId;
    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { currentAccountId = saved; return saved; }
    return "";
}

async function signAndSendTransaction() {
    throw new Error("Transaction signing will be available in Stage 2");
}

export {
    networkId,
    RPC_URL,
    connectWithAccountId,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
    verifyAccount,
};