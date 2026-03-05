var RPC_URL = "https://rpc.mainnet.near.org";

export async function nearNftTokensForOwner(contractId, accountId, limit) {
    limit = limit || 100;
    try {
        var res = await fetch(RPC_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: "nft",
                method: "query",
                params: {
                    request_type: "call_function",
                    finality: "final",
                    account_id: contractId,
                    method_name: "nft_tokens_for_owner",
                    args_base64: btoa(JSON.stringify({
                        account_id: accountId,
                        from_index: "0",
                        limit: limit,
                    })),
                },
            }),
        });
        var j = await res.json();
        if (j.error || !j.result || !j.result.result) return [];
        var decoded = new TextDecoder().decode(new Uint8Array(j.result.result));
        var tokens = JSON.parse(decoded);

        // Process tokens to ensure proper image URLs
        return tokens.map(function (t) {
            var media = "";
            if (t.metadata) {
                media = t.metadata.media || "";
                // Handle IPFS URLs
                if (media.startsWith("ipfs://")) {
                    media = "https://ipfs.io/ipfs/" + media.slice(7);
                }
                // Handle relative URLs - use base_uri if available
                if (media && !media.startsWith("http") && !media.startsWith("data:")) {
                    var baseUri = t.metadata.base_uri || "";
                    if (baseUri) {
                        if (baseUri.startsWith("ipfs://")) {
                            baseUri = "https://ipfs.io/ipfs/" + baseUri.slice(7);
                        }
                        media = baseUri + (baseUri.endsWith("/") ? "" : "/") + media;
                    }
                }
            }
            return {
                token_id: t.token_id,
                owner_id: t.owner_id,
                metadata: {
                    title: t.metadata?.title || "Card #" + t.token_id,
                    description: t.metadata?.description || "",
                    media: media,
                    extra: t.metadata?.extra || null,
                }
            };
        });
    } catch (e) {
        console.error("[nearNft] error:", e);
        return [];
    }
}