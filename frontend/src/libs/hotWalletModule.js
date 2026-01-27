const HOT_WALLET_ID = "hot-wallet";
const HOT_WALLET_URL = "https://t.me/hot_wallet/app";

export function setupHotWallet() {
    // ВАЖНО: возвращаем async функцию (фабрику), а не объект напрямую
    return async ({ options, store, emitter }) => {
        let accountId = "";

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

        // При инициализации проверяем LS
        accountId = getStoredAccountId();

        return {
            id: HOT_WALLET_ID,
            type: "instant-link",
            metadata: {
                name: "HOT Wallet",
                description: "Telegram NEAR Wallet",
                iconUrl: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128'%3E%3Crect fill='%23FF3D00' width='128' height='128' rx='24'/%3E%3Ctext x='64' y='80' font-size='60' text-anchor='middle' fill='white' font-weight='bold'%3EHOT%3C/text%3E%3C/svg%3E",
                deprecated: false,
                available: true,
            },

            async connect() {
                const tg = window.Telegram?.WebApp;
                if (!tg) {
                    throw new Error("Открой игру через @Cardclashbot в Telegram");
                }

                const botId = import.meta.env.VITE_TG_BOT_ID || "";
                const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "testnet").toLowerCase();

                const payload = `auth_${encodeURIComponent(botId)}_${networkId}`;
                const url = `${HOT_WALLET_URL}?startapp=${payload}`;

                try {
                    tg.expand?.();
                } catch { }

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

                    const checkAccount = () => {
                        if (resolved) return;

                        const acc = getStoredAccountId();
                        if (acc) {
                            resolved = true;
                            cleanup();
                            accountId = acc;

                            // Уведомляем wallet-selector
                            emitter.emit("accountsChanged", {
                                accounts: [{ accountId: acc }],
                            });

                            resolve([{ accountId: acc }]);
                            return;
                        }

                        if (Date.now() - startTime > 30000) {
                            resolved = true;
                            cleanup();
                            reject(new Error("HOT Wallet не вернул accountId за 30 сек. Попробуй ещё раз."));
                        }
                    };

                    const interval = setInterval(checkAccount, 500);

                    const onVisibilityChange = () => {
                        if (!document.hidden) setTimeout(checkAccount, 300);
                    };

                    const cleanup = () => {
                        clearInterval(interval);
                        document.removeEventListener("visibilitychange", onVisibilityChange);
                    };

                    document.addEventListener("visibilitychange", onVisibilityChange);
                });
            },

            async disconnect() {
                accountId = "";
                setStoredAccountId("");
                emitter.emit("accountsChanged", { accounts: [] });
            },

            async getAccounts() {
                const acc = accountId || getStoredAccountId();
                return acc ? [{ accountId: acc }] : [];
            },

            async isSignedIn() {
                const acc = accountId || getStoredAccountId();
                return !!acc;
            },

            async signAndSendTransaction({ receiverId, actions }) {
                const tg = window.Telegram?.WebApp;
                if (!tg) throw new Error("Открой игру через Telegram");

                const acc = accountId || getStoredAccountId();
                if (!acc) throw new Error("Не подключен аккаунт. Подключи HOT Wallet.");

                try {
                    tg.expand?.();
                } catch { }

                const botId = import.meta.env.VITE_TG_BOT_ID || "";
                const txData = { receiverId, actions, signerId: acc };
                const txPayload = encodeURIComponent(btoa(JSON.stringify(txData)));
                const payload = `sign_${encodeURIComponent(botId)}_${txPayload}`;
                const url = `${HOT_WALLET_URL}?startapp=${payload}`;

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
                            reject(new Error("HOT Wallet sign timeout (30s)"));
                        }
                    };

                    const interval = setInterval(checkTxHash, 500);

                    const onVisibilityChange = () => {
                        if (!document.hidden) setTimeout(checkTxHash, 300);
                    };

                    const cleanup = () => {
                        clearInterval(interval);
                        document.removeEventListener("visibilitychange", onVisibilityChange);
                    };

                    document.addEventListener("visibilitychange", onVisibilityChange);
                });
            },

            async signAndSendTransactions({ transactions }) {
                const results = [];
                for (const tx of transactions) {
                    const result = await this.signAndSendTransaction(tx);
                    results.push(result);
                }
                return results;
            },
        };
    };
}