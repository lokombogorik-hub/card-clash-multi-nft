import { useEffect, useMemo } from "react";
import { useWalletStore } from "../../store/walletStore";

function WalletTile({ title, subtitle, icon, accent, onClick, disabled }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.12)",
                background:
                    `radial-gradient(120% 140% at 20% 20%, ${accent} 0%, rgba(0,0,0,0) 55%),` +
                    `radial-gradient(120% 140% at 80% 80%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 55%),` +
                    `rgba(0,0,0,0.50)`,
                color: "#fff",
                display: "grid",
                gridTemplateColumns: "56px 1fr",
                gap: 12,
                alignItems: "center",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.5 : 1,
                boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                transition: "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            }}
            onMouseDown={(e) => {
                // tiny press effect
                if (disabled) return;
                e.currentTarget.style.transform = "translateY(1px) scale(0.995)";
            }}
            onMouseUp={(e) => {
                e.currentTarget.style.transform = "";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
            }}
        >
            <div
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                    fontSize: 26,
                }}
            >
                {icon}
            </div>

            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.2 }}>{title}</div>
                <div style={{ opacity: 0.85, fontSize: 12, marginTop: 4, lineHeight: 1.25 }}>
                    {subtitle}
                </div>
            </div>
        </button>
    );
}

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

    const haptic = (kind = "light") => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind);
        } catch { }
    };

    const title = useMemo(() => {
        return nearNetworkId === "testnet" ? "Testnet wallets" : "Mainnet wallets";
    }, [nearNetworkId]);

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 26000,
                background:
                    "radial-gradient(120% 120% at 30% 20%, rgba(120,200,255,0.18) 0%, rgba(0,0,0,0) 60%)," +
                    "radial-gradient(120% 120% at 70% 85%, rgba(255,61,242,0.14) 0%, rgba(0,0,0,0) 60%)," +
                    "rgba(0,0,0,0.72)",
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
                    width: "min(560px, 96vw)",
                    borderRadius: 22,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(10,10,14,0.92)",
                    color: "#fff",
                    padding: 14,
                    boxShadow: "0 30px 120px rgba(0,0,0,0.78)",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>Connect wallet</div>
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            {title} • network: <span style={{ fontFamily: "monospace" }}>{nearNetworkId}</span>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            background: "rgba(255,255,255,0.08)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            color: "#fff",
                            fontWeight: 900,
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <WalletTile
                        title="HERE / Hot Wallet"
                        subtitle="Best for Telegram. Opens inside Telegram and returns back to the game."
                        icon="🟦"
                        accent="rgba(120,200,255,0.28)"
                        onClick={async () => {
                            haptic("light");
                            await connectHere();
                            // user will return manually, keep picker closed
                            onClose?.();
                        }}
                    />

                    <WalletTile
                        title="MyNearWallet"
                        subtitle="No popups. Redirect via Telegram openLink (works on Desktop too)."
                        icon="🟨"
                        accent="rgba(255,215,0,0.20)"
                        onClick={async () => {
                            haptic("light");
                            await openMyNearWalletRedirect();
                            onClose?.();
                        }}
                    />

                    {status ? (
                        <div
                            style={{
                                padding: 12,
                                borderRadius: 16,
                                background: "rgba(0,0,0,0.42)",
                                border: "1px solid rgba(255,255,255,0.12)",
                                fontSize: 12,
                                opacity: 0.9,
                                lineHeight: 1.35,
                            }}
                        >
                            {status}
                        </div>
                    ) : null}

                    <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
                        Tip: after confirming in wallet, just return to Telegram — the game will auto-detect your account.
                    </div>
                </div>
            </div>
        </div>
    );
}