const HOT_WALLET_ID = "hot-wallet";
const HOT_WALLET_BOT = "hot_wallet"; // username бота (без @)

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

function showManualInputModal() {
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
      width: min(420px, 96vw);
      border-radius: 18px;
      border: 1px solid rgba(255,255,255,0.14);
      background: rgba(10,10,14,0.96);
      color: #fff;
      padding: 18px;
      box-shadow: 0 30px 120px rgba(0,0,0,0.88);
    `;

        modal.innerHTML = `
      <div style="font-weight: 900; font-size: 16px; margin-bottom: 12px;">
        Введи NEAR Account ID
      </div>
      <div style="font-size: 13px; opacity: 0.85; line-height: 1.4; margin-bottom: 14px;">
        Если HOT Wallet не открылся:<br><br>
        
        <strong>Открой вручную:</strong><br>
        1. Открой @hot_wallet в Telegram<br>
        2. Скопируй свой Account ID (вверху экрана)<br>
        3. Вернись сюда и вставь ниже<br><br>
        
        Пример: <span style="font-family: monospace;">digitalbunny.testnet</span>
      </div>
      <input 
        id="cc-account-input" 
        type="text" 
        placeholder="your_account.testnet" 
        style="
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.4);
          color: #fff;
          font-family: monospace;
          font-size: 14px;
          outline: none;
          margin-bottom: 14px;
        "
      />
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button 
          id="cc-account-cancel" 
          style="
            padding: 10px 16px;
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
          id="cc-account-submit" 
          style="
            padding: 10px 16px;
            border-radius: 12px;
            border: 1px solid rgba(255,255,255,0.14);
            background: linear-gradient(90deg,#2563eb,#7c3aed);
            color: #fff;
            font-weight: 900;
            cursor: pointer;
          "
        >
          Подключить
        </button>
      </div>
    `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const input = document.getElementById("cc-account-input");
        const submitBtn = document.getElementById("cc-account-submit");
        const cancelBtn = document.getElementById("cc-account-cancel");

        const cleanup = () => {
            try {
                document.body.removeChild(overlay);
            } catch { }
        };

        submitBtn.onclick = () => {
            const accountId = (input.value || "").trim();
            if (!accountId) {
                input.style.borderColor = "rgba(239, 68, 68, 0.75)";
                return;
            }
            cleanup();
            resolve(accountId);
        };

        cancelBtn.onclick = () => {
            cleanup();
            reject(new Error("Пользователь отменил ввод accountId"));
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
                description: "Telegram NEAR Wallet",
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
                    const tg = window.Telegram?.WebApp;
                    if (!tg) {
                        throw new Error("Открой игру через @Cardclashbot в Telegram");
                    }

                    const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim();
                    const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "testnet").toLowerCase();

                    console.log("[HOT] connect() called");
                    console.log("[HOT] botId:", botId);
                    console.log("[HOT] networkId:", networkId);

                    if (!botId) {
                        throw new Error("VITE_TG_BOT_ID пустой!");
                    }

                    // ВАЖНО: HOT — это обычный бот, а не mini app, поэтому:
                    // НЕ /app, а ?start= (вместо ?startapp=)
                    const payload = `auth_${botId}_${networkId}`;
                    const url = `https://t.me/${HOT_WALLET_BOT}?start=${encodeURIComponent(payload)}`;

                    console.log("[HOT] Opening URL:", url);
                    console.log("[HOT] Telegram.WebApp.version:", tg.version);

                    try {
                        tg.expand?.();
                    } catch { }

                    // Открываем HOT через openTelegramLink (как обычную тг-ссылку)
                    let opened = false;

                    if (typeof tg.openTelegramLink === "function") {
                        console.log("[HOT] Trying openTelegramLink...");
                        try {
                            tg.openTelegramLink(url);
                            opened = true;
                        } catch (e) {
                            console.error("[HOT] openTelegramLink failed:", e);
                        }
                    }

                    if (!opened && typeof tg.openLink === "function") {
                        console.log("[HOT] Trying openLink...");
                        try {
                            tg.openLink(url, { try_instant_view: false });
                            opened = true;
                        } catch (e) {
                            console.error("[HOT] openLink failed:", e);
                        }
                    }

                    if (!opened) {
                        throw new Error("Не удалось открыть HOT Wallet");
                    }

                    return new Promise(async (resolve, reject) => {
                        let resolved = false;
                        const startTime = Date.now();

                        const checkAccount = () => {
                            if (resolved) return;

                            const acc = getStoredAccountId();
                            if (acc) {
                                resolved = true;
                                cleanup();
                                _accountId = acc;

                                console.log("[HOT] Account connected:", acc);

                                if (_emitter) {
                                    _emitter.emit("accountsChanged", {
                                        accounts: [{ accountId: acc }],
                                    });
                                }

                                resolve([{ accountId: acc }]);
                                return;
                            }

                            // Показываем manual input через 5 сек
                            if (Date.now() - startTime > 5000 && Date.now() - startTime < 5500) {
                                console.log("[HOT] No auto accountId after 5s, showing manual input...");

                                setTimeout(async () => {
                                    if (resolved) return;

                                    try {
                                        const manualAccountId = await showManualInputModal();
                                        if (!resolved && manualAccountId) {
                                            resolved = true;
                                            cleanup();
                                            _accountId = manualAccountId;
                                            setStoredAccountId(manualAccountId);

                                            if (_emitter) {
                                                _emitter.emit("accountsChanged", {
                                                    accounts: [{ accountId: manualAccountId }],
                                                });
                                            }

                                            resolve([{ accountId: manualAccountId }]);
                                        }
                                    } catch (err) {
                                        if (!resolved) {
                                            resolved = true;
                                            cleanup();
                                            reject(err);
                                        }
                                    }
                                }, 100);
                            }

                            if (Date.now() - startTime > 60000) {
                                resolved = true;
                                cleanup();
                                const err = new Error("HOT Wallet timeout");
                                logError("connect timeout", err);
                                reject(err);
                            }
                        };

                        const interval = setInterval(checkAccount, 500);

                        const onVisibilityChange = () => {
                            if (!document.hidden) {
                                console.log("[HOT] App returned, checking...");
                                setTimeout(checkAccount, 300);
                            }
                        };

                        const cleanup = () => {
                            clearInterval(interval);
                            document.removeEventListener("visibilitychange", onVisibilityChange);
                        };

                        document.addEventListener("visibilitychange", onVisibilityChange);
                    });
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
                try {
                    const tg = window.Telegram?.WebApp;
                    if (!tg) throw new Error("Открой игру через Telegram");

                    const acc = _accountId || getStoredAccountId();
                    if (!acc) throw new Error("Не подключен аккаунт.");

                    try {
                        tg.expand?.();
                    } catch { }

                    const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim();
                    if (!botId) throw new Error("VITE_TG_BOT_ID не задан");

                    const txData = { receiverId, actions, signerId: acc };
                    const txPayload = encodeURIComponent(btoa(JSON.stringify(txData)));
                    const payload = `sign_${botId}_${txPayload}`;
                    const url = `https://t.me/${HOT_WALLET_BOT}?start=${encodeURIComponent(payload)}`;

                    console.log("[HOT] Signing tx, URL:", url);

                    if (typeof tg.openTelegramLink === "function") {
                        tg.openTelegramLink(url);
                    } else if (typeof tg.openLink === "function") {
                        tg.openLink(url, { try_instant_view: false });
                    } else {
                        throw new Error("Telegram WebApp API недоступен");
                    }

                    return new Promise((resolve, reject) => {
                        let resolved = false;
                        const startTime = Date.now();

                        const checkTxHash = () => {
                            if (resolved) return;

                            try {
                                const u = new URL(window.location.href);
                                const txHash = u.searchParams.get("tx_hash") || u.searchParams.get("txHash") || "";
                                if (txHash) {
                                    resolved = true;
                                    cleanup();

                                    u.searchParams.delete("tx_hash");
                                    u.searchParams.delete("txHash");
                                    window.history.replaceState({}, "", u.toString());

                                    console.log("[HOT] Transaction signed, txHash:", txHash);

                                    resolve({
                                        transaction: { hash: txHash },
                                        transaction_outcome: { id: txHash },
                                    });
                                    return;
                                }
                            } catch { }

                            if (Date.now() - startTime > 30000) {
                                resolved = true;
                                cleanup();
                                const err = new Error("HOT Wallet sign timeout");
                                logError("sign timeout", err);
                                reject(err);
                            }
                        };

                        const interval = setInterval(checkTxHash, 500);

                        const onVisibilityChange = () => {
                            if (!document.hidden) {
                                console.log("[HOT] App returned, checking tx...");
                                setTimeout(checkTxHash, 300);
                            }
                        };

                        const cleanup = () => {
                            clearInterval(interval);
                            document.removeEventListener("visibilitychange", onVisibilityChange);
                        };

                        document.addEventListener("visibilitychange", onVisibilityChange);
                    });
                } catch (err) {
                    logError("signAndSendTransaction", err);
                    throw err;
                }
            },

            signAndSendTransactions: async ({ transactions }) => {
                const results = [];
                for (const tx of transactions) {
                    const result = await wallet.signAndSendTransaction(tx);
                    results.push(result);
                }
                return results;
            },
        };

        return wallet;
    };
}