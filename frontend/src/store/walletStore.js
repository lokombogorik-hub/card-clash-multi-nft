import { create } from "zustand";

const NEAR_NETWORK = "mainnet";
const NEAR_RPC = "https://rpc.mainnet.near.org";

let selector = null;
let modal = null;

async function initNearSelector() {
    if (selector && modal) return { selector, modal };

    // динамические импорты — меньше проблем на сборке/SSR
    const { setupWalletSelector } = await import("@near-wallet-selector/core");
    const { setupModal } = await import("@near-wallet-selector/modal-ui");
    const { setupMyNearWallet } = await import("@near-wallet-selector/my-near-wallet");

    selector = await setupWalletSelector({
        network: NEAR_NETWORK,
        modules: [
            setupMyNearWallet(),
            // HERE wallet можно добавить позже, когда всё стабильно (он чаще требует node polyfills)
            // (await import("@near-wallet-selector/here-wallet")).setupHereWallet(),
        ],
    });

    modal = setupModal(selector, { contractId: undefined });
    return { selector, modal };
}

async function fetchNearBalance(accountId) {
    const body = {
        jsonrpc: "2.0",
        id: "1",
        method: "query",
        params: {
            request_type: "view_account",
            finality: "final",
            account_id: accountId,
        },
    };

    const res = await fetch(NEAR_RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`NEAR RPC error: ${res.status}`);
    const json = await res.json();
    const yocto = json?.result?.amount || "0";
    return Number(yocto) / 1e24;
}

async function getNearAccountId() {
    const { selector } = await initNearSelector();
    const wallet = await selector.wallet();
    const accounts = await wallet.getAccounts();
    return accounts?.[0]?.accountId || null;
}

async function waitForAccountId(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const id = await getNearAccountId();
        if (id) return id;
        await new Promise((r) => setTimeout(r, 300));
    }
    return null;
}

export const useWalletStore = create((set, get) => ({
    connected: false,
    walletAddress: "",
    network: "near",
    balance: 0,
    availableNetworks: ["near"],

    async connectWallet(net = "near") {
        if (net !== "near") throw new Error("Only NEAR is enabled right now");

        const { modal } = await initNearSelector();
        modal.show();

        const accountId = await waitForAccountId(15000);
        if (!accountId) throw new Error("Wallet not connected");

        const bal = await fetchNearBalance(accountId).catch(() => 0);

        set({
            connected: true,
            network: "near",
            walletAddress: accountId,
            balance: bal,
        });
    },

    async disconnectWallet() {
        const { selector } = await initNearSelector();
        const wallet = await selector.wallet();
        await wallet.signOut();

        set({
            connected: false,
            walletAddress: "",
            network: "near",
            balance: 0,
        });
    },

    async switchNetwork(net) {
        const allowed = get().availableNetworks;
        if (!allowed.includes(net)) return;
        set({ network: net });
    },
}));