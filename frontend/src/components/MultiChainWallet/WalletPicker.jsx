import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWalletStore } from "../../store/useWalletStore";

const ICON_V = 24;

function isTelegramWebApp() {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData)
}

function WalletTile({ title, subtitle, icon, tag, disabled, onClick, warning }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                width: "100%",
                borderRadius: 18,
                border: warning ? "1px solid rgba(255,100,100,0.3)" : "1px solid rgba(255,255,255,0.12)",
                background: warning
                    ? "radial-gradient(120% 120% at 12% 10%, rgba(255,100,100,0.12) 0%, rgba(0,0,0,0) 55%), rgba(20,10,10,0.86)"
                    : "radial-gradient(120% 120% at 12% 10%, rgba(120,200,255,0.12) 0%, rgba(0,0,0,0) 55%)," +
                    "radial-gradient(120% 120% at 85% 85%, rgba(255,61,242,0.10) 0%, rgba(0,0,0,0) 60%)," +
                    "rgba(10,10,14,0.86)",
                color: "#fff",
                padding: 14,
                display: "grid",
                gridTemplateColumns: "60px 1fr auto",
                gap: 12,
                alignItems: "center",
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.55 : 1,
                textAlign: "left",
                boxShadow: "0 22px 90px rgba(0,0,0,0.55)",
            }}
        >
            <div
                style={{
                    width: 60,
                    height: 60,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    display: "grid",
                    placeItems: "center",
                    overflow: "hidden",
                }}
            >
                <img
                    src={icon}
                    alt=""
                    draggable="false"
                    style={{ width: 44, height: 44, display: "block" }}
                    onError={(e) => {
                        try {
                            e.currentTarget.style.display = "none";
                        } catch { }
                    }}
                />
            </div>

            <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                    <div style={{ fontWeight: 950, fontSize: 14, letterSpacing: 0.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {title}
                    </div>
                    {tag ? (
                        <div
                            style={{
                                padding: "3px 8px",
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 950,
                                background: tag === 'TESTNET OK' ? "rgba(99, 102, 241, 0.25)" : "rgba(0,0,0,0.45)",
                                border: "1px solid rgba(255,255,255,0.14)",
                                opacity: 0.92,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {tag}
                        </div>
                    ) : null}
                </div>

                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.82, lineHeight: 1.25 }}>
                    {subtitle}
                </div>
            </div>

            <div
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(255,255,255,0.06)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    opacity: 0.9,
                }}
            >
                →
            </div>
        </button>
    );
}

export default function WalletPicker({ open, onClose }) {
    const { nearNetworkId, status, connectHot, connectMyNear } = useWalletStore();
    const [busy, setBusy] = useState(false);

    const isTestnet = nearNetworkId === 'testnet';
    const isTg = isTelegramWebApp();

    const subtitle = useMemo(() => {
        return isTestnet
            ? "Testnet • подключение и тестовые NFT"
            : "Mainnet • реальные NFT/NEAR";
    }, [isTestnet]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e) => e.key === "Escape" && onClose?.();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const haptic = (kind = "light") => {
        try {
            window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(kind);
        } catch { }
    };

    const onConnectHot = async () => {
        haptic("light");
        setBusy(true);
        try {
            await connectHot();
            onClose?.();
        } catch (err) {
            // Error handled in store
        } finally {
            setBusy(false);
        }
    };

    const onConnectMyNear = async () => {
        haptic("light");

        // ВАЖНО: закрываем drawer ДО показа MyNearWallet modal
        onClose?.();

        setBusy(true);
        try {
            await connectMyNear();
        } catch (err) {
            // Error handled in store
        } finally {
            setBusy(false);
        }
    };

    return (
        <AnimatePresence>
            {open ? (
                <motion.div
                    key="overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: "fixed",
                        inset: 0,
                        zIndex: 26000,
                        background:
                            "radial-gradient(120% 120% at 25% 18%, rgba(120,200,255,0.16) 0%, rgba(0,0,0,0) 62%)," +
                            "radial-gradient(120% 120% at 78% 86%, rgba(255,61,242,0.12) 0%, rgba(0,0,0,0) 62%)," +
                            "rgba(0,0,0,0.78)",
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "center",
                        padding: 12,
                    }}
                    onClick={() => {
                        haptic("light");
                        onClose?.();
                    }}
                >
                    <motion.div
                        key="sheet"
                        initial={{ y: 26, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 26, opacity: 0 }}
                        transition={{ type: "spring", damping: 22, stiffness: 260 }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(720px, 96vw)",
                            borderRadius: 26,
                            border: "1px solid rgba(255,255,255,0.14)",
                            background:
                                "radial-gradient(140% 140% at 10% 0%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 55%)," +
                                "rgba(10,10,14,0.95)",
                            color: "#fff",
                            padding: 14,
                            boxShadow: "0 30px 120px rgba(0,0,0,0.78)",
                            backdropFilter: "blur(18px)",
                            WebkitBackdropFilter: "blur(18px)",
                        }}
                    >
                        {/* handle */}
                        <div style={{ display: "flex", justifyContent: "center", paddingTop: 2, paddingBottom: 10 }}>
                            <div
                                style={{
                                    width: 56,
                                    height: 5,
                                    borderRadius: 999,
                                    background: "rgba(255,255,255,0.18)",
                                }}
                            />
                        </div>

                        {/* header */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 950, fontSize: 16, letterSpacing: 0.2 }}>
                                    Подключить кошелёк
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>
                                    {subtitle} • network:{" "}
                                    <span style={{ fontFamily: "monospace" }}>{nearNetworkId}</span>
                                    {!isTg && <span style={{ color: "#f88" }}> • (не Telegram)</span>}
                                </div>
                            </div>

                            <button
                                onClick={() => {
                                    haptic("light");
                                    onClose?.();
                                }}
                                style={{
                                    padding: "10px 12px",
                                    borderRadius: 14,
                                    background: "rgba(255,255,255,0.08)",
                                    border: "1px solid rgba(255,255,255,0.12)",
                                    color: "#fff",
                                    fontWeight: 950,
                                    cursor: "pointer",
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* wallets */}
                        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                            {/* HOT Wallet */}
                            <WalletTile
                                title="HOT Wallet (Telegram)"
                                subtitle={
                                    !isTg
                                        ? "⚠️ Работает только в Telegram WebApp. Откройте игру через бота или используйте MyNearWallet."
                                        : isTestnet
                                            ? "⚠️ Создаст mainnet аккаунт (HOT не поддерживает testnet). Для testnet используйте MyNearWallet."
                                            : "Откроет mini app @herewalletbot поверх игры. Лучший вариант для Telegram."
                                }
                                icon={`/ui/wallets/hotwallet.svg?v=${ICON_V}`}
                                tag={!isTg ? "TG ONLY" : isTestnet ? "MAINNET ONLY" : "RECOMMENDED"}
                                disabled={busy || !isTg}
                                warning={!isTg || isTestnet}
                                onClick={onConnectHot}
                            />

                            {/* MyNearWallet */}
                            <WalletTile
                                title="MyNearWallet"
                                subtitle={
                                    isTestnet
                                        ? "Откроется в новой вкладке. Поддерживает testnet. Рекомендуется для тестирования."
                                        : "Откроется в новой вкладке. Для mainnet в Telegram рекомендуем HOT Wallet."
                                }
                                icon={`/ui/wallets/mynear.svg?v=${ICON_V}`}
                                tag={isTestnet ? "TESTNET OK" : null}
                                disabled={busy}
                                onClick={onConnectMyNear}
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
                                        wordBreak: "break-word",
                                    }}
                                >
                                    {status}
                                </div>
                            ) : null}

                            <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.35 }}>
                                {isTg
                                    ? "После подключения вернитесь в эту вкладку — аккаунт и баланс подтянутся автоматически."
                                    : "HOT Wallet недоступен в браузере. Используйте MyNearWallet или откройте игру в Telegram."}
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            ) : null}
        </AnimatePresence>
    );
}