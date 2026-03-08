var RPC_URL = "https://rpc.mainnet.near.org";

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

/**
 * Parse any IPFS URL format into { cid, path }
 *
 *   ipfs://CID/path
 *   https://CID.ipfs.w3s.link/path          (subdomain)
 *   https://gateway.com/ipfs/CID/path        (path-based)
 *
 * CIDv1 (bafy...) can be 59 chars, CIDv0 (Qm...) 46 chars — regex must allow long alphanumeric+digit strings
 */
export function parseIpfs(url) {
    if (!url) return null;
    var s = String(url).trim();

    // ipfs:// protocol
    if (s.startsWith("ipfs://")) {
        var rest = s.slice(7);
        var idx = rest.indexOf("/");
        if (idx >= 0) return { cid: rest.substring(0, idx), path: rest.substring(idx) };
        return { cid: rest, path: "" };
    }

    // subdomain: https://CID.ipfs.GATEWAY/path
    // CIDv1 base32 is [a-z2-7]{59}, but be generous with pattern
    var subMatch = s.match(/^https?:\/\/([a-zA-Z0-9]{20,}?)\.ipfs\.[^/]+(\/.*)?$/);
    if (subMatch) {
        return { cid: subMatch[1], path: subMatch[2] || "" };
    }

    // path-based: https://gateway/ipfs/CID/path
    var pathMatch = s.match(/\/ipfs\/([a-zA-Z0-9]{20,})(\/.*)?/);
    if (pathMatch) {
        return { cid: pathMatch[1], path: pathMatch[2] || "" };
    }

    return null;
}

export function isIpfsUrl(url) {
    return parseIpfs(url) !== null;
}

/**
 * Build alternative IPFS URL using gateway at index
 */
export function ipfsGatewayUrl(originalUrl, gatewayIndex) {
    var parsed = parseIpfs(originalUrl);
    if (!parsed) return originalUrl || "";
    var gi = (gatewayIndex || 0) % IPFS_GATEWAYS.length;
    return IPFS_GATEWAYS[gi](parsed.cid, parsed.path);
}

/**
 * Check if a URL is reachable (HEAD request with timeout)
 */
async function probeUrl(url, timeoutMs) {
    try {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, timeoutMs || 6000);
        var r = await fetch(url, { method: "HEAD", signal: controller.signal, mode: "no-cors" });
        clearTimeout(timer);
        // no-cors gives opaque response (status 0), that's OK — it means the server responded
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Given an original IPFS media URL, find the first working gateway URL.
 * Returns the working URL or the original if all fail.
 */
export async function findWorkingIpfsUrl(originalUrl) {
    if (!originalUrl) return "";
    var parsed = parseIpfs(originalUrl);
    if (!parsed) return originalUrl;

    // Try original first
    var origOk = await probeUrl(originalUrl, 5000);
    if (origOk) return originalUrl;

    // Try each gateway
    for (var i = 0; i < IPFS_GATEWAYS.length; i++) {
        var candidate = IPFS_GATEWAYS[i](parsed.cid, parsed.path);
        if (candidate === originalUrl) continue;
        var ok = await probeUrl(candidate, 5000);
        if (ok) return candidate;
    }

    // Fallback: return the first path-based gateway (most reliable pattern)
    return IPFS_GATEWAYS[0](parsed.cid, parsed.path);
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

    // Pagination: some contracts want from_index as number, some as string
    // Try both approaches
    var all = [];
    var useNumericIndex = false;

    // First attempt with string index (NEP-171 standard)
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
        // Try numeric index
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

    // Continue pagination if we got exactly 100
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

    // Also try without from_index at all (some contracts don't support it)
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

    // Dedup by token_id just in case
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

    debugLog.push("total_tokens=" + all.length);

    // Also try nft_supply_for_owner to know expected count
    try {
        var supply = await rpc(contractId, "nft_supply_for_owner", { account_id: accountId });
        var expectedCount = parseInt(supply, 10) || 0;
        debugLog.push("expected_supply=" + expectedCount);
        if (expectedCount > all.length) {
            debugLog.push("WARNING: expected " + expectedCount + " but got " + all.length);

            // Try fetching with larger limit and no from_index
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

        // 1. Direct media field
        if (md.media) {
            media = join(bUri, md.media);
        }

        // 2. If no media, try reference JSON
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

        // 3. Contract icon as last resort
        if (!media && cIcon && cIcon.startsWith("data:")) {
            media = cIcon;
        }

        // 4. If base_uri exists, try CID/token_id pattern
        if (!media && bUri) {
            media = join(bUri, t.token_id);
        }

        // 5. For IPFS URLs, rewrite to most reliable gateway immediately
        if (media && isIpfsUrl(media)) {
            var parsed = parseIpfs(media);
            if (parsed) {
                // Use ipfs.near.social as primary — it's most reliable in NEAR ecosystem
                media = IPFS_GATEWAYS[0](parsed.cid, parsed.path);
                if (i < 5) debugLog.push("token_" + t.token_id + "_rewritten=" + media);
            }
        }

        out.push({
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: { title: title || ("Card #" + t.token_id), description: desc, media: media, extra: extra },
        });
    }

    out._debug = debugLog;
    return out;
}