import React, { useEffect, useRef, useState } from "react";
import { useWalletStore } from "../../store/useWalletStore";
import { apiFetch } from "../../api.js";
import WalletPicker from "./WalletPicker";

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        balance,
        status,
        disconnectWallet,
        restoreSession,
        clearStatus,
    } = useWalletStore();

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);

    const pollRef = useRef(null);

    useEffect(() => {
        restoreSession?.().catch(() => { });
    }, [restoreSession]);

    useEffect(() => {
        if (!connected || !walletAddress) return;

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

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const startAutoRestorePolling = () => {
        if (pollRef.current) clearInterval(pollRef.current);

        const startedAt = Date.now();
        pollRef.current = setInterval(async () => {
            if (Date.now() - startedAt > 15000) {
                clearInterval(pollRef.current);
                pollRef.current = null;
                return;
            }
            try {
                await restoreSession?.();
            } catch { }
        }, 900);
    };

    const haptic = (kind = "light") => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind);
        } catch { }
    };

    const formatAddress = (address) => {
        if (!address) return "";
        if (address.length <= 18) return address;
        return `${address.slice(0, 10)}...${address.slice(-6)}`;
    };

    const onOpenPicker = () => {
        haptic("light");
        setErr("");
        setPickerOpen(true);
        startAutoRestorePolling();
    };

    const onDisconnect = async () => {
        haptic("light");
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

    const topOffset =
        "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    return (
        <div style={{ position: "fixed", top: topOffset, right: 16, zIndex: 9999 }}>
            <WalletPicker open={pickerOpen} onClose={() => setPickerOpen(false)} />

            {!connected ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 360 }}>
                    <button
                        onClick={onOpenPicker}
                        disabled={loading}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "linear-gradient(90deg,#2563eb,#7c3aed)",
                            color: "#fff",
                            fontWeight: 900,
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.8 : 1,
                        }}
                    >
                        Подключить кошелёк
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
                            {status}
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
                    <button
                        onClick={() => {
                            haptic("light");
                            onOpenPicker();
                        }}
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
                            cursor: "pointer",
                        }}
                        title="Wallet"
                    >
                        <div
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#0b0b0b",
                                border: "1px solid rgba(255,255,255,0.12)",
                                fontWeight: 800,
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
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onDisconnect();
                            }}
                            disabled={loading}
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "rgba(200,40,40,0.25)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.8 : 1,
                                fontWeight: 900,
                            }}
                            title="Отключить"
                        >
                            {loading ? "..." : "⎋"}
                        </button>
                    </button>
                </div>
            )}
        </div>
    );
}