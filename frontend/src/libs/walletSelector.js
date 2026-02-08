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

async function getWallet() {
    if (wallet) return wallet;

    var mod = await import("@here-wallet/core");
    var HereWallet = mod.HereWallet || mod.default;

    if (!HereWallet) {
        throw new Error("HereWallet not found in module");
    }

    wallet = await HereWallet.connect({
        networkId: networkId,
        walletId: (import.meta.env.VITE_HOT_WALLET_ID || "herewalletbot/app").trim(),
        telegramBotId: (import.meta.env.VITE_TG_BOT_ID || "Cardclashbot/app").trim(),
        rpcUrl: RPC_URL,
        openUrl: function (url) {
            // НЕ используем openTelegramLink — он закрывает игру!
            // Вместо этого открываем в iframe поверх
            openWalletOverlay(url);
        },
    });

    return wallet;
}

function openWalletOverlay(url) {
    // Удаляем старый
    var old = document.getElementById("hot-iframe-overlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.id = "hot-iframe-overlay";
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;" +
        "background:rgba(0,0,0,0.9);" +
        "display:flex;flex-direction:column;" +
        "align-items:center;justify-content:flex-start;" +
        "padding:0;";

    // Кнопка закрыть
    var closeBar = document.createElement("div");
    closeBar.style.cssText =
        "width:100%;padding:8px 16px;" +
        "display:flex;justify-content:space-between;align-items:center;" +
        "background:rgba(0,0,0,0.95);flex-shrink:0;";

    var title = document.createElement("span");
    title.style.cssText = "color:#fff;font-size:14px;font-weight:900;";
    title.textContent = "🔥 HOT Wallet";

    var closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ Close";
    closeBtn.style.cssText =
        "padding:8px 16px;border-radius:10px;" +
        "border:1px solid rgba(255,255,255,0.2);" +
        "background:rgba(255,60,60,0.2);color:#fff;" +
        "font-size:13px;font-weight:800;cursor:pointer;";

    closeBtn.addEventListener("click", function () {
        var el = document.getElementById("hot-iframe-overlay");
        if (el) el.remove();
    });

    closeBar.appendChild(title);
    closeBar.appendChild(closeBtn);

    // iframe с кошельком
    var iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.cssText =
        "flex:1;width:100%;border:none;" +
        "background:#000;border-radius:0;";
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");
    iframe.setAttribute("sandbox",
        "allow-scripts allow-same-origin allow-popups " +
        "allow-forms allow-modals allow-top-navigation");

    overlay.appendChild(closeBar);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);
}

async function connectWallet() {
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

    // signIn — SDK вызовет openUrl → откроется iframe поверх
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
            // Закрываем iframe overlay
            var el = document.getElementById("hot-iframe-overlay");
            if (el) el.remove();
        }

        return { accountId: accountId };
    } catch (e) {
        // Если ошибка но iframe открылся — пользователь ещё подтверждает
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