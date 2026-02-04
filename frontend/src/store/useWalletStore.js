import { create } from 'zustand';
import { HereWallet } from '@here-wallet/core';

const NETWORK_ID = import.meta.env.VITE_NEAR_NETWORK_ID || 'testnet';
const RPC_URL = import.meta.env.VITE_NEAR_RPC_URL || 'https://rpc.testnet.near.org';
const NFT_CONTRACT_ID = import.meta.env.VITE_NEAR_NFT_CONTRACT_ID || 'nft.examples.testnet';
const ESCROW_CONTRACT_ID = import.meta.env.VITE_NEAR_ESCROW_CONTRACT_ID;

const GAS_DEFAULT = '300000000000000'; // 300 Tgas

// Helper: NEAR to yoctoNEAR
const toYocto = (nearAmount) => {
    const amount = String(nearAmount);
    const [whole = '0', fraction = '0'] = amount.split('.');
    const paddedFraction = fraction.padEnd(24, '0').slice(0, 24);
    return whole + paddedFraction;
};

export const useWalletStore = create((set, get) => ({
    wallet: null,
    accountId: null,
    isConnecting: false,
    isAuthenticated: false,
    balance: '0',
    nfts: [],
    lastMintResult: null,

    // Initialize HERE Wallet
    initWallet: async () => {
        try {
            const wallet = await HereWallet.connect({ networkId: NETWORK_ID });
            set({ wallet });
            return wallet;
        } catch (error) {
            console.error('Failed to init wallet:', error);
            throw error;
        }
    },

    // Connect wallet
    connect: async () => {
        set({ isConnecting: true });
        try {
            let { wallet } = get();
            if (!wallet) {
                wallet = await get().initWallet();
            }

            const accountId = await wallet.signIn({ contractId: NFT_CONTRACT_ID });

            set({
                accountId,
                isConnecting: false,
                isAuthenticated: true
            });

            await get().refreshBalance();
            await get().getUserNFTs();

            return accountId;
        } catch (error) {
            console.error('Wallet connect error:', error);
            set({ isConnecting: false });
            throw error;
        }
    },

    // Disconnect
    disconnect: async () => {
        const { wallet } = get();
        if (wallet) {
            try {
                await wallet.signOut();
            } catch (error) {
                console.warn('Wallet disconnect warning:', error);
            }
        }
        set({
            wallet: null,
            accountId: null,
            isAuthenticated: false,
            balance: '0',
            nfts: [],
            lastMintResult: null,
        });
    },

    // Refresh balance
    refreshBalance: async () => {
        const { wallet, accountId } = get();
        if (!wallet || !accountId) return;

        try {
            const account = wallet.account();
            const state = await account.state();
            set({ balance: state.amount || '0' });
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        }
    },

    // Sign and send transaction
    signAndSendTransaction: async ({ receiverId, actions }) => {
        const { wallet, accountId } = get();
        if (!wallet || !accountId) {
            throw new Error('Wallet not connected');
        }

        try {
            const result = await wallet.signAndSendTransaction({
                receiverId,
                actions,
            });

            await get().refreshBalance();
            return result;
        } catch (error) {
            console.error('Transaction error:', error);
            throw error;
        }
    },

    // Send NEAR
    sendNear: async ({ receiverId, amountNear }) => {
        const deposit = toYocto(amountNear);
        return get().signAndSendTransaction({
            receiverId,
            actions: [
                {
                    type: 'Transfer',
                    params: { deposit },
                },
            ],
        });
    },

    // ========== NFT Methods ==========

    // Mint single card (5 NEAR for game economy)
    mintCard: async () => {
        const { accountId } = get();
        if (!accountId) throw new Error('Wallet not connected');

        const tokenId = `card_${Date.now()}_${accountId}`;
        const deposit = toYocto('0.1'); // Storage deposit

        try {
            const result = await get().signAndSendTransaction({
                receiverId: NFT_CONTRACT_ID,
                actions: [
                    {
                        type: 'FunctionCall',
                        params: {
                            methodName: 'nft_mint',
                            args: {
                                token_id: tokenId,
                                receiver_id: accountId,
                                metadata: {
                                    title: `Card Clash Card #${Date.now()}`,
                                    description: 'Card from Card Clash game',
                                    media: '',
                                    extra: JSON.stringify({
                                        rarity: ['common', 'rare', 'epic', 'legendary'][Math.floor(Math.random() * 4)],
                                        power: Math.floor(Math.random() * 100),
                                        element: ['fire', 'water', 'earth', 'air'][Math.floor(Math.random() * 4)],
                                    }),
                                },
                            },
                            gas: GAS_DEFAULT,
                            deposit,
                        },
                    },
                ],
            });

            await get().getUserNFTs();
            set({ lastMintResult: result });
            return result;
        } catch (error) {
            console.error('mintCard error:', error);
            throw error;
        }
    },

    // Mint pack (5 cards, 20 NEAR for game economy)
    mintPack: async () => {
        const { accountId } = get();
        if (!accountId) throw new Error('Wallet not connected');

        const results = [];
        for (let i = 0; i < 5; i++) {
            const result = await get().mintCard();
            results.push(result);
        }
        return results;
    },

    // Get user's NFTs
    getUserNFTs: async () => {
        const { accountId } = get();
        if (!accountId) {
            set({ nfts: [] });
            return [];
        }

        try {
            const response = await fetch(RPC_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: 'dontcare',
                    method: 'query',
                    params: {
                        request_type: 'call_function',
                        finality: 'final',
                        account_id: NFT_CONTRACT_ID,
                        method_name: 'nft_tokens_for_owner',
                        args_base64: btoa(
                            JSON.stringify({
                                account_id: accountId,
                                from_index: '0',
                                limit: 200,
                            })
                        ),
                    },
                }),
            });

            const json = await response.json();

            if (json.error) {
                console.error('RPC error:', json.error);
                throw new Error(json.error.data || json.error.message);
            }

            const resultBytes = json.result?.result;
            if (!resultBytes) {
                set({ nfts: [] });
                return [];
            }

            const resultString = new TextDecoder().decode(
                new Uint8Array(resultBytes)
            );
            const tokens = JSON.parse(resultString);

            set({ nfts: tokens });
            return tokens;
        } catch (error) {
            console.error('getUserNFTs error:', error);
            set({ nfts: [] });
            return [];
        }
    },

    // Transfer NFT to escrow for Stage2
    nft_transfer_call: async ({ tokenId, receiverId, msg }) => {
        return get().signAndSendTransaction({
            receiverId: NFT_CONTRACT_ID,
            actions: [
                {
                    type: 'FunctionCall',
                    params: {
                        methodName: 'nft_transfer_call',
                        args: {
                            receiver_id: receiverId || ESCROW_CONTRACT_ID,
                            token_id: tokenId,
                            approval_id: null,
                            memo: null,
                            msg: msg || '',
                        },
                        gas: GAS_DEFAULT,
                        deposit: '1', // 1 yoctoNEAR
                    },
                },
            ],
        });
    },

    // Claim NFT from escrow
    claim: async ({ matchId }) => {
        if (!ESCROW_CONTRACT_ID) throw new Error('VITE_NEAR_ESCROW_CONTRACT_ID not set');

        return get().signAndSendTransaction({
            receiverId: ESCROW_CONTRACT_ID,
            actions: [
                {
                    type: 'FunctionCall',
                    params: {
                        methodName: 'claim',
                        args: { match_id: matchId },
                        gas: GAS_DEFAULT,
                        deposit: '1',
                    },
                },
            ],
        });
    },
}));