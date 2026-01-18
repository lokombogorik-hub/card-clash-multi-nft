export async function apiFetch(path, opts = {}) {
    const {
        method = "GET",
        body,
        token,
        headers = {},
    } = opts;

    const res = await fetch(path, {
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

    if (!res.ok) {
        const msg = typeof data === "string" ? data : JSON.stringify(data);
        throw new Error(`${res.status} ${res.statusText}: ${msg}`);
    }

    return data;
}