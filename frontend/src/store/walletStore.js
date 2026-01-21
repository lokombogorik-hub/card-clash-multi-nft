import { create } from "zustand";

export const useWalletStore = create((set, get) => ({
    connected: false,
    walletAddress: "",
    network: "near",
    balance: 0,
    availableNetworks: ["near"],

    async connectWallet(net = "near") {
        if (net !== "near") throw new Error("Only NEAR is enabled right now");

        // Временная заглушка: чтобы сборка проходила и UI работал.
        const accountId = window.prompt("Введите NEAR accountId (пример: you.near):");
        if (!accountId) throw new Error("No accountId provided");

        set({
            connected: true,
            network: "near",
            walletAddress: accountId.trim(),
            balance: 0,
        });
    },

    disconnectWallet() {
        set({
            connected: false,
            walletAddress: "",
            network: "near",
            balance: 0,
        });
    },

    switchNetwork(net) {
        const allowed = get().availableNetworks;
        if (!allowed.includes(net)) return;
        set({ network: net });
    },
}));