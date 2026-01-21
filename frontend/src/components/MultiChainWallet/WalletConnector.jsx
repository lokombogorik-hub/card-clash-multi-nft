import React, { useEffect, useState } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        network,
        balance,
        availableNetworks,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        restoreSession,
    } = useWalletStore();

    const [showNetworks, setShowNetworks] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        // Восстановление сессии после возврата со страницы кошелька
        restoreSession?.().catch(() => { });
    }, [restoreSession]);

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

    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(walletAddress);
            alert("Адрес скопирован");
        } catch {
            alert("Не удалось скопировать");
        }
    };

    const explorerUrl =
        network === "near" ? `https://nearblocks.io/address/${walletAddress}` : "#";

    const onConnect = async () => {
        haptic();
        setErr("");
        setLoading(true);
        try {
            await connectWallet("near");
            // Обычно произойдёт редирект на кошелёк, а после возврата restoreSession() всё подхватит
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    const onDisconnect = async () => {
        haptic();
        setErr("");
        setLoading(true);
        try {
            await disconnectWallet();
        } catch (e) {
            setErr(String(e?.message || e));
        } finally {
            setLoading(false);
        }
    };

    // Позиция ниже верхней границы (safe-area + запас под хедер)
    const topOffset = "calc(env(safe-area-inset-top, 0px) + 56px)";

    return (
        <div style={{ position: "fixed", top: topOffset, right: 16, zIndex: 9999 }}>
            {!connected ? (
                <div style={{ display: "grid", gap: 8, justifyItems: "end" }}>
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
                        {loading ? "Подключение..." : "Подключить кошелёк"}
                    </button>

                    {err ? (
                        <div
                            style={{
                                maxWidth: 320,
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
                        {/* Селектор сети показываем только когда сетей > 1 */}
                        {Array.isArray(availableNetworks) && availableNetworks.length > 1 ? (
                            <div style={{ position: "relative" }}>
                                <button
                                    onClick={() => setShowNetworks((v) => !v)}
                                    style={{
                                        padding: "8px 10px",
                                        borderRadius: 10,
                                        background: "#0b0b0b",
                                        border: "1px solid rgba(255,255,255,0.12)",
                                        color: "#fff",
                                        cursor: "pointer",
                                        fontWeight: 700,
                                    }}
                                >
                                    Сеть ▾
                                </button>

                                {showNetworks && (
                                    <div
                                        style={{
                                            position: "absolute",
                                            top: "110%",
                                            left: 0,
                                            width: 180,
                                            borderRadius: 12,
                                            overflow: "hidden",
                                            background: "#0b0b0b",
                                            border: "1px solid rgba(255,255,255,0.12)",
                                        }}
                                    >
                                        {availableNetworks.map((net) => (
                                            <button
                                                key={net}
                                                onClick={() => {
                                                    switchNetwork(net);
                                                    setShowNetworks(false);
                                                }}
                                                style={{
                                                    display: "block",
                                                    width: "100%",
                                                    textAlign: "left",
                                                    padding: "10px 12px",
                                                    background:
                                                        net === network ? "rgba(255,255,255,0.08)" : "transparent",
                                                    border: "none",
                                                    color: "#fff",
                                                    cursor: "pointer",
                                                }}
                                            >
                                                {net.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {/* Баланс */}
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

                        {/* Адрес */}
                        <button
                            onClick={copyAddress}
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#113a8a",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                cursor: "pointer",
                                fontFamily: "monospace",
                            }}
                            title="Скопировать адрес"
                        >
                            {formatAddress(walletAddress)}
                        </button>

                        {/* Explorer */}
                        <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                                padding: "8px 10px",
                                borderRadius: 10,
                                background: "#0b0b0b",
                                border: "1px solid rgba(255,255,255,0.12)",
                                color: "#fff",
                                textDecoration: "none",
                            }}
                            title="Открыть в эксплорере"
                        >
                            ↗
                        </a>

                        {/* Disconnect */}
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

                    {err ? (
                        <div
                            style={{
                                maxWidth: 360,
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
            )}
        </div>
    );
}