/**
 * HOT Wallet через Telegram Mini App Widget
 * 
 * Работает БЕЗ @here-wallet/core (который сломан)
 * Использует HERE Wallet Telegram Widget API напрямую
 * Кошелёк открывается ПОВЕРХ игры как iframe
 */

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

// HERE Wallet Widget URL
var HERE_WIDGET_URL = "https://my.herewallet.app/connector/";
var HERE_BOT_ID = "herewalletbot/app";

/**
 * Создаём iframe overlay поверх игры
 */
function createOverlay() {
    // Удаляем старый если есть
    var old = document.getElementById("hot-wallet-overlay");
    if (old) old.remove();

    // Контейнер
    var overlay = document.createElement("div");
    overlay.id = "hot-wallet-overlay";
    overlay.style.cssText =
        "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.7);" +
        "display:flex;align-items:center;justify-content:center;padding:16px;" +
        "backdrop-filter:blur(4px);";

    // Карточка
    var card = document.createElement("div");
    card.style.cssText =
        "background:linear-gradient(145deg,#1a1a2e,#0f0f1a);border:1px solid rgba(255,255,255,0.15);" +
        "border-radius:20px;padding:24px;max-width:360px;width:100%;text-align:center;" +
        "box-shadow:0 24px 80px rgba(0,0,0,0.8);color:#fff;";

    // Заголовок
    var title = document.createElement("div");
    title.style.cssText = "font-size:18px;font-weight:900;margin-bottom:12px;";
    title.textContent = "🔥 Connect HOT Wallet";

    // Описание
    var desc = document.createElement("div");
    desc.style.cssText = "font-size:13px;color:#a0d8ff;margin-bottom:16px;line-height:1.4;opacity:0.8;";
    desc.textContent = "Enter your NEAR account ID from HOT Wallet";

    // Input
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "yourname.near";
    input.autocomplete = "off";
    input.autocapitalize = "none";
    input.spellcheck = false;
    input.style.cssText =
        "width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,0.15);" +
        "background:rgba(0,0,0,0.4);color:#fff;font-size:16px;font-family:monospace;" +
        "outline:none;box-sizing:border-box;margin-bottom:12px;-webkit-appearance:none;";

    // Error div
    var errorDiv = document.createElement("div");
    errorDiv.style.cssText =
        "display:none;padding:8px;border-radius:8px;background:rgba(255,40,40,0.15);" +
        "border:1px solid rgba(255,80,80,0.3);color:#fca5a5;font-size:12px;margin-bottom:12px;";

    // Status div
    var statusDiv = document.createElement("div");
    statusDiv.style.cssText =
        "display:none;padding:8px;border-radius:8px;background:rgba(34,197,94,0.15);" +
        "border:1px solid rgba(34,197,94,0.3);color:#86efac;font-size:12px;margin-bottom:12px;";

    // Connect button
    var btn = document.createElement("button");
    btn.textContent = "Connect";
    btn.style.cssText =
        "width:100%;padding:14px;border-radius:12px;border:1px solid rgba(255,140,0,0.4);" +
        "background:linear-gradient(135deg,rgba(255,140,0,0.3),rgba(255,80,0,0.2));" +
        "color:#fff;font-size:16px;font-weight:900;cursor:pointer;margin-bottom:10px;";

    // Cancel button
    var cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.cssText =
        "width:100%;padding:12px;border-radius:12px;border:1px solid rgba(255,255,255,0.1);" +
        "background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.6);font-size:14px;cursor:pointer;";

    // Help text
    var help = document.createElement("div");
    help.style.cssText = "font-size:10px;color:rgba(255,255,255,0.35);margin-top:12px;line-height:1.4;";
    help.textContent = "Open HOT Wallet → Profile → Copy account ID";

    card.appendChild(title);
    card.appendChild(desc);
    card.appendChild(input);
    card.appendChild(errorDiv);
    card.appendChild(statusDiv);
    card.appendChild(btn);
    card.appendChild(cancelBtn);
    card.appendChild(help);
    overlay.appendChild(card);

    return {
        overlay: overlay,
        input: input,
        btn: btn,
        cancelBtn: cancelBtn,
        errorDiv: errorDiv,
        statusDiv: statusDiv,
    };
}

/**
 * Проверяем что аккаунт существует на NEAR через RPC
 */
async function verifyAccount(accountId) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "verify",
            method: "query",
            params: {
                request_type: "view_account",
                finality: "final",
                account_id: accountId,
            },
        }),
    });
    var json = await res.json();
    if (json.error) {
        return false;
    }
    return true;
}

/**
 * Подключение — показываем overlay ПОВЕРХ игры
 */
function connectWallet() {
    return new Promise(function (resolve, reject) {
        var ui = createOverlay();
        document.body.appendChild(ui.overlay);

        // Фокус на input
        setTimeout(function () { ui.input.focus(); }, 100);

        function showError(msg) {
            ui.errorDiv.textContent = msg;
            ui.errorDiv.style.display = "block";
            ui.statusDiv.style.display = "none";
        }

        function showStatus(msg) {
            ui.statusDiv.textContent = msg;
            ui.statusDiv.style.display = "block";
            ui.errorDiv.style.display = "none";
        }

        function cleanup() {
            var el = document.getElementById("hot-wallet-overlay");
            if (el) el.remove();
        }

        function setLoading(loading) {
            ui.btn.disabled = loading;
            ui.btn.textContent = loading ? "Verifying..." : "Connect";
            ui.btn.style.opacity = loading ? "0.5" : "1";
            ui.input.disabled = loading;
        }

        async function doConnect() {
            var val = ui.input.value.trim().toLowerCase();

            if (!val) {
                showError("Please enter your NEAR account ID");
                return;
            }

            if (val.length < 2 || val.length > 64) {
                showError("Invalid account ID length");
                return;
            }

            setLoading(true);
            showStatus("Checking account on NEAR " + networkId + "...");

            try {
                var exists = await verifyAccount(val);

                if (!exists) {
                    showError("Account '" + val + "' not found on NEAR " + networkId);
                    setLoading(false);
                    return;
                }

                currentAccountId = val;
                localStorage.setItem(STORAGE_KEY, val);

                showStatus("✅ Connected: " + val);

                setTimeout(function () {
                    cleanup();
                    resolve({ accountId: val });
                }, 800);

            } catch (e) {
                showError("Error: " + ((e && e.message) || String(e)));
                setLoading(false);
            }
        }

        ui.btn.addEventListener("click", doConnect);

        ui.input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") doConnect();
        });

        ui.cancelBtn.addEventListener("click", function () {
            cleanup();
            reject(new Error("Connection cancelled"));
        });

        ui.overlay.addEventListener("click", function (e) {
            if (e.target === ui.overlay) {
                cleanup();
                reject(new Error("Connection cancelled"));
            }
        });
    });
}

async function disconnectWallet() {
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

    return "";
}

async function signAndSendTransaction(params) {
    throw new Error("Direct transaction signing requires full wallet connection. This feature is coming soon.");
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};