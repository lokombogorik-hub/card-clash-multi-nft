var RPC_URL = "https://rpc.mainnet.near.org";

function toBase64(str) {
    try {
        return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
        return btoa(str);
    }
}

function fixIpfs(url) {
    if (!url) return "";
    if (typeof url !== "string") return "";
    if (url.startsWith("ipfs://")) {
        return "https://ipfs.io/ipfs/" + url.slice(7);
    }
    return url;
}

function makeFullUrl(path, baseUri) {
    if (!path) return "";
    path = fixIpfs(String(path));
    if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
        return path;
    }
    if (baseUri) {
        var base = fixIpfs(String(baseUri));
        if (base && !base.endsWith("/")) base += "/";
        return base + path.replace(/^\//, "");
    }
    return path;
}

async function fetchJson(url) {
    if (!url) return null;
    try {
        var r = await fetch(url);
        if (!r.ok) return null;
        return await r.json();
    } catch (e) {
        return null;
    }
}

export async function nearNftTokensForOwner(contractId, accountId, limit) {
    limit = limit || 200;
    var allTokens = [];
    var fromIndex = 0;
    var maxPages = 20;

    for (var page = 0; page < maxPages; page++) {
        try {
            var res = await fetch(RPC_URL, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id: "nft_" + page,
                    method: "query",
                    params: {
                        request_type: "call_function",
                        finality: "final",
                        account_id: contractId,
                        method_name: "nft_tokens_for_owner",
                        args_base64: toBase64(JSON.stringify({
                            account_id: accountId,
                            from_index: String(fromIndex),
                            limit: limit,
                        })),
                    },
                }),
            });

            var j = await res.json();
            if (j.error || !j.result || !j.result.result) break;

            var decoded = new TextDecoder().decode(new Uint8Array(j.result.result));
            var batch = JSON.parse(decoded);

            if (!Array.isArray(batch) || batch.length === 0) break;

            allTokens = allTokens.concat(batch);
            fromIndex += batch.length;

            if (batch.length < limit) break;
        } catch (e) {
            console.error("[nearNft] page " + page + " error:", e);
            break;
        }
    }

    console.log("[nearNft] total raw tokens:", allTokens.length);

    // Now get base_uri from contract metadata
    var contractBaseUri = "";
    try {
        var metaRes = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "meta",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: contractId,
                    method_name: "nft_metadata",
                    args_base64: toBase64("{}"),
                },
            }),
        });
        var metaJ = await metaRes.json();
        if (metaJ.result && metaJ.result.result) {
            var metaDecoded = new TextDecoder().decode(new Uint8Array(metaJ.result.result));
            var contractMeta = JSON.parse(metaDecoded);
            contractBaseUri = contractMeta.base_uri || "";
            console.log("[nearNft] contract base_uri:", contractBaseUri);
        }
    } catch (e) {
        console.warn("[nearNft] nft_metadata error:", e);
    }

    // Process each token: resolve image
    var results = [];

    for (var i = 0; i < allTokens.length; i++) {
        var t = allTokens[i];
        var md = t.metadata || {};
        var baseUri = md.base_uri || contractBaseUri || "";
        var media = "";
        var title = md.title || "";
        var description = md.description || "";
        var extra = md.extra || null;

        // 1) Try direct media field
        media = makeFullUrl(md.media || "", baseUri);

        // 2) If no media, try reference JSON
        if (!media && md.reference) {
            var refUrl = makeFullUrl(md.reference, baseUri);
            console.log("[nearNft] fetching reference for token " + t.token_id + ":", refUrl);
            var refJson = await fetchJson(refUrl);

            if (refJson) {
                media = makeFullUrl(refJson.media || refJson.image || refJson.icon || "", baseUri);
                if (!title && refJson.title) title = refJson.title;
                if (!title && refJson.name) title = refJson.name;
                if (!description && refJson.description) description = refJson.description;
                if (!extra && refJson.extra) extra = refJson.extra;
            }
        }

        // 3) If still no media, try Mintbase/NEAR convention
        if (!media && baseUri) {
            media = makeFullUrl(t.token_id, baseUri);
        }

        results.push({
            token_id: t.token_id,
            owner_id: t.owner_id,
            metadata: {
                title: title || "Card #" + t.token_id,
                description: description,
                media: media,
                extra: extra,
            },
        });
    }

    console.log("[nearNft] processed tokens:", results.length);
    return results;
}