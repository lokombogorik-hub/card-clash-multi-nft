import { create } from "zustand";
import { connect, keyStores } from "near-api-js";

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";

const NEAR_NETWORK = "mainnet";

let selector = null;
let modal = null;

async function initNearSelector() {
    if (selector && modal) return { selector, modal };

    selector = await setupWalletSelector({
        network: NEAR_NETWORK,
        modules: [setupMyNearWallet(), setupHereWallet()],
    });

    modal = setupModal(selector, {
        contractId: undefined,
    });

    return { selector, modal };
}

async function getNearAccountId() {
    const { selector } = await initNearSelector();
    const wallet = await selector.wallet();
    const accounts = await wallet.getAccounts();
    return accounts?.[0]?.accountId || null;
}

async function getNearBalance(accountId) {
    const near = await connect({
        networkId: NEAR_NETWORK,
        nodeUrl: "https://rpc.mainnet.near.org",
        walletUrl: "https://wallet.near.org",
        helperUrl: "https://helper.mainnet.near.org",
        deps: { keyStore: new keyStores.BrowserLocalStorageKeyStore() },
    });

    const account = await near.account(accountId);
    const state = await account.state();
    const yocto = state?.amount || "0";
    return Number(yocto) / 1e24;
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

        await new Promise((r) => setTimeout(r, 600));

        const accountId = await getNearAccountId();
        if (!accountId) throw new Error("Wallet not connected");

        const bal = await getNearBalance(accountId).catch(() => 0);

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