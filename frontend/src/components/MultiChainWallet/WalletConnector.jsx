import React, { useEffect, useState, useRef } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    var w = useWalletStore();
    var [loading, setLoading] = useState(false);
    var [inputValue, setInputValue] = useState("");
    var [verifying, setVerifying] = useState(false);
    var inputRef = useRef(null);
    var nid = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
    var isTest = nid.toLowerCase() === "testnet";

    useEffect(function () { w.restoreSession(); }, []);

    useEffect(function () {
        if (w.showAccountInput && inputRef.current) {
            setTimeout(function () {
                if (inputRef.current) inputRef.current.focus();
            }, 300);
        }
    }, [w.showAccountInput]);

    function haptic() {
        try { window.Telegram.WebApp.HapticFeedback.impactOccurred("light"); } catch (e) { }
    }

    function fmt(a) {
        return !a ? "" : a.length <= 20 ? a : a.slice(0, 10) + "…" + a.slice(-6);
    }

    async function onConnect() {
        haptic();
        setLoading(true);
        try { await w.connectHot(); } catch (e) { }
        setLoading(false);
    }

    async function onSubmit() {
        if (!inputValue.trim()) return;
        haptic();
        setVerifying(true);
        await w.submitAccount(inputValue.trim());
        setVerifying(false);
    }

    function onCancel() {
        haptic();
        w.cancelConnect();
        setInputValue("");
    }

    function onKeyDown(e) {
        if (e.key === "Enter") onSubmit();
        if (e.key === "Escape") onCancel();
    }

    var top = "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    var badge = {
        padding: "6px 12px", borderRadius: 8,
        background: isTest ? "rgba(251,146,60,0.15)" : "rgba(34,197,94,0.15)",
        border: "1px solid " + (isTest ? "rgba(251,146,60,0.3)" : "rgba(34,197,94,0.3)"),
        color: "#fff", fontSize: 11, fontWeight: 800, textTransform: "uppercase",
    };

    // ─── Connected state ───
    if (w.connected) {
        return (
            <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div style={badge}>{isTest ? "🧪 TESTNET" : "🚀 MAINNET"}</div>
                    <div style={{
                        display: "flex", gap: 8, alignItems: "center", padding: 10,
                        borderRadius: 16, background: "rgba(20,20,20,0.85)",
                        border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)",
                    }}>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#0b0b0b",
                            border: "1px solid rgba(255,255,255,0.12)", fontWeight: 800,
                            color: "#fff", whiteSpace: "nowrap",
                        }}>{Number(w.balance || 0).toFixed(4)} Ⓝ</div>
                        <div style={{
                            padding: "8px 10px", borderRadius: 10, background: "#113a8a",
                            border: "1px solid rgba(255,255,255,0.12)", color: "#fff",
                            fontFamily: "monospace",
                        }}>{fmt(w.walletAddress)}</div>
                        <button onClick={function () { haptic(); w.disconnectWallet(); }} style={{
                            padding: "8px 10px", borderRadius: 10,
                            background: "rgba(200,40,40,0.25)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff", cursor: "pointer",
                        }}>⎋</button>
                    </div>
                </div>
            </div>
        );
    }

    // ─── Account input modal ───
    if (w.showAccountInput) {
        return (
            <div style={{
                position: "fixed", inset: 0, zIndex: 99999,
                background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 20,
            }}>
                <div style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 20, padding: "28px 24px",
                    maxWidth: 380, width: "100%", textAlign: "center",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
                }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔥</div>
                    <h3 style={{
                        margin: "0 0 8px", fontSize: 20, fontWeight: 900, color: "#fff",
                    }}>Connect NEAR Account</h3>

                    <p style={{
                        margin: "0 0 6px", fontSize: 13, color: "#a0d8ff",
                        lineHeight: 1.5, opacity: 0.8,
                    }}>
                        HOT Wallet opened! Copy your NEAR address from the wallet and paste it below.
                    </p>

                    <p style={{
                        margin: "0 0 16px", fontSize: 11, color: "#fbbf24",
                        lineHeight: 1.4, opacity: 0.7,
                    }}>
                        💡 In HOT Wallet: tap your address at the top to copy it
                    </p>

                    <input
                        ref={inputRef}
                        type="text"
                        value={inputValue}
                        onChange={function (e) { setInputValue(e.target.value); }}
                        onKeyDown={onKeyDown}
                        placeholder="example.near"
                        style={{
                            width: "100%", padding: "14px 16px", borderRadius: 12,
                            border: "1px solid rgba(255,140,0,0.3)",
                            background: "rgba(0,0,0,0.4)", color: "#fff",
                            fontSize: 16, fontFamily: "monospace",
                            outline: "none", boxSizing: "border-box",
                            marginBottom: 12,
                        }}
                    />

                    {w.status ? (
                        <div style={{
                            padding: "8px 12px", borderRadius: 10,
                            background: "rgba(0,0,0,0.4)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            color: "#a0d8ff", fontSize: 12, marginBottom: 12,
                        }}>{w.status}</div>
                    ) : null}

                    {w.lastError ? (
                        <div style={{
                            padding: "8px 12px", borderRadius: 10,
                            background: "rgba(120,20,20,0.6)",
                            border: "1px solid rgba(255,80,80,0.3)",
                            color: "#fca5a5", fontSize: 12, marginBottom: 12,
                            wordBreak: "break-word",
                        }}>{w.lastError.message}</div>
                    ) : null}

                    <button
                        onClick={onSubmit}
                        disabled={verifying || !inputValue.trim()}
                        style={{
                            width: "100%", padding: "14px 20px", borderRadius: 14,
                            border: "1px solid rgba(255,140,0,0.4)",
                            background: verifying
                                ? "rgba(255,140,0,0.1)"
                                : "linear-gradient(135deg, rgba(255,140,0,0.3), rgba(255,80,0,0.2))",
                            color: "#fff", fontSize: 16, fontWeight: 900,
                            cursor: verifying ? "default" : "pointer",
                            opacity: (!inputValue.trim() || verifying) ? 0.5 : 1,
                            marginBottom: 10,
                        }}
                    >{verifying ? "⏳ Verifying..." : "✅ Connect"}</button>

                    <button
                        onClick={onCancel}
                        style={{
                            width: "100%", padding: "10px 20px", borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.1)",
                            background: "rgba(255,255,255,0.05)",
                            color: "rgba(255,255,255,0.6)", fontSize: 13,
                            cursor: "pointer",
                        }}
                    >Cancel</button>
                </div>
            </div>
        );
    }

    // ─── Default: connect button ───
    return (
        <div style={{ position: "fixed", top: top, right: 16, zIndex: 9999 }}>
            <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 300 }}>
                <div style={badge}>{isTest ? "🧪 TESTNET" : "🚀 MAINNET"}</div>
                <button onClick={onConnect} disabled={loading} style={{
                    padding: "14px 20px", borderRadius: 14,
                    border: "1px solid rgba(255,140,0,0.4)",
                    background: loading
                        ? "rgba(255,140,0,0.1)"
                        : "linear-gradient(135deg,rgba(255,140,0,0.3),rgba(255,80,0,0.2))",
                    color: "#fff", fontSize: 16, fontWeight: 900,
                    cursor: loading ? "default" : "pointer",
                    opacity: loading ? 0.6 : 1,
                    display: "flex", alignItems: "center", gap: 10, justifyContent: "center",
                    boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                }}>{loading ? "⏳ Opening wallet..." : "🔥 Connect HOT Wallet"}</button>
            </div>
        </div>
    );
}