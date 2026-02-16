import React, { useEffect, useState } from "react";
import { useWalletConnect } from "../../context/WalletConnectContext";

export default function WalletConnector() {
    const { accountId, isLoading, connect, disconnect } = useWalletConnect();
    const [balance, setBalance] = useState(0);
    const [loadingBalance, setLoadingBalance] = useState(false);

    // Fetch balance when accountId changes
    useEffect(() => {
        if (!accountId) {
            setBalance(0);
            return;
        }

        async function fetchBalance() {
            setLoadingBalance(true);
            try {
                const RPC_URL = "https://rpc.mainnet.near.org";
                const res = await fetch(RPC_URL, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: "balance",
                        method: "query",
                        params: {
                            request_type: "view_account",
                            finality: "final",
                            account_id: accountId,
                        },
                    }),
                });

                const json = await res.json();

                if (json.error) {
                    console.warn("[RPC] Balance error:", json.error.message);
                    setBalance(0);
                    return;
                }

                const yocto = BigInt(json.result.amount || "0");
                const ONE_NEAR = 10n ** 24n;
                const nearInt = yocto / ONE_NEAR;
                const nearDec = yocto % ONE_NEAR;

                const balanceNear = parseFloat(
                    nearInt.toString() + "." + nearDec.toString().padStart(24, "0").slice(0, 6)
                );
                setBalance(balanceNear);
            } catch (err) {
                console.warn("[RPC] fetchBalance error:", err.message);
                setBalance(0);
            } finally {
                setLoadingBalance(false);
            }
        }

        fetchBalance();
    }, [accountId]);

    if (isLoading) {
        return (
            <div style={{ padding: 20, textAlign: "center", color: "#fff" }}>
                <p>Loading wallet...</p>
            </div>
        );
    }

    if (!accountId) {
        return (
            <div style={{ padding: 20, textAlign: "center" }}>
                <button
                    onClick={connect}
                    style={{
                        padding: "12px 24px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,140,0,0.4)",
                        background: "linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))",
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: 900,
                        cursor: "pointer",
                    }}
                >
                    🔥 Connect HOT Wallet
                </button>
            </div>
        );
    }

    return (
        <div
            style={{
                padding: 20,
                background: "rgba(0,0,0,0.5)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
            }}
        >
            <div style={{ color: "#fff", marginBottom: 8 }}>
                <strong>Connected:</strong> {accountId}
            </div>
            <div style={{ color: "#a0d8ff", marginBottom: 12 }}>
                <strong>Balance:</strong> {loadingBalance ? "..." : `${balance.toFixed(4)} NEAR`}
            </div>
            <button
                onClick={disconnect}
                style={{
                    padding: "8px 16px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,0,0,0.2)",
                    color: "#fff",
                    fontSize: 14,
                    cursor: "pointer",
                }}
            >
                Disconnect
            </button>
        </div>
    );
}