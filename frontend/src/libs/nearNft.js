var RPC_URL = "https://rpc.mainnet.near.org";

function toBase64(str) {
    try { return btoa(unescape(encodeURIComponent(str))); }
    catch (e) { return btoa(str); }
}

function fixIpfs(url) {
    if (!url) return "";
    if (typeof url !== "string") return "";
    var s = url.trim();
    if (s.startsWith("ipfs://")) return "https://ipfs.near.social/ipfs/" + s.slice(7);
    if (s.startsWith("ar://")) return "https://arweave.net/" + s.slice(5);
    return s;
}

function joinUrl(base, path) {
    if (!path) return "";
    var p = fixIpfs(String(path).trim());
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("data:") || p.startsWith("blob:")) return p;
    if (!base) return p;
    var b = fixIpfs(String(base).trim());
    if (!b) return p;
    if (!b.endsWith("/")) b += "/";
    return b + p.replace(/^\//, "");
}

async function fetchJsonSafe(url) {
    if (!url) return null;
    try {
        var r = await fetch(url, { method: "GET" });
        if (!r.ok) return null;
        var text = await r.text();
        try { return JSON.parse(text); }
        catch (e) { return null; }
    } catch (e) { return null; }
}

async function rpcCall(contractId, method, args) {
    var res = await fetch(RPC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0", id: "q", method: "query",
            params: {
                request_type: "call_function", finality: "final",
                account_id: contractId, method_name: method,
                args_base64: toBase64(JSON.stringify(args || {})),
            },
        }),
    });
    var j = await res.json();
    if (j.error) throw new Error(j.error.message || "RPC error");
    if (!j.result || !j.result.result) throw new Error("Empty RPC result");
    return JSON.parse(new TextDecoder().decode(new Uint8Array(j.result.result)));
}

export async function nearNftTokensForOwner(contractId, accountId) {
    // 1. Get contract metadata for base_uri
    var contractBaseUri = "";
    try {
        var meta = await rpcCall(contractId, "nft_metadata", {});
        contractBaseUri = meta.base_uri || "";
        console.log("[nearNft] contract:", contractId, "base_uri:", contractBaseUri, "name:", meta.name);
    } catch (e) {
        console.warn("[nearNft] nft_metadata failed:", e.message);
    }

    // 2. Paginate nft_tokens_for_owner
    var all = [];
    var pageSize = 50;
    for (var page = 0; page < 20; page++) {
        try {
            var batch = await rpcCall(contractId, "nft_tokens_for_owner", {
                account_id: accountId,
                from_index: String(all.length),
                limit: pageSize,
            });
            if (!Array.isArray(batch) || batch.length === 0) break;
            all = all.concat(batch);
            if (batch.length < pageSize) break;
        } catch (e) {
            console.warn("[nearNft] page", page, "error:", e.message);
            break;
        }
    }

    console.log("[nearNft] raw tokens:", all.length);

    // 3. Resolve each token's image
    var results = [];
    for (var i = 0; i < all.length; i++) {
        var t = all[i];
        var md = t.metadata || {};
        var baseUri = md.base_uri || contractBaseUri || "";
        var title = md.title || "";
        var description = md.description || "";
        var media = "";
        var extra = md.extra || null;

        // Try media directly
        if (md.media) {
            media = joinUrl(baseUri, md.media);
        }

        // If no media, try reference JSON
        if (!media && md.reference) {
            var refUrl = joinUrl(baseUri, md.reference);
            var refJson = await fetchJsonSafe(refUrl);
            if (refJson) {
                if (refJson.media) media = joinUrl(baseUri, refJson.media);
                else if (refJson.image) media = joinUrl(baseUri, refJson.image);
                else if (refJson.animation_url) media = joinUrl(baseUri, refJson.animation_url);
                if (!title && (refJson.title || refJson.name)) title = refJson.title || refJson.name;
                if (!description && refJson.description) description = refJson.description;
                if (!extra && refJson.extra) extra = refJson.extra;
            }
        }

        // Last resort: try base_uri/token_id (some contracts store like this)
        if (!media && baseUri) {
            media = joinUrl(baseUri, t.token_id);
        }

        if (media) {
            console.log("[nearNft] token", t.token_id, "image:", media.substring(0, 80));
        } else {
            console.warn("[nearNft] token", t.token_id, "NO IMAGE FOUND, md:", JSON.stringify(md).substring(0, 200));
        }

        results.push({
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: { title: title || ("Card #" + t.token_id), description: description, media: media, extra: extra },
        });
    }

    return results;
}