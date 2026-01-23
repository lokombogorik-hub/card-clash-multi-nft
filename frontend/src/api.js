const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function getStoredToken() {
    try {
        return (
            localStorage.getItem("token") ||
            localStorage.getItem("accessToken") ||
            localStorage.getItem("access_token") ||
            ""
        );
    } catch {
        return "";
    }
}

function getNearAccountId() {
    try {
        return localStorage.getItem("cc_near_account_id") || "";
    } catch {
        return "";
    }
}

export async function apiFetch(path, opts = {}) {
    const url = `${API_BASE}${path}`;

    const {
        method = "GET",
        headers = {},
        body,
        token: tokenFromOpts,
    } = opts;

    const token = tokenFromOpts || getStoredToken();
    const nearAccountId = getNearAccountId();

    const finalHeaders = {
        "content-type": "application/json",
        ...headers,
    };

    if (token) {
        finalHeaders.Authorization = `Bearer ${token}`;
    }

    // если подключен near account — автоматически включаем для real NFTs
    if (nearAccountId && !finalHeaders["X-NEAR-ACCOUNT-ID"]) {
        finalHeaders["X-NEAR-ACCOUNT-ID"] = nearAccountId;
    }

    const res = await fetch(url, {
        method,
        headers: finalHeaders,
        body,
    });

    const text = await res.text().catch(() => "");
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = null;
    }

    if (!res.ok) {
        const msg = json?.detail || json?.error || text || `HTTP ${res.status}`;
        throw new Error(`HTTP ${res.status} on ${url}: ${msg}`);
    }

    return json;
}