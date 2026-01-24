import React, { useEffect, useRef, useState } from "react";
import { useWalletStore } from "../../store/walletStore";
import { apiFetch } from "../../api.js";

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        balance,
        status,
        connectWallet,
        openMyNearWalletRedirect,
        disconnectWallet,
        restoreSession,
        clearStatus,
    } = useWalletStore();

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

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

    const haptic = () => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("light");
        } catch { }
    };

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
            await connectWallet("near"); // opens HERE modal
            startAutoRestorePolling();
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setTimeout(() => setLoading(false), 400);
        }
    };

    const onMyNearRedirect = async () => {
        haptic();
        setErr("");
        try {
            await openMyNearWalletRedirect?.();
            startAutoRestorePolling();
        } catch (e) {
            setErr(String(e?.message || e));
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
                        {loading ? "Открываю..." : "Подключить кошелёк"}
                    </button>

                    <button
                        onClick={onMyNearRedirect}
                        disabled={loading}
                        style={{
                            padding: "10px 14px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#fff",
                            fontWeight: 800,
                        }}
                        title="Без popups, работает в Telegram"
                    >
                        MyNearWallet (redirect)
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