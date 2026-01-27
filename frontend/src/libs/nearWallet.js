import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupModal } from "@near-wallet-selector/modal-ui";
import { setupNearMobileWallet } from "@near-wallet-selector/near-mobile-wallet";

const LS_NEAR_ACCOUNT_ID = "cc_near_account_id";

const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const networkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const botId = (import.meta.env.VITE_TG_BOT_ID || "").trim(); // Cardclashbot/app

let selector = null;
let modal = null;

async function initWalletSelector() {
    if (selector) return selector;

    selector = await setupWalletSelector({
        network: networkId,
        modules: [
            // HOT Wallet для Telegram
            setupNearMobileWallet({
                // Указываем точный URL для HOT Wallet
                dAppMetadata: {
                    name: "Card Clash",
                    description: "NFT Card Battle Game",
                    iconUrl: "https://card-clash-multi-nft.vercel.app/logo.png", // твой лого
                },
                walletUrl: "https://t.me/hot_wallet/app",
            }),
        ],
    });

    return selector;
}

async function initModal() {
    if (modal) return modal;

    const sel = await initWalletSelector();

    modal = setupModal(sel, {
        contractId: "", // не требуется для простого коннекта
        theme: "dark",
        description: "Подключи HOT Wallet из Telegram для игры",
    });

    return modal;
}

export async function connectWallet() {
    const m = await initModal();

    m.show();

    return new Promise((resolve, reject) => {
        let resolved = false;

        const cleanup = () => {
            try {
                selector?.store?.observable?.unsubscribe?.(handleAccountsChanged);
            } catch { }
        };

        const handleAccountsChanged = async (state) => {
            if (resolved) return;

            const accounts = state?.accounts || [];
            if (accounts.length === 0) return;

            const accountId = accounts[0]?.accountId;
            if (!accountId) return;

            resolved = true;
            cleanup();

            try {
                localStorage.setItem(LS_NEAR_ACCOUNT_ID, accountId);
            } catch { }

            m.hide();
            resolve({ accountId });
        };

        try {
            selector.store.observable.subscribe(handleAccountsChanged);
        } catch (err) {
            reject(err);
        }

        setTimeout(() => {
            if (resolved) return;
            resolved = true;
            cleanup();
            m.hide();
            reject(new Error("Wallet connect timeout (60s)"));
        }, 60000);
    });
}

export async function disconnectWallet() {
    try {
        localStorage.removeItem(LS_NEAR_ACCOUNT_ID);
    } catch { }

    if (!selector) return;

    const wallet = await selector.wallet();
    if (wallet?.signOut) {
        await wallet.signOut();
    }
}

export async function signAndSendTransaction({ receiverId, actions }) {
    if (!selector) throw new Error("Wallet not initialized");

    const wallet = await selector.wallet();
    if (!wallet) throw new Error("No wallet connected");

    const accountId = localStorage.getItem(LS_NEAR_ACCOUNT_ID) || "";
    if (!accountId) throw new Error("No accountId in LS");

    const outcome = await wallet.signAndSendTransaction({
        signerId: accountId,
        receiverId,
        actions,
    });

    return outcome;
}