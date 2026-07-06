import React from "react";
import { FireIcon } from "../Icons";

export default function WalletPicker({ open, onClose, onHot }) {
    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 99999,
                background: "rgba(0,0,0,0.75)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
                backdropFilter: "blur(6px)",
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "linear-gradient(145deg, #1a1a2e, #0f0f1a)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 20,
                    padding: "28px 24px",
                    maxWidth: 340,
                    width: "100%",
                    textAlign: "center",
                    boxShadow: "0 24px 80px rgba(0,0,0,0.8)",
                }}
                onClick={function (e) { e.stopPropagation(); }}
            >
                <div style={{ marginBottom: 12 }}><FireIcon size={34} /></div>
                <h3
                    style={{
                        margin: "0 0 8px",
                        fontSize: 20,
                        fontWeight: 900,
                        color: "#fff",
                    }}
                >
                    Connect Wallet
                </h3>
                <p
                    style={{
                        margin: "0 0 20px",
                        fontSize: 13,
                        opacity: 0.7,
                        color: "#a0d8ff",
                        lineHeight: 1.4,
                    }}
                >
                    HOT Wallet откроется для подтверждения.
                    <br />
                    Подтвердите подключение в кошельке.
                </p>

                <button
                    onClick={onHot}
                    style={{
                        width: "100%",
                        padding: "14px 20px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,140,0,0.4)",
                        background:
                            "linear-gradient(135deg, rgba(255,140,0,0.25), rgba(255,80,0,0.15))",
                        color: "#fff",
                        fontSize: 16,
                        fontWeight: 900,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        transition: "all 0.3s",
                        boxShadow: "0 0 20px rgba(255,140,0,0.15)",
                    }}
                >
                    <img
                        src="https://tgapp.herewallet.app/hot-icon.png"
                        alt=""
                        style={{ width: 28, height: 28, borderRadius: 8 }}
                        onError={function (e) { e.target.style.display = "none"; }}
                    />
                    HOT Wallet
                </button>

                <button
                    onClick={onClose}
                    style={{
                        marginTop: 14,
                        padding: "10px 20px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.1)",
                        background: "rgba(255,255,255,0.05)",
                        color: "rgba(255,255,255,0.6)",
                        fontSize: 13,
                        cursor: "pointer",
                        width: "100%",
                    }}
                >
                    Отмена
                </button>
            </div>
        </div>
    );
}