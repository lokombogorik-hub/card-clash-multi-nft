var DIRECT_RPC_URL = "https://rpc.mainnet.near.org";
var API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";
var PROXY_RPC_URL = API_BASE ? API_BASE + "/api/near/rpc" : "";

var IPFS_GATEWAYS = [
    function (cid, path) { return "https://" + cid + ".ipfs.w3s.link" + path; },
    function (cid, path) { return "https://cloudflare-ipfs.com/ipfs/" + cid + path; },
    function (cid, path) { return "https://nftstorage.link/ipfs/" + cid + path; },
    function (cid, path) { return "https://ipfs.near.social/ipfs/" + cid + path; },
    function (cid, path) { return "https://w3s.link/ipfs/" + cid + path; },
    function (cid, path) { return "https://gateway.pinata.cloud/ipfs/" + cid + path; },
    function (cid, path) { return "https://" + cid + ".ipfs.dweb.link" + path; },
    function (cid, path) { return "https://ipfs.io/ipfs/" + cid + path; },
];

export var GATEWAY_COUNT = IPFS_GATEWAYS.length;

function toB64(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { return btoa(str); }
}

function fixProto(url) {
    if (!url) return "";
    var s = String(url).trim();
    if (s.startsWith("ipfs://")) return "https://ipfs.near.social/ipfs/" + s.slice(7);
    if (s.startsWith("ar://")) return "https://arweave.net/" + s.slice(5);
    return s;
}

function join(base, path) {
    if (!path) return "";
    var p = fixProto(String(path).trim());
    if (!p) return "";
    if (p.startsWith("http") || p.startsWith("data:") || p.startsWith("blob:")) return p;
    if (!base) return p;
    var b = fixProto(String(base).trim());
    if (!b) return p;
    if (!b.endsWith("/")) b += "/";
    return b + p.replace(/^\//, "");
}

async function getJson(url) {
    if (!url) return null;
    try {
        var r = await fetch(url, { signal: AbortSignal.timeout ? AbortSignal.timeout(5000) : undefined });
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

// PATCH: fetch с таймаутом — на мобилке запросы зависают без таймаута
function fetchWithTimeout(url, opts, ms) {
    ms = ms || 8000;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, ms) : null;
    var finalOpts = controller
        ? Object.assign({}, opts, { signal: controller.signal })
        : opts;
    return fetch(url, finalOpts).finally(function () {
        if (timer) clearTimeout(timer);
    });
}

// PATCH: RPC кэш — не делаем одинаковые запросы повторно
// nft_tokens_for_owner: 30s TTL
// nft_metadata: 5min TTL
// nft_supply_for_owner: 30s TTL
var _rpcCache = new Map();

function _cacheKey(contractId, method, args) {
    return contractId + "|" + method + "|" + JSON.stringify(args || {});
}

function _cacheGet(key, maxAgeMs) {
    var entry = _rpcCache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > maxAgeMs) { _rpcCache.delete(key); return undefined; }
    return entry.value;
}

function _cacheSet(key, value) {
    _rpcCache.set(key, { value: value, ts: Date.now() });
    // LRU: удаляем самые старые если кэш > 300 записей
    if (_rpcCache.size > 300) {
        _rpcCache.delete(_rpcCache.keys().next().value);
    }
}

async function rpc(contractId, method, args, cacheMaxAgeMs) {
    var key = _cacheKey(contractId, method, args);
    if (cacheMaxAgeMs) {
        var cached = _cacheGet(key, cacheMaxAgeMs);
        if (cached !== undefined) return cached;
    }

    var payload = {
        jsonrpc: "2.0", id: "q", method: "query",
        params: {
            request_type: "call_function", finality: "final",
            account_id: contractId, method_name: method,
            args_base64: toB64(JSON.stringify(args || {})),
        },
    };

    var result = null;

    // Прокси (быстрее на мобилке — обходит CORS и медленный DNS)
    if (PROXY_RPC_URL) {
        try {
            var pr = await fetchWithTimeout(PROXY_RPC_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }, 6000);
            if (pr.ok) {
                var pj = await pr.json();
                if (!pj.error && pj.result?.result) {
                    result = JSON.parse(new TextDecoder().decode(new Uint8Array(pj.result.result)));
                }
            }
        } catch (e) {
            console.warn("[nearNft] proxy RPC failed:", method, e?.message);
        }
    }

    // Прямой RPC
    if (result === null) {
        var dr = await fetchWithTimeout(DIRECT_RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        }, 8000);
        var dj = await dr.json();
        if (dj.error) throw new Error(dj.error.message || "RPC error: " + method);
        result = JSON.parse(new TextDecoder().decode(new Uint8Array(dj.result.result)));
    }

    if (cacheMaxAgeMs && result !== null) _cacheSet(key, result);
    return result;
}

export function parseIpfs(url) {
    if (!url) return null;
    var s = String(url).trim();
    if (s.startsWith("ipfs://")) {
        var rest = s.slice(7);
        var idx = rest.indexOf("/");
        if (idx >= 0) return { cid: rest.substring(0, idx), path: rest.substring(idx) };
        return { cid: rest, path: "" };
    }
    var sub = s.match(/^https?:\/\/([a-zA-Z0-9]{20,})\.ipfs\.[^/]+(\/.*)?$/);
    if (sub) return { cid: sub[1], path: sub[2] || "" };
    var path = s.match(/\/ipfs\/([a-zA-Z0-9]{20,})(\/.*)?/);
    if (path) return { cid: path[1], path: path[2] || "" };
    return null;
}

export function isIpfsUrl(url) { return parseIpfs(url) !== null; }

export function ipfsGatewayUrl(url, idx) {
    var p = parseIpfs(url);
    if (!p) return url || "";
    return IPFS_GATEWAYS[(idx || 0) % IPFS_GATEWAYS.length](p.cid, p.path);
}

export function proxyImageUrl(url) {
    if (!url || !API_BASE) return url || "";
    return API_BASE + "/api/proxy/image?url=" + encodeURIComponent(url);
}

var _imageCache = new Map();

function resolveMediaUrl(media, original) {
    if (!media) return { display: "", original: "" };
    var k = original || media;
    if (_imageCache.has(k)) return _imageCache.get(k);
    var r;
    if (isIpfsUrl(original || media)) {
        r = { display: ipfsGatewayUrl(original || media, 0), original: original || media };
    } else if (media && !media.startsWith("http") && API_BASE) {
        r = { display: proxyImageUrl(media), original: original || media };
    } else {
        r = { display: media, original: original || media };
    }
    _imageCache.set(k, r);
    return r;
}

// PATCH: Кэш NFT токенов владельца — 30 секунд.
// До этого каждый вызов nearNftTokensForOwner делал 3-5 RPC запросов (~3-8s на мобилке).
// С кэшем повторные вызовы в течение 30s мгновенные.
// LockEscrowModal вызывает эту функцию при каждой попытке лока — кэш критичен.
var _ownerCache = new Map();
var OWNER_CACHE_TTL = 30000;

export async function nearNftTokensForOwner(contractId, accountId) {
    var cacheKey = contractId + ":" + accountId;
    var cached = _ownerCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < OWNER_CACHE_TTL) {
        console.warn("[nearNft] cache HIT:", accountId, "count=", cached.tokens.length,
            "age=", Math.round((Date.now() - cached.ts) / 1000) + "s");
        return cached.tokens;
    }

    console.warn("[nearNft] fetching tokens for:", accountId, "contract:", contractId);
    var debugLog = [];

    // nft_metadata — кэш 5 минут
    var cBaseUri = "", cIcon = "";
    try {
        var cm = await rpc(contractId, "nft_metadata", {}, 300000);
        cBaseUri = cm.base_uri || "";
        cIcon = cm.icon || "";
        debugLog.push("name=" + (cm.name || "?"));
    } catch (e) { debugLog.push("metadata_err=" + e.message); }

    var all = [];
    var numericIdx = false;

    // Попытка 1: from_index как строка
    try {
        var b1 = await rpc(contractId, "nft_tokens_for_owner",
            { account_id: accountId, from_index: "0", limit: 100 }, 30000);
        if (Array.isArray(b1)) { all = b1; debugLog.push("str_idx=" + b1.length); }
    } catch (e) {
        debugLog.push("str_err=" + e.message);
        numericIdx = true;
        // Попытка 2: from_index как число
        try {
            var b2 = await rpc(contractId, "nft_tokens_for_owner",
                { account_id: accountId, from_index: 0, limit: 100 }, 30000);
            if (Array.isArray(b2)) { all = b2; debugLog.push("num_idx=" + b2.length); }
        } catch (e2) { debugLog.push("num_err=" + e2.message); }
    }

    // Пагинация
    if (all.length === 100) {
        for (var pg = 1; pg < 50; pg++) {
            try {
                var from = numericIdx ? all.length : String(all.length);
                var batch = await rpc(contractId, "nft_tokens_for_owner",
                    { account_id: accountId, from_index: from, limit: 100 }, 30000);
                if (!Array.isArray(batch) || batch.length === 0) break;
                all = all.concat(batch);
                if (batch.length < 100) break;
            } catch (e) { debugLog.push("pg" + pg + "_err=" + e.message); break; }
        }
    }

    // Fallback: без from_index
    if (all.length === 0) {
        try {
            var fb = await rpc(contractId, "nft_tokens_for_owner",
                { account_id: accountId, limit: 500 }, 30000);
            if (Array.isArray(fb) && fb.length > 0) { all = fb; debugLog.push("fb=" + fb.length); }
        } catch (e) { debugLog.push("fb_err=" + e.message); }
    }

    // Дедупликация
    var seen = Object.create(null);
    all = all.filter(function (t) {
        if (seen[t.token_id]) return false;
        seen[t.token_id] = true;
        return true;
    });

    // Supply check
    try {
        var supply = await rpc(contractId, "nft_supply_for_owner",
            { account_id: accountId }, 30000);
        var expected = parseInt(supply, 10) || 0;
        debugLog.push("supply=" + expected + "/got=" + all.length);
        if (expected > all.length && expected <= 500) {
            try {
                var big = await rpc(contractId, "nft_tokens_for_owner",
                    { account_id: accountId, limit: expected + 10 }, 30000);
                if (Array.isArray(big) && big.length > all.length) {
                    all = big;
                    debugLog.push("big_batch=" + big.length);
                }
            } catch (e) { debugLog.push("big_err=" + e.message); }
        }
    } catch (e) { debugLog.push("supply_err=" + e.message); }

    debugLog.push("total=" + all.length);
    console.warn("[nearNft] tokens fetched:", accountId, debugLog.join(", "));

    // Обрабатываем параллельно
    var out = await Promise.all(all.map(async function (t) {
        var md = t.metadata || {};
        var bUri = md.base_uri || cBaseUri || "";
        var media = "", title = md.title || md.name || "", desc = md.description || "", extra = md.extra || null;

        if (md.media) media = join(bUri, md.media);

        if (!media && md.reference && md.reference !== "NO_REF") {
            var refUrl = join(bUri, md.reference);
            var rj = await getJson(refUrl);
            if (rj) {
                media = join(bUri, rj.media || rj.image || rj.animation_url || rj.icon || "");
                if (!title) title = rj.title || rj.name || "";
                if (!desc) desc = rj.description || "";
                if (!extra) extra = rj.extra || null;
            }
        }

        if (!media && cIcon && cIcon.startsWith("data:")) media = cIcon;
        if (!media && bUri) media = join(bUri, t.token_id);

        var orig = media;
        var resolved = resolveMediaUrl(media, orig);

        return {
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: {
                title: title || ("Card #" + t.token_id),
                description: desc,
                media: resolved.display,
                originalMedia: resolved.original,
                extra: extra,
            },
        };
    }));

    // Сохраняем в кэш
    _ownerCache.set(cacheKey, { tokens: out, ts: Date.now() });

    out._debug = debugLog;
    return out;
}

// PATCH: Инвалидация кэша — вызывать после успешного lock NFT
export function invalidateOwnerCache(contractId, accountId) {
    var k = contractId + ":" + accountId;
    _ownerCache.delete(k);
    // Чистим RPC кэш связанный с этим accountId
    for (var key of Array.from(_rpcCache.keys())) {
        if (key.includes(accountId)) _rpcCache.delete(key);
    }
    console.warn("[nearNft] invalidateOwnerCache:", k);
}