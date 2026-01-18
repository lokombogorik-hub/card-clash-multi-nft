const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function joinUrl(base, path) {
    const b = (base || "").replace(/\/+$/, "");
    const p = (path || "").startsWith("/") ? path : `/${path}`;
    return b ? `${b}${p}` : p;
}

async function safeReadText(res) {
    try {
        return await res.text();
    } catch {
        return "";
    }
}

export async function apiFetch(path, opts = {}) {
    const { method = "GET", body, token, headers = {} } = opts;

    const url = joinUrl(API_BASE, path);

    const h = { ...headers };
    if (body != null && !("Content-Type" in h)) h["Content-Type"] = "application/json";
    if (token) h["Authorization"] = `Bearer ${token}`;

    let res;
    try {
        res = await fetch(url, {
            method,
            headers: h,
            body,
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
        });
    } catch (e) {
        throw new Error(`Failed to fetch ${url} (network/CORS). ${String(e?.message || e)}`);
    }

    if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} on ${url}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();

    const text = await safeReadText(res);
    return text;
}