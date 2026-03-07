var RPC_URL = "https://rpc.mainnet.near.org";

var IPFS_GATEWAYS = [
    "https://ipfs.near.social/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://w3s.link/ipfs/",
    "https://dweb.link/ipfs/",
];

function toB64(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { return btoa(str); }
}

function fixProto(url) {
    if (!url) return "";
    var s = String(url).trim();
    if (s.startsWith("ipfs://")) return IPFS_GATEWAYS[0] + s.slice(7);
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

export function ipfsGatewayUrl(originalUrl, gatewayIndex) {
    if (!originalUrl) return "";
    var s = String(originalUrl).trim();
    var cid = "";
    var path = "";

    if (s.startsWith("ipfs://")) {
        var rest = s.slice(7);
        var slashIdx = rest.indexOf("/");
        if (slashIdx >= 0) {
            cid = rest.substring(0, slashIdx);
            path = rest.substring(slashIdx);
        } else {
            cid = rest;
        }
    } else {
        for (var i = 0; i < IPFS_GATEWAYS.length; i++) {
            if (s.includes("/ipfs/")) {
                var parts = s.split("/ipfs/");
                var afterIpfs = parts[parts.length - 1];
                var slashIdx2 = afterIpfs.indexOf("/");
                if (slashIdx2 >= 0) {
                    cid = afterIpfs.substring(0, slashIdx2);
                    path = afterIpfs.substring(slashIdx2);
                } else {
                    cid = afterIpfs;
                }
                break;
            }
        }
        if (!cid && s.includes(".ipfs.")) {
            var match = s.match(/https?:\/\/([^.]+)\.ipfs\.[^/]+(\/.*)?/);
            if (match) {
                cid = match[1];
                path = match[2] || "";
            }
        }
    }

    if (!cid) return s;

    var gi = (gatewayIndex || 0) % IPFS_GATEWAYS.length;
    return IPFS_GATEWAYS[gi] + cid + path;
}

export function isIpfsUrl(url) {
    if (!url) return false;
    var s = String(url);
    if (s.startsWith("ipfs://")) return true;
    if (s.includes("/ipfs/")) return true;
    if (s.includes(".ipfs.")) return true;
    return false;
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