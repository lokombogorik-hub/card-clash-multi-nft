const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function apiFetch(path, opts = {}) {
    const { method = "GET", body, token, headers = {} } = opts;

    const url = API_BASE ? `${API_BASE}${path}` : path;

    const res = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers,
        },
        body,
    });

    const text = await res.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = text;
    }

    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${text}`);
    return data;
}