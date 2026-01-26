const envNetworkId = (import.meta.env.VITE_NEAR_NETWORK_ID || "").toLowerCase();
const nearNetworkId = envNetworkId === "testnet" ? "testnet" : "mainnet";

const envRpcUrl = (import.meta.env.VITE_NEAR_RPC_URL || "").trim();
export const rpcUrl =
    envRpcUrl ||
    (nearNetworkId === "testnet"
        ? "https://rpc.testnet.near.org"
        : "https://rpc.mainnet.near.org");

function bytesToString(bytes) {
    try {
        return new TextDecoder().decode(new Uint8Array(bytes || []));
    } catch {
        // fallback
        try {
            return String.fromCharCode(...(bytes || []));
        } catch {
            return "";
        }
    }
}

function jsonToArgsBase64(obj) {
    const json = JSON.stringify(obj ?? {});
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

async function nearRpc(method, params) {
    const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: "cc-near-view",
            method,
            params,
        }),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`NEAR RPC HTTP ${res.status}`);
    if (!json) throw new Error("NEAR RPC invalid JSON");
    if (json.error) throw new Error(json?.error?.message || "NEAR RPC error");
    return json.result;
}

export async function nearViewFunction({ contractId, methodName, args }) {
    if (!contractId) throw new Error("contractId is required");
    if (!methodName) throw new Error("methodName is required");

    const result = await nearRpc("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: methodName,
        args_base64: jsonToArgsBase64(args || {}),
    });

    const text = bytesToString(result?.result);
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`View call returned non-JSON: ${text.slice(0, 200)}`);
    }
}

/**
 * Requires NFT contract supports NEP-171 enumeration extension:
 *   nft_tokens_for_owner({ account_id, from_index, limit })
 */
export async function nearNftTokensForOwner({
    nftContractId,
    accountId,
    fromIndex = "0",
    limit = 50,
}) {
    if (!nftContractId) throw new Error("nftContractId is required");
    if (!accountId) throw new Error("accountId is required");

    const out = await nearViewFunction({
        contractId: nftContractId,
        methodName: "nft_tokens_for_owner",
        args: {
            account_id: accountId,
            from_index: String(fromIndex),
            limit: Number(limit),
        },
    });

    if (!Array.isArray(out)) {
        throw new Error("NFT contract doesn't support nft_tokens_for_owner (or returned invalid data)");
    }

    // normalize: keep minimal fields we need
    return out.map((t) => ({
        token_id: String(t?.token_id ?? ""),
        owner_id: String(t?.owner_id ?? ""),
        metadata: t?.metadata ?? null,
    })).filter((t) => t.token_id);
}