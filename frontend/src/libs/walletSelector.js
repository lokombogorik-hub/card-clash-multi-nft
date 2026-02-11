import { HereWallet, WidgetStrategy } from "@here-wallet/core";

export const networkId = "mainnet";
export const RPC_URL = "https://rpc.mainnet.near.org";

let _herePromise = null;

async function getHere() {
    if (_herePromise) return _herePromise;

    _herePromise = (async () => {
        console.log("[HERE] init (WidgetStrategy only)", { networkId, RPC_URL });

        // IMPORTANT: WidgetStrategy does not depend on Telegram start_param return flow
        const here = await HereWallet.connect({
            networkId,
            nodeUrl: RPC_URL,
            defaultStrategy: new WidgetStrategy(),
        });

        return here;
    })();

    return _herePromise;
}

export async function connectWallet() {
    const here = await getHere();

    const contractId = "retardo-s.near";
    console.log("[HERE] signIn (widget)", { contractId, networkId });

    const accountId = await here.signIn({ contractId, methodNames: [] });
    console.log("[HERE] connected", accountId);

    return { accountId: String(accountId || "") };
}

export async function disconnectWallet() {
    const here = await getHere();
    await here.signOut();
}

export async function getSignedInAccountId() {
    const here = await getHere();
    try {
        const ok = await here.isSignedIn();
        if (!ok) return "";
        return await here.getAccountId();
    } catch {
        return "";
    }
}

export async function signAndSendTransaction(params) {
    const here = await getHere();
    return await here.signAndSendTransaction({
        receiverId: params.receiverId,
        actions: params.actions,
    });
}

export async function fetchBalance(accountId) {
    try {
        const res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "b",
                method: "query",
                params: { request_type: "view_account", finality: "final", account_id: accountId },
            }),
        });

        const json = await res.json();
        if (json.error) return 0;

        const y = BigInt((json.result && json.result.amount) || "0");
        const ONE = 10n ** 24n;
        const whole = y / ONE;
        const frac = (y % ONE).toString().padStart(24, "0").slice(0, 6);
        return Number(whole.toString() + "." + frac);
    } catch {
        return 0;
    }
}