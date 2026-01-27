const HOT_WALLET_ID = "hot-wallet";

window.__HOT_WALLET_ERRORS__ = [];

function logError(step, error) {
    const msg = {
        step,
        message: error?.message || String(error),
        stack: error?.stack || "",
        time: new Date().toISOString(),
    };

    console.error(`[HOT ERROR] ${step}:`, error);

    if (!window.__HOT_WALLET_ERRORS__) window.__HOT_WALLET_ERRORS__ = [];
    window.__HOT_WALLET_ERRORS__.push(msg);

    if (window.__HOT_WALLET_ERRORS__.length > 5) {
        window.__HOT_WALLET_ERRORS__.shift();
    }
}

function showHotWalletConnectModal() {
    return new Promise((resolve, reject) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 9999999;
      background: rgba(0,0,0,0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
    `;

        const modal = document.createElement("div");
        modal.style.cssText = `
      width: min(480px, 96vw);
      max-height: 90vh;
      overflow-y: auto;
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(10,10,14,0.96);
      color: #fff;
      padding: 20px;
      box-shadow: 0 30px 120px rgba(0,0,0,0.88);
    `;

        const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "testnet").toLowerCase();

        modal.innerHTML = `
      <div style="font-weight: 900; font-size: 18px; margin-bottom: 14px; text-align: center;">
        🔥 Подключение HOT Wallet
      </div>
      
      <div style="font-size: 13px; opacity: 0.88; line-height: 1.5; margin-bottom: 16px;">
        <strong>Как подключить HOT Wallet к игре:</strong>
      </div>

      <ol style="font-size: 13px; line-height: 1.6; padding-left: 20px; margin-bottom: 16px; opacity: 0.9;">
        <li style="margin-bottom: 10px;">
          Открой <strong>@hot_wallet</strong> в Telegram (нажми на ссылку ниже ↓)
        </li>
        <li style="margin-bottom: 10px;">
          В HOT Wallet нажми на свой аккаунт <strong>вверху экрана</strong>
        </li>
        <li style="margin-bottom: 10px;">
          Скопируй свой <strong>Account ID</strong> (например: <span style="font-family: monospace; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px;">digitalbunny.testnet</span>)
        </li>
        <li style="margin-bottom: 10px;">
          Вернись сюда и <strong>вставь Account ID</strong> в поле ниже
        </li>
        <li>
          Нажми <strong>"Подключить"</strong> → баланс и NFT подтянутся автоматически
        </li>
      </ol>

      <div style="margin-bottom: 12px;">
        <a 
          href="https://t.me/hot_wallet" 
          target="_blank"
          style="
            display: block;
            text-align: center;
            padding: 12px 16px;
            border-radius: 12px;
            background: linear-gradient(90deg, #FF3D00, #FF6E40);
            color: #fff;
            font-weight: 900;
            text-decoration: none;
            box-shadow: 0 8px 24px rgba(255,61,0,0.35);
          "
        >
          Открыть @hot_wallet →
        </a>
      </div>

      <div style="font-size: 12px; opacity: 0.75; margin-bottom: 12px; text-align: center;">
        Network: <span style="font-family: monospace;">${networkId}</span>
      </div>

      <input 
        id="cc-hot-account-input" 
        type="text" 
        placeholder="digitalbunny.testnet" 
        style="
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.4);
          color: #fff;
          font-family: monospace;
          font-size: 15px;
          outline: none;
          margin-bottom: 16px;
          text-align: center;
        "
      />
      
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button 
          id="cc-hot-cancel" 
          style="
            padding: 12px 18px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.14);
            background: rgba(255,255,255,0.08);
            color: #fff;
            font-weight: 800;
            cursor: pointer;
          "
        >
          Отмена
        </button>
        <button 
          id="cc-hot-submit" 
          style="
            padding: 12px 20px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.14);
            background: linear-gradient(90deg,#2563eb,#7c3aed);
            color: #fff;
            font-weight: 900;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(37,99,235,0.3);
          "
        >
          Подключить
        </button>
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const input = document.getElementById("cc-hot-account-input");
        const submitBtn = document.getElementById("cc-hot-submit");
        const cancelBtn = document.getElementById("cc-hot-cancel");

        const cleanup = () => {
            try {
                document.body.removeChild(overlay);
            } catch { }
        };

        submitBtn.onclick = () => {
            const accountId = (input.value || "").trim();
            if (!accountId) {
                input.style.borderColor = "rgba(239, 68, 68, 0.85)";
                input.placeholder = "Введи Account ID!";
                return;
            }

            // basic validation (должен содержать . или быть implicit)
            if (!accountId.includes('.') && accountId.length < 64) {
                input.style.borderColor = "rgba(239, 68, 68, 0.85)";
                input.value = "";
                input.placeholder = "Неверный формат (нужен .testnet или .near)";
                return;
            }

            cleanup();
            resolve(accountId);
        };

        cancelBtn.onclick = () => {
            cleanup();
            reject(new Error("Отменено пользователем"));
        };

        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitBtn.click();
            if (e.key === "Escape") cancelBtn.click();
        });

        setTimeout(() => {
            try {
                input.focus();
            } catch { }
        }, 100);
    });
}

export function setupHotWallet() {
    return async () => {
        let _emitter;
        let _accountId = "";

        const getStoredAccountId = () => {
            try {
                return (localStorage.getItem("cc_near_account_id") || "").trim();
            } catch {
                return "";
            }
        };

        const setStoredAccountId = (id) => {
            try {
                localStorage.setItem("cc_near_account_id", String(id || "").trim());
            } catch { }
        };

        const getAccounts = async () => {
            const acc = _accountId || getStoredAccountId();
            return acc ? [{ accountId: acc }] : [];
        };

        const wallet = {
            id: HOT_WALLET_ID,
            type: "injected",
            metadata: {
                name: "HOT Wallet",
                description: "Telegram NEAR Wallet (manual connect)",
                iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect fill='%23FF3D00' width='128' height='128' rx='24'/%3E%3Ctext x='64' y='80' font-size='60' text-anchor='middle' fill='white' font-weight='bold'%3EHOT%3C/text%3E%3C/svg%3E",
                deprecated: false,
                available: true,
            },

            init: async (config) => {
                try {
                    _emitter = config.emitter;
                    _accountId = getStoredAccountId();

                    if (_accountId) {
                        _emitter.emit("accountsChanged", {
                            accounts: [{ accountId: _accountId }],
                        });
                    }

                    console.log("[HOT] Init OK, accountId:", _accountId || "(empty)");
                    return wallet;
                } catch (err) {
                    logError("init", err);
                    throw err;
                }
            },

            connect: async () => {
                try {
                    console.log("[HOT] connect() — showing manual input modal");

                    // Показываем modal сразу (т.к. автоподключение не работает)
                    const accountId = await showHotWalletConnectModal();

                    if (!accountId) {
                        throw new Error("Account ID не введён");
                    }

                    _accountId = accountId;
                    setStoredAccountId(accountId);

                    console.log("[HOT] Manual account ID entered:", accountId);

                    if (_emitter) {
                        _emitter.emit("accountsChanged", {
                            accounts: [{ accountId }],
                        });
                    }

                    return [{ accountId }];
                } catch (err) {
                    logError("connect", err);
                    throw err;
                }
            },

            disconnect: async () => {
                _accountId = "";
                setStoredAccountId("");

                if (_emitter) {
                    _emitter.emit("accountsChanged", { accounts: [] });
                }
            },

            getAccounts,
            isSignedIn: async () => {
                const accounts = await getAccounts();
                return accounts.length > 0;
            },
            signIn: async () => {
                return await wallet.connect();
            },
            signOut: async () => {
                return await wallet.disconnect();
            },

            signAndSendTransaction: async ({ receiverId, actions }) => {
                // Транзакции пока делаем заглушкой (HOT не поддерживает tx deep links для сторонних приложений)
                // В будущем можно добавить @here-wallet/core для подписи или near-api-js с ключами
                throw new Error(
                    "Подписание транзакций через HOT в WebApp пока не поддерживается.\n\n" +
                    "Для Stage2 (lock/claim NFT) используй MyNearWallet или подожди интеграцию HERE SDK."
                );
            },

            signAndSendTransactions: async ({ transactions }) => {
                throw new Error("Batch tx not supported in HOT manual mode");
            },
        };

        return wallet;
    };
}