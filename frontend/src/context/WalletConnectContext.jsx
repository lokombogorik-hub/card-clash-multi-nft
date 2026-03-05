import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import useTelegram from "../hooks/useTelegram";
import { initSelector, fetchBalance } from "../libs/walletSelector";

var WalletContext = createContext({
    selector: null, accountId: null, balance: 0, isLoading: true,
    connected: false, connect: async function () { }, disconnect: async function () { },
    sendNear: async function () { }, signAndSendTransaction: async function () { },
});

export function WalletConnectProvider({ children }) {
    var { tgWebApp } = useTelegram();
    var [selector, setSelector] = useState(null);
    var [accountId, setAccountId] = useState(null);
    var [balance, setBalance] = useState(0);
    var [isLoading, setIsLoading] = useState(true);
    var unsubscribeRef = useRef(null);

    var linkToBackend = async function (nearAccountId) {
        if (!nearAccountId) return;
        var t = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";
        if (!t) return;
        var apiBase = (import.meta.env.VITE_API_BASE_URL || "").trim();
        if (!apiBase) return;
        try {
            await fetch(apiBase + "/api/near/link", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
                body: JSON.stringify({ accountId: nearAccountId }),
            });
        } catch (e) { }
    };

    var refreshBalanceFor = async function (id) {
        if (!id) return;
        try { var bal = await fetchBalance(id); setBalance(bal); } catch (e) { }
    };

    useEffect(function () {
        var cancelled = false;
        async function bootstrap() {
            setIsLoading(true);
            try {
                var isMiniApp = false;
                var initData = "";
                try {
                    if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) {
                        isMiniApp = true;
                        initData = window.Telegram.WebApp.initData;
                    }
                } catch (e) { }

                var sel = await initSelector({ miniApp: isMiniApp, telegramInitData: initData });
                if (cancelled) return;
                setSelector(sel);

                try {
                    var state = sel.store.getState();
                    var active = state.accounts ? state.accounts.find(function (a) { return a.active; }) : null;
                    var id = active ? active.accountId : null;
                    setAccountId(id || null);
                    if (id) { refreshBalanceFor(id); linkToBackend(id); }
                } catch (e) { setAccountId(null); }

                try { if (unsubscribeRef.current) unsubscribeRef.current(); } catch (e) { }
                unsubscribeRef.current = sel.store.observable.subscribe(function (nextState) {
                    var act = nextState.accounts ? nextState.accounts.find(function (a) { return a.active; }) : null;
                    var newId = act ? act.accountId : null;
                    setAccountId(newId || null);
                    if (newId) { refreshBalanceFor(newId); linkToBackend(newId); }
                    else { setBalance(0); }
                });
            } catch (e) {
                if (!cancelled) { setSelector(null); setAccountId(null); }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }
        bootstrap();
        return function () { cancelled = true; try { if (unsubscribeRef.current) unsubscribeRef.current(); } catch (e) { } };
    }, []);

    var connect = async function () {
        if (!selector) throw new Error("Wallet selector not initialized");
        var w = await selector.wallet("hot-wallet");
        await w.signIn({ contractId: "retardo-s.near", methodNames: [] });
    };

    var disconnect = async function () {
        if (!selector) return;
        try {
            var state = selector.store.getState();
            var activeWalletId = state.selectedWalletId;
            if (!activeWalletId) return;
            var w = await selector.wallet(activeWalletId);
            await w.signOut();
        } catch (e) { }
    };

    var sendNear = async function (params) {
        if (!selector || !accountId) throw new Error("Wallet not connected");
        var w = await selector.wallet("hot-wallet");

        // Convert NEAR to yoctoNEAR
        var amountStr = String(params.amount);
        var parts = amountStr.split(".");
        var whole = parts[0] || "0";
        var frac = (parts[1] || "").padEnd(24, "0").slice(0, 24);
        var yocto = whole + frac;

        // Simple transfer action
        var result = await w.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: [{
                type: "Transfer",
                params: { deposit: yocto }
            }]
        });

        setTimeout(function () { refreshBalanceFor(accountId); }, 2000);

        var txHash = "";
        if (result) {
            if (typeof result === "string") txHash = result;
            else if (result.transaction_outcome) txHash = result.transaction_outcome.id;
            else if (result.transaction) txHash = result.transaction.hash;
            else if (result.txHash) txHash = result.txHash;
        }
        return { txHash: txHash, result: result };
    };

    var signAndSendTransaction = async function (params) {
        if (!selector || !accountId) throw new Error("Wallet not connected");
        var w = await selector.wallet("hot-wallet");
        return await w.signAndSendTransaction({ receiverId: params.receiverId, actions: params.actions });
    };

    useEffect(function () {
        window.showWalletSelector = connect;
        window.disconnectWallet = disconnect;
        return function () {
            try { delete window.showWalletSelector; delete window.disconnectWallet; }
            catch (e) { window.showWalletSelector = undefined; window.disconnectWallet = undefined; }
        };
    }, [selector]);

    return (
        <WalletContext.Provider value={{
            selector: selector, accountId: accountId, balance: balance, isLoading: isLoading,
            connected: !!accountId, connect: connect, disconnect: disconnect,
            sendNear: sendNear, signAndSendTransaction: signAndSendTransaction,
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletConnect() { return useContext(WalletContext); }
export default WalletConnectProvider;