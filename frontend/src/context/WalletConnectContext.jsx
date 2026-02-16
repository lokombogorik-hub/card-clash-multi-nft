// frontend/src/context/WalletConnectContext.jsx

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import useTelegram from "../hooks/useTelegram";
import { initSelector } from "../libs/walletSelector";

const WalletContext = createContext({
    selector: null,
    accountId: null,
    isLoading: true,
    hasError: false,
    connect: async () => { },
    disconnect: async () => { },
});

export function WalletConnectProvider({ children }) {
    const { tgWebApp } = useTelegram();
    const [selector, setSelector] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [hasError, setHasError] = useState(false);

    const unsubscribeRef = useRef(null);
    const didLinkBackendRef = useRef(false);

    // Инициализация wallet-selector
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

                // Гидратация активного аккаунта
                try {
                    const state = sel.store.getState();
                    const active = state.accounts?.find((a) => a.active);
                    const activeId = active?.accountId || null;
                    setAccountId(activeId);

                    // Link to backend (только один раз)
                    if (activeId && !didLinkBackendRef.current) {
                        linkToBackend(activeId);
                        didLinkBackendRef.current = true;
                    }
                } catch (e) {
                    console.warn("[wallet] store hydrate error:", e);
                    setAccountId(null);
                }

                // Подписка на изменения store
                try {
                    unsubscribeRef.current?.();
                } catch { }

                unsubscribeRef.current = sel.store.observable.subscribe((nextState) => {
                    const active = nextState.accounts?.find((a) => a.active);
                    const activeId = active?.accountId || null;
                    setAccountId(activeId);

                    // Link to backend при подключении
                    if (activeId && !didLinkBackendRef.current) {
                        linkToBackend(activeId);
                        didLinkBackendRef.current = true;
                    }
                });

                setHasError(false);
            } catch (e) {
                console.error("[wallet] init error:", e);
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

    // Link NEAR account to backend
    async function linkToBackend(nearAccountId) {
        const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
        if (!API_BASE) return;

        const token =
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            "";

        if (!token) return;

        try {
            await fetch(`${API_BASE}/api/near/link`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ accountId: nearAccountId }),
            });
            console.log("[wallet] Linked to backend:", nearAccountId);
        } catch (e) {
            console.warn("[wallet] Link to backend error:", e);
        }
    }

    // Connect wallet
    const connect = async () => {
        if (!selector) return;
        try {
            // HOT Wallet как primary
            const w = await selector.wallet("hot-wallet");
            await w.signIn({
                contractId: "retardo-s.near",
                methodNames: [],
            });
        } catch (e) {
            console.error("[wallet] connect error:", e);
            throw e;
        }
    };

    // Disconnect wallet
    const disconnect = async () => {
        if (!selector) return;
        try {
            const state = selector.store.getState();
            const activeWalletId = state.selectedWalletId;
            if (!activeWalletId) return;

            const w = await selector.wallet(activeWalletId);
            await w.signOut();

            didLinkBackendRef.current = false;
        } catch (e) {
            console.error("[wallet] disconnect error:", e);
            throw e;
        }
    };

    // Совместимость с window.showWalletSelector()
    useEffect(() => {
        window.showWalletSelector = connect;
        return () => {
            if (window.showWalletSelector === connect) {
                try {
                    delete window.showWalletSelector;
                } catch {
                    window.showWalletSelector = undefined;
                }
            }
        };
    }, [selector]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <WalletContext.Provider
            value={{
                selector,
                accountId,
                isLoading,
                hasError,
                connect,
                disconnect,
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