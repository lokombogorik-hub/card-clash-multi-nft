import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { initSelector, fetchBalance } from "../libs/walletSelector";

var WalletContext = createContext({
    selector: null, accountId: null, balance: 0, isLoading: true,
    connected: false, connect: async function () { }, disconnect: async function () { },
    sendNear: async function () { }, signAndSendTransaction: async function () { },
    getWallet: async function () { },
});

// PATCH: Module-level кэш selector — переживает React ремонт/StrictMode.
// После HOT Wallet deep-link redirect React перемонтирует компонент,
// но _cachedSelector уже есть → setSelector вызывается синхронно,
// нет 500-1500ms окна где selector=null.
var _cachedSelector = null;

function getStoredAccountId() {
    try { return localStorage.getItem("cc_near_account_id") || ""; } catch (e) { return ""; }
}

function storeAccountId(id) {
    try {
        if (id) localStorage.setItem("cc_near_account_id", id);
        else localStorage.removeItem("cc_near_account_id");
    } catch (e) { }
}

export function WalletConnectProvider({ children }) {
    // PATCH: Инициализируем selector из кэша синхронно — без мигания null
    var [selector, setSelector] = useState(function () { return _cachedSelector; });
    // PATCH: accountId из localStorage — восстанавливаем после redirect немедленно
    var [accountId, setAccountId] = useState(function () { return getStoredAccountId() || null; });
    var [balance, setBalance] = useState(0);
    // PATCH: isLoading=false если selector уже в кэше
    var [isLoading, setIsLoading] = useState(function () { return _cachedSelector === null; });

    var unsubRef = useRef(null);
    var mountedRef = useRef(true);

    useEffect(function () {
        mountedRef.current = true;
        return function () { mountedRef.current = false; };
    }, []);

    var refreshBal = useCallback(async function (id) {
        if (!id) return;
        try {
            var b = await fetchBalance(id);
            if (mountedRef.current) setBalance(b);
        } catch (e) { }
    }, []);

    var linkToBackend = useCallback(async function (id) {
        if (!id) return;
        var t = "";
        try { t = localStorage.getItem("token") || localStorage.getItem("accessToken") || ""; } catch (e) { }
        if (!t) return;
        var base = "";
        try { base = (import.meta.env.VITE_API_BASE_URL || "").trim(); } catch (e) { }
        if (!base) return;
        try {
            await fetch(base + "/api/near/link", {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
                body: JSON.stringify({ accountId: id }),
            });
        } catch (e) { }
    }, []);

    // PATCH: Единая функция обновления accountId — синхронизирует state + localStorage
    var applyAccountId = useCallback(function (id) {
        if (!mountedRef.current) return;
        var newId = id || null;
        setAccountId(newId);
        storeAccountId(newId);
        if (newId) {
            refreshBal(newId);
            linkToBackend(newId);
        } else {
            setBalance(0);
        }
    }, [refreshBal, linkToBackend]);

    // PATCH: Подписка на store.observable — вынесена в отдельную функцию
    // чтобы вызывать и при первой инициализации, и при восстановлении из кэша
    var subscribeToSelector = useCallback(function (sel) {
        if (!sel) return function () { };
        try {
            // Читаем текущий state синхронно
            var st = sel.store.getState();
            var act = st.accounts ? st.accounts.find(function (a) { return a.active; }) : null;
            var currentId = act ? act.accountId : null;
            if (currentId) applyAccountId(currentId);

            // Подписываемся на изменения
            var unsub = sel.store.observable.subscribe(function (ns) {
                if (!mountedRef.current) return;
                var a = ns.accounts ? ns.accounts.find(function (x) { return x.active; }) : null;
                var nid = a ? a.accountId : null;
                applyAccountId(nid);
            });
            return unsub;
        } catch (e) {
            console.warn("[wallet] subscribeToSelector error:", e);
            return function () { };
        }
    }, [applyAccountId]);

    useEffect(function () {
        var cancelled = false;

        // PATCH: Если selector уже в кэше — не инициализируем заново.
        // Просто подписываемся и читаем текущий state.
        if (_cachedSelector) {
            setSelector(_cachedSelector);
            setIsLoading(false);
            if (unsubRef.current) { try { unsubRef.current(); } catch (e) { } }
            unsubRef.current = subscribeToSelector(_cachedSelector);
            return function () {
                cancelled = true;
                if (unsubRef.current) { try { unsubRef.current(); } catch (e) { } }
            };
        }

        // Первая инициализация
        (async function () {
            setIsLoading(true);
            try {
                var isMiniApp = false;
                var initData = "";
                try {
                    if (window.Telegram?.WebApp?.initData) {
                        isMiniApp = true;
                        initData = window.Telegram.WebApp.initData;
                    }
                } catch (e) { }

                var sel = await initSelector({ miniApp: isMiniApp, telegramInitData: initData });
                if (cancelled) return;

                // PATCH: Сохраняем в module-level кэш
                _cachedSelector = sel;
                setSelector(sel);

                if (unsubRef.current) { try { unsubRef.current(); } catch (e) { } }
                unsubRef.current = subscribeToSelector(sel);

            } catch (e) {
                console.error("[wallet] init error:", e);
                if (!cancelled) {
                    setSelector(null);
                    // PATCH: Не сбрасываем accountId — он мог быть из localStorage
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return function () {
            cancelled = true;
            if (unsubRef.current) { try { unsubRef.current(); } catch (e) { } }
        };
    }, [subscribeToSelector]);

    // PATCH: getWallet — единая точка получения кошелька с fallback цепочкой.
    // Порядок: selectedWalletId → hot-wallet → первый модуль.
    // Используется в LockEscrowModal вместо прямого ctx.selector.wallet(id).
    var getWallet = useCallback(async function () {
        var sel = _cachedSelector || selector;
        if (!sel) throw new Error("Wallet selector not initialized. Please reload the page.");

        var state = null;
        try { state = sel.store.getState(); } catch (e) {
            throw new Error("Cannot read selector state: " + (e?.message || e));
        }

        var selectedWalletId = state?.selectedWalletId;
        var errors = [];

        console.warn("[wallet] getWallet: selectedWalletId=", selectedWalletId,
            "accounts=", state?.accounts?.length,
            "modules=", state?.modules?.map(function (m) { return m.id; })
        );

        // Попытка 1: selectedWalletId
        if (selectedWalletId) {
            try {
                var w1 = await sel.wallet(selectedWalletId);
                if (w1) {
                    console.warn("[wallet] getWallet OK: using", selectedWalletId);
                    return w1;
                }
            } catch (e) {
                errors.push(selectedWalletId + ": " + (e?.message || e));
                console.warn("[wallet] getWallet", selectedWalletId, "failed:", e?.message);
            }
        }

        // Попытка 2: hot-wallet явно
        if (selectedWalletId !== "hot-wallet") {
            try {
                var w2 = await sel.wallet("hot-wallet");
                if (w2) {
                    console.warn("[wallet] getWallet OK: fallback to hot-wallet");
                    return w2;
                }
            } catch (e) {
                errors.push("hot-wallet: " + (e?.message || e));
                console.warn("[wallet] getWallet hot-wallet failed:", e?.message);
            }
        }

        // Попытка 3: первый доступный модуль
        var modules = state?.modules || [];
        for (var i = 0; i < modules.length; i++) {
            var mid = modules[i]?.id;
            if (!mid || mid === selectedWalletId || mid === "hot-wallet") continue;
            try {
                var w3 = await sel.wallet(mid);
                if (w3) {
                    console.warn("[wallet] getWallet OK: fallback to module", mid);
                    return w3;
                }
            } catch (e) {
                errors.push(mid + ": " + (e?.message || e));
            }
        }

        throw new Error(
            "Cannot get wallet after all fallbacks. " +
            "Errors: [" + errors.join(" | ") + "]. " +
            "Try reconnecting wallet."
        );
    }, [selector]);

    var connect = useCallback(async function () {
        var w = await getWallet();
        await w.signIn({ contractId: "retardo-s.near", methodNames: [] });
    }, [getWallet]);

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

    var sendNear = useCallback(async function (params) {
        if (!accountId) throw new Error("Wallet not connected");
        var w = await getWallet();
        var amount = parseFloat(params.amount) || 0;
        var yocto = "0";
        if (amount > 0) {
            var nearStr = amount.toFixed(24);
            var parts = nearStr.split(".");
            var wholePart = parts[0] || "0";
            var fracPart = (parts[1] || "").padEnd(24, "0").substring(0, 24);
            var wholeYocto = BigInt(wholePart) * BigInt("1000000000000000000000000");
            var fracYocto = BigInt(fracPart);
            yocto = (wholeYocto + fracYocto).toString();
        }
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
    }, [accountId, getWallet, refreshBal]);

    var signAndSendTransaction = useCallback(async function (params) {
        if (!accountId) throw new Error("Wallet not connected");
        var w = await getWallet();
        return await w.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions,
        });
    }, [accountId, getWallet]);

    // Debug helpers
    useEffect(function () {
        window.showWalletSelector = connect;
        window.disconnectWallet = disconnect;
        window._debugWallet = function () {
            var sel = _cachedSelector || selector;
            if (!sel) { console.warn("No selector"); return; }
            var st = sel.store.getState();
            console.warn("[wallet debug]", {
                selectedWalletId: st.selectedWalletId,
                accounts: st.accounts,
                modules: st.modules?.map(function (m) { return m.id; }),
                accountId: accountId,
                isLoading: isLoading,
                hasCachedSelector: !!_cachedSelector,
            });
        };
        return function () {
            try {
                delete window.showWalletSelector;
                delete window.disconnectWallet;
                delete window._debugWallet;
            } catch (e) { }
        };
    }, [selector, connect, disconnect, accountId, isLoading]);

    return (
        <WalletContext.Provider value={{
            selector: selector || _cachedSelector,
            accountId: accountId,
            balance: balance,
            isLoading: isLoading,
            connected: !!accountId,
            connect: connect,
            disconnect: disconnect,
            sendNear: sendNear,
            signAndSendTransaction: signAndSendTransaction,
            // PATCH: getWallet экспортируется в контекст — используется в LockEscrowModal
            getWallet: getWallet,
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletConnect() { return useContext(WalletContext); }
export default WalletConnectProvider;