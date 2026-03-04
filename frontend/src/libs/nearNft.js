var RPC_URL = "https://rpc.mainnet.near.org";

export async function nearNftTokensForOwner(contractId, accountId, limit) {
    limit = limit || 50;
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
                    args_base64: btoa(
                        JSON.stringify({
                            account_id: accountId,
                            from_index: "0",
                            limit: limit,
                        })
                    ),
                },
            }),
        });
        var j = await res.json();
        if (j.error || !j.result || !j.result.result) return [];
        var decoded = new TextDecoder().decode(
            new Uint8Array(j.result.result)
        );
        return JSON.parse(decoded);
    } catch (e) {
        return [];
    }
}