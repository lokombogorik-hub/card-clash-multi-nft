import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { initSelector, fetchBalance } from "../libs/walletSelector";

var WalletContext = createContext({
    selector: null, accountId: null, balance: 0, isLoading: true,
    connected: false, connect: async function () { }, disconnect: async function () { },
    sendNear: async function () { }, signAndSendTransaction: async function () { },
});

// PATCH: Храним selector в module-level переменной.
// На мобилке после HOT Wallet deep-link redirect React перемонтирует компонент,
// useEffect запускается заново — но initSelector уже был вызван.
// Без этого кэша selector = null пока useEffect не завершится (~500ms).
// За это время LockEscrowModal пытается получить wallet → падает.
var _selectorInstance = null;
var _selectorInitPromise = null;

function getStoredAccountId() {
    try {
        // PATCH: Кэшируем accountId в localStorage чтобы восстановить после redirect
        return localStorage.getItem("cc_near_account_id") || "";
    } catch (e) { return ""; }
}

function storeAccountId(id) {
    try {
        if (id) {
            localStorage.setItem("cc_near_account_id", id);
        } else {
            localStorage.removeItem("cc_near_account_id");
        }
    } catch (e) { }
}

export function WalletConnectProvider({ children }) {
    // PATCH: Инициализируем accountId из localStorage сразу —
    // не ждём пока selector инициализируется.
    // Это устраняет flickering и проблему "selector готов, но accountId ещё null"
    var [selector, setSelector] = useState(_selectorInstance);
    var [accountId, setAccountId] = useState(function () { return getStoredAccountId(); });
    var [balance, setBalance] = useState(0);
    // PATCH: isLoading=false если selector уже есть в кэше (после redirect)
    var [isLoading, setIsLoading] = useState(function () { return _selectorInstance === null; });
    var unsubRef = useRef(null);
    var mountedRef = useRef(true);

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

    var refreshBal = useCallback(async function (id) {
        if (!id) return;
        try { var b = await fetchBalance(id); if (mountedRef.current) setBalance(b); } catch (e) { }
    }, []);

    // PATCH: Вынесен хелпер для обновления accountId
    // Вызывается и из useEffect, и из store.observable
    var updateAccountId = useCallback(function (id) {
        if (!mountedRef.current) return;
        var newId = id || null;
        setAccountId(newId);
        storeAccountId(newId); // PATCH: Сохраняем в localStorage для восстановления после redirect
        if (newId) {
            refreshBal(newId);
            linkToBackend(newId);
        } else {
            setBalance(0);
        }
    }, [refreshBal, linkToBackend]);

    useEffect(function () {
        mountedRef.current = true;
        return function () { mountedRef.current = false; };
    }, []);

    useEffect(function () {
        var cancelled = false;

        // PATCH: Если selector уже есть в module-level кэше — не инициализируем снова.
        // Это критично на мобилке: после HOT Wallet redirect страница перезагружается,
        // useEffect запускается снова, но _selectorInstance уже есть.
        if (_selectorInstance) {
            setSelector(_selectorInstance);
            setIsLoading(false);

            // Подписываемся на изменения store
            try {
                if (unsubRef.current) unsubRef.current();
                unsubRef.current = _selectorInstance.store.observable.subscribe(function (ns) {
                    if (cancelled) return;
                    var a = ns.accounts ? ns.accounts.find(function (x) { return x.active; }) : null;
                    var nid = a ? a.accountId : null;
                    updateAccountId(nid);
                });

                // Синхронизируем текущий state
                var st = _selectorInstance.store.getState();
                var act = st.accounts ? st.accounts.find(function (a) { return a.active; }) : null;
                var currentId = act ? act.accountId : null;
                if (currentId) updateAccountId(currentId);
            } catch (e) {
                console.warn("[wallet] subscribe error on cached selector:", e);
            }
            return function () {
                cancelled = true;
                try { if (unsubRef.current) unsubRef.current(); } catch (e) { }
            };
        }

        // PATCH: Если инициализация уже идёт (другой instance этого компонента) —
        // ждём того же промиса, не запускаем новый initSelector
        if (_selectorInitPromise) {
            _selectorInitPromise.then(function (sel) {
                if (cancelled || !sel) return;
                _selectorInstance = sel;
                setSelector(sel);
                setIsLoading(false);
                try {
                    var st = sel.store.getState();
                    var act = st.accounts ? st.accounts.find(function (a) { return a.active; }) : null;
                    var id = act ? act.accountId : null;
                    updateAccountId(id);
                } catch (e) { }
            }).catch(function (e) {
                console.error("[wallet] shared init promise error:", e);
                if (!cancelled) setIsLoading(false);
            });
            return function () { cancelled = true; };
        }

        // Первая инициализация
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

                // PATCH: Сохраняем промис чтобы другие вызовы могли его ждать
                _selectorInitPromise = initSelector({ miniApp: isMiniApp, telegramInitData: initData });
                var sel = await _selectorInitPromise;
                _selectorInitPromise = null;

                if (cancelled) return;

                // PATCH: Сохраняем в module-level кэш
                _selectorInstance = sel;
                setSelector(sel);

                try {
                    var st = sel.store.getState();
                    var act = st.accounts ? st.accounts.find(function (a) { return a.active; }) : null;
                    var id = act ? act.accountId : null;
                    updateAccountId(id);
                } catch (e) {
                    console.warn("[wallet] read state error:", e);
                }

                try { if (unsubRef.current) unsubRef.current(); } catch (e) { }
                unsubRef.current = sel.store.observable.subscribe(function (ns) {
                    if (cancelled) return;
                    var a = ns.accounts ? ns.accounts.find(function (x) { return x.active; }) : null;
                    var nid = a ? a.accountId : null;
                    updateAccountId(nid);
                });

            } catch (e) {
                console.error("[wallet] init error:", e);
                _selectorInitPromise = null;
                if (!cancelled) {
                    setSelector(null);
                    // PATCH: Не сбрасываем accountId — он мог быть восстановлен из localStorage
                }
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return function () {
            cancelled = true;
            try { if (unsubRef.current) unsubRef.current(); } catch (e) { }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // PATCH: getWallet — единая функция получения кошелька с fallback цепочкой.
    // Используется везде вместо прямого selector.wallet(id).
    // Порядок: selectedWalletId → hot-wallet → первый доступный.
    var getWallet = useCallback(async function (sel) {
        var s = sel || _selectorInstance;
        if (!s) throw new Error("Selector not initialized");

        var state = null;
        try { state = s.store.getState(); } catch (e) {
            throw new Error("Cannot read selector state: " + (e?.message || e));
        }

        var selectedWalletId = state?.selectedWalletId;
        var errors = [];

        // Попытка 1: selectedWalletId
        if (selectedWalletId) {
            try {
                var w1 = await s.wallet(selectedWalletId);
                if (w1) {
                    console.warn("[wallet] getWallet: using selectedWalletId =", selectedWalletId);
                    return w1;
                }
            } catch (e) {
                errors.push(selectedWalletId + ": " + (e?.message || e));
            }
        }

        // Попытка 2: hot-wallet (явный fallback)
        if (selectedWalletId !== "hot-wallet") {
            try {
                var w2 = await s.wallet("hot-wallet");
                if (w2) {
                    console.warn("[wallet] getWallet: fallback to hot-wallet");
                    return w2;
                }
            } catch (e) {
                errors.push("hot-wallet: " + (e?.message || e));
            }
        }

        // Попытка 3: первый модуль из state
        var modules = state?.modules || [];
        for (var i = 0; i < modules.length; i++) {
            var mid = modules[i]?.id;
            if (!mid || mid === selectedWalletId || mid === "hot-wallet") continue;
            try {
                var w3 = await s.wallet(mid);
                if (w3) {
                    console.warn("[wallet] getWallet: fallback to module", mid);
                    return w3;
                }
            } catch (e) {
                errors.push(mid + ": " + (e?.message || e));
            }
        }

        throw new Error("Cannot get any wallet. Errors: " + errors.join(" | "));
    }, []);

    var connect = useCallback(async function () {
        var s = selector || _selectorInstance;
        if (!s) throw new Error("Wallet not ready");
        // PATCH: Используем selectedWalletId если есть, иначе hot-wallet
        var w = await getWallet(s);
        await w.signIn({ contractId: "retardo-s.near", methodNames: [] });
    }, [selector, getWallet]);

    var disconnect = useCallback(async function () {
        var s = selector || _selectorInstance;
        if (!s) return;
        try {
            var w = await getWallet(s);
            await w.signOut();
            updateAccountId(null);
        } catch (e) {
            console.warn("[wallet] disconnect error:", e);
        }
    }, [selector, getWallet, updateAccountId]);

    var sendNear = useCallback(async function (params) {
        var s = selector || _selectorInstance;
        if (!s || !accountId) throw new Error("Wallet not connected");
        var w = await getWallet(s);
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
    }, [selector, accountId, getWallet, refreshBal]);

    var signAndSendTransaction = useCallback(async function (params) {
        var s = selector || _selectorInstance;
        if (!s || !accountId) throw new Error("Wallet not connected");
        // PATCH: Используем getWallet вместо хардкода "hot-wallet"
        var w = await getWallet(s);
        return await w.signAndSendTransaction({
            receiverId: params.receiverId,
            actions: params.actions,
        });
    }, [selector, accountId, getWallet]);

    useEffect(function () {
        window.showWalletSelector = connect;
        window.disconnectWallet = disconnect;
        // PATCH: Экспортируем getWallet для дебага в консоли
        window._getWallet = function () { return getWallet(selector || _selectorInstance); };
        return function () {
            try {
                delete window.showWalletSelector;
                delete window.disconnectWallet;
                delete window._getWallet;
            } catch (e) { }
        };
    }, [selector, connect, disconnect, getWallet]);

    return (
        <WalletContext.Provider value={{
            selector: selector || _selectorInstance,
            accountId: accountId,
            balance: balance,
            isLoading: isLoading,
            connected: !!accountId,
            connect: connect,
            disconnect: disconnect,
            sendNear: sendNear,
            signAndSendTransaction: signAndSendTransaction,
            // PATCH: Экспортируем getWallet в контекст — LockEscrowModal будет использовать его
            getWallet: getWallet,
        }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWalletConnect() { return useContext(WalletContext); }
export default WalletConnectProvider;