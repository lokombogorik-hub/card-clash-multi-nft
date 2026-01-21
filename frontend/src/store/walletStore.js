import { create } from "zustand";

/**
 * Минимальный store только под NEAR на данном этапе.
 * connectWallet('near') сейчас делает простую "заглушку" (без NEAR Wallet Selector),
 * чтобы UI WalletConnector начал работать сразу.
 *
 * Следующий шаг: заменить connectWalletNear() на реальный near-wallet-selector.
 */

async function connectWalletNear() {
    // Заглушка: просим юзера ввести accountId (чтобы UI работал уже сейчас)
    // Потом заменим на Wallet Selector (HERE / MyNearWallet).
    const accountId = window.prompt("Введите NEAR accountId (пример: you.near):");
    if (!accountId) throw new Error("No accountId provided");
    return accountId.trim();
}

export const useWalletStore = create((set, get) => ({
    connected: false,
    walletAddress: "",
    network: "near",
    balance: 0,
    availableNetworks: ["near"],

    async connectWallet(net = "near") {
        if (net !== "near") throw new Error("Only NEAR is enabled right now");
        const accountId = await connectWalletNear();
        set({
            connected: true,
            network: "near",
            walletAddress: accountId,
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
        // Пока одна сеть
        const allowed = get().availableNetworks;
        if (!allowed.includes(net)) return;
        set({ network: net });
    },
}));