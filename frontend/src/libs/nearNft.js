var RPC_URL = "https://rpc.mainnet.near.org";

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

export async function nearNftTokensForOwner(contractId, accountId) {
    var debugLog = [];

    // 1) Contract metadata
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

    // 2) Paginate
    var all = [];
    for (var pg = 0; pg < 30; pg++) {
        try {
            var batch = await rpc(contractId, "nft_tokens_for_owner", {
                account_id: accountId,
                from_index: String(all.length),
                limit: 50,
            });
            if (!Array.isArray(batch) || batch.length === 0) break;
            all = all.concat(batch);
            if (batch.length < 50) break;
        } catch (e) { break; }
    }
    debugLog.push("total_tokens=" + all.length);

    // 3) Process each
    var out = [];
    for (var i = 0; i < all.length; i++) {
        var t = all[i];
        var md = t.metadata || {};
        var bUri = md.base_uri || cBaseUri || "";

        var media = "";
        var title = md.title || md.name || "";
        var desc = md.description || "";
        var extra = md.extra || null;

        // Debug: log raw metadata for first 3 tokens
        if (i < 3) {
            debugLog.push("token_" + t.token_id + "_raw=" + JSON.stringify(md).substring(0, 300));
        }

        // A) Direct media
        if (md.media) {
            media = join(bUri, md.media);
        }

        // B) Reference JSON
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

        // C) Fallback: contract icon
        if (!media && cIcon && cIcon.startsWith("data:")) {
            media = cIcon;
        }

        // D) Fallback: base_uri + token_id
        if (!media && bUri) {
            media = join(bUri, t.token_id);
        }

        out.push({
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: { title: title || ("Card #" + t.token_id), description: desc, media: media, extra: extra },
        });
    }

    // Store debug for display
    out._debug = debugLog;

    return out;
}