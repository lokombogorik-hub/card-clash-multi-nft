import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import useTelegram from "../hooks/useTelegram";
import { initSelector, fetchBalance } from "../libs/walletSelector";

var WalletContext = createContext({
    selector: null, accountId: null, balance: 0, isLoading: true,
    connected: false, connect: async function () { }, disconnect: async function () { },
    sendNear: async function () { }, signAndSendTransaction: async function () { },
});

export function WalletConnectProvider({ children }) {
    var tgHook = useTelegram();
    var [selector, setSelector] = useState(null);
    var [accountId, setAccountId] = useState(null);
    var [balance, setBalance] = useState(0);
    var [isLoading, setIsLoading] = useState(true);
    var unsubRef = useRef(null);

    var linkToBackend = async function (id) {
        if (!id) return;
        var t = localStorage.getItem("token") || localStorage.getItem("accessToken") || "";
        if (!t) return;
        var base = (import.meta.env.VITE_API_BASE_URL || "").trim();
        if (!base) return;
        try {
            await fetch(base + "/api/near/link", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
                body: JSON.stringify({ accountId: id }),
            });
        } catch (e) { }
    };

    var refreshBal = async function (id) {
        if (!id) return;
        try { var b = await fetchBalance(id); setBalance(b); } catch (e) { }
    };

    useEffect(function () {
        var cancelled = false;
        (async function () {
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
                    var st = sel.store.getState();
                    var act = st.accounts ? st.accounts.find(function (a) { return a.active; }) : null;
                    var id = act ? act.accountId : null;
                    setAccountId(id || null);
                    if (id) { refreshBal(id); linkToBackend(id); }
                } catch (e) { setAccountId(null); }

                try { if (unsubRef.current) unsubRef.current(); } catch (e) { }
                unsubRef.current = sel.store.observable.subscribe(function (ns) {
                    var a = ns.accounts ? ns.accounts.find(function (x) { return x.active; }) : null;
                    var nid = a ? a.accountId : null;
                    setAccountId(nid || null);
                    if (nid) { refreshBal(nid); linkToBackend(nid); }
                    else { setBalance(0); }
                });
            } catch (e) {
                console.error("[wallet] init error:", e);
                if (!cancelled) { setSelector(null); setAccountId(null); }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();
        return function () { cancelled = true; try { if (unsubRef.current) unsubRef.current(); } catch (e) { } };
    }, []);

    var connect = async function () {
        if (!selector) throw new Error("Wallet not ready");
        var w = await selector.wallet("hot-wallet");
        await w.signIn({ contractId: "retardo-s.near", methodNames: [] });
    };

    var disconnect = async function () {
        if (!selector) return;
        try {
            var st = selector.store.getState();
            var wid = st.selectedWalletId;
            if (!wid) return;
            var w = await selector.wallet(wid);
            await w.signOut();
        } catch (e) { }
    };

    var sendNear = async function (params) {
        if (!selector || !accountId) throw new Error("Wallet not connected");
        var w = await selector.wallet("hot-wallet");
        var amount = parseFloat(params.amount) || 0;
        var yocto = "0";
        if (amount > 0) {
            var whole = BigInt(Math.floor(amount));
            var frac = BigInt(Math.round((amount - Math.floor(amount)) * 1e24));
            yocto = (whole * BigInt("1000000000000000000000000") + frac).toString();
        }
        console.log("[sendNear]", amount, "NEAR =", yocto, "yocto, to:", params.receiverId);
        var result = await w.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: [{ type: "Transfer", params: { deposit: yocto } }],
        });
        setTimeout(function () { refreshBal(accountId); }, 2000);
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