// frontend/src/libs/walletSelector.js

import { setupWalletSelector } from "@near-wallet-selector/core";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";

export async function initSelector({ miniApp = false, telegramInitData = "" }) {
    return await setupWalletSelector({
        network: "mainnet",
        modules: [
            setupHotWallet({
                miniApp,
                telegramInitData,
            }),
            setupMyNearWallet(),
            setupMeteorWallet(),
            setupNightly(),
        ],
    });
}