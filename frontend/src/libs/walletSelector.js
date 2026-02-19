import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";

export async function initSelector({ miniApp = false, telegramInitData = "" }) {
    return await setupWalletSelector({
        network: "mainnet",
        modules: [
            setupHotWallet({
                miniApp,
                telegramInitData,
            }),
        ],
    });
}

export async function fetchBalance(accountId) {
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