import React, { useState } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletConnector() {
    const {
        connected,
        walletAddress,
        network,
        balance,
        connectWallet,
        disconnectWallet,
        switchNetwork,
        availableNetworks,
    } = useWalletStore();

    const [showNetworks, setShowNetworks] = useState(false);

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
        network === "near"
            ? `https://nearblocks.io/address/${walletAddress}`
            : `https://explorer.${network}.org/accounts/${walletAddress}`;

    return (
        <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999 }}>
            {!connected ? (
                <button
                    onClick={() => connectWallet("near")}
                    style={{
                        padding: "10px 14px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.15)",
                        background: "linear-gradient(90deg,#2563eb,#7c3aed)",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: "pointer",
                    }}
                >
                    Подключить кошелёк
                </button>
            ) : (
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
                    {/* Network dropdown */}
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
                            {network.toUpperCase()} ▾
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
                                            background: net === network ? "rgba(255,255,255,0.08)" : "transparent",
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

                    {/* Balance */}
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

                    {/* Address + actions */}
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

                    <button
                        onClick={disconnectWallet}
                        style={{
                            padding: "8px 10px",
                            borderRadius: 10,
                            background: "rgba(200,40,40,0.25)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            cursor: "pointer",
                        }}
                        title="Отключить"
                    >
                        ⎋
                    </button>
                </div>
            )}
        </div>
    );
}