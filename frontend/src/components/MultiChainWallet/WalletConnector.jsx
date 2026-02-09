import React, { useEffect, useState } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    var w = useWalletStore();
    var [loading, setLoading] = useState(false);
    var nid = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
    var isTest = nid.toLowerCase() === "testnet";

    useEffect(function () { w.restoreSession(); }, []);

    function haptic() { try { window.Telegram.WebApp.HapticFeedback.impactOccurred("light"); } catch (e) { } }
    function fmt(a) { return !a ? "" : a.length <= 20 ? a : a.slice(0, 10) + "…" + a.slice(-6); }

    async function onConnect() {
        haptic();
        setLoading(true);
        try { await w.connectHot(); } catch (e) { }
        setLoading(false);
    }

    var top = "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";
    var badge = {
        padding: "6px 12px", borderRadius: 8,
        background: isTest ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
        border: "1px solid " + (isTest ? "rgba(251,146,60,0.3)" : "rgba(34,197,94,0.3)"),
        color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
    };

    if (w.connected) {
        return (
            <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div style={badge}>{isTest ? "🧪 TESTNET" : "🚀 MAINNET"}</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", padding: 10, borderRadius: 16, background: "rgba(20,20,20,0.85)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}>
                        <div style={{ padding: "8px 10px", borderRadius: 10, background: "#0b0b0b", border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>{Number(w.balance || 0).toFixed(4)} Ⓝ</div>
                        <div style={{ padding: "8px 10px", borderRadius: 10, background: "#113a8a", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "monospace" }}>{fmt(w.walletAddress)}</div>
                        <button onClick={function () { haptic(); w.disconnectWallet(); }} style={{ padding: "8px 10px", borderRadius: 10, background: "rgba(200,40,40,0.25)", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer" }}>⎋</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
            <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 300 }}>
                <div style={badge}>{isTest ? "🧪 TESTNET" : "🚀 MAINNET"}</div>
                <button onClick={onConnect} disabled={loading} style={{
                    padding: "14px 20px", borderRadius: 14,
                    border: "1px solid rgba(255,140,0,0.4)",
                    background: loading ? "rgba(255,140,0,0.1)" : "linear-gradient(135deg,rgba(255,140,0,0.3),rgba(255,80,0,0.2))",
                    color: "#fff", fontSize: 16, fontWeight: 900, cursor: loading ? "default" : "pointer",
                    opacity: loading ? 0.6 : 1, display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
                    boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                }}>{loading ? "⏳ Connecting..." : "🔥 Connect HOT Wallet"}</button>
                {w.status ? <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.1)", color: "#a0d8ff", fontSize: 12, maxWidth: 280, textAlign: "right" }}>{w.status}</div> : null}
                {w.lastError ? <div style={{ padding: "10px 12px", borderRadius: 12, background: "rgba(120,20,20,0.8)", border: "1px solid rgba(255,80,80,0.3)", color: "#fca5a5", fontSize: 11, maxWidth: 280, textAlign: "right", wordBreak: "break-word" }}>{w.lastError.message}</div> : null}
            </div>
        </div>
    );
}