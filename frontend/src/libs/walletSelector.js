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
    return !json.error;
}

function connectWallet() {
    return new Promise(function (resolve, reject) {
        var old = document.getElementById("hot-wallet-overlay");
        if (old) old.remove();

        var overlay = document.createElement("div");
        overlay.id = "hot-wallet-overlay";
        overlay.style.cssText =
            "position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.8);" +
            "display:flex;align-items:center;justify-content:center;padding:16px;" +
            "backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);";

        var card = document.createElement("div");
        card.style.cssText =
            "background:linear-gradient(145deg,#1a1a2e,#0f0f1a);" +
            "border:1px solid rgba(255,255,255,0.15);border-radius:20px;padding:28px 24px;" +
            "max-width:340px;width:100%;text-align:center;" +
            "box-shadow:0 24px 80px rgba(0,0,0,0.8);color:#fff;";

        card.innerHTML =
            '<div style="font-size:42px;margin-bottom:8px;">🔥</div>' +
            '<div style="font-size:20px;font-weight:900;margin-bottom:6px;">HOT Wallet</div>' +
            '<div style="font-size:12px;color:#a0d8ff;margin-bottom:20px;line-height:1.5;opacity:0.8;">' +
            'Step 1: Open HOT Wallet and copy your Account ID<br>' +
            'Step 2: Paste it below and tap Connect' +
            '</div>' +

            '<button id="hot-open-btn" style="' +
            'width:100%;padding:14px;border-radius:14px;margin-bottom:14px;' +
            'border:1px solid rgba(255,140,0,0.5);cursor:pointer;' +
            'background:linear-gradient(135deg,rgba(255,140,0,0.35),rgba(255,80,0,0.2));' +
            'color:#fff;font-size:15px;font-weight:900;' +
            'display:flex;align-items:center;justify-content:center;gap:8px;' +
            '">📱 Open HOT Wallet</button>' +

            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">' +
            '<div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>' +
            '<div style="font-size:11px;color:rgba(255,255,255,0.3);">then paste your ID</div>' +
            '<div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>' +
            '</div>' +

            '<input id="hot-input" type="text" placeholder="yourname.near" ' +
            'autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" ' +
            'style="width:100%;padding:14px;border-radius:12px;' +
            'border:1px solid rgba(255,255,255,0.15);background:rgba(0,0,0,0.4);' +
            'color:#fff;font-size:16px;font-family:monospace;outline:none;' +
            'box-sizing:border-box;margin-bottom:12px;-webkit-appearance:none;" />' +

            '<div id="hot-error" style="display:none;padding:10px;border-radius:10px;' +
            'background:rgba(255,40,40,0.15);border:1px solid rgba(255,80,80,0.3);' +
            'color:#fca5a5;font-size:12px;margin-bottom:12px;"></div>' +

            '<div id="hot-status" style="display:none;padding:10px;border-radius:10px;' +
            'background:rgba(34,197,94,0.15);border:1px solid rgba(34,197,94,0.3);' +
            'color:#86efac;font-size:12px;margin-bottom:12px;"></div>' +

            '<button id="hot-connect-btn" style="' +
            'width:100%;padding:14px;border-radius:12px;' +
            'border:1px solid rgba(120,200,255,0.4);' +
            'background:linear-gradient(135deg,rgba(37,99,235,0.5),rgba(124,58,237,0.4));' +
            'color:#fff;font-size:16px;font-weight:900;cursor:pointer;margin-bottom:10px;' +
            '">⚡ Connect</button>' +

            '<button id="hot-cancel-btn" style="' +
            'width:100%;padding:12px;border-radius:12px;' +
            'border:1px solid rgba(255,255,255,0.08);' +
            'background:rgba(255,255,255,0.03);' +
            'color:rgba(255,255,255,0.4);font-size:13px;cursor:pointer;' +
            '">Cancel</button>';

        overlay.appendChild(card);
        document.body.appendChild(overlay);

        var input = document.getElementById("hot-input");
        var errorDiv = document.getElementById("hot-error");
        var statusDiv = document.getElementById("hot-status");
        var connectBtn = document.getElementById("hot-connect-btn");
        var cancelBtn = document.getElementById("hot-cancel-btn");
        var openBtn = document.getElementById("hot-open-btn");

        var settled = false;

        function cleanup() {
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

        function setLoading(on) {
            connectBtn.disabled = on;
            connectBtn.textContent = on ? "Verifying..." : "⚡ Connect";
            connectBtn.style.opacity = on ? "0.5" : "1";
            input.disabled = on;
        }

        // Open HOT Wallet button
        openBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            try {
                if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.openTelegramLink) {
                    window.Telegram.WebApp.openTelegramLink("https://t.me/herewalletbot/app");
                } else {
                    window.open("https://t.me/herewalletbot/app", "_blank");
                }
            } catch (err) {
                window.open("https://t.me/herewalletbot/app", "_blank");
            }
        });

        // Connect button
        connectBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            doConnect();
        });

        // Enter key
        input.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                doConnect();
            }
        });

        // Cancel button
        cancelBtn.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (!settled) {
                settled = true;
                cleanup();
                reject(new Error("Cancelled"));
            }
        });

        // Click outside — НЕ закрываем (чтобы не было случайного закрытия)
        // Убрали обработчик клика на overlay

        async function doConnect() {
            if (settled) return;

            var val = input.value.trim().toLowerCase();

            if (!val) {
                showError("Please enter your NEAR account ID");
                return;
            }

            if (val.length < 2 || val.length > 64) {
                showError("Account ID must be 2-64 characters");
                return;
            }

            if (!/^[a-z0-9._-]+$/.test(val)) {
                showError("Invalid characters. Use: a-z, 0-9, . _ -");
                return;
            }

            setLoading(true);
            showStatus("Checking account on NEAR " + networkId + "...");

            try {
                var exists = await verifyAccount(val);

                if (!exists) {
                    showError("Account '" + val + "' not found on NEAR " + networkId + ". Check spelling.");
                    setLoading(false);
                    return;
                }

                currentAccountId = val;
                localStorage.setItem(STORAGE_KEY, val);

                showStatus("✅ Connected: " + val);
                settled = true;

                setTimeout(function () {
                    cleanup();
                    resolve({ accountId: val });
                }, 600);

            } catch (e) {
                showError("Network error: " + ((e && e.message) || String(e)));
                setLoading(false);
            }
        }

        // Focus input
        setTimeout(function () {
            if (input) input.focus();
        }, 200);
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
    throw new Error("Transaction signing coming soon. Account is linked for game stats.");
}

export {
    networkId,
    RPC_URL,
    connectWallet,
    disconnectWallet,
    getSignedInAccountId,
    signAndSendTransaction,
};