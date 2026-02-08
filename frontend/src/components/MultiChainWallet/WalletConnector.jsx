import React, { useEffect, useState } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    var wallet = useWalletStore();
    var [loading, setLoading] = useState(false);
    var networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
    var isTestnet = networkId.toLowerCase() === "testnet";

    useEffect(function () { wallet.restoreSession(); }, []);

    function haptic(k) {
        try { window.Telegram.WebApp.HapticFeedback.impactOccurred(k || "light"); } catch (e) { }
    }

    function fmt(a) {
        if (!a) return "";
        return a.length <= 20 ? a : a.slice(0, 10) + "…" + a.slice(-6);
    }

    async function onConnect() {
        haptic("light");
        setLoading(true);
        try { await wallet.connectHot(); } catch (e) { }
        setLoading(false);
    }

    async function onDisconnect() {
        haptic("light");
        await wallet.disconnectWallet();
    }

    var top = "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    if (wallet.connected) {
        return (
            <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: isTestnet ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
                        border: "1px solid " + (isTestnet ? "rgba(251,146,60,0.3)" : "rgba(34,197,94,0.3)"),
                        color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase"
                    }}>
                        {isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}
                    </div>
                    <div style={{
                        display: "flex", gap: 8, alignItems: "center", padding: 10,
                        borderRadius: 16, background: "rgba(20,20,20,0.85)",
                        border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)"
                    }}>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#0b0b0b",
                            border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800, color: "#fff", whiteSpace: "nowrap"
                        }}>
                            {Number(wallet.balance || 0).toFixed(4)} Ⓝ
                        </div>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#113a8a",
                            border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "monospace"
                        }}>
                            {fmt(wallet.walletAddress)}
                        </div>
                        <button onClick={onDisconnect} style={{
                            padding: "8px 10px", borderRadius: 10,
                            background: "rgba(200,40,40,0.25)", border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff", cursor: "pointer"
                        }}>⎋</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
            <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 300 }}>
                <div style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: isTestnet ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
                    border: "1px solid " + (isTestnet ? "rgba(251,146,60,0.3)" : "rgba(34,197,94,0.3)"),
                    color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase"
                }}>
                    {isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}
                </div>

                <button onClick={onConnect} disabled={loading} style={{
                    padding: "14px 20px", borderRadius: 14,
                    border: "1px solid rgba(255,140,0,0.4)",
                    background: loading ? "rgba(255,140,0,0.1)" : "linear-gradient(135deg,rgba(255,140,0,0.3),rgba(255,80,0,0.2))",
                    color: "#fff", fontSize: 16, fontWeight: 900, cursor: loading ? "default" : "pointer",
                    opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
                    boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                }}>
                    {loading ? "⏳ Connecting..." : "🔥 Connect HOT Wallet"}
                </button>

                {wallet.status ? (
                    <div style={{
                        padding: "10px 12px", borderRadius: 12,
                        background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#a0d8ff", fontSize: 12, maxWidth: 280, textAlign: "right"
                    }}>
                        {wallet.status}
                    </div>
                ) : null}

                {wallet.lastError ? (
                    <div style={{
                        padding: "10px 12px", borderRadius: 12,
                        background: "rgba(120,20,20,0.8)", border: "1px solid rgba(255,80,80,0.3)",
                        color: "#fca5a5", fontSize: 11, maxWidth: 280, textAlign: "right", wordBreak: "break-word"
                    }}>
                        {wallet.lastError.message}
                    </div>
                ) : null}
            </div>
        </div>
    );
}