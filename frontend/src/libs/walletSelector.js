var networkId =
    (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase() === "testnet"
        ? "testnet"
        : "mainnet";

var RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

var currentAccountId = "";
var STORAGE_KEY = "cardclash_near_account";
var PENDING_KEY = "cardclash_pending_connect";

/**
 * При загрузке страницы — проверяем URL на callback от кошелька
 */
function checkCallback() {
    try {
        var hash = window.location.hash || "";
        var search = window.location.search || "";

        // Проверяем и hash и search параметры
        var params = new URLSearchParams(search);
        var hashParams = new URLSearchParams(hash.replace("#", ""));

        var accountId =
            params.get("account_id") ||
            params.get("accountId") ||
            hashParams.get("account_id") ||
            hashParams.get("accountId") || "";

        if (accountId) {
            currentAccountId = accountId;
            localStorage.setItem(STORAGE_KEY, accountId);
            localStorage.removeItem(PENDING_KEY);

            // Чистим URL
            var cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, "", cleanUrl);

            console.log("[Wallet] Callback received, account:", accountId);
            return accountId;
        }

        // HERE Wallet может вернуть через startapp параметр в Telegram
        if (window.Telegram && window.Telegram.WebApp) {
            var startParam = window.Telegram.WebApp.initDataUnsafe &&
                window.Telegram.WebApp.initDataUnsafe.start_param;

            if (startParam && startParam.indexOf("account_") === 0) {
                accountId = startParam.replace("account_", "");
                if (accountId) {
                    currentAccountId = accountId;
                    localStorage.setItem(STORAGE_KEY, accountId);
                    localStorage.removeItem(PENDING_KEY);
                    console.log("[Wallet] Telegram startParam account:", accountId);
                    return accountId;
                }
            }
        }
    } catch (e) {
        console.warn("[Wallet] checkCallback error:", e);
    }
    return "";
}

// Проверяем callback при загрузке модуля
checkCallback();

/**
 * Подключение через HOT Wallet
 * Открывает кошелёк ПОВЕРХ игры в Telegram
 */
function connectWallet() {
    return new Promise(function (resolve, reject) {
        // Сначала проверяем callback (может уже вернулись)
        var callbackId = checkCallback();
        if (callbackId) {
            return resolve({ accountId: callbackId });
        }

        // Удаляем старый overlay
        var old = document.getElementById("hot-wallet-overlay");
        if (old) old.remove();

        var overlay = document.createElement("div");
        overlay.id = "hot-wallet-overlay";
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.85);" +
            "display:flex;align-items:center;justify-content:center;padding:16px;" +
            "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);";

        var card = document.createElement("div");
        card.style.cssText =
            "background:linear-gradient(145deg,#1a1a2e,#0f0f1a);" +
            "border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:28px 24px;" +
            "max-width:340px;width:100%;text-align:center;" +
            "box-shadow:0 24px 80px rgba(0,0,0,0.8);color:#fff;";

        card.innerHTML =
            '<div style="font-size:48px;margin-bottom:12px;">🔥</div>' +
            '<div style="font-size:22px;font-weight:900;margin-bottom:8px;">Connect HOT Wallet</div>' +
            '<div style="font-size:13px;color:#a0d8ff;margin-bottom:24px;line-height:1.5;opacity:0.8;">' +
            'Tap the button below to open HOT Wallet.<br>Confirm the connection there.' +
            '</div>' +

            '<div id="hot-status" style="display:none;padding:12px;border-radius:12px;' +
            'background:rgba(120,200,255,0.1);border:1px solid rgba(120,200,255,0.25);' +
            'color:#a0d8ff;font-size:13px;margin-bottom:16px;"></div>' +

            '<div id="hot-error" style="display:none;padding:12px;border-radius:12px;' +
            'background:rgba(255,40,40,0.15);border:1px solid rgba(255,80,80,0.3);' +
            'color:#fca5a5;font-size:12px;margin-bottom:16px;"></div>' +

            '<button id="hot-connect-btn" style="' +
            'width:100%;padding:16px;border-radius:14px;margin-bottom:12px;' +
            'border:1px solid rgba(255,140,0,0.5);cursor:pointer;' +
            'background:linear-gradient(135deg,rgba(255,140,0,0.4),rgba(255,80,0,0.25));' +
            'color:#fff;font-size:17px;font-weight:900;' +
            'display:flex;align-items:center;justify-content:center;gap:10px;' +
            'box-shadow:0 0 30px rgba(255,140,0,0.2);' +
            '">🔥 Open HOT Wallet</button>' +

            '<div id="hot-waiting" style="display:none;padding:16px;text-align:center;">' +
            '<div style="font-size:13px;color:#a0d8ff;margin-bottom:12px;">Waiting for confirmation...</div>' +
            '<div style="width:32px;height:32px;border:3px solid rgba(120,200,255,0.2);' +
            'border-top-color:#78c8ff;border-radius:50%;margin:0 auto;' +
            'animation:spin 0.8s linear infinite;"></div>' +
            '</div>' +

            '<button id="hot-cancel-btn" style="' +
            'width:100%;padding:12px;border-radius:12px;' +
            'border:1px solid rgba(255,255,255,0.08);' +
            'background:rgba(255,255,255,0.03);' +
            'color:rgba(255,255,255,0.4);font-size:13px;cursor:pointer;' +
            '">Cancel</button>';

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        var connectBtn = document.getElementById("hot-connect-btn");
        var cancelBtn = document.getElementById("hot-cancel-btn");
        var waitingDiv = document.getElementById("hot-waiting");
        var statusDiv = document.getElementById("hot-status");
        var errorDiv = document.getElementById("hot-error");

        var settled = false;
        var pollInterval = null;

        function cleanup() {
            if (pollInterval) clearInterval(pollInterval);
            var el = document.getElementById("hot-wallet-overlay");
            if (el) el.remove();
        }

        function showError(msg) {
            errorDiv.textContent = msg;
            errorDiv.style.display = "block";
            statusDiv.style.display = "none";
        }

        function showStatus(msg) {
            statusDiv.textContent = msg;
            statusDiv.style.display = "block";
            errorDiv.style.display = "none";
        }

        // Open HOT Wallet
        connectBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Запоминаем что ждём подключения
            localStorage.setItem(PENDING_KEY, Date.now().toString());

            // Открываем HOT Wallet в Telegram
            var appUrl = window.location.origin + window.location.pathname;
            var hotLink = "https://t.me/herewalletbot/app?startapp=connect_" + encodeURIComponent(appUrl);

            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
                    window.Telegram.WebApp.openTelegramLink(hotLink);
                } else {
                    window.open(hotLink, "_blank");
                }
            } catch (err) {
                window.open(hotLink, "_blank");
            }

            // Показываем ожидание
            connectBtn.style.display = "none";
            waitingDiv.style.display = "block";
            showStatus("HOT Wallet opened. Confirm connection there, then return here.");

            // Начинаем polling — проверяем вернулся ли пользователь с account_id
            startPolling();
        });

        function startPolling() {
            var startTime = Date.now();
            var maxWait = 180000; // 3 минуты

            pollInterval = setInterval(function () {
                if (settled) {
                    clearInterval(pollInterval);
                    return;
                }

                // Таймаут
                if (Date.now() - startTime > maxWait) {
                    clearInterval(pollInterval);
                    showError("Timeout. Please try again.");
                    connectBtn.style.display = "flex";
                    waitingDiv.style.display = "none";
                    return;
                }

                // Проверяем callback в URL
                var id = checkCallback();
                if (id) {
                    settled = true;
                    clearInterval(pollInterval);
                    showStatus("✅ Connected: " + id);
                    setTimeout(function () {
                        cleanup();
                        resolve({ accountId: id });
                    }, 600);
                    return;
                }

                // Проверяем localStorage (может другая вкладка записала)
                var saved = localStorage.getItem(STORAGE_KEY);
                var pending = localStorage.getItem(PENDING_KEY);
                if (saved && pending && saved !== currentAccountId) {
                    settled = true;
                    clearInterval(pollInterval);
                    currentAccountId = saved;
                    showStatus("✅ Connected: " + saved);
                    setTimeout(function () {
                        cleanup();
                        resolve({ accountId: saved });
                    }, 600);
                    return;
                }
            }, 1000);
        }

        // Cancel
        cancelBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error("Cancelled"));
            }
        });
    });
}

async function disconnectWallet() {
    currentAccountId = "";
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PENDING_KEY);
}

async function getSignedInAccountId() {
    // Проверяем callback при каждом вызове
    var callbackId = checkCallback();
    if (callbackId) return callbackId;

    if (currentAccountId) return currentAccountId;

    var saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        currentAccountId = saved;
        return saved;
    }

    return "";
}

async function signAndSendTransaction(params) {
    var accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("Wallet not connected");

    // Для транзакций используем MyNearWallet (работает и в Telegram)
    var baseUrl = networkId === "testnet"
        ? "https://testnet.mynearwallet.com/sign"
        : "https://app.mynearwallet.com/sign";

    var callbackUrl = window.location.origin + window.location.pathname;

    // Формируем URL для подписи
    var txJson = JSON.stringify([{
        receiverId: params.receiverId,
        actions: params.actions,
    }]);

    var signUrl = baseUrl +
        "?transactions=" + encodeURIComponent(btoa(txJson)) +
        "&callbackUrl=" + encodeURIComponent(callbackUrl);

    try {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openLink) {
            window.Telegram.WebApp.openLink(signUrl);
        } else {
            window.open(signUrl, "_blank");
        }
    } catch (e) {
        window.open(signUrl, "_blank");
    }

    return { pending: true, message: "Transaction sent to wallet for signing" };
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};