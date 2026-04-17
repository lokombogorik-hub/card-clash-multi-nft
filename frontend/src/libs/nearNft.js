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
        var r = await fetch(url);
        if (!r.ok) return null;
        return await r.json();
    } catch (e) { return null; }
}

// PATCH: RPC с таймаутом — на мобилке запросы могут висеть вечно
async function fetchWithTimeout(url, opts, timeoutMs) {
    var ms = timeoutMs || 8000;
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller
        ? setTimeout(function () { controller.abort(); }, ms)
        : null;
    try {
        var res = await fetch(url, Object.assign({}, opts, controller ? { signal: controller.signal } : {}));
        return res;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// PATCH: RPC кэш — не делаем повторные запросы для одинаковых вызовов.
// nft_tokens_for_owner кэшируется на 30 секунд.
// nft_metadata кэшируется на 5 минут (меняется редко).
var _rpcCache = new Map();

function _rpcCacheKey(contractId, method, args) {
    return contractId + ":" + method + ":" + JSON.stringify(args || {});
}

function _rpcCacheGet(key, maxAgeMs) {
    var entry = _rpcCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > maxAgeMs) {
        _rpcCache.delete(key);
        return null;
    }
    return entry.value;
}

function _rpcCacheSet(key, value) {
    _rpcCache.set(key, { value: value, ts: Date.now() });
    // Не даём кэшу расти бесконечно
    if (_rpcCache.size > 200) {
        var firstKey = _rpcCache.keys().next().value;
        _rpcCache.delete(firstKey);
    }
}

async function rpc(contractId, method, args, opts) {
    var cacheMaxAge = (opts && opts.cacheMaxAge) || 0;
    var cacheKey = _rpcCacheKey(contractId, method, args);

    // PATCH: Проверяем кэш
    if (cacheMaxAge > 0) {
        var cached = _rpcCacheGet(cacheKey, cacheMaxAge);
        if (cached !== null) {
            return cached;
        }
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

    // PATCH: Сначала через бэкенд прокси (с таймаутом 6s)
    if (PROXY_RPC_URL) {
        try {
            var proxyRes = await fetchWithTimeout(PROXY_RPC_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            }, 6000);
            if (proxyRes.ok) {
                var proxyJ = await proxyRes.json();
                if (!proxyJ.error && proxyJ.result && proxyJ.result.result) {
                    result = JSON.parse(new TextDecoder().decode(new Uint8Array(proxyJ.result.result)));
                }
            }
        } catch (e) {
            console.warn("[nearNft] proxy RPC failed:", e?.message, "— falling back to direct");
        }
    }

    // PATCH: Прямой RPC (с таймаутом 8s)
    if (result === null) {
        var res = await fetchWithTimeout(DIRECT_RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
        }, 8000);
        var j = await res.json();
        if (j.error) throw new Error(j.error.message || "RPC err");
        result = JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
    }

    // PATCH: Сохраняем в кэш
    if (cacheMaxAge > 0 && result !== null) {
        _rpcCacheSet(cacheKey, result);
    }

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
    var subMatch = s.match(/^https?:\/\/([a-zA-Z0-9]{20,})\.ipfs\.[^/]+(\/.*)?$/);
    if (subMatch) return { cid: subMatch[1], path: subMatch[2] || "" };
    var pathMatch = s.match(/\/ipfs\/([a-zA-Z0-9]{20,})(\/.*)?/);
    if (pathMatch) return { cid: pathMatch[1], path: pathMatch[2] || "" };
    return null;
}

export function isIpfsUrl(url) {
    return parseIpfs(url) !== null;
}

export function ipfsGatewayUrl(originalUrl, gatewayIndex) {
    var parsed = parseIpfs(originalUrl);
    if (!parsed) return originalUrl || "";
    var gi = (gatewayIndex || 0) % IPFS_GATEWAYS.length;
    return IPFS_GATEWAYS[gi](parsed.cid, parsed.path);
}

export function proxyImageUrl(originalUrl) {
    if (!originalUrl) return "";
    if (!API_BASE) return originalUrl;
    return API_BASE + "/api/proxy/image?url=" + encodeURIComponent(originalUrl);
}

var resolvedImageCache = new Map();

function resolveMediaUrl(media, originalMedia) {
    if (!media) return { display: "", original: "" };
    var cacheKey = originalMedia || media;
    if (resolvedImageCache.has(cacheKey)) return resolvedImageCache.get(cacheKey);
    var result;
    if (isIpfsUrl(originalMedia || media)) {
        var directUrl = ipfsGatewayUrl(originalMedia || media, 0);
        result = { display: directUrl, original: originalMedia || media };
    } else if (media && !media.startsWith("http") && API_BASE) {
        result = { display: proxyImageUrl(media), original: originalMedia || media };
    } else {
        result = { display: media, original: originalMedia || media };
    }
    resolvedImageCache.set(cacheKey, result);
    return result;
}

// PATCH: Кэш для nearNftTokensForOwner — 30 секунд.
// Основная причина медленного лока на мобилке:
// LockEscrowModal вызывал nearNftTokensForOwner при каждой попытке,
// каждый раз делая 3-5 RPC запросов (~3-8 секунд на мобилке).
// С кэшем второй и последующие вызовы мгновенные.
var _ownerTokensCache = new Map();
var OWNER_CACHE_TTL_MS = 30000; // 30 секунд

export async function nearNftTokensForOwner(contractId, accountId) {
    // PATCH: Проверяем кэш владельца
    var ownerCacheKey = contractId + ":" + accountId;
    var ownerCached = _ownerTokensCache.get(ownerCacheKey);
    if (ownerCached && (Date.now() - ownerCached.ts) < OWNER_CACHE_TTL_MS) {
        console.warn("[nearNft] nearNftTokensForOwner: cache hit for", accountId,
            "count=", ownerCached.tokens.length,
            "age=", Math.round((Date.now() - ownerCached.ts) / 1000) + "s"
        );
        return ownerCached.tokens;
    }

    var debugLog = [];

    // PATCH: nft_metadata кэшируем 5 минут — меняется крайне редко
    var cBaseUri = "";
    var cIcon = "";
    try {
        var cm = await rpc(contractId, "nft_metadata", {}, { cacheMaxAge: 300000 });
        cBaseUri = cm.base_uri || "";
        cIcon = cm.icon || "";
        debugLog.push("contract_base_uri=" + (cBaseUri || "(empty)"));
        debugLog.push("contract_name=" + (cm.name || "?"));
    } catch (e) {
        debugLog.push("nft_metadata_error=" + e.message);
    }

    var all = [];
    var useNumericIndex = false;

    // PATCH: Запрос токенов — кэшируем 30 секунд
    try {
        var firstBatch = await rpc(contractId, "nft_tokens_for_owner", {
            account_id: accountId,
            from_index: "0",
            limit: 100,
        }, { cacheMaxAge: 30000 });
        if (Array.isArray(firstBatch)) {
            all = firstBatch;
            debugLog.push("first_batch_string_idx=" + firstBatch.length);
        }
    } catch (e) {
        debugLog.push("string_idx_error=" + e.message);
        useNumericIndex = true;
        try {
            var firstBatch2 = await rpc(contractId, "nft_tokens_for_owner", {
                account_id: accountId,
                from_index: 0,
                limit: 100,
            }, { cacheMaxAge: 30000 });
            if (Array.isArray(firstBatch2)) {
                all = firstBatch2;
                debugLog.push("first_batch_numeric_idx=" + firstBatch2.length);
            }
        } catch (e2) {
            debugLog.push("numeric_idx_error=" + e2.message);
        }
    }

    if (all.length === 100) {
        for (var pg = 1; pg < 50; pg++) {
            try {
                var fromIdx = useNumericIndex ? all.length : String(all.length);
                var batch = await rpc(contractId, "nft_tokens_for_owner", {
                    account_id: accountId,
                    from_index: fromIdx,
                    limit: 100,
                }, { cacheMaxAge: 30000 });
                if (!Array.isArray(batch) || batch.length === 0) break;
                all = all.concat(batch);
                if (batch.length < 100) break;
            } catch (e) {
                debugLog.push("pagination_error_pg" + pg + "=" + e.message);
                break;
            }
        }
    }

    if (all.length === 0) {
        try {
            var noIdx = await rpc(contractId, "nft_tokens_for_owner", {
                account_id: accountId,
                limit: 500,
            }, { cacheMaxAge: 30000 });
            if (Array.isArray(noIdx) && noIdx.length > 0) {
                all = noIdx;
                debugLog.push("no_index_fallback=" + noIdx.length);
            }
        } catch (e) {
            debugLog.push("no_index_error=" + e.message);
        }
    }

    // Дедупликация
    var seen = {};
    var deduped = [];
    for (var d = 0; d < all.length; d++) {
        var tid = all[d].token_id;
        if (!seen[tid]) { seen[tid] = true; deduped.push(all[d]); }
    }
    all = deduped;

    // PATCH: nft_supply_for_owner — тоже кэшируем
    try {
        var supply = await rpc(contractId, "nft_supply_for_owner",
            { account_id: accountId },
            { cacheMaxAge: 30000 }
        );
        var expectedCount = parseInt(supply, 10) || 0;
        debugLog.push("expected_supply=" + expectedCount);
        if (expectedCount > all.length) {
            debugLog.push("WARNING: expected " + expectedCount + " but got " + all.length);
            if (expectedCount <= 500) {
                try {
                    var bigBatch = await rpc(contractId, "nft_tokens_for_owner", {
                        account_id: accountId,
                        limit: expectedCount + 10,
                    }, { cacheMaxAge: 30000 });
                    if (Array.isArray(bigBatch) && bigBatch.length > all.length) {
                        all = bigBatch;
                        debugLog.push("big_batch_retry=" + bigBatch.length);
                    }
                } catch (e) {
                    debugLog.push("big_batch_error=" + e.message);
                }
            }
        }
    } catch (e) {
        debugLog.push("supply_check_error=" + e.message);
    }

    debugLog.push("total_tokens=" + all.length);
    console.warn("[nearNft] nearNftTokensForOwner:", accountId, "tokens:", all.length, debugLog);

    // Обрабатываем токены параллельно
    var out = await Promise.all(all.map(async function (t) {
        var md = t.metadata || {};
        var bUri = md.base_uri || cBaseUri || "";
        var media = "";
        var title = md.title || md.name || "";
        var desc = md.description || "";
        var extra = md.extra || null;

        if (md.media) {
            media = join(bUri, md.media);
        }

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

        if (!media && cIcon && cIcon.startsWith("data:")) {
            media = cIcon;
        }

        if (!media && bUri) {
            media = join(bUri, t.token_id);
        }

        var originalMedia = media;
        var resolved = resolveMediaUrl(media, originalMedia);
        media = resolved.display;
        originalMedia = resolved.original;

        return {
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: {
                title: title || ("Card #" + t.token_id),
                description: desc,
                media: media,
                originalMedia: originalMedia,
                extra: extra,
            },
        };
    }));

    // PATCH: Сохраняем в кэш владельца
    _ownerTokensCache.set(ownerCacheKey, { tokens: out, ts: Date.now() });

    out._debug = debugLog;
    return out;
}

// PATCH: Функция для инвалидации кэша владельца.
// Вызывать после успешного lock — чтобы при следующей проверке
// не показывало устаревшие данные.
export function invalidateOwnerCache(contractId, accountId) {
    var key = contractId + ":" + accountId;
    _ownerTokensCache.delete(key);
    // Также чистим RPC кэш для этого владельца
    for (var k of _rpcCache.keys()) {
        if (k.includes(accountId)) {
            _rpcCache.delete(k);
        }
    }
    console.warn("[nearNft] invalidateOwnerCache:", key);
}