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
        return;
    } catch (e) {
        logHot("tg:openTelegramLink_err", e?.message || String(e));
    }
    try {
        tg?.openLink?.(url);
        logHot("tg:openLink", "Opened via openLink", { url });
        return;
    } catch (e) {
        logHot("tg:openLink_err", e?.message || String(e));
    }
    window.open(url, "_blank", "noopener,noreferrer");
    logHot("tg:window.open", "Opened via window.open", { url });
}

function walletBotUsernameFromId(walletId) {
    const s = String(walletId || "").trim();
    const username = s.split("/")[0].trim();
    return username || "herewalletbot";
}

function openHereWalletTelegram() {
    const username = walletBotUsernameFromId(HOT_WALLET_ID);
    // ✅ FIX: передаём network в startapp
    const payload = encodeURIComponent(networkId);
    const url = `https://t.me/${username}?startapp=${payload}`;
    logHot("hot:deeplink", "Opening HERE wallet via Telegram deep link", { url, networkId });
    tgOpen(url);
}

// ✅ FIX: очищаем старые сессии HOT при смене сети
function clearHereWalletStorage() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k) continue;
            const lk = k.toLowerCase();
            // Удаляем старые ключи HOT/HERE
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

async function getWallet() {
    if (wallet) return wallet;

    // ✅ FIX: очищаем старые сессии перед инициализацией
    clearHereWalletStorage();

    logHot("hot:init", "Initializing HereWallet", { networkId, RPC_URL, HOT_WALLET_ID, TG_BOT_ID });

    wallet = await HereWallet.connect({
        networkId,
        walletId: HOT_WALLET_ID,
        telegramBotId: TG_BOT_ID,
        rpcUrl: RPC_URL,
        // ✅ FIX: используем только openTelegramLink для Telegram WebApp
        openUrl: (url) => {
            logHot("hot:openUrl", "HOT requested openUrl", { url });
            const tg = window.Telegram?.WebApp;
            if (tg?.openTelegramLink) {
                try {
                    tg.openTelegramLink(url);
                    logHot("hot:openUrl_ok", "Opened via openTelegramLink");
                    return;
                } catch (e) {
                    logHot("hot:openUrl_err", e?.message || String(e));
                }
            }
            // Fallback
            tgOpen(url);
        },
    });

    logHot("hot:init_ok", "HereWallet initialized");
    return wallet;
}

/**
 * Silent check: DO NOT call signIn/connect here.
 * Only tries to read already-authorized account from wallet storage/session.
 */
export async function getSignedInAccountId() {
    const w = await getWallet();

    try {
        if (typeof w.getAccounts === "function") {
            const accounts = await w.getAccounts();
            const id = accounts?.[0]?.accountId || "";
            logHot("hot:silent_accounts", "getAccounts()", { id, networkId });
            return id;
        }
    } catch (e) {
        logHot("hot:silent_accounts_err", e?.message || String(e));
    }

    try {
        if (typeof w.getAccountId === "function") {
            const id = await w.getAccountId();
            logHot("hot:silent_getAccountId", "getAccountId()", { id, networkId });
            return id || "";
        }
    } catch (e) {
        logHot("hot:silent_getAccountId_err", e?.message || String(e));
    }

    try {
        if (typeof w.accountId === "function") {
            const id = await w.accountId();
            logHot("hot:silent_accountId", "accountId()", { id, networkId });
            return id || "";
        }
    } catch (e) {
        logHot("hot:silent_accountId_err", e?.message || String(e));
    }

    return "";
}

/**
 * Active connect: MAY call signIn/connect and MAY open deeplink.
 * Call ONLY from user click.
 */
export async function connectHotWallet() {
    logHot("hot:start", "Starting HERE/HOT connect (active)...");
    logHot("hot:env", "ENV", { botId: TG_BOT_ID, walletId: HOT_WALLET_ID, networkId, RPC_URL });

    const w = await getWallet();

    try {
        // ✅ FIX: сначала пробуем signIn без автоматического открытия deeplink
        if (typeof w.signIn === "function") {
            logHot("hot:connect_api", "Using wallet.signIn()");

            const res = await w.signIn({
                contractId: import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "",
            }).catch((e) => {
                logHot("hot:signIn_err", e?.message || String(e), { stack: e?.stack });
                // Если ошибка "Load failed" — открываем deeplink вручную
                if ((e?.message || "").toLowerCase().includes("load failed")) {
                    logHot("hot:signIn_fallback", "Load failed, opening deeplink manually");
                    openHereWalletTelegram();
                    return null;
                }
                throw e;
            });

            if (!res) {
                // signIn не вернул результат, но deeplink уже открыт
                return { accountId: "", wallet: w };
            }

            const accountId =
                typeof res === "string" ? res : res?.accountId || res?.account_id || "";

            if (accountId) {
                logHot("hot:signIn_ok", "SignIn successful", { accountId, networkId });
                return { accountId, wallet: w };
            }

            // Пробуем получить аккаунт после signIn
            const silentId = await getSignedInAccountId();
            if (silentId) {
                logHot("hot:signIn_silent_ok", "Got account after signIn", { silentId, networkId });
                return { accountId: silentId, wallet: w };
            }
        }

        // Если signIn не сработал — открываем deeplink
        openHereWalletTelegram();
        return { accountId: "", wallet: w };
    } catch (e) {
        const msg = e?.message || String(e);
        logHot("hot:error", msg, { stack: e?.stack, networkId });

        if (msg.toLowerCase().includes("load failed")) {
            openHereWalletTelegram();
            return { accountId: "", wallet: w };
        }

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
    const w = await getWallet();
    try {
        if (typeof w.disconnect === "function") await w.disconnect();
        else if (typeof w.signOut === "function") await w.signOut();
    } catch { }

    // ✅ FIX: очищаем кеш HOT при disconnect
    clearHereWalletStorage();
    wallet = null; // ✅ FIX: сбрасываем инстанс
}

export async function signAndSendTransaction({ receiverId, actions }) {
    const w = await getWallet();

    // IMPORTANT: do not auto-open deeplink here.
    // If not signed in, throw and UI should ask user to connect.
    const accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Wallet not signed in. Click Connect HOT Wallet.");

    if (typeof w.signAndSendTransaction !== "function") {
        logHot("hot:no_sign", "wallet.signAndSendTransaction missing");
        throw new Error("HERE wallet API mismatch: signAndSendTransaction missing");
    }

    return await w.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}