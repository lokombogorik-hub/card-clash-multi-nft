import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import useTelegram from "../hooks/useTelegram";
import { initSelector, fetchBalance } from "../libs/walletSelector";

const WalletContext = createContext({
    selector: null, accountId: null, balance: 0, isLoading: true,
    connected: false, connect: async () => { }, disconnect: async () => { },
    sendNear: async () => { }, signAndSendTransaction: async () => { }
});

export function WalletConnectProvider({ children }) {
    const { tgWebApp } = useTelegram();
    const [selector, setSelector] = useState(null);
    const [accountId, setAccountId] = useState(null);
    const [balance, setBalance] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const unsubscribeRef = useRef(null);

    const refreshBalanceFor = async (id) => {
        if (!id) return;
        const bal = await fetchBalance(id);
        setBalance(bal);
    };

    useEffect(() => {
        let cancelled = false;
        async function bootstrap() {
            setIsLoading(true);
            try {
                const sel = await initSelector({
                    miniApp: !!(window.Telegram && window.Telegram.WebApp.initData),
                    telegramInitData: window.Telegram?.WebApp?.initData || "",
                });
                if (cancelled) return;
                setSelector(sel);

                const state = sel.store.getState();
                const active = state.accounts?.find((a) => a.active);
                const id = active?.accountId || null;
                setAccountId(id);
                if (id) refreshBalanceFor(id);

                unsubscribeRef.current = sel.store.observable.subscribe((nextState) => {
                    const act = nextState.accounts?.find((a) => a.active);
                    const newId = act?.accountId || null;
                    setAccountId(newId);
                    if (newId) refreshBalanceFor(newId);
                });
            } catch (e) {
                console.error("Selector init error", e);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        bootstrap();
        return () => { cancelled = true; unsubscribeRef.current?.(); };
    }, []);

    const connect = async () => {
        if (!selector) return;
        const wallet = await selector.wallet("hot-wallet");
        await wallet.signIn({ contractId: "retardo-s.near" });
    };

    const disconnect = async () => {
        if (!selector) return;
        const wallet = await selector.wallet();
        await wallet.signOut();
    };

    const sendNear = async ({ receiverId, amount }) => {
        const wallet = await selector.wallet("hot-wallet");
        const parts = String(amount).split(".");
        const yocto = (parts[0] || "0") + (parts[1] || "").padEnd(24, "0").slice(0, 24);
        const result = await wallet.signAndSendTransaction({
            receiverId,
            actions: [{ type: "FunctionCall", params: { methodName: "transfer", args: {}, gas: "30000000000000", deposit: yocto } }]
        });
        return { txHash: result?.transaction?.hash || "" };
    };

    return (
        <WalletContext.Provider value={{
            selector, accountId, balance, isLoading, connected: !!accountId,
            connect, disconnect, sendNear,
            signAndSendTransaction: async (p) => {
                const w = await selector.wallet();
                return await w.signAndSendTransaction(p);
            }
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export const useWalletConnect = () => useContext(WalletContext);
export default WalletConnectProvider;