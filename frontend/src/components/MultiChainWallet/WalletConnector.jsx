import React, { useState } from "react";
import { useWalletConnect } from "../../context/WalletConnectContext";
import WalletPicker from "./WalletPicker";

export default function WalletConnector() {
    var ctx = useWalletConnect();
    var [pickerOpen, setPickerOpen] = useState(false);

    /* БЕЗ position:fixed — позиционирование через родительский .home-wallet-row */
    var wrapStyle = {};

    if (ctx.isLoading) {
        return (
            <div style={wrapStyle}>
                <div style={{
                    padding: "6px 12px", borderRadius: 10,
                    background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.5)", fontSize: 11,
                }}>Loading...</div>
            </div>
        );
    }

    if (ctx.connected && ctx.accountId) {
        return (
            <div style={wrapStyle}>
                <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 10px", borderRadius: 10,
                    background: "rgba(0,0,0,0.7)", border: "1px solid rgba(120,200,255,0.3)",
                    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                }}>
                    <div style={{ fontSize: 11, color: "#78c8ff", fontWeight: 700 }}>
                        {ctx.accountId.length > 14 ? ctx.accountId.slice(0, 6) + "…" + ctx.accountId.slice(-4) : ctx.accountId}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.65)", fontWeight: 600 }}>
                        {Number(ctx.balance).toFixed(2)}Ⓝ
                    </div>
                    <button onClick={ctx.disconnect} style={{
                        padding: "3px 7px", borderRadius: 6,
                        border: "1px solid rgba(255,80,80,0.3)", background: "rgba(255,80,80,0.18)",
                        color: "#ff6b6b", fontSize: 10, cursor: "pointer",
                    }}>✕</button>
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
                backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                boxShadow: "0 0 14px rgba(255,140,0,0.2)",
            }}>🔥 Connect</button>
            <WalletPicker
                open={pickerOpen}
                onClose={function () { setPickerOpen(false); }}
                onHot={async function () {
                    setPickerOpen(false);
                    try { await ctx.connect(); } catch (e) { console.error(e); }
                }}
            />
        </div>
    );
}