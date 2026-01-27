const HOT_WALLET_ID = "hot-wallet";
const HOT_WALLET_URL = "https://t.me/hot_wallet/app";

export function setupHotWallet() {
    return async () => {
        const getAccounts = async () => {
            try {
                const accountId = localStorage.getItem("cc_near_account_id") || "";
                if (!accountId) return [];
                return [{ accountId, publicKey: "" }];
            } catch {
                return [];
            }
        };

        return {
            id: HOT_WALLET_ID,
            type: "instant-link",
            metadata: {
                name: "HOT Wallet",
                description: "Telegram Wallet для NEAR (key_k1.tg аккаунты)",
                iconUrl: "/ui/wallets/hotwallet.svg?v=21",
                deprecated: false,
                available: true,
                downloadUrl: HOT_WALLET_URL,
            },

            async init() {
                return;
            },

            async connect() {
                const tg = window.Telegram?.WebApp;
                if (!tg) {
                    throw new Error("Открой игру через Telegram (@Cardclashbot)");
                }

                const botId = import.meta.env.VITE_TG_BOT_ID || "";
                const networkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "testnet").toLowerCase();

                // Формируем deep link для HOT
                const payload = `auth_${encodeURIComponent(botId)}_${networkId}`;
                const url = `${HOT_WALLET_URL}?startapp=${payload}`;

                try {
                    tg.expand?.();
                } catch { }

                // Открываем HOT через openTelegramLink (mini app поверх игры)
                if (typeof tg.openTelegramLink === "function") {
                    tg.openTelegramLink(url);
                } else if (typeof tg.openLink === "function") {
                    tg.openLink(url);
                } else {
                    throw new Error("Telegram WebApp API недоступен");
                }

                // Ждём возврата из HOT (пользователь вернётся в игру через 5-15 сек)
                return new Promise((resolve, reject) => {
                    let resolved = false;
                    const startTime = Date.now();

                    const checkAccount = async () => {
                        if (resolved) return;

                        // Проверяем LS (HOT может записать accountId напрямую)
                        const accounts = await getAccounts();
                        if (accounts.length > 0) {
                            resolved = true;
                            cleanup();
                            resolve(accounts);
                            return;
                        }

                        // Timeout 30s
                        if (Date.now() - startTime > 30000) {
                            resolved = true;
                            cleanup();
                            reject(new Error(
                                "HOT Wallet не вернул accountId.\n\n" +
                                "Что делать:\n" +
                                "1. Открой @hot_wallet в Telegram\n" +
                                "2. Создай/подключи NEAR аккаунт\n" +
                                "3. Скопируй свой Account ID (например user.near)\n" +
                                "4. Введи его вручную в следующем окне"
                            ));
                        }
                    };

                    // Polling каждые 500ms
                    const interval = setInterval(checkAccount, 500);

                    // Слушаем возврат фокуса в игру
                    const onVisibilityChange = () => {
                        if (!document.hidden) {
                            setTimeout(checkAccount, 300);
                        }
                    };

                    const onFocus = () => {
                        setTimeout(checkAccount, 300);
                    };

                    const cleanup = () => {
                        clearInterval(interval);
                        document.removeEventListener("visibilitychange", onVisibilityChange);
                        window.removeEventListener("focus", onFocus);
                    };

                    document.addEventListener("visibilitychange", onVisibilityChange);
                    window.addEventListener("focus", onFocus);
                });
            },

            async disconnect() {
                try {
                    localStorage.removeItem("cc_near_account_id");
                } catch { }
            },

            async getAccounts() {
                return await getAccounts();
            },

            async signIn() {
                return await this.connect();
            },

            async signOut() {
                return await this.disconnect();
            },

            async isSignedIn() {
                const accounts = await getAccounts();
                return accounts.length > 0;
            },

            async signAndSendTransaction({ receiverId, actions, signerId }) {
                const tg = window.Telegram?.WebApp;
                if (!tg) {
                    throw new Error("Открой игру через Telegram");
                }

                const accountId = signerId || localStorage.getItem("cc_near_account_id") || "";
                if (!accountId) {
                    throw new Error("Не подключен аккаунт. Сначала подключи HOT Wallet.");
                }

                try {
                    tg.expand?.();
                } catch { }

                const botId = import.meta.env.VITE_TG_BOT_ID || "";
                const txData = { receiverId, actions, signerId: accountId };
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

                        // Проверяем URL на txHash (HOT может вернуть через query)
                        try {
                            const u = new URL(window.location.href);
                            const txHash = u.searchParams.get("tx_hash") || u.searchParams.get("txHash") || "";
                            if (txHash) {
                                resolved = true;
                                cleanup();

                                // Очищаем URL
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
                        if (!document.hidden) {
                            setTimeout(checkTxHash, 300);
                        }
                    };

                    const cleanup = () => {
                        clearInterval(interval);
                        document.removeEventListener("visibilitychange", onVisibilityChange);
                    };

                    document.addEventListener("visibilitychange", onVisibilityChange);
                });
            },

            async signAndSendTransactions({ transactions }) {
                // HOT не поддерживает batch transactions — подписываем по одной
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