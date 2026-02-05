import { HereWallet } from "@here-wallet/core";

const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

const TG_BOT_ID = (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim();
const HOT_WALLET_ID = (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim();

function logHot(step, message, extra) {
    try {
        window.__HOT_WALLET_ERRORS__ = window.__HOT_WALLET_ERRORS__ || [];
        window.__HOT_WALLET_ERRORS__.push({
            step,
            message,
            extra,
            time: new Date().toISOString(),
        });
    } catch { }
}

function tgOpen(url) {
    const tg = window.Telegram?.WebApp;
    try {
        tg?.openTelegramLink?.(url);
        logHot("tg:openTelegramLink", "Opened via openTelegramLink", { url });
        return true;
    } catch (e) {
        logHot("tg:openTelegramLink_err", e?.message || String(e));
    }
    try {
        tg?.openLink?.(url, { try_instant_view: false });
        logHot("tg:openLink", "Opened via openLink", { url });
        return true;
    } catch (e) {
        logHot("tg:openLink_err", e?.message || String(e));
    }
    window.open(url, "_blank", "noopener,noreferrer");
    logHot("tg:window.open", "Opened via window.open", { url });
    return false;
}

function walletBotUsernameFromId(walletId) {
    const s = String(walletId || "").trim();
    const username = s.split("/")[0].trim();
    return username || "herewalletbot";
}

// ✅ FIX: deeplink для переключения сети в HOT Wallet
function openHereWalletSwitchNetwork() {
    const username = walletBotUsernameFromId(HOT_WALLET_ID);
    // Используем специальный deeplink для переключения сети
    const url = `https://t.me/${username}/app?startapp=network_${networkId}`;
    logHot("hot:switch_network", "Opening HOT Wallet to switch network", { url, networkId });
    tgOpen(url);
}

function openHereWalletTelegram() {
    const username = walletBotUsernameFromId(HOT_WALLET_ID);
    const payload = encodeURIComponent(networkId);
    const url = `https://t.me/${username}?startapp=${payload}`;
    logHot("hot:deeplink", "Opening HERE wallet via Telegram deep link", { url, networkId });
    tgOpen(url);
}

function clearHereWalletStorage() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            const lk = k.toLowerCase();
            if (lk.includes("herewallet") || lk.includes("here_wallet") || lk.includes("hot_wallet")) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach((k) => {
            localStorage.removeItem(k);
            logHot("hot:clear_storage", `Removed old key: ${k}`);
        });
    } catch (e) {
        logHot("hot:clear_storage_err", e?.message || String(e));
    }
}

let wallet = null;
let isConnecting = false;

async function getWallet() {
    if (wallet) return wallet;

    logHot("hot:init", "Initializing HereWallet", { networkId, RPC_URL, HOT_WALLET_ID, TG_BOT_ID });

    try {
        wallet = await HereWallet.connect({
            networkId,
            walletId: HOT_WALLET_ID,
            telegramBotId: TG_BOT_ID,
            rpcUrl: RPC_URL,
            openUrl: (url) => {
                logHot("hot:openUrl_callback", "HOT SDK requested openUrl", { url });
                tgOpen(url);
            },
        });

        logHot("hot:init_ok", "HereWallet initialized");
        return wallet;
    } catch (e) {
        logHot("hot:init_err", e?.message || String(e), { stack: e?.stack });
        throw e;
    }
}

/**
 * Silent check: только читает уже авторизованный аккаунт
 */
export async function getSignedInAccountId() {
    try {
        const w = await getWallet();

        if (typeof w.isSignedIn === "function") {
            const signedIn = await w.isSignedIn();
            logHot("hot:isSignedIn", "isSignedIn()", { signedIn, networkId });
            if (!signedIn) return "";
        }

        if (typeof w.getAccountId === "function") {
            const id = await w.getAccountId();
            logHot("hot:silent_getAccountId", "getAccountId()", { id, networkId });
            if (id) {
                // ✅ FIX: проверяем, что аккаунт на правильной сети
                if (networkId === "testnet" && !id.includes(".testnet")) {
                    logHot("hot:wrong_network", "Account is not testnet", { id, expectedNetwork: networkId });
                    return "";
                }
                if (networkId === "mainnet" && id.includes(".testnet")) {
                    logHot("hot:wrong_network", "Account is testnet, but mainnet expected", { id, expectedNetwork: networkId });
                    return "";
                }
                return id;
            }
        }

        if (typeof w.getAccounts === "function") {
            const accounts = await w.getAccounts();
            const id = accounts?.[0]?.accountId || "";
            logHot("hot:silent_accounts", "getAccounts()", { id, accounts, networkId });
            if (id) {
                // ✅ FIX: проверяем сеть
                if (networkId === "testnet" && !id.includes(".testnet")) {
                    logHot("hot:wrong_network", "Account is not testnet", { id, expectedNetwork: networkId });
                    return "";
                }
                if (networkId === "mainnet" && id.includes(".testnet")) {
                    logHot("hot:wrong_network", "Account is testnet, but mainnet expected", { id, expectedNetwork: networkId });
                    return "";
                }
                return id;
            }
        }
    } catch (e) {
        logHot("hot:silent_err", e?.message || String(e));
    }

    return "";
}

/**
 * Active connect: вызывает signIn и открывает HOT Wallet
 */
export async function connectHotWallet() {
    if (isConnecting) {
        logHot("hot:already_connecting", "Connection already in progress");
        throw new Error("Connection already in progress");
    }

    isConnecting = true;
    logHot("hot:start", "Starting HERE/HOT connect (active)...");
    logHot("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId, RPC_URL });

    try {
        const w = await getWallet();

        // ✅ FIX: сначала проверяем, не авторизован ли уже на правильной сети
        const existingId = await getSignedInAccountId();
        if (existingId) {
            logHot("hot:already_signed_in", "Already signed in on correct network", { existingId, networkId });
            isConnecting = false;
            return { accountId: existingId, wallet: w };
        }

        // ✅ FIX: если есть аккаунт, но на другой сети - сначала разлогиниваем
        try {
            if (typeof w.getAccountId === "function") {
                const rawId = await w.getAccountId();
                if (rawId) {
                    const isWrongNetwork =
                        (networkId === "testnet" && !rawId.includes(".testnet")) ||
                        (networkId === "mainnet" && rawId.includes(".testnet"));

                    if (isWrongNetwork) {
                        logHot("hot:wrong_network_detected", "Account on wrong network, signing out", { rawId, networkId });
                        if (typeof w.signOut === "function") {
                            await w.signOut();
                            logHot("hot:signOut_ok", "Signed out from wrong network");
                        }
                        clearHereWalletStorage();
                        wallet = null;
                        // Переинициализируем
                        await getWallet();
                    }
                }
            }
        } catch (e) {
            logHot("hot:wrong_network_check_err", e?.message || String(e));
        }

        if (typeof w.signIn !== "function") {
            throw new Error("HOT Wallet SDK: signIn method not found");
        }

        logHot("hot:signIn_start", "Calling wallet.signIn()");

        const res = await w.signIn({
            contractId: import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || undefined,
        }).catch((e) => {
            logHot("hot:signIn_err", e?.message || String(e), { stack: e?.stack });

            const msg = String(e?.message || "").toLowerCase();
            if (msg.includes("load failed") || msg.includes("user reject")) {
                logHot("hot:signIn_user_action_needed", "User needs to authorize in HOT Wallet");
                return null;
            }

            throw e;
        });

        if (!res) {
            logHot("hot:signIn_pending", "Waiting for user to authorize in HOT Wallet");
            isConnecting = false;
            return { accountId: "", wallet: w };
        }

        const accountId = typeof res === "string" ? res : res?.accountId || res?.account_id || "";

        if (accountId) {
            // ✅ FIX: проверяем сеть возвращённого аккаунта
            const isWrongNetwork =
                (networkId === "testnet" && !accountId.includes(".testnet")) ||
                (networkId === "mainnet" && accountId.includes(".testnet"));

            if (isWrongNetwork) {
                logHot("hot:signIn_wrong_network", "SignIn returned account from wrong network", {
                    accountId,
                    expectedNetwork: networkId
                });
                isConnecting = false;
                throw new Error(`Wrong network: got ${accountId.includes(".testnet") ? "testnet" : "mainnet"} account, but ${networkId} expected. Please switch network in HOT Wallet.`);
            }

            logHot("hot:signIn_ok", "SignIn successful", { accountId, networkId });
            isConnecting = false;
            return { accountId, wallet: w };
        }

        const silentId = await getSignedInAccountId();
        if (silentId) {
            logHot("hot:signIn_silent_ok", "Got account after signIn", { silentId, networkId });
            isConnecting = false;
            return { accountId: silentId, wallet: w };
        }

        logHot("hot:signIn_no_account", "No account after signIn, user needs to complete auth");
        isConnecting = false;
        return { accountId: "", wallet: w };

    } catch (e) {
        isConnecting = false;
        const msg = e?.message || String(e);
        logHot("hot:error", msg, { stack: e?.stack, networkId });
        throw e;
    }
}

export async function connectMyNearWallet() {
    throw new Error("MyNearWallet disabled in Telegram WebApp. Use HOT Wallet.");
}

export async function connectWallet() {
    return connectHotWallet();
}

export async function disconnectWallet() {
    try {
        const w = await getWallet();
        if (typeof w.signOut === "function") {
            await w.signOut();
            logHot("hot:signOut_ok", "SignOut successful");
        } else if (typeof w.disconnect === "function") {
            await w.disconnect();
            logHot("hot:disconnect_ok", "Disconnect successful");
        }
    } catch (e) {
        logHot("hot:disconnect_err", e?.message || String(e));
    }

    clearHereWalletStorage();
    wallet = null;
    isConnecting = false;
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const w = await getWallet();

    const accountId = await getSignedInAccountId();
    if (!accountId) {
        throw new Error("Wallet not signed in. Click Connect HOT Wallet.");
    }

    if (typeof w.signAndSendTransaction !== "function") {
        logHot("hot:no_sign", "wallet.signAndSendTransaction missing");
        throw new Error("HERE wallet API mismatch: signAndSendTransaction missing");
    }

    logHot("hot:sign_tx_start", "Starting transaction signing", { receiverId, accountId, actionsCount: actions.length });

    try {
        const result = await w.signAndSendTransaction({
            signerId: accountId,
            receiverId,
            actions,
        });

        logHot("hot:sign_tx_ok", "Transaction signed successfully", { result });
        return result;
    } catch (e) {
        logHot("hot:sign_tx_err", e?.message || String(e), { stack: e?.stack });
        throw e;
    }
}

// ✅ FIX: экспортируем для UI
export { openHereWalletSwitchNetwork };