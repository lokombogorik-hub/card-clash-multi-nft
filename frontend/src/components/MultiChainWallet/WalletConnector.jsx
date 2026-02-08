import React, { useEffect, useRef, useState } from "react";
import { useWalletStore } from "../../store/walletStore";
import WalletPicker from "./WalletPicker";

export default function WalletConnector() {
    var wallet = useWalletStore();
    var connected = wallet.connected;
    var walletAddress = wallet.walletAddress;
    var balance = wallet.balance;
    var status = wallet.status;
    var lastError = wallet.lastError;
    var connectHot = wallet.connectHot;
    var disconnectWallet = wallet.disconnectWallet;
    var restoreSession = wallet.restoreSession;
    var clearStatus = wallet.clearStatus;

    var loadingState = useState(false);
    var loading = loadingState[0];
    var setLoading = loadingState[1];

    var errState = useState("");
    var err = errState[0];
    var setErr = errState[1];

    var pickerState = useState(false);
    var pickerOpen = pickerState[0];
    var setPickerOpen = pickerState[1];

    var errorDetailState = useState(false);
    var showErrorDetail = errorDetailState[0];
    var setShowErrorDetail = errorDetailState[1];

    var pollRef = useRef(null);

    var networkId = import.meta.env.VITE_NEAR_NETWORK_ID || "mainnet";
    var isTestnet = networkId.toLowerCase() === "testnet";

    useEffect(function () {
        if (restoreSession) {
            restoreSession().catch(function () { });
        }
    }, [restoreSession]);

    useEffect(function () {
        return function () {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    function startAutoRestorePolling() {
        if (pollRef.current) clearInterval(pollRef.current);

        var startedAt = Date.now();
        pollRef.current = setInterval(function () {
            if (Date.now() - startedAt > 15000) {
                clearInterval(pollRef.current);
                pollRef.current = null;
                return;
            }
            if (restoreSession) {
                restoreSession().catch(function () { });
            }
        }, 900);
    }

    function haptic(kind) {
        try {
            if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred(kind || "light");
            }
        } catch (e) { /* ignore */ }
    }

    function formatAddress(address) {
        if (!address) return "";
        if (address.length <= 18) return address;
        return address.slice(0, 10) + "..." + address.slice(-6);
    }

    function onOpenPicker() {
        haptic("light");
        setErr("");
        setPickerOpen(true);
        startAutoRestorePolling();
    }

    async function onDisconnect() {
        haptic("light");
        setErr("");
        setLoading(true);
        try {
            await disconnectWallet();
            if (clearStatus) clearStatus();
        } catch (e) {
            setErr(String((e && e.message) || e));
        } finally {
            setLoading(false);
        }
    }

    var topOffset =
        "calc(var(--safe-t, env(safe-area-inset-top, 0px)) + var(--tg-top-controls, 58px) + 6px)";

    return React.createElement(
        "div",
        { style: { position: "fixed", top: topOffset, right: 16, zIndex: 9999 } },

        React.createElement(WalletPicker, {
            open: pickerOpen,
            onClose: function () { setPickerOpen(false); },
            onHot: async function () {
                setErr("");
                setLoading(true);
                try {
                    await connectHot();
                    setPickerOpen(false);
                } catch (e) {
                    setErr(String((e && e.message) || e));
                } finally {
                    setLoading(false);
                }
            },
        }),

        !connected
            ? React.createElement(
                "div",
                { style: { display: "grid", gap: 8, justifyItems: "end", maxWidth: 360 } },

                React.createElement(
                    "div",
                    {
                        style: {
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: isTestnet ? "rgba(251, 146, 60, 0.15)" : "rgba(34, 197, 94, 0.15)",
                            border: "1px solid " + (isTestnet ? "rgba(251, 146, 60, 0.3)" : "rgba(34, 197, 94, 0.3)"),
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                        },
                    },
                    isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"
                ),

                React.createElement(
                    "button",
                    {
                        onClick: onOpenPicker,
                        disabled: loading,
                        style: {
                            padding: "10px 14px",
                            borderRadius: 999,
                            border: "1px solid rgba(255,255,255,0.15)",
                            background: "linear-gradient(90deg,#2563eb,#7c3aed)",
                            color: "#fff",
                            fontWeight: 900,
                            cursor: loading ? "not-allowed" : "pointer",
                            opacity: loading ? 0.8 : 1,
                        },
                    },
                    "Подключить кошелёк"
                ),

                status
                    ? React.createElement(
                        "div",
                        {
                            style: {
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(0,0,0,0.55)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1.25,
                            },
                        },
                        status
                    )
                    : null,

                lastError
                    ? React.createElement(
                        "div",
                        {
                            style: {
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "rgba(120, 20, 20, 0.85)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 11,
                                lineHeight: 1.35,
                                maxWidth: 360,
                                wordBreak: "break-word",
                            },
                        },
                        React.createElement("div", { style: { fontWeight: 900, marginBottom: 6 } }, lastError.name + ": " + lastError.message),
                        React.createElement(
                            "button",
                            {
                                onClick: function () { setShowErrorDetail(!showErrorDetail); },
                                style: {
                                    padding: "4px 8px",
                                    borderRadius: 8,
                                    background: "rgba(255,255,255,0.12)",
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    color: "#fff",
                                    fontSize: 10,
                                    fontWeight: 800,
                                    cursor: "pointer",
                                    marginBottom: 6,
                                },
                            },
                            showErrorDetail ? "Скрыть stack" : "Показать stack"
                        ),
                        showErrorDetail && lastError.stack
                            ? React.createElement(
                                "pre",
                                {
                                    style: {
                                        fontSize: 10,
                                        lineHeight: 1.3,
                                        margin: 0,
                                        whiteSpace: "pre-wrap",
                                        wordBreak: "break-word",
                                        opacity: 0.9,
                                    },
                                },
                                lastError.stack
                            )
                            : null
                    )
                    : null,

                err
                    ? React.createElement(
                        "div",
                        {
                            style: {
                                padding: "8px 10px",
                                borderRadius: 12,
                                background: "rgba(120, 20, 20, 0.75)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontSize: 12,
                                lineHeight: 1.25,
                            },
                        },
                        err
                    )
                    : null
            )
            : React.createElement(
                "div",
                { style: { display: "grid", gap: 8, justifyItems: "end" } },

                React.createElement(
                    "div",
                    {
                        style: {
                            padding: "6px 12px",
                            borderRadius: 8,
                            background: isTestnet ? "rgba(251, 146, 60, 0.15)" : "rgba(34, 197, 94, 0.15)",
                            border: "1px solid " + (isTestnet ? "rgba(251, 146, 60, 0.3)" : "rgba(34, 197, 94, 0.3)"),
                            color: "#fff",
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: "uppercase",
                        },
                    },
                    isTestnet ? "🧪 TESTNET" : "🚀 MAINNET"
                ),

                React.createElement(
                    "div",
                    {
                        style: {
                            display: "flex",
                            gap: 8,
                            alignItems: "center",
                            padding: 10,
                            borderRadius: 16,
                            background: "rgba(20,20,20,0.85)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            backdropFilter: "blur(8px)",
                        },
                    },

                    React.createElement(
                        "div",
                        {
                            style: {
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#0b0b0b",
                                border: "1px solid rgba(255,255,255,0.12)",
                                fontWeight: 800,
                                whiteSpace: "nowrap",
                            },
                            title: "Баланс",
                        },
                        Number(balance || 0).toFixed(4) + " Ⓝ"
                    ),

                    React.createElement(
                        "div",
                        {
                            style: {
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#113a8a",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                fontFamily: "monospace",
                            },
                            title: "Account",
                        },
                        formatAddress(walletAddress)
                    ),

                    React.createElement(
                        "button",
                        {
                            onClick: onDisconnect,
                            disabled: loading,
                            style: {
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "rgba(200,40,40,0.25)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                cursor: loading ? "not-allowed" : "pointer",
                                opacity: loading ? 0.8 : 1,
                            },
                            title: "Отключить",
                        },
                        loading ? "..." : "⎋"
                    )
                )
            )
    );
}