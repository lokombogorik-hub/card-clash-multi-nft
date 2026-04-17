import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";

// PATCH: Singleton — selector создаётся ОДИН РАЗ за всё время жизни страницы.
// HOT Wallet на мобилке делает deep-link redirect → страница перезагружается.
// Без singleton setupWalletSelector вызывается заново каждый раз,
// ломая внутреннее состояние HOT Wallet и создавая ~1-2s окно где selector=null.
var _selectorSingleton = null;
var _initPromise = null;

// PATCH: Ключ для определения что мы вернулись после redirect
var REDIRECT_FLAG_KEY = "cc_wallet_selector_initialized";

export async function initSelector({ miniApp = false, telegramInitData = "" } = {}) {
    // PATCH: Если singleton уже есть — возвращаем его немедленно.
    // Это критично для мобильного redirect: после перезагрузки страницы
    // React монтируется заново и вызывает initSelector — но selector уже готов
    // (сохранён в module scope, переживает hot-reload в dev режиме).
    if (_selectorSingleton) {
        console.warn("[walletSelector] returning existing singleton");
        return _selectorSingleton;
    }

    // PATCH: Если инициализация уже идёт — ждём того же промиса.
    // Защита от двойного вызова из React StrictMode или двойного маунта.
    if (_initPromise) {
        console.warn("[walletSelector] waiting for existing init promise");
        return _initPromise;
    }

    // PATCH: Определяем — это первый запуск или возврат после redirect?
    var isAfterRedirect = false;
    try {
        isAfterRedirect = sessionStorage.getItem(REDIRECT_FLAG_KEY) === "1";
    } catch (e) { }

    // PATCH: Перечитываем Telegram initData максимально поздно —
    // к этому моменту Telegram WebApp точно инициализирован
    var actualInitData = telegramInitData;
    var actualMiniApp = miniApp;
    try {
        if (window.Telegram?.WebApp?.initData) {
            actualInitData = window.Telegram.WebApp.initData;
            actualMiniApp = true;
        }
    } catch (e) { }

    // PATCH: После redirect НЕ ждём 300ms — selector нужен немедленно.
    // HOT Wallet сам восстановит сессию из localStorage асинхронно.
    // При первом запуске ждём 100ms (не 300ms) — этого достаточно.
    if (!isAfterRedirect) {
        await new Promise(function (resolve) { setTimeout(resolve, 100); });
        // Перечитываем ещё раз после паузы
        try {
            if (window.Telegram?.WebApp?.initData) {
                actualInitData = window.Telegram.WebApp.initData;
                actualMiniApp = true;
            }
        } catch (e) { }
    }

    console.warn("[walletSelector] initSelector start, isAfterRedirect=", isAfterRedirect,
        "miniApp=", actualMiniApp,
        "initDataLen=", actualInitData?.length || 0
    );

    _initPromise = (async function () {
        try {
            var selector = await setupWalletSelector({
                network: "mainnet",
                modules: [
                    setupHotWallet({
                        miniApp: actualMiniApp,
                        telegramInitData: actualInitData,
                    }),
                ],
            });

            // PATCH: Ждём пока HOT Wallet восстановит сессию из localStorage.
            // После redirect selector создан, но аккаунты ещё не загружены.
            // Поллим state до 3 секунд.
            var waitedMs = 0;
            var pollInterval = 100;
            var maxWait = 3000;
            while (waitedMs < maxWait) {
                try {
                    var state = selector.store.getState();
                    var hasAccounts = Array.isArray(state.accounts) && state.accounts.length > 0;
                    var hasWallet = !!state.selectedWalletId;
                    if (hasAccounts || hasWallet) {
                        console.warn("[walletSelector] state ready after", waitedMs, "ms",
                            "accounts=", state.accounts?.length,
                            "wallet=", state.selectedWalletId
                        );
                        break;
                    }
                } catch (e) { }
                await new Promise(function (resolve) { setTimeout(resolve, pollInterval); });
                waitedMs += pollInterval;
            }

            if (waitedMs >= maxWait) {
                console.warn("[walletSelector] state not ready after", maxWait, "ms — continuing anyway");
            }

            // PATCH: Сохраняем флаг что selector был инициализирован.
            // При следующей загрузке (после redirect) знаем что это возврат.
            try {
                sessionStorage.setItem(REDIRECT_FLAG_KEY, "1");
            } catch (e) { }

            // PATCH: Сохраняем singleton
            _selectorSingleton = selector;
            _initPromise = null;

            console.warn("[walletSelector] initSelector done, selectedWallet=",
                selector.store.getState()?.selectedWalletId
            );

            return selector;
        } catch (e) {
            // PATCH: При ошибке сбрасываем промис чтобы можно было попробовать снова
            _initPromise = null;
            console.error("[walletSelector] setupWalletSelector failed:", e);
            throw e;
        }
    })();

    return _initPromise;
}

// PATCH: Функция для принудительного сброса singleton.
// Нужна только если пользователь явно disconnect + хочет переподключиться
// с другим аккаунтом. В обычном flow не вызывается.
export function resetSelectorSingleton() {
    console.warn("[walletSelector] resetSelectorSingleton called");
    _selectorSingleton = null;
    _initPromise = null;
    try { sessionStorage.removeItem(REDIRECT_FLAG_KEY); } catch (e) { }
}

export async function fetchBalance(accountId) {
    if (!accountId) return 0;
    try {
        // PATCH: Таймаут 5s — на мобилке RPC может висеть долго
        var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 5000) : null;
        try {
            var res = await fetch("https://rpc.mainnet.near.org", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "b",
                    method: "query",
                    params: {
                        request_type: "view_account",
                        finality: "final",
                        account_id: accountId,
                    },
                }),
                signal: controller ? controller.signal : undefined,
            });
            if (timer) clearTimeout(timer);
            var j = await res.json();
            if (j.error) return 0;
            var y = BigInt((j.result && j.result.amount) || "0");
            var ONE = 10n ** 24n;
            var whole = (y / ONE).toString();
            var frac = (y % ONE).toString().padStart(24, "0").slice(0, 4);
            return parseFloat(whole + "." + frac);
        } finally {
            if (timer) clearTimeout(timer);
        }
    } catch (e) {
        return 0;
    }
}