var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var wallet = null;
var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";

/*
 * ПЕРЕХВАТ: заменяем openTelegramLink чтобы SDK
 * не закрывал нашу игру, а открывал кошелёк в iframe
 */
function installTelegramLinkInterceptor() {
    if (!window.Telegram || !window.Telegram.WebApp) return;
    if (window.__hotInterceptorInstalled) return;
    window.__hotInterceptorInstalled = true;

    var originalOpenTelegramLink = window.Telegram.WebApp.openTelegramLink;

    window.Telegram.WebApp.openTelegramLink = function (url) {
        console.log("[INTERCEPT] openTelegramLink called:", url);

        // Если это ссылка на herewalletbot — открываем в iframe
        if (url && url.indexOf("herewalletbot") !== -1) {
            console.log("[INTERCEPT] Redirecting to iframe overlay");
            openWalletIframe(url);
            return;
        }

        // Остальные ссылки — как обычно
        if (originalOpenTelegramLink) {
            originalOpenTelegramLink.call(window.Telegram.WebApp, url);
        }
    };

    console.log("[INTERCEPT] Telegram link interceptor installed");
}

function openWalletIframe(tgUrl) {
    // Преобразуем t.me ссылку в web URL для iframe
    // https://t.me/herewalletbot/app?startapp=xxx -> https://tgapp.herewallet.app/?startapp=xxx
    var webUrl = tgUrl;
    try {
        var parsed = new URL(tgUrl);
        var path = parsed.pathname; // /herewalletbot/app
        var search = parsed.search; // ?startapp=xxx
        webUrl = "https://my.herewallet.app/" + search;
    } catch (e) {
        webUrl = "https://my.herewallet.app/";
    }

    // Удаляем старый
    var old = document.getElementById("hot-iframe-overlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.id = "hot-iframe-overlay";
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;" +
        "background:rgba(0,0,0,0.95);" +
        "display:flex;flex-direction:column;";

    // Header
    var header = document.createElement("div");
    header.style.cssText =
        "display:flex;justify-content:space-between;align-items:center;" +
        "padding:12px 16px;background:#111;flex-shrink:0;";

    var titleEl = document.createElement("span");
    titleEl.style.cssText = "color:#fff;font-size:15px;font-weight:900;";
    titleEl.textContent = "🔥 HOT Wallet";

    var closeBtn = document.createElement("button");
    closeBtn.textContent = "✕";
    closeBtn.style.cssText =
        "width:36px;height:36px;border-radius:10px;" +
        "border:1px solid rgba(255,255,255,0.2);" +
        "background:rgba(255,60,60,0.3);color:#fff;" +
        "font-size:18px;font-weight:900;cursor:pointer;" +
        "display:flex;align-items:center;justify-content:center;";
    closeBtn.addEventListener("click", function () {
        var el = document.getElementById("hot-iframe-overlay");
        if (el) el.remove();
    });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);

    // iframe
    var iframe = document.createElement("iframe");
    iframe.src = webUrl;
    iframe.style.cssText =
        "flex:1;width:100%;border:none;background:#000;";
    iframe.setAttribute("allow",
        "clipboard-read; clipboard-write; web-share");

    overlay.appendChild(header);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    console.log("[INTERCEPT] iframe opened:", webUrl);
}

// Устанавливаем перехватчик сразу
installTelegramLinkInterceptor();

async function getWallet() {
    if (wallet) return wallet;

    // Убеждаемся что перехватчик на месте
    installTelegramLinkInterceptor();

    var mod = await import("@here-wallet/core");
    var HereWallet = mod.HereWallet || mod.default;

    if (!HereWallet) {
        throw new Error("HereWallet not found");
    }

    wallet = await HereWallet.connect({
        networkId: networkId,
        walletId: (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim(),
        telegramBotId: (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim(),
        rpcUrl: RPC_URL,
    });

    return wallet;
}

async function connectWallet() {
    // Убеждаемся что перехватчик на месте
    installTelegramLinkInterceptor();

    var w = await getWallet();

    // Проверяем уже авторизован
    var existingId = "";
    try {
        if (w.getAccountId) {
            existingId = await w.getAccountId();
        }
    } catch (e) { }

    if (existingId) {
        currentAccountId = String(existingId);
        localStorage.setItem(STORAGE_KEY, currentAccountId);
        return { accountId: currentAccountId };
    }

    // signIn — SDK попытается вызвать openTelegramLink
    // но наш перехватчик откроет iframe вместо этого
    try {
        var result = await w.signIn({
            contractId: (import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "").trim() || undefined,
        });

        var accountId = "";
        if (typeof result === "string") accountId = result;
        else if (result && result.accountId) accountId = result.accountId;

        if (!accountId && w.getAccountId) {
            try { accountId = await w.getAccountId(); } catch (e) { }
        }

        accountId = String(accountId || "").trim();

        if (accountId) {
            currentAccountId = accountId;
            localStorage.setItem(STORAGE_KEY, accountId);
            // Закрываем iframe
            var el = document.getElementById("hot-iframe-overlay");
            if (el) el.remove();
        }

        return { accountId: accountId };
    } catch (e) {
        var msg = (e && e.message || "").toLowerCase();
        if (msg.indexOf("load failed") !== -1 || msg.indexOf("user reject") !== -1) {
            return { accountId: "" };
        }
        throw e;
    }
}

async function disconnectWallet() {
    try {
        if (wallet && wallet.signOut) await wallet.signOut();
    } catch (e) { }
    wallet = null;
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
}

async function getSignedInAccountId() {
    if (currentAccountId) return currentAccountId;

    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
    }

    if (wallet && wallet.getAccountId) {
        try {
            var id = await wallet.getAccountId();
            if (id) {
                currentAccountId = String(id);
                localStorage.setItem(STORAGE_KEY, currentAccountId);
                return currentAccountId;
            }
        } catch (e) { }
    }

    return "";
}

async function signAndSendTransaction(params) {
    // Перехватчик на месте
    installTelegramLinkInterceptor();

    if (!wallet) throw new Error("Wallet not initialized");
    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Not connected");

    return await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};