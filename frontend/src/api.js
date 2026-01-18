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
    const { method = "GET", body, token, headers = {}, __triedRelative = false } = opts;

    const url = __triedRelative ? path : joinUrl(API_BASE, path);

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
        // fallback: если внешний API_BASE недоступен из WebView — пробуем same-origin (через Vercel rewrites)
        if (!__triedRelative && API_BASE) {
            return apiFetch(path, { ...opts, __triedRelative: true });
        }
        throw new Error(`Failed to fetch ${url} (network). ${String(e?.message || e)}`);
    }

    if (!res.ok) {
        const text = await safeReadText(res);
        throw new Error(`HTTP ${res.status} on ${url}${text ? `: ${text.slice(0, 300)}` : ""}`);
    }

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();

    return await safeReadText(res);
}