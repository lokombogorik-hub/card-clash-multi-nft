import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupModal } from "@near-wallet-selector/modal-ui";
import "@near-wallet-selector/modal-ui/styles.css";

const envNetworkIdRaw = (import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet").toLowerCase();
const networkId = envNetworkIdRaw === "testnet" ? "testnet" : "mainnet";

const RPC_URL =
    import.meta.env.VITE_NEAR_RPC_URL ||
    (networkId === "testnet" ? "https://rpc.testnet.near.org" : "https://rpc.mainnet.near.org");

let selector = null;
let modal = null;
let currentWallet = null;

export async function initWalletSelector() {
    if (selector) return selector;

    selector = await setupWalletSelector({
        network: networkId,
        modules: [setupHereWallet()],
    });

    const state = selector.store.getState();
    if (state.accounts.length > 0) {
        currentWallet = await selector.wallet();
    }

    return selector;
}

export async function connectWallet() {
    const sel = await initWalletSelector();

    if (!modal) {
        modal = setupModal(sel, {
            contractId: import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || "near",
        });
    }

    modal.show();

    return new Promise((resolve) => {
        const unsubscribe = sel.store.observable.subscribe(async (state) => {
            if (state.accounts.length > 0) {
                currentWallet = await sel.wallet();
                unsubscribe();
                modal.hide();
                resolve({ accountId: state.accounts[0].accountId });
            }
        });
    });
}

export async function disconnectWallet() {
    const sel = await initWalletSelector();
    const wallet = await sel.wallet();
    if (wallet) await wallet.signOut();
    currentWallet = null;
}

export async function getSignedInAccountId() {
    const sel = await initWalletSelector();
    const state = sel.store.getState();
    return state.accounts.length > 0 ? state.accounts[0].accountId : "";
}

export async function signAndSendTransaction({ receiverId, actions }) {
    if (!currentWallet) {
        const sel = await initWalletSelector();
        currentWallet = await sel.wallet();
    }

    if (!currentWallet) throw new Error("Wallet not connected");

    const accountId = await getSignedInAccountId();
    if (!accountId) throw new Error("No signed in account");

    return await currentWallet.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });
}

export { networkId, RPC_URL };