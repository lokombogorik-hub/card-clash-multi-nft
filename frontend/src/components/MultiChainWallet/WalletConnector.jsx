import React, { useState } from "react";
import { useWalletConnect } from "../../context/WalletConnectContext";
import WalletPicker from "./WalletPicker";

export default function WalletConnector() {
    const { connected, accountId, balance, isLoading, connect, disconnect } =
        useWalletConnect();
    const [pickerOpen, setPickerOpen] = useState(false);

    if (isLoading) {
        return (
            <div
                style={{
                    position: "fixed",
                    top: 12,
                    right: 12,
                    zIndex: 9999,
                    padding: "8px 14px",
                    borderRadius: 12,
                    background: "rgba(0,0,0,0.6)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 12,
                }}
            >
                Loading wallet...
            </div>
        );
    }

    if (connected && accountId) {
        return (
            <div
                style={{
                    position: "fixed",
                    top: 12,
                    right: 12,
                    zIndex: 9999,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 14px",
                    borderRadius: 14,
                    background: "rgba(0,0,0,0.65)",
                    border: "1px solid rgba(120,200,255,0.25)",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                }}
            >
                <div style={{ fontSize: 12, color: "#78c8ff", fontWeight: 700 }}>
                    {accountId.length > 20
                        ? accountId.slice(0, 10) + "..." + accountId.slice(-6)
                        : accountId}
                </div>
                <div
                    style={{
                        fontSize: 11,
                        color: "rgba(255,255,255,0.7)",
                        fontWeight: 600,
                    }}
                >
                    {Number(balance).toFixed(2)} Ⓝ
                </div>
                <button
                    onClick={disconnect}
                    style={{
                        padding: "4px 10px",
                        borderRadius: 8,
                        border: "1px solid rgba(255,80,80,0.3)",
                        background: "rgba(255,80,80,0.15)",
                        color: "#ff6b6b",
                        fontSize: 11,
                        cursor: "pointer",
                    }}
                >
                    ✕
                </button>
            </div>
        );
    }

    return (
        <>
            <button
                onClick={() => setPickerOpen(true)}
                style={{
                    position: "fixed",
                    top: 12,
                    right: 12,
                    zIndex: 9999,
                    padding: "10px 18px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,140,0,0.4)",
                    background:
                        "linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 900,
                    cursor: "pointer",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                    boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                }}
            >
                🔥 Connect
            </button>

            <WalletPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onHot={async () => {
                    setPickerOpen(false);
                    try {
                        await connect();
                    } catch (e) {
                        console.error("Connect failed:", e);
                    }
                }}
            />
        </>
    );
}