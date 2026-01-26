import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app (без @)
const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "").trim(); // herewalletbot/app

let herePromise = null;
let patched = false;

function walletDomainFromId(id) {
    // "herewalletbot/app" -> "herewalletbot"
    const s = String(id || "").trim();
    if (!s) return "";
    return s.split("/")[0].trim();
}

function normalizeTelegramMiniAppUrl(url) {
    if (!url || typeof url !== "string") return null;

    const walletDomain = walletDomainFromId(walletId);

    // tg://resolve?domain=herewalletbot&startapp=...
    if (url.startsWith("tg://resolve?")) {
        try {
            const qs = url.split("?")[1] || "";
            const params = new URLSearchParams(qs);
            const domain = params.get("domain");
            const startapp = params.get("startapp") || params.get("start") || "";
            if (!domain) return null;

            // ВАЖНО: мини-апп всегда через /app
            const base = `https://t.me/${domain}/app`;
            if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
            return base;
        } catch {
            return null;
        }
    }

    // https://t.me/...
    if (url.includes("t.me/") || url.includes("telegram.me/")) {
        const u = url.replace("telegram.me", "t.me");

        // если ссылка вида https://t.me/herewalletbot?startapp=... -> перепишем на /app
        // чтобы Telegram открыл именно Mini App, а не чат
        try {
            const parsed = new URL(u);
            const path = (parsed.pathname || "").replace(/^\/+/, ""); // "herewalletbot/app" or "herewalletbot"
            const startapp = parsed.searchParams.get("startapp") || parsed.searchParams.get("start") || "";

            // если это наш кошелек и нет /app — принудительно добавим /app
            if (walletDomain && (path === walletDomain || path === `${walletDomain}`)) {
                const base = `https://t.me/${walletDomain}/app`;
                if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
                return base;
            }

            // если уже /app — оставляем как есть
            return u;
        } catch {
            return u;
        }
    }

    return null;
}

function openTelegramMiniApp(url) {
    const tg = window.Telegram?.WebApp;
    if (!tg) return false;

    const tgUrl = normalizeTelegramMiniAppUrl(url);
    if (!tgUrl) return false;

    // "как CapsGame": открывает внутри Telegram поверх, с возможностью вернуться назад
    if (typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(tgUrl);
        return true;
    }

    // fallback (хуже): может открыть in-app browser
    if (typeof tg.openLink === "function") {
        tg.openLink(tgUrl);
        return true;
    }

    return false;
}

function patchTelegramOpen() {
    if (patched) return;
    patched = true;

    // 1) window.open
    const origOpen = window.open?.bind(window);
    window.open = (url, target, features) => {
        try {
            if (openTelegramMiniApp(url)) return null;
        } catch {
            // ignore
        }
        return origOpen ? origOpen(url, target, features) : null;
    };

    // 2) location.assign / replace
    try {
        const loc = window.location;
        const origAssign = loc.assign?.bind(loc);
        const origReplace = loc.replace?.bind(loc);

        if (origAssign) {
            loc.assign = (url) => {
                if (openTelegramMiniApp(url)) return;
                return origAssign(url);
            };
        }

        if (origReplace) {
            loc.replace = (url) => {
                if (openTelegramMiniApp(url)) return;
                return origReplace(url);
            };
        }
    } catch {
        // ignore
    }

    // 3) клики по <a href="..."> (частый кейс — иначе Telegram открывает "браузер")
    try {
        document.addEventListener(
            "click",
            (e) => {
                const a = e.target?.closest?.("a");
                const href = a?.getAttribute?.("href");
                if (!href) return;

                if (openTelegramMiniApp(href)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            },
            true
        );
    } catch {
        // ignore
    }
}

async function getHere() {
    patchTelegramOpen();

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