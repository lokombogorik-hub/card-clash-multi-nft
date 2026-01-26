import { HereWallet } from "@here-wallet/core";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app (без @)
const walletId = (import.meta.env.VITE_HOT_WALLET_ID || "").trim(); // IMPORTANT: hot_wallet/app OR herewalletbot/app

let herePromise = null;
let patched = false;

function walletDomainFromId(id) {
    // "hot_wallet/app" -> "hot_wallet"
    const s = String(id || "").trim();
    return s ? s.split("/")[0].trim() : "";
}

/**
 * Превращает ЛЮБОЙ URL, ведущий к HOT/HERE, в Telegram Mini App link:
 *   https://t.me/<walletDomain>/app?startapp=...
 * чтобы Telegram открыл его "поверх" (как CapsGame), а не в браузере.
 */
function toTelegramMiniAppLink(url) {
    if (!url || typeof url !== "string") return null;

    const preferredDomain = walletDomainFromId(walletId); // что выбрано в env
    const knownWalletDomains = new Set(
        [preferredDomain, "hot_wallet", "herewalletbot"].filter(Boolean)
    );

    // tg://resolve?domain=...&startapp=...
    if (url.startsWith("tg://resolve?")) {
        try {
            const qs = url.split("?")[1] || "";
            const params = new URLSearchParams(qs);
            const domain = (params.get("domain") || "").trim();
            const startapp =
                params.get("startapp") ||
                params.get("start") ||
                params.get("start_param") ||
                params.get("startParam") ||
                "";

            if (!domain) return null;

            const base = `https://t.me/${domain}/app`;
            if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
            return base;
        } catch {
            return null;
        }
    }

    // try parse as URL (https://...)
    let parsed = null;
    try {
        parsed = new URL(url);
    } catch {
        parsed = null;
    }

    // https://t.me/<domain>/app?... or https://t.me/<domain>?startapp=...
    if (parsed && (parsed.hostname === "t.me" || parsed.hostname === "telegram.me")) {
        const path = (parsed.pathname || "").replace(/^\/+/, ""); // "hot_wallet/app" or "hot_wallet"
        const [domain, maybeApp] = path.split("/");

        const startapp =
            parsed.searchParams.get("startapp") ||
            parsed.searchParams.get("start") ||
            parsed.searchParams.get("start_param") ||
            parsed.searchParams.get("startParam") ||
            "";

        if (!domain) return null;

        const base = `https://t.me/${domain}/app`;
        if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
        return base;
    }

    // Любой другой домен (например tgapp.herewallet..., near... и т.п.)
    // Пытаемся вытащить domain/startapp из query.
    if (parsed) {
        const q = parsed.searchParams;

        const domainFromQuery = (q.get("domain") || "").trim();
        const startapp =
            q.get("startapp") ||
            q.get("start") ||
            q.get("start_param") ||
            q.get("startParam") ||
            "";

        // если домен кошелька лежит в query
        if (domainFromQuery && knownWalletDomains.has(domainFromQuery)) {
            const base = `https://t.me/${domainFromQuery}/app`;
            if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
            return base;
        }

        // если в URL где-то встречается hot_wallet / herewalletbot
        for (const d of knownWalletDomains) {
            if (!d) continue;
            if (url.includes(d)) {
                const base = `https://t.me/${d}/app`;
                if (startapp) return `${base}?startapp=${encodeURIComponent(startapp)}`;
                return base;
            }
        }
    }

    return null;
}

function openAsTelegramOverlay(url) {
    const tg = window.Telegram?.WebApp;
    if (!tg) return false;

    const tgMiniAppLink = toTelegramMiniAppLink(url);
    if (!tgMiniAppLink) return false;

    // ВАЖНО: openTelegramLink = открывает внутри Telegram "поверх" (как @CapsGame)
    if (typeof tg.openTelegramLink === "function") {
        tg.openTelegramLink(tgMiniAppLink);
        return true;
    }

    // fallback: может открыть in-app browser (хуже, но лучше чем window.open)
    if (typeof tg.openLink === "function") {
        tg.openLink(tgMiniAppLink);
        return true;
    }

    return false;
}

function patchAllOpens() {
    if (patched) return;
    patched = true;

    // 0) Патчим Telegram.WebApp.openLink => чтобы все t.me/hot_wallet/herewalletbot открывалось как overlay
    try {
        const tg = window.Telegram?.WebApp;
        if (tg && typeof tg.openLink === "function") {
            const origOpenLink = tg.openLink.bind(tg);
            tg.openLink = (url, opts) => {
                try {
                    if (openAsTelegramOverlay(url)) return;
                } catch {
                    // ignore
                }
                return origOpenLink(url, opts);
            };
        }
    } catch {
        // ignore
    }

    // 1) window.open
    try {
        const origOpen = window.open?.bind(window);
        window.open = (url, target, features) => {
            try {
                if (openAsTelegramOverlay(url)) return null;
            } catch {
                // ignore
            }
            return origOpen ? origOpen(url, target, features) : null;
        };
    } catch {
        // ignore
    }

    // 2) location.assign/replace
    try {
        const loc = window.location;
        const origAssign = loc.assign?.bind(loc);
        const origReplace = loc.replace?.bind(loc);

        if (origAssign) {
            loc.assign = (url) => {
                if (openAsTelegramOverlay(url)) return;
                return origAssign(url);
            };
        }

        if (origReplace) {
            loc.replace = (url) => {
                if (openAsTelegramOverlay(url)) return;
                return origReplace(url);
            };
        }
    } catch {
        // ignore
    }

    // 3) клики по <a href>
    try {
        document.addEventListener(
            "click",
            (e) => {
                const a = e.target?.closest?.("a");
                const href = a?.getAttribute?.("href");
                if (!href) return;

                if (openAsTelegramOverlay(href)) {
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
    patchAllOpens();

    if (!botId) throw new Error("VITE_TG_BOT_ID is missing (expected Cardclashbot/app)");
    if (!walletId) throw new Error("VITE_HOT_WALLET_ID is missing (expected hot_wallet/app or herewalletbot/app)");

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