// frontend/src/store/walletStore.js
// Legacy compatibility wrapper — real logic is in WalletConnectContext

export var walletStore = {
    getState: function () {
        return {
            connected: false,
            walletAddress: "",
            balance: 0,
            status: "",
            lastError: null,
            nfts: [],
        };
    },
    subscribe: function () {
        return function () { };
    },
    connectHot: async function () { },
    disconnectWallet: async function () { },
    restoreSession: async function () { },
    clearStatus: function () { },
    signAndSendTransaction: async function () { },
    sendNear: async function () { },
    refreshBalance: async function () { },
    getUserNFTs: function () {
        return [];
    },
    syncFromContext: function () { },
};