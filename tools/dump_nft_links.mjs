// dump_nft_links.mjs — только ссылки на NFT, по одной в строке.
// Запуск:  node dump_nft_links.mjs            (контракт bunny.nfts.tg)
//          node dump_nft_links.mjs <contract> [rpc]
// Создаёт: nft_media_urls.txt (картинки) и nft_meta_urls.txt (json).

import { writeFileSync } from "node:fs";

const CONTRACT = process.argv[2] || "bunny.nfts.tg";
const RPC = process.argv[3] || "https://rpc.mainnet.near.org";
const PAGE = 100;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

async function view(method, args) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "query", params: {
      request_type: "call_function", finality: "final",
      account_id: CONTRACT, method_name: method, args_base64: b64(args) } }) });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

console.log("Контракт:", CONTRACT, "— читаю токены...");
const media = [], meta = [];
let from = 0;
while (true) {
  let batch;
  try { batch = await view("nft_tokens", { from_index: String(from), limit: PAGE }); }
  catch (e) { console.error("Ошибка на", from, "-", e.message); break; }
  if (!Array.isArray(batch) || batch.length === 0) break;
  for (const tk of batch) {
    const md = tk.metadata || {};
    if (md.media) media.push(md.media);
    if (md.reference) meta.push(md.reference);
  }
  from += batch.length;
  process.stdout.write("  " + from + "\r");
  if (batch.length < PAGE) break;
}

writeFileSync("nft_media_urls.txt", media.join("\n") + "\n", "utf8");
writeFileSync("nft_meta_urls.txt", meta.join("\n") + "\n", "utf8");
console.log("\nГотово. Токенов:", from);
console.log("Картинки -> nft_media_urls.txt (" + media.length + " ссылок)");
console.log("JSON     -> nft_meta_urls.txt  (" + meta.length + " ссылок)");
console.log("\nПример:", media[0] || "(media пуст)");
