var RPC_URL = "https://rpc.mainnet.near.org";

var API_BASE = (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) || "";

var IPFS_GATEWAYS = [
    function (cid, path) { return "https://ipfs.near.social/ipfs/" + cid + path; },
    function (cid, path) { return "https://cloudflare-ipfs.com/ipfs/" + cid + path; },
    function (cid, path) { return "https://nftstorage.link/ipfs/" + cid + path; },
    function (cid, path) { return "https://" + cid + ".ipfs.dweb.link" + path; },
    function (cid, path) { return "https://gateway.pinata.cloud/ipfs/" + cid + path; },
    function (cid, path) { return "https://" + cid + ".ipfs.w3s.link" + path; },
    function (cid, path) { return "https://w3s.link/ipfs/" + cid + path; },
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

async function rpc(contractId, method, args) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: "q", method: "query",
            params: {
                request_type: "call_function", finality: "final",
                account_id: contractId, method_name: method,
                args_base64: toB64(JSON.stringify(args || {})),
            },
        }),
    });
    var j = await res.json();
    if (j.error) throw new Error(j.error.message || "RPC err");
    return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
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
    if (subMatch) {
        return { cid: subMatch[1], path: subMatch[2] || "" };
    }

    var pathMatch = s.match(/\/ipfs\/([a-zA-Z0-9]{20,})(\/.*)?/);
    if (pathMatch) {
        return { cid: pathMatch[1], path: pathMatch[2] || "" };
    }

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

/**
 * Build a proxy URL through our backend.
 * NO URL encoding - pass URL as-is for Telegram WebView compatibility.
 */
export function proxyImageUrl(originalUrl) {
    if (!originalUrl) return "";
    if (!API_BASE) return originalUrl;
    // Don't use encodeURIComponent - it breaks in Telegram WebView
    return API_BASE + "/api/proxy/image?url=" + originalUrl;
}

export async function nearNftTokensForOwner(contractId, accountId) {
    var debugLog = [];

    var cBaseUri = "";
    var cIcon = "";
    try {
        var cm = await rpc(contractId, "nft_metadata", {});
        cBaseUri = cm.base_uri || "";
        cIcon = cm.icon || "";
        debugLog.push("contract_base_uri=" + (cBaseUri || "(empty)"));
        debugLog.push("contract_name=" + (cm.name || "?"));
    } catch (e) {
        debugLog.push("nft_metadata_error=" + e.message);
    }

    var all = [];
    var useNumericIndex = false;

    try {
        var firstBatch = await rpc(contractId, "nft_tokens_for_owner", {
            account_id: accountId,
            from_index: "0",
            limit: 100,
        });
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
            });
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
                });
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
            });
            if (Array.isArray(noIdx) && noIdx.length > 0) {
                all = noIdx;
                debugLog.push("no_index_fallback=" + noIdx.length);
            }
        } catch (e) {
            debugLog.push("no_index_error=" + e.message);
        }
    }

    var seen = {};
    var deduped = [];
    for (var d = 0; d < all.length; d++) {
        var tid = all[d].token_id;
        if (!seen[tid]) {
            seen[tid] = true;
            deduped.push(all[d]);
        }
    }
    all = deduped;

    try {
        var supply = await rpc(contractId, "nft_supply_for_owner", { account_id: accountId });
        var expectedCount = parseInt(supply, 10) || 0;
        debugLog.push("expected_supply=" + expectedCount);
        if (expectedCount > all.length) {
            debugLog.push("WARNING: expected " + expectedCount + " but got " + all.length);
            if (expectedCount <= 500) {
                try {
                    var bigBatch = await rpc(contractId, "nft_tokens_for_owner", {
                        account_id: accountId,
                        limit: expectedCount + 10,
                    });
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

    var out = [];
    for (var i = 0; i < all.length; i++) {
        var t = all[i];
        var md = t.metadata || {};
        var bUri = md.base_uri || cBaseUri || "";

        var media = "";
        var title = md.title || md.name || "";
        var desc = md.description || "";
        var extra = md.extra || null;

        if (i < 5) {
            debugLog.push("token_" + t.token_id + "_raw=" + JSON.stringify(md).substring(0, 300));
        }

        if (md.media) {
            media = join(bUri, md.media);
        }

        if (!media && md.reference) {
            var refUrl = join(bUri, md.reference);
            if (i < 5) debugLog.push("token_" + t.token_id + "_refUrl=" + refUrl);
            var rj = await getJson(refUrl);
            if (rj) {
                media = join(bUri, rj.media || rj.image || rj.animation_url || rj.icon || "");
                if (!title) title = rj.title || rj.name || "";
                if (!desc) desc = rj.description || "";
                if (!extra) extra = rj.extra || null;
                if (i < 5) debugLog.push("token_" + t.token_id + "_refMedia=" + (media || "(empty)"));
            } else {
                if (i < 5) debugLog.push("token_" + t.token_id + "_refFailed");
            }
        }

        if (!media && cIcon && cIcon.startsWith("data:")) {
            media = cIcon;
        }

        if (!media && bUri) {
            media = join(bUri, t.token_id);
        }

        var originalMedia = media;

        // Build proxy URL without encoding
        if (media && API_BASE) {
            media = proxyImageUrl(originalMedia);
            if (i < 5) debugLog.push("token_" + t.token_id + "_proxied=" + media);
        } else if (media && isIpfsUrl(media)) {
            var parsed = parseIpfs(media);
            if (parsed) {
                media = IPFS_GATEWAYS[0](parsed.cid, parsed.path);
                if (i < 5) debugLog.push("token_" + t.token_id + "_rewritten=" + media);
            }
        }

        out.push({
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: {
                title: title || ("Card #" + t.token_id),
                description: desc,
                media: media,
                originalMedia: originalMedia,
                extra: extra,
            },
        });
    }

    out._debug = debugLog;
    return out;
}