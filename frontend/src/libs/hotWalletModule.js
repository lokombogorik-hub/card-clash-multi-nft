const HOT_WALLET_ID = "hot-wallet";
const HOT_WALLET_URL = "https://t.me/hot_wallet/app";

// Глобальный стек ошибок (для UI дебага)
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

    // Keep only last 5 errors
    if (window.__HOT_WALLET_ERRORS__.length > 5) {
        window.__HOT_WALLET_ERRORS__.shift();
    }
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
                        throw new Error("Открой игру через @Cardclashbot в Telegram (не в браузере)");
                    }

                    const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim();
                    const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "testnet").toLowerCase();

                    console.log("[HOT] connect() called");
                    console.log("[HOT] botId:", botId);
                    console.log("[HOT] networkId:", networkId);

                    if (!botId) {
                        throw new Error("VITE_TG_BOT_ID пустой! Проверь Vercel env variables.");
                    }

                    const payload = `auth_${encodeURIComponent(botId)}_${networkId}`;
                    const url = `${HOT_WALLET_URL}?startapp=${payload}`;

                    console.log("[HOT] Opening URL:", url);

                    try {
                        tg.expand?.();
                    } catch { }

                    if (typeof tg.openTelegramLink === "function") {
                        tg.openTelegramLink(url);
                    } else if (typeof tg.openLink === "function") {
                        tg.openLink(url);
                    } else {
                        throw new Error("Telegram WebApp API недоступен (нет openTelegramLink/openLink)");
                    }

                    return new Promise((resolve, reject) => {
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

                            if (Date.now() - startTime > 30000) {
                                resolved = true;
                                cleanup();
                                const err = new Error("HOT Wallet не вернул accountId за 30 сек.");
                                logError("connect timeout", err);
                                reject(err);
                            }
                        };

                        const interval = setInterval(checkAccount, 500);

                        const onVisibilityChange = () => {
                            if (!document.hidden) {
                                console.log("[HOT] App returned to foreground, checking account...");
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
                    const payload = `sign_${encodeURIComponent(botId)}_${txPayload}`;
                    const url = `${HOT_WALLET_URL}?startapp=${payload}`;

                    console.log("[HOT] Signing tx, URL:", url);

                    if (typeof tg.openTelegramLink === "function") {
                        tg.openTelegramLink(url);
                    } else if (typeof tg.openLink === "function") {
                        tg.openLink(url);
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