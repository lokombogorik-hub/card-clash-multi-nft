import React, { useEffect, useState } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    var wallet = useWalletStore();
    var [input, setInput] = useState("");
    var [loading, setLoading] = useState(false);
    var [err, setErr] = useState("");
    var [showInput, setShowInput] = useState(false);

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
        var val = input.trim();
        if (!val) { setErr("Enter your NEAR account ID"); return; }
        haptic("light");
        setErr("");
        setLoading(true);
        try {
            await wallet.connectHot(val);
            setInput("");
            setShowInput(false);
        } catch (e) {
            setErr((e && e.message) || String(e));
        }
        setLoading(false);
    }

    function onKey(e) { if (e.key === "Enter") onConnect(); }

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
                        color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                    }}>{isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}</div>
                    <div style={{
                        display: "flex", gap: 8, alignItems: "center", padding: 10,
                        borderRadius: 16, background: "rgba(20,20,20,0.85)",
                        border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
                    }}>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#0b0b0b",
                            border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800,
                            color: "#fff", whiteSpace: "nowrap",
                        }}>{Number(wallet.balance || 0).toFixed(4)} Ⓝ</div>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#113a8a",
                            border: "1px solid rgba(255,255,255,0.12)", color: "#fff", fontFamily: "monospace",
                        }}>{fmt(wallet.walletAddress)}</div>
                        <button onClick={onDisconnect} style={{
                            padding: "8px 10px", borderRadius: 10, background: "rgba(200,40,40,0.25)",
                            border: "1px solid rgba(255,255,255,0.12)", color: "#fff", cursor: "pointer",
                        }}>⎋</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
            <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 310 }}>
                <div style={{
                    padding: "6px 12px", borderRadius: 8,
                    background: isTestnet ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
                    border: "1px solid " + (isTestnet ? "rgba(251,146,60,0.3)" : "rgba(34,197,94,0.3)"),
                    color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                }}>{isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}</div>

                {!showInput ? (
                    <button onClick={function () { haptic("light"); setShowInput(true); setErr(""); }} style={{
                        padding: "14px 20px", borderRadius: 14,
                        border: "1px solid rgba(255,140,0,0.4)",
                        background: "linear-gradient(135deg,rgba(255,140,0,0.3),rgba(255,80,0,0.2))",
                        color: "#fff", fontSize: 16, fontWeight: 900, cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
                        boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                    }}>🔥 Connect Wallet</button>
                ) : (
                    <div style={{
                        padding: 16, borderRadius: 16, background: "rgba(10,10,18,0.95)",
                        border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)",
                        display: "grid", gap: 10, width: 295,
                    }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: "#fff", textAlign: "center" }}>
                            Enter your NEAR Account ID
                        </div>
                        <div style={{ fontSize: 11, color: "#a0d8ff", textAlign: "center", lineHeight: 1.4, opacity: 0.7 }}>
                            Find it in HOT Wallet → Profile
                        </div>
                        <input type="text" value={input}
                            onChange={function (e) { setInput(e.target.value); setErr(""); }}
                            onKeyDown={onKey} placeholder={isTestnet ? "name.testnet" : "name.near"}
                            autoComplete="off" autoCapitalize="none" spellCheck={false}
                            style={{
                                width: "100%", padding: "13px 14px", borderRadius: 12,
                                border: "1px solid " + (err ? "rgba(255,80,80,0.5)" : "rgba(255,255,255,0.12)"),
                                background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 16,
                                fontFamily: "monospace", outline: "none", boxSizing: "border-box",
                            }} />
                        <button onClick={onConnect} disabled={loading || !input.trim()} style={{
                            padding: "13px", borderRadius: 12,
                            border: "1px solid rgba(120,200,255,0.3)",
                            background: (loading || !input.trim()) ? "rgba(120,200,255,0.05)"
                                : "linear-gradient(135deg,rgba(37,99,235,0.4),rgba(124,58,237,0.3))",
                            color: "#fff", fontSize: 15, fontWeight: 900,
                            cursor: (loading || !input.trim()) ? "default" : "pointer",
                            opacity: (loading || !input.trim()) ? 0.4 : 1,
                        }}>{loading ? "⏳ Verifying..." : "⚡ Connect"}</button>
                        <button onClick={function () { setShowInput(false); setErr(""); }} style={{
                            padding: "10px", borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.06)",
                            background: "transparent", color: "rgba(255,255,255,0.3)",
                            fontSize: 12, cursor: "pointer",
                        }}>Cancel</button>
                        {err ? (<div style={{
                            padding: "8px 10px", borderRadius: 10,
                            background: "rgba(255,40,40,0.12)", border: "1px solid rgba(255,80,80,0.25)",
                            color: "#fca5a5", fontSize: 12,
                        }}>{err}</div>) : null}
                        {wallet.status ? (<div style={{
                            padding: "8px 10px", borderRadius: 10,
                            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)",
                            color: "#86efac", fontSize: 12,
                        }}>{wallet.status}</div>) : null}
                    </div>
                )}
            </div>
        </div>
    );
}