import { useEffect, useMemo } from "react";
import { useWalletStore } from "../../store/walletStore";

function Tile({
    title,
    subtitle,
    iconSrc,
    accent,
    onClick,
    disabled,
    badge,
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                textAlign: "left",
                padding: 14,
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.12)",
                background:
                    `radial-gradient(110% 140% at 15% 20%, ${accent} 0%, rgba(0,0,0,0) 58%),` +
                    `radial-gradient(110% 140% at 85% 85%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%),` +
                    `linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.26)),` +
                    `rgba(0,0,0,0.52)`,
                color: "#fff",
                display: "grid",
                gridTemplateColumns: "68px 1fr",
                gap: 12,
                alignItems: "center",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                boxShadow:
                    "0 18px 70px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.03) inset",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                transition: "transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
            }}
            onMouseDown={(e) => {
                if (disabled) return;
                e.currentTarget.style.transform = "translateY(1px) scale(0.995)";
            }}
            onMouseUp={(e) => (e.currentTarget.style.transform = "")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
        >
            <div
                style={{
                    width: 68,
                    height: 68,
                    borderRadius: 18,
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow:
                        `0 0 0 1px rgba(255,255,255,0.04) inset, 0 0 22px ${accent}`,
                    overflow: "hidden",
                }}
            >
                <img
                    src={iconSrc}
                    alt=""
                    draggable="false"
                    style={{ width: 46, height: 46, display: "block" }}
                />
            </div>

            <div style={{ minWidth: 0, position: "relative" }}>
                {badge ? (
                    <div
                        style={{
                            position: "absolute",
                            right: 0,
                            top: 0,
                            padding: "4px 8px",
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 900,
                            background: "rgba(0,0,0,0.45)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            opacity: 0.9,
                        }}
                    >
                        {badge}
                    </div>
                ) : null}

                <div style={{ fontWeight: 950, fontSize: 14, letterSpacing: 0.2 }}>
                    {title}
                </div>
                <div style={{ opacity: 0.85, fontSize: 12, marginTop: 6, lineHeight: 1.25 }}>
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

    const subtitle = useMemo(() => {
        return nearNetworkId === "testnet"
            ? "Testnet • fast & cheap dev flow"
            : "Mainnet • real NEAR & real NFTs";
    }, [nearNetworkId]);

    if (!open) return null;

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 26000,
                background:
                    "radial-gradient(120% 120% at 25% 18%, rgba(120,200,255,0.16) 0%, rgba(0,0,0,0) 62%)," +
                    "radial-gradient(120% 120% at 78% 86%, rgba(255,61,242,0.12) 0%, rgba(0,0,0,0) 62%)," +
                    "rgba(0,0,0,0.74)",
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
                    width: "min(620px, 96vw)",
                    borderRadius: 24,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background:
                        "radial-gradient(140% 140% at 10% 0%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 55%)," +
                        "rgba(10,10,14,0.94)",
                    color: "#fff",
                    padding: 14,
                    boxShadow: "0 30px 120px rgba(0,0,0,0.78)",
                    backdropFilter: "blur(18px)",
                    WebkitBackdropFilter: "blur(18px)",
                }}
            >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                        <div style={{ fontWeight: 950, fontSize: 16, letterSpacing: 0.2 }}>Connect wallet</div>
                        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                            {subtitle} • network: <span style={{ fontFamily: "monospace" }}>{nearNetworkId}</span>
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

                <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    <Tile
                        title="HERE / Hot Wallet"
                        subtitle="Best in Telegram. Connect inside app and return to the game."
                        iconSrc="/ui/wallets/here.svg"
                        accent="rgba(120,200,255,0.28)"
                        badge="Telegram"
                        onClick={async () => {
                            haptic("light");
                            await connectHere();
                            onClose?.();
                        }}
                    />

                    <Tile
                        title="MyNearWallet"
                        subtitle="Stable fallback. Redirect via Telegram openLink (no popups)."
                        iconSrc="/ui/wallets/mynearwallet.svg"
                        accent="rgba(255,215,0,0.22)"
                        badge="No popups"
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
                                opacity: 0.92,
                                lineHeight: 1.35,
                            }}
                        >
                            {status}
                        </div>
                    ) : null}

                    <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
                        Tip: after confirming in wallet, return to Telegram — the game will auto-detect your account.
                    </div>
                </div>
            </div>
        </div>
    );
}