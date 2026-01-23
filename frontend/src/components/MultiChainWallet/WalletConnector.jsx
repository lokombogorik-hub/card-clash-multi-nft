import React, { useEffect, useState } from "react";
import { useWalletStore } from "../../store/walletStore";
import { apiFetch } from "../../api.js";

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        balance,
        status,
        connectWallet,
        disconnectWallet,
        restoreSession,
        setManualAccountId,
        clearStatus,
    } = useWalletStore();

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [manual, setManual] = useState("");

    useEffect(() => {
        restoreSession?.().catch(() => { });
    }, [restoreSession]);

    // Stage2: persist NEAR accountId to backend DB
    useEffect(() => {
        if (!connected) return;
        if (!walletAddress) return;

        const token =
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            "";

        if (!token) return;

        apiFetch("/api/near/link", {
            method: "POST",
            token,
            body: JSON.stringify({ accountId: walletAddress }),
        }).catch(() => { });
    }, [connected, walletAddress]);

    const haptic = () => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch { }
    };

    const formatAddress = (address) => {
        if (!address) return "";
        if (address.length <= 18) return address;
        return `${address.slice(0, 10)}...${address.slice(-6)}`;
    };

    const onConnect = async () => {
        haptic();
        setErr("");
        setLoading(true);
        try {
            await connectWallet("near");
            setTimeout(() => setLoading(false), 700);
        } catch (e) {
            setErr(String(e?.message || e));
            setLoading(false);
        }
    };

    const onDisconnect = async () => {
        haptic();
        setErr("");
        setLoading(true);
        try {
            await disconnectWallet();
            clearStatus?.();
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    const onIConnected = async () => {
        haptic();
        setErr("");
        setLoading(true);
        try {
            await restoreSession?.();
            clearStatus?.();
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    const onManualSet = () => {
        haptic();
        try {
            setManualAccountId(manual);
            setManual("");
            clearStatus?.();
        } catch (e) {
            setErr(String(e?.message || e));
        }
    };

    const topOffset =
        "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    return (
        <div style={{ position: "fixed", top: topOffset, right: 16, zIndex: 9999 }}>
            {!connected ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 360 }}>
                    <button
                        onClick={onConnect}
                        disabled={loading}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "linear-gradient(90deg,#2563eb,#7c3aed)",
                            color: "#fff",
                            fontWeight: 700,
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.8 : 1,
                        }}
                    >
                        {loading ? "Открываю кошелёк..." : "Подключить кошелёк"}
                    </button>

                    {status ? (
                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(0,0,0,0.55)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1.25,
                            }}
                        >
                            <div style={{ marginBottom: 8 }}>{status}</div>

                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button
                                    onClick={onIConnected}
                                    disabled={loading}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: "rgba(255,255,255,0.08)",
                                        border: "1px solid rgba(255,255,255,0.14)",
                                        color: "#fff",
                                        fontSize: 12,
                                        fontWeight: 800,
                                    }}
                                >
                                    Я уже подключил
                                </button>
                            </div>

                            <div style={{ marginTop: 10, opacity: 0.9 }}>
                                Если возврата в WebApp нет, введи свой accountId вручную:
                            </div>

                            <div style={{ marginTop: 6, display: "flex", gap: 8 }}>
                                <input
                                    value={manual}
                                    onChange={(e) => setManual(e.target.value)}
                                    placeholder="например: yourname.near"
                                    style={{
                                        flex: 1,
                                        padding: "10px 10px",
                                        borderRadius: 10,
                                        border: "1px solid rgba(255,255,255,0.14)",
                                        background: "rgba(0,0,0,0.35)",
                                        color: "#fff",
                                        outline: "none",
                                    }}
                                />
                                <button
                                    onClick={onManualSet}
                                    disabled={!manual.trim()}
                                    style={{
                                        padding: "10px 12px",
                                        borderRadius: 10,
                                        background: "#0b0b0b",
                                        border: "1px solid rgba(255,255,255,0.14)",
                                        color: "#fff",
                                        fontWeight: 900,
                                    }}
                                >
                                    OK
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {err ? (
                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(120, 20, 20, 0.75)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1.25,
                            }}
                        >
                            {err}
                        </div>
                    ) : null}
                </div>
            ) : (
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            padding: 10,
                            borderRadius: 16,
                            background: "rgba(20,20,20,0.85)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            backdropFilter: "blur(8px)",
                        }}
                    >
                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#0b0b0b",
                                border: "1px solid rgba(255,255,255,0.12)",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                            }}
                            title="Баланс"
                        >
                            {Number(balance || 0).toFixed(4)} Ⓝ
                        </div>

                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#113a8a",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontFamily: "monospace",
                            }}
                            title="Account"
                        >
                            {formatAddress(walletAddress)}
                        </div>

                        <button
                            onClick={onDisconnect}
                            disabled={loading}
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "rgba(200,40,40,0.25)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.8 : 1,
                            }}
                            title="Отключить"
                        >
                            {loading ? "..." : "⎋"}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}