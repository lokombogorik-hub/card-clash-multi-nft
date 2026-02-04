import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { providers, transactions, utils } from "near-api-js";

const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
const HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

// важно: wrap контракт зависит от сети
const WRAP_CONTRACT_ID = networkId === "testnet" ? "wrap.testnet" : "wrap.near";

function log(tag, message, extra) {
    try {
        window.__CC_WALLET_LOGS__ = window.__CC_WALLET_LOGS__ || [];
        window.__CC_WALLET_LOGS__.push({
            t: new Date().toISOString(),
            tag,
            message,
            extra,
        });
    } catch { }
}

let selectorPromise = null;

async function getSelector() {
    if (selectorPromise) return selectorPromise;

    selectorPromise = setupWalletSelector({
        network: networkId,
        modules: [
            setupMyNearWallet(),
            setupHereWallet({
                botId: HOT_WALLET_ID, // herewalletbot/app
            }),
        ],
    });

    return selectorPromise;
}

function getProvider() {
    return new providers.JsonRpcProvider({ url: RPC_URL });
}

async function getAccountIdFromWallet(wallet) {
    const accounts = await wallet.getAccounts();
    return accounts?.[0]?.accountId || "";
}

export async function connectMyNearWallet() {
    log("mynear:start", "Starting MyNearWallet connection...");
    const selector = await getSelector();

    log("mynear:init_success", `WalletSelector initialized`, { networkId, RPC_URL, WRAP_CONTRACT_ID });

    const wallet = await selector.wallet("my-near-wallet");
    log("mynear:wallet_instance", `Wallet instance: my-near-wallet`);

    // MyNearWallet требует contractId — даём WRAP для сети
    try {
        log("mynear:signin_call", `Calling signIn to ${WRAP_CONTRACT_ID}...`);
        await wallet.signIn({ contractId: WRAP_CONTRACT_ID });
    } catch (e) {
        log("mynear:error", e?.message || String(e), { stack: e?.stack });
        throw e;
    }

    const accountId = await getAccountIdFromWallet(wallet);
    log("mynear:account", `Connected account: ${accountId}`);

    return { accountId, wallet };
}

export async function connectHotWallet() {
    log("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId });

    const selector = await getSelector();
    const wallet = await selector.wallet("here-wallet");

    // here-wallet на практике тоже требует signIn с contractId, но можно дать wrap
    try {
        log("hot:signin_call", `Calling signIn to ${WRAP_CONTRACT_ID}...`);
        await wallet.signIn({ contractId: WRAP_CONTRACT_ID });
    } catch (e) {
        log("hot:error", e?.message || String(e), { stack: e?.stack });
        throw e;
    }

    const accountId = await getAccountIdFromWallet(wallet);
    log("hot:account", `Connected account: ${accountId}`);

    return { accountId, wallet };
}

// старый алиас (если где-то используется)
export async function connectWallet() {
    return connectHotWallet();
}

export async function disconnectWallet() {
    const selector = await getSelector();
    const wallets = await selector.wallets();

    // выходим из всех кошельков
    for (const w of wallets) {
        try {
            const wallet = await selector.wallet(w.id);
            await wallet.signOut();
        } catch { }
    }
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const selector = await getSelector();
    const wallet = await selector.wallet(); // активный

    const accountId = await getAccountIdFromWallet(wallet);
    if (!accountId) throw new Error("Wallet not signed in");

    // actions: [{type:"FunctionCall"|"Transfer", params:{...}}]
    const nearActions = actions.map((a) => {
        if (a.type === "Transfer") {
            return transactions.transfer(utils.format.parseNearAmount("0") ? a.params.deposit : a.params.deposit);
        }

        if (a.type === "FunctionCall") {
            const { methodName, args, gas, deposit } = a.params;
            return transactions.functionCall(
                methodName,
                args ? Buffer.from(JSON.stringify(args)) : Buffer.from("{}"),
                BigInt(gas || "100000000000000"),
                BigInt(deposit || "0")
            );
        }

        throw new Error(`Unsupported action type: ${a.type}`);
    });

    return await wallet.signAndSendTransaction({
        receiverId,
        actions: nearActions,
    });
}