import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

function nftKey(n) {
    if (n.key) return n.key;
    if (n.chain && n.contractId && n.tokenId) return `${n.chain}:${n.contractId}:${n.tokenId}`;
    if (n.contract_id && n.token_id) return `near:${n.contract_id}:${n.token_id}`;
    return `${n.chain || "mock"}:${n.contractId || "x"}:${n.tokenId || "0"}`;
}

export default function Inventory({ token, onDeckReady }) {
    const [loading, setLoading] = useState(false);
    const [nfts, setNfts] = useState([]);
    const [selected, setSelected] = useState(() => new Set());
    const [error, setError] = useState("");

    const selectedArr = useMemo(() => Array.from(selected), [selected]);

    useEffect(() => {
        if (!token) return;

        let alive = true;
        (async () => {
            setLoading(true);
            setError("");

            try {
                const [inv, deck] = await Promise.all([
                    apiFetch("/api/nfts/my", { token }),
                    apiFetch("/api/decks/active", { token }),
                ]);

                if (!alive) return;
                setNfts(inv.items || []);
                setSelected(new Set((deck.cards || []).slice(0, 5)));
            } catch (e) {
                if (!alive) return;
                setError(e.message);
            } finally {
                if (!alive) return;
                setLoading(false);
            }
        })();

        return () => {
            alive = false;
        };
    }, [token]);

    const toggle = (k) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(k)) next.delete(k);
            else {
                if (next.size >= 5) return next;
                next.add(k);
            }
            return next;
        });
    };

    const clear = () => setSelected(new Set());

    const saveDeck = async () => {
        try {
            if (selected.size !== 5) return;
            await apiFetch("/api/decks/active", {
                token,
                method: "PUT",
                body: JSON.stringify({ cards: selectedArr }),
            });
            onDeckReady?.();
        } catch (e) {
            setError(e.message);
        }
    };

    return (
        <div className="page">
            <h2>Инвентарь</h2>

            <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 10 }}>
                Выбери 5 NFT-карт для колоды ({selected.size}/5)
            </div>

            {error && <div style={{ color: "#ff9aa9", marginBottom: 10 }}>{error}</div>}
            {!token && <div style={{ opacity: 0.75 }}>Ожидание авторизации Telegram…</div>}
            {loading && <div style={{ opacity: 0.75 }}>Загрузка NFT…</div>}

            <div style={{ marginBottom: 10, opacity: 0.8, fontSize: 12 }}>
                Выбрано: {selectedArr.length ? selectedArr.join(", ") : "—"}
            </div>

            <div className="inv-grid">
                {nfts.map((n) => {
                    const k = nftKey(n);
                    const isSel = selected.has(k);

                    return (
                        <button
                            key={k}
                            onClick={() => toggle(k)}
                            className={`inv-card ${isSel ? "is-selected" : ""}`}
                            title={k}
                        >
                            <div className="inv-top">
                                <div className="inv-elem">{n.elementIcon || "?"}</div>
                                <div className="inv-meta">
                                    <div className="inv-name">{n.name || `#${n.tokenId || n.token_id}`}</div>
                                    <div className="inv-sub">
                                        {(n.element || "—")} • {(n.rank || "—")}
                                    </div>
                                </div>
                            </div>

                            <div className="inv-stats">
                                <div>↑ {n.stats?.top ?? "-"}</div>
                                <div style={{ textAlign: "right" }}>→ {n.stats?.right ?? "-"}</div>
                                <div>← {n.stats?.left ?? "-"}</div>
                                <div style={{ textAlign: "right" }}>↓ {n.stats?.bottom ?? "-"}</div>
                            </div>

                            <div className="inv-hint">{isSel ? "В колоде" : "Нажми, чтобы добавить"}</div>
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button onClick={clear} disabled={!selected.size}>
                    Очистить
                </button>
                <button disabled={selected.size !== 5} onClick={saveDeck}>
                    Сохранить колоду
                </button>
                <div style={{ opacity: 0.7, fontSize: 12 }}>После сохранения можно нажимать Play.</div>
            </div>
        </div>
    );
}