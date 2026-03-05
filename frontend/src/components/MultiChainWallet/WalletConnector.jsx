import React, { useState } from "react";
import { useWalletConnect } from "../../context/WalletConnectContext";
import WalletPicker from "./WalletPicker";

export default function WalletConnector() {
    var { connected, accountId, balance, isLoading, connect, disconnect } = useWalletConnect();
    var [pickerOpen, setPickerOpen] = useState(false);

    var wrapStyle = {
        position: "fixed",
        top: "max(env(safe-area-inset-top, 0px), 8px)",
        right: 12,
        zIndex: 9999,
        marginTop: 4,
    };

    if (isLoading) {
        return (
            <div style={wrapStyle}>
                <div style={{
                    padding: "8px 14px", borderRadius: 12,
                    background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.6)", fontSize: 12,
                }}>
                    Loading...
                </div>
            </div>
        );
    }

    if (connected && accountId) {
        return (
            <div style={wrapStyle}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 12px", borderRadius: 12,
                    background: "rgba(0,0,0,0.7)", border: "1px solid rgba(120,200,255,0.3)",
                    backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                }}>
                    <div style={{ fontSize: 11, color: "#78c8ff", fontWeight: 700 }}>
                        {accountId.length > 14 ? accountId.slice(0, 6) + "..." + accountId.slice(-4) : accountId}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
                        {Number(balance).toFixed(2)}Ⓝ
                    </div>
                    <button onClick={disconnect} style={{
                        padding: "3px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,80,80,0.3)", background: "rgba(255,80,80,0.2)",
                        color: "#ff6b6b", fontSize: 10, cursor: "pointer", marginLeft: 2,
                    }}>
                        ✕
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={wrapStyle}>
            <button onClick={function () { setPickerOpen(true); }} style={{
                padding: "8px 14px", borderRadius: 12,
                border: "1px solid rgba(255,140,0,0.4)",
                background: "linear-gradient(135deg, rgba(255,140,0,0.3), rgba(255,80,0,0.2))",
                color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer",
                backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                boxShadow: "0 0 15px rgba(255,140,0,0.2)",
            }}>
                🔥 Connect
            </button>

            <WalletPicker
                open={pickerOpen}
                onClose={function () { setPickerOpen(false); }}
                onHot={async function () {
                    setPickerOpen(false);
                    try { await connect(); } catch (e) { console.error("Connect failed:", e); }
                }}
            />
        </div>
    );
}