var RPC_URL = "https://rpc.mainnet.near.org";

var IPFS_GATEWAYS = [
    function (cid, path) { return "https://" + cid + ".ipfs.w3s.link" + path; },
    function (cid, path) { return "https://ipfs.near.social/ipfs/" + cid + path; },
    function (cid, path) { return "https://cloudflare-ipfs.com/ipfs/" + cid + path; },
    function (cid, path) { return "https://" + cid + ".ipfs.dweb.link" + path; },
    function (cid, path) { return "https://gateway.pinata.cloud/ipfs/" + cid + path; },
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
 * Extract CID and path from any IPFS URL format:
 *   ipfs://CID/path
 *   https://CID.ipfs.w3s.link/path        (subdomain)
 *   https://gateway.com/ipfs/CID/path      (path-based)
 * Returns { cid, path } or null
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
    var subMatch = s.match(/^https?:\/\/([a-zA-Z0-9]+)\.ipfs\.[^/]+(\/.*)?$/);
    if (subMatch) {
        return { cid: subMatch[1], path: subMatch[2] || "" };
    }

    // path-based: https://gateway/ipfs/CID/path
    var pathMatch = s.match(/\/ipfs\/([a-zA-Z0-9]+)(\/.*)?/);
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
    for (var pg = 0; pg < 50; pg++) {
        try {
            var batch = await rpc(contractId, "nft_tokens_for_owner", {
                account_id: accountId,
                from_index: String(all.length),
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

        if (i < 3) {
            debugLog.push("token_" + t.token_id + "_raw=" + JSON.stringify(md).substring(0, 300));
        }

        if (md.media) {
            media = join(bUri, md.media);
        }

        if (!media && md.reference) {
            var refUrl = join(bUri, md.reference);
            if (i < 3) debugLog.push("token_" + t.token_id + "_refUrl=" + refUrl);
            var rj = await getJson(refUrl);
            if (rj) {
                media = join(bUri, rj.media || rj.image || rj.animation_url || rj.icon || "");
                if (!title) title = rj.title || rj.name || "";
                if (!desc) desc = rj.description || "";
                if (!extra) extra = rj.extra || null;
                if (i < 3) debugLog.push("token_" + t.token_id + "_refMedia=" + (media || "(empty)"));
            } else {
                if (i < 3) debugLog.push("token_" + t.token_id + "_refFailed");
            }
        }

        if (!media && cIcon && cIcon.startsWith("data:")) {
            media = cIcon;
        }

        if (!media && bUri) {
            media = join(bUri, t.token_id);
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