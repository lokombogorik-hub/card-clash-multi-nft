import { useEffect, useState } from "react";
import { apiFetch } from "../api";

export default function Profile({ token }) {
    const [data, setData] = useState(null);

    useEffect(() => {
        if (!token) return;
        apiFetch("/api/users/me", { token }).then(setData).catch(console.error);
    }, [token]);

    return (
        <div className="page">
            <h2>Профиль</h2>
            {!token && <div style={{ opacity: 0.75 }}>Ожидание авторизации…</div>}
            {token && !data && <div style={{ opacity: 0.75 }}>Загрузка…</div>}
            {data && (
                <pre style={{ fontSize: 12, opacity: 0.9, whiteSpace: "pre-wrap" }}>
                    {JSON.stringify(data, null, 2)}
                </pre>
            )}
            <div style={{ opacity: 0.8, fontSize: 12 }}>
                (На ЭТАПЕ 2 сюда добавим привязку NEAR кошелька, статистику и историю матчей.)
            </div>
        </div>
    );
}