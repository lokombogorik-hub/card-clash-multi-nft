import React, { useEffect, useRef, useState } from "react";
import { useWalletStore } from "../../store/walletStore";
import { apiFetch } from "../../api.js";
import WalletPicker from "./WalletPicker";
import { openHereWalletSwitchNetwork } from "../../libs/nearWallet"; // ✅ FIX: импорт

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        balance,
        status,
        lastError,
        connectHot,
        disconnectWallet,
        restoreSession,
        clearStatus,
    } = useWalletStore();

    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [pickerOpen, setPickerOpen] = useState(false);
    const [showErrorDetail, setShowErrorDetail] = useState(false);

    const pollRef = useRef(null);

    const networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
    const isTestnet = networkId.toLowerCase() === "testnet";

    // ✅ FIX: проверяем, на правильной ли сети текущий аккаунт
    const isWrongNetwork = connected && walletAddress && (
        (isTestnet && !walletAddress.includes(".testnet")) ||
        (!isTestnet && walletAddress.includes(".testnet"))
    );

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

    // ✅ FIX: кнопка переключения сети
    const onSwitchNetwork = () => {
        haptic("light");
        openHereWalletSwitchNetwork();
    };

    const topOffset =
        "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    return (
        <div style={{ position: "fixed", top: topOffset, right: 16, zIndex: 9999 }}>
            <WalletPicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onHot={async () => {
                    setErr("");
                    setLoading(true);
                    try {
                        await connectHot();
                        setPickerOpen(false);
                    } catch (e) {
                        setErr(String(e?.message || e));
                    } finally {
                        setLoading(false);
                    }
                }}
            />

            {!connected ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "end", maxWidth: 360 }}>
                    <div
                        style={{
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: isTestnet ? "rgba(251, 146, 60, 0.15)" : "rgba(34, 197, 94, 0.15)",
                            border: `1px solid ${isTestnet ? "rgba(251, 146, 60, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                        }}
                    >
                        {isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}
                    </div>

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

                    {/* ✅ FIX: кнопка переключения сети если нужно */}
                    <button
                        onClick={onSwitchNetwork}
                        style={{
                            padding: "8px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(251, 146, 60, 0.3)",
                            background: "rgba(251, 146, 60, 0.15)",
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            cursor: "pointer",
                        }}
                    >
                        🔄 Switch HOT Wallet to {isTestnet ? "testnet" : "mainnet"}
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

                    {lastError ? (
                        <div
                            style={{
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(120, 20, 20, 0.85)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 11,
                                lineHeight: 1.35,
                                maxWidth: 360,
                                wordBreak: "break-word",
                            }}
                        >
                            <div style={{ fontWeight: 900, marginBottom: 6 }}>
                                {lastError.name}: {lastError.message}
                            </div>
                            <button
                                onClick={() => setShowErrorDetail(!showErrorDetail)}
                                style={{
                                    padding: "4px 8px",
                                    borderRadius: 8,
                                    background: "rgba(255,255,255,0.12)",
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    color: "#fff",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    marginBottom: 6,
                                }}
                            >
                                {showErrorDetail ? "Скрыть stack" : "Показать stack"}
                            </button>
                            {showErrorDetail && lastError.stack ? (
                                <pre
                                    style={{
                                        fontSize: 10,
                                        lineHeight: 1.3,
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        opacity: 0.9,
                                    }}
                                >
                                    {lastError.stack}
                                </pre>
                            ) : null}
                        </div>
                    ) : null}

                    {window.__HOT_WALLET_ERRORS__?.length > 0 ? (
                        <div
                            style={{
                                maxWidth: 360,
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(139, 0, 0, 0.85)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 11,
                                lineHeight: 1.4,
                            }}
                        >
                            <div style={{ fontWeight: 900, marginBottom: 8 }}>HOT Wallet Debug:</div>
                            {window.__HOT_WALLET_ERRORS__.slice(-5).map((err, idx) => (
                                <div key={idx} style={{ marginBottom: 8, opacity: 0.95 }}>
                                    <div style={{ fontWeight: 800 }}>{err.step}</div>
                                    <div>{err.message}</div>
                                    {err.extra && typeof err.extra === "object" ? (
                                        <div style={{ fontSize: 10, opacity: 0.7 }}>
                                            {JSON.stringify(err.extra, null, 2)}
                                        </div>
                                    ) : null}
                                    <div style={{ fontSize: 10, opacity: 0.7 }}>{err.time}</div>
                                </div>
                            ))}
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
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: isTestnet ? "rgba(251, 146, 60, 0.15)" : "rgba(34, 197, 94, 0.15)",
                            border: `1px solid ${isTestnet ? "rgba(251, 146, 60, 0.3)" : "rgba(34, 197, 94, 0.3)"}`,
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                        }}
                    >
                        {isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"}
                    </div>

                    {/* ✅ FIX: предупреждение если аккаунт на другой сети */}
                    {isWrongNetwork && (
                        <div
                            style={{
                                padding: "8px 12px",
                                borderRadius: 12,
                                background: "rgba(220, 38, 38, 0.85)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 800,
                                textAlign: "center",
                            }}
                        >
                            ⚠️ Wrong network!<br />
                            Account: {walletAddress.includes(".testnet") ? "testnet" : "mainnet"}<br />
                            Expected: {isTestnet ? "testnet" : "mainnet"}
                        </div>
                    )}

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

                    {/* ✅ FIX: кнопка переключения сети если подключён не тот аккаунт */}
                    {isWrongNetwork && (
                        <button
                            onClick={() => {
                                onDisconnect();
                                setTimeout(() => {
                                    onSwitchNetwork();
                                }, 500);
                            }}
                            style={{
                                padding: "8px 12px",
                                borderRadius: 12,
                                border: "1px solid rgba(251, 146, 60, 0.3)",
                                background: "rgba(251, 146, 60, 0.15)",
                                color: "#fff",
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: "pointer",
                            }}
                        >
                            🔄 Disconnect & Switch to {isTestnet ? "testnet" : "mainnet"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}