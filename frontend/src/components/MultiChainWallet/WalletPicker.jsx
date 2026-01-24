import { useEffect } from "react";
import { useWalletStore } from "../../store/walletStore";

export default function WalletPicker({ open, onClose }) {
    const { nearNetworkId, status, connectHere, openMyNearWalletRedirect } = useWalletStore();

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 26000,
                background: "rgba(0,0,0,0.72)",
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                padding: 12,
            }}
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "min(520px, 96vw)",
                    borderRadius: 18,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(12,12,16,0.96)",
                    color: "#fff",
                    padding: 14,
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                        <div style={{ fontWeight: 900, fontSize: 15 }}>Выберите кошелёк</div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
                            Network: <span style={{ fontFamily: "monospace" }}>{nearNetworkId}</span>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "8px 10px",
                            borderRadius: 12,
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            fontWeight: 900,
                        }}
                    >
                        ✕
                    </button>
                </div>

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <button
                        onClick={async () => {
                            await connectHere();
                            onClose?.();
                        }}
                        style={{
                            padding: "12px 14px",
                            borderRadius: 14,
                            background: "linear-gradient(90deg,#2563eb,#7c3aed)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "#fff",
                            fontWeight: 900,
                            textAlign: "left",
                        }}
                    >
                        HERE / HotWallet
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            Подключение через wallet-selector (внутри Telegram)
                        </div>
                    </button>

                    <button
                        onClick={async () => {
                            await openMyNearWalletRedirect();
                            onClose?.();
                        }}
                        style={{
                            padding: "12px 14px",
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "#fff",
                            fontWeight: 900,
                            textAlign: "left",
                        }}
                    >
                        MyNearWallet
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            Без popup (redirect через Telegram openLink)
                        </div>
                    </button>

                    {status ? (
                        <div
                            style={{
                                padding: 10,
                                borderRadius: 12,
                                background: "rgba(0,0,0,0.35)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                fontSize: 12,
                                opacity: 0.9,
                            }}
                        >
                            {status}
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
}