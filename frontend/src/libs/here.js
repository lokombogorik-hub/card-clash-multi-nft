import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app (без @)
const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "").trim(); // herewalletbot/app

let herePromise = null;
let navPatched = false;

function normalizeTelegramUrl(url) {
    if (!url || typeof url !== "string") return null;

    // https://t.me/...
    if (url.includes("t.me/") || url.includes("telegram.me/")) {
        return url.replace("telegram.me", "t.me");
    }

    // tg://resolve?domain=...&startapp=...
    if (url.startsWith("tg://resolve?")) {
        try {
            const qs = url.split("?")[1] || "";
            const params = new URLSearchParams(qs);
            const domain = params.get("domain");
            const startapp = params.get("startapp") || params.get("start") || "";
            if (!domain) return null;

            if (startapp) return `https://t.me/${domain}?startapp=${encodeURIComponent(startapp)}`;
            return `https://t.me/${domain}`;
        } catch {
            return null;
        }
    }

    return null;
}

function openInTelegram(url) {
    const tg = window.Telegram?.WebApp;
    if (!tg) return false;

    const tgUrl = normalizeTelegramUrl(url);
    if (!tgUrl) return false;

    // ВАЖНО: openTelegramLink открывает поверх и позволяет вернуться "назад" как в @CapsGame
    if (typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(tgUrl);
        return true;
    }

    // fallback (хуже): openLink может открыть in-app browser
    if (typeof tg.openLink === "function") {
        tg.openLink(tgUrl);
        return true;
    }

    return false;
}

function patchTelegramNavigation() {
    if (navPatched) return;
    navPatched = true;

    // patch window.open
    const origOpen = window.open?.bind(window);
    window.open = (url, target, features) => {
        try {
            if (openInTelegram(url)) return null;
        } catch {
            // ignore
        }
        return origOpen ? origOpen(url, target, features) : null;
    };

    // patch location.assign / replace (кошельки часто используют это)
    try {
        const loc = window.location;
        const origAssign = loc.assign?.bind(loc);
        const origReplace = loc.replace?.bind(loc);

        if (origAssign) {
            loc.assign = (url) => {
                if (openInTelegram(url)) return;
                return origAssign(url);
            };
        }

        if (origReplace) {
            loc.replace = (url) => {
                if (openInTelegram(url)) return;
                return origReplace(url);
            };
        }
    } catch {
        // ignore
    }
}

async function getHere() {
    patchTelegramNavigation();

    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");
    if (!walletId) throw new Error("VITE_HOT_WALLET_ID is missing (expected herewalletbot/app)");

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
    // expand перед открытием кошелька (чтобы выглядело как "поверх" без обрезаний)
    try {
        window.Telegram?.WebApp?.expand?.();
    } catch {
        // ignore
    }

    const here = await getHere();
    const res = await here.authenticate();
    const accountId = String(res?.accountId || "").trim();
    return { ...res, accountId };
}

export async function hereSignAndSendTransaction({ receiverId, actions }) {
    try {
        window.Telegram?.WebApp?.expand?.();
    } catch {
        // ignore
    }

    const here = await getHere();

    const signerId = getStoredAccountId() || undefined;

    return await here.signAndSendTransaction({
        signerId,
        receiverId,
        actions,
    });
}