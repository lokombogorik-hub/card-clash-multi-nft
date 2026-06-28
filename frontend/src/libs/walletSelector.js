import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";

// Устойчивый NEAR RPC из env (публичный rpc.mainnet.near.org перегружается при
// большом онлайне). Задаётся через VITE_NEAR_RPC_URL.
var NEAR_RPC_URL = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_NEAR_RPC_URL) || "https://free.rpc.fastnear.com";

export async function initSelector({ miniApp = false, telegramInitData = "" }) {
    await new Promise(function (resolve) { setTimeout(resolve, 300); });

    var initData = telegramInitData;
    try {
        if (
            window.Telegram &&
            window.Telegram.WebApp &&
            window.Telegram.WebApp.initData
        ) {
            initData = window.Telegram.WebApp.initData;
            miniApp = true;
        }
    } catch (e) { }

    // Кастомная сеть с НАДЁЖНЫМ RPC (fastnear). Дефолтный mainnet использует
    // перегруженный rpc.mainnet.near.org -> кошелёк отдаёт "All RPCs are unavailable"
    // при рассылке транзакции (особенно на мобиле). Свой nodeUrl это лечит.
    return await setupWalletSelector({
        network: {
            networkId: "mainnet",
            nodeUrl: NEAR_RPC_URL,
            helperUrl: "https://helper.mainnet.near.org",
            explorerUrl: "https://nearblocks.io",
            indexerUrl: "https://api.kitwallet.app",
        },
        modules: [
            setupHotWallet({
                miniApp: miniApp,
                telegramInitData: initData,
            }),
        ],
    });
}

export async function fetchBalance(accountId) {
    try {
        var res = await fetch(NEAR_RPC_URL, {
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
        });
        var j = await res.json();
        if (j.error) return 0;
        var y = BigInt((j.result && j.result.amount) || "0");
        var ONE = 10n ** 24n;
        return Number(
            (y / ONE).toString() +
            "." +
            (y % ONE)
                .toString()
                .padStart(24, "0")
                .slice(0, 6)
        );
    } catch (e) {
        return 0;
    }
}