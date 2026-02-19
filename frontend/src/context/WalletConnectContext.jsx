import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import useTelegram from "../hooks/useTelegram";
import { initSelector, fetchBalance } from "../libs/walletSelector";

const WalletContext = createContext({
    selector: null,
    accountId: null,
    balance: 0,
    isLoading: true,
    hasError: false,
    connected: false,
    connect: async () => { },
    disconnect: async () => { },
    refreshBalance: async () => { },
    sendNear: async () => { },
    signAndSendTransaction: async () => { },
    getUserNFTs: () => [],
});

export function WalletConnectProvider({ children }) {
    const { tgWebApp } = useTelegram();
    const [selector, setSelector] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [balance, setBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const unsubscribeRef = useRef(null);

    // Link NEAR account to backend
    const linkToBackend = async (nearAccountId) => {
        if (!nearAccountId) return;
        const token =
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            "";
        if (!token) return;
        const apiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
        if (!apiBase) return;
        try {
            await fetch(apiBase + "/api/near/link", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + token,
                },
                body: JSON.stringify({ accountId: nearAccountId }),
            });
        } catch (e) {
            console.warn("[wallet] linkToBackend error:", e);
        }
    };

    // Update balance
    const refreshBalanceFor = async (id) => {
        if (!id) return;
        try {
            const bal = await fetchBalance(id);
            setBalance(bal);
        } catch {
            // ignore
        }
    };

    // Init wallet selector
    useEffect(() => {
        let cancelled = false;

        async function bootstrap() {
            setIsLoading(true);
            setHasError(false);

            try {
                const sel = await initSelector({
                    miniApp: !!tgWebApp,
                    telegramInitData: tgWebApp?.initData || "",
                });
                if (cancelled) return;

                setSelector(sel);

                // Hydrate active account from store
                try {
                    const state = sel.store.getState();
                    const active = state.accounts?.find((a) => a.active);
                    const id = active?.accountId || null;
                    setAccountId(id);
                    if (id) {
                        refreshBalanceFor(id);
                        linkToBackend(id);
                    }
                } catch (e) {
                    console.warn("[wallet] store hydrate error:", e);
                    setAccountId(null);
                }

                // Subscribe to store changes
                try {
                    unsubscribeRef.current?.();
                } catch { }

                unsubscribeRef.current = sel.store.observable.subscribe((nextState) => {
                    const active = nextState.accounts?.find((a) => a.active);
                    const id = active?.accountId || null;
                    setAccountId(id);
                    if (id) {
                        refreshBalanceFor(id);
                        linkToBackend(id);
                    } else {
                        setBalance(0);
                    }
                });

                setHasError(false);
            } catch (e) {
                console.warn("[wallet] init error:", e);
                if (!cancelled) {
                    setHasError(true);
                    setSelector(null);
                    setAccountId(null);
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        bootstrap();

        return () => {
            cancelled = true;
            try {
                unsubscribeRef.current?.();
            } catch { }
            unsubscribeRef.current = null;
        };
    }, [tgWebApp]);

    // Connect
    const connect = async () => {
        if (!selector) throw new Error("Wallet selector not initialized");
        try {
            const w = await selector.wallet("hot-wallet");
            await w.signIn({
                contractId: "retardo-s.near",
                methodNames: [],
            });
            // subscription will update accountId automatically
        } catch (e) {
            console.error("[wallet] connect error:", e);
            throw e;
        }
    };

    // Disconnect
    const disconnect = async () => {
        if (!selector) return;
        try {
            const state = selector.store.getState();
            const activeWalletId = state.selectedWalletId;
            if (!activeWalletId) return;
            const w = await selector.wallet(activeWalletId);
            await w.signOut();
        } catch (e) {
            console.error("[wallet] disconnect error:", e);
        }
    };

    // Send NEAR
    const sendNear = async ({ receiverId, amount }) => {
        if (!selector || !accountId) throw new Error("Wallet not connected");
        const w = await selector.wallet("hot-wallet");

        // Convert NEAR to yoctoNEAR
        const parts = String(amount).split(".");
        const yocto =
            (parts[0] || "0") +
            (parts[1] || "").padEnd(24, "0").slice(0, 24);

        const result = await w.signAndSendTransaction({
            receiverId,
            actions: [
                {
                    type: "FunctionCall",
                    params: {
                        methodName: "transfer",
                        args: {},
                        gas: "30000000000000",
                        deposit: yocto,
                    },
                },
            ],
        });

        // Refresh balance after transfer
        setTimeout(() => refreshBalanceFor(accountId), 2000);

        // Extract txHash
        const txHash =
            (result && typeof result === "object"
                ? result.transaction_outcome?.id ||
                result.transaction?.hash ||
                result.txHash
                : typeof result === "string"
                    ? result
                    : "") || "";

        return { txHash, result };
    };

    // Sign and send arbitrary transaction
    const signAndSendTransaction = async (params) => {
        if (!selector || !accountId) throw new Error("Wallet not connected");
        const w = await selector.wallet("hot-wallet");
        return await w.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions,
        });
    };

    // Refresh balance
    const refreshBalance = async () => {
        if (accountId) await refreshBalanceFor(accountId);
    };

    // Expose connect on window for legacy compatibility
    useEffect(() => {
        window.showWalletSelector = connect;
        window.disconnectWallet = disconnect;
        return () => {
            try {
                delete window.showWalletSelector;
                delete window.disconnectWallet;
            } catch {
                window.showWalletSelector = undefined;
                window.disconnectWallet = undefined;
            }
        };
    }, [selector]);

    return (
        <WalletContext.Provider
            value={{
                selector,
                accountId,
                balance,
                isLoading,
                hasError,
                connected: !!accountId,
                connect,
                disconnect,
                refreshBalance,
                sendNear,
                signAndSendTransaction,
                getUserNFTs: () => [],
            }}
        >
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletConnect() {
    return useContext(WalletContext);
}

export default WalletConnectProvider;