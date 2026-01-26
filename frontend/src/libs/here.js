import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app (без @)
const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "").trim(); // herewalletbot/app

let herePromise = null;
let windowOpenPatched = false;

function buildHttpsTelegramLink(url) {
    if (!url || typeof url !== "string") return null;

    // already https t.me
    if (url.includes("t.me/") || url.includes("telegram.me/")) {
        return url.replace("telegram.me", "t.me");
    }

    // tg://resolve?domain=herewalletbot&startapp=...
    if (url.startsWith("tg://resolve?")) {
        try {
            const qs = url.split("?")[1] || "";
            const params = new URLSearchParams(qs);
            const domain = params.get("domain");
            const startapp = params.get("startapp") || params.get("start") || "";

            if (!domain) return null;

            if (startapp) {
                return `https://t.me/${domain}?startapp=${encodeURIComponent(startapp)}`;
            }
            return `https://t.me/${domain}`;
        } catch {
            return null;
        }
    }

    return null;
}

function patchWindowOpenForTelegram() {
    if (windowOpenPatched) return;
    windowOpenPatched = true;

    const origOpen = window.open?.bind(window);

    window.open = (url, target, features) => {
        try {
            const tg = window.Telegram?.WebApp;

            // In Telegram WebApp лучше открывать через openTelegramLink/openLink
            if (tg && typeof url === "string" && url) {
                const httpsTg = buildHttpsTelegramLink(url);

                if (httpsTg) {
                    if (typeof tg.openTelegramLink === "function") {
                        tg.openTelegramLink(httpsTg);
                        return null;
                    }
                    if (typeof tg.openLink === "function") {
                        tg.openLink(httpsTg);
                        return null;
                    }
                }

                // fallback: external link
                if (typeof tg.openLink === "function" && /^https?:\/\//i.test(url)) {
                    tg.openLink(url);
                    return null;
                }
            }
        } catch {
            // ignore
        }

        // default
        if (origOpen) return origOpen(url, target, features);
        return null;
    };
}

async function getHere() {
    patchWindowOpenForTelegram();

    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected like Cardclashbot/app)");
    if (!walletId) throw new Error("VITE_HOT_WALLET_ID is missing (expected like herewalletbot/app)");

    if (!herePromise) {
        herePromise = HereWallet.connect({
            networkId,
            botId,
            walletId,
        });
    }
    return await herePromise;
}

function getStoredAccountId() {
    try {
        return (localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "").trim();
    } catch {
        return "";
    }
}

export async function hereAuthenticate() {
    const here = await getHere();

    // HERE core делает authenticate через NEP-413 (без AddKey)
    // Возвращает { accountId, publicKey, signature, message, ... } (зависит от версии)
    const res = await here.authenticate();
    const accountId = String(res?.accountId || "").trim();

    return { ...res, accountId };
}

export async function hereSignAndSendTransaction({ receiverId, actions }) {
    const here = await getHere();

    const signerId = getStoredAccountId() || undefined;

    // IMPORTANT:
    // some versions accept signerId, some don't — но передать безопасно
    // если библиотека не использует signerId, она просто проигнорит
    return await here.signAndSendTransaction({
        signerId,
        receiverId,
        actions,
    });
}