/**
 * Card Clash — HOT Wallet direct connection
 * 
 * Стратегия:
 * 1. В Telegram WebApp — используем HERE Wallet через injected/iframe
 *    (кошелёк открывается ПОВЕРХ игры, не закрывая её)
 * 2. HOT Wallet бот (@herewalletbot) инжектит window.near в WebApp
 * 3. Если нет injected — используем iframe strategy (widget поверх)
 */

import { connect, keyStores, WalletConnection } from "near-api-js";

/* ───── config ───── */
const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
    ? "testnet" : "mainnet";

const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const HOT_WALLET_ID = import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app";

/* ───── state ───── */
let hereWallet = null;
let connectedAccountId = "";

/* ───── detect environment ───── */
function isTelegramWebApp() {
    return !!(window.Telegram?.WebApp?.initData);
}

function isHereInjected() {
    return !!(window.near || window.hereWallet);
}

/* ───── HERE Wallet via @here-wallet/core ───── */
async function getHereWallet() {
    if (hereWallet) return hereWallet;

    const { HereWallet } = await import("@here-wallet/core");

    if (isTelegramWebApp()) {
        /*
         * В Telegram WebApp HOT Wallet доступен через:
         * 1. window.near (если пользователь открыл через HOT Wallet бот)
         * 2. HereWallet с strategy telegram — widget overlay
         */
        try {
            const { HereStrategy } = await import("@here-wallet/core");
            hereWallet = await HereWallet.connect({
                botId: HOT_WALLET_ID,
                strategy: new HereStrategy({
                    widget: true, // overlay поверх текущего WebApp
                }),
            });
        } catch (e1) {
            console.warn("[HOT] HereStrategy failed, trying default:", e1);
            try {
                hereWallet = await HereWallet.connect({
                    botId: HOT_WALLET_ID,
                });
            } catch (e2) {
                console.warn("[HOT] Default connect failed, trying injected:", e2);
                hereWallet = new HereWallet();
            }
        }
    } else {
        // Desktop / обычный браузер
        hereWallet = new HereWallet();
    }

    return hereWallet;
}

/* ───── Connect ───── */
async function connectWallet() {
    const wallet = await getHereWallet();

    try {
        // signIn с пустым contractId — просто авторизация
        const accountId = await wallet.signIn({
            contractId: "",
        });

        connectedAccountId = accountId || "";

        // Если signIn вернул пустоту, пробуем getAccountId
        if (!connectedAccountId) {
            try {
                connectedAccountId = await wallet.getAccountId();
            } catch { }
        }

        if (!connectedAccountId) {
            throw new Error("No account returned from HOT Wallet");
        }

        console.log("[HOT] Connected:", connectedAccountId);
        return { accountId: connectedAccountId };

    } catch (err) {
        console.error("[HOT] Connect error:", err);
        throw err;
    }
}

/* ───── Disconnect ───── */
async function disconnectWallet() {
    try {
        if (hereWallet) {
            await hereWallet.signOut();
        }
    } catch (e) {
        console.warn("[HOT] signOut error:", e);
    }
    hereWallet = null;
    connectedAccountId = "";
}

/* ───── Get signed in account ───── */
async function getSignedInAccountId() {
    if (connectedAccountId) return connectedAccountId;

    try {
        const wallet = await getHereWallet();
        const id = await wallet.getAccountId();
        if (id) {
            connectedAccountId = id;
            return id;
        }
    } catch { }

    return "";
}

/* ───── Sign and send transaction ───── */
async function signAndSendTransaction({ receiverId, actions }) {
    const wallet = await getHereWallet();
    if (!wallet) throw new Error("Wallet not connected");

    const accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("No signed-in account");

    // Преобразуем actions в формат HERE Wallet
    const hereActions = actions.map((a) => {
        if (a.type === "FunctionCall") {
            return {
                type: "FunctionCall",
                params: {
                    methodName: a.params.methodName,
                    args: a.params.args,
                    gas: a.params.gas || "100000000000000",
                    deposit: a.params.deposit || "0",
                },
            };
        }
        if (a.type === "Transfer") {
            return {
                type: "Transfer",
                params: {
                    deposit: a.params.deposit || "0",
                },
            };
        }
        return a;
    });

    const result = await wallet.signAndSendTransaction({
        receiverId,
        actions: hereActions,
    });

    return result;
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};