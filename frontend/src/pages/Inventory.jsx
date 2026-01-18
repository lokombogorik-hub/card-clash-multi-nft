import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../api";

function nftKey(n) {
    return `${n.chain}:${n.contractId}:${n.tokenId}`;
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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10 }}>
                {nfts.map((n) => {
                    const k = nftKey(n);
                    const isSel = selected.has(k);
                    return (
                        <button
                            key={k}
                            onClick={() => toggle(k)}
                            className={`nav-item ${isSel ? "active" : ""}`}
                            style={{ padding: 8, textAlign: "left", borderRadius: 14 }}
                        >
                            <div style={{ fontWeight: 900, fontSize: 12 }}>{n.name || `#${n.tokenId}`}</div>
                            <div style={{ opacity: 0.9, fontSize: 12, marginTop: 4 }}>
                                {n.elementIcon} {n.element} • {n.rank}
                            </div>
                            <div style={{ opacity: 0.8, fontSize: 12, marginTop: 6 }}>
                                {n.stats.top}/{n.stats.right}/{n.stats.bottom}/{n.stats.left}
                            </div>
                        </button>
                    );
                })}
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
                <button disabled={selected.size !== 5} onClick={saveDeck}>
                    Сохранить колоду
                </button>
                <div style={{ opacity: 0.7, fontSize: 12 }}>
                    После сохранения можно нажимать Play.
                </div>
            </div>
        </div>
    );
}