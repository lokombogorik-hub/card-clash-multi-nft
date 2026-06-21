// verify_cid.mjs
// Проверяет, совпадает ли CID твоей папки с тем, что записан в NFT.
// Сам читает нужные CID из контракта (отдельно для картинок и для метаданных).
//
// Запуск:
//   node verify_cid.mjs <папка> [contract]
// Примеры:
//   node verify_cid.mjs ./images           (контракт по умолчанию bunny.nfts.tg)
//   node verify_cid.mjs ./images ofp_collection.nfts.tg
//
// Нужен Node 18+. ipfs-car подтянется через npx.

import { execSync } from "node:child_process";

const FOLDER = process.argv[2];
const CONTRACT = process.argv[3] || "bunny.nfts.tg";
const RPC = "https://rpc.mainnet.near.org";

if (!FOLDER) {
  console.error("Использование: node verify_cid.mjs <папка> [contract]");
  process.exit(1);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");

async function view(method, args) {
  const r = await fetch(RPC, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method: "query", params: {
      request_type: "call_function", finality: "final",
      account_id: CONTRACT, method_name: method, args_base64: b64(args) } }),
  });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

function cidOf(url) {
  if (!url) return null;
  let m = url.match(/^https?:\/\/([a-z0-9]+)\.ipfs\.[^/]+\//i); if (m) return m[1];
  m = url.match(/\/ipfs\/([a-z0-9]+)\//i); if (m) return m[1];
  m = url.match(/^ipfs:\/\/([a-z0-9]+)\//i); if (m) return m[1];
  return null;
}

console.log("Контракт:", CONTRACT, "— читаю токены...");
const tokens = await view("nft_tokens", { from_index: "0", limit: 3 });
if (!Array.isArray(tokens) || !tokens.length) { console.error("Токенов не нашёл."); process.exit(1); }

const md = tokens[0].metadata || {};
const imageCID = cidOf(md.media);
const metaCID = cidOf(md.reference);
console.log("\nПример токена:", tokens[0].token_id);
console.log("  media:    ", md.media);
console.log("  reference:", md.reference);
console.log("\n>>> CID картинок (images):   ", imageCID || "(media не IPFS)");
console.log(">>> CID метаданных (json):  ", metaCID || "(reference нет/не IPFS)");
console.log(imageCID && metaCID && imageCID !== metaCID
  ? "\n⚠️ Картинки и json — РАЗНЫЕ CID. Значит их надо пиннить ДВУМЯ отдельными папками."
  : "");

console.log("\nПакую", FOLDER, "(ipfs-car, тот же упаковщик, что web3.storage)...");
execSync(`npx --yes ipfs-car pack "${FOLDER}" --output out.car`, { stdio: "inherit" });
const root = execSync("npx --yes ipfs-car roots out.car").toString().trim();

console.log("\n--------------------------------------------------");
console.log("CID твоей папки:", root);
if (root === imageCID)      console.log("✅ Совпал с CID КАРТИНОК — пиннь out.car, картинки оживут.");
else if (root === metaCID)  console.log("✅ Совпал с CID МЕТАДАННЫХ — пиннь out.car, атрибуты/рарность оживут.");
else {
  console.log("❌ Не совпал ни с image, ни с meta CID.");
  console.log("   Скорее всего в папке лежит лишнее (png+json вместе, подпапка, .DS_Store).");
  console.log("   Сделай ДВЕ чистые папки: только .png -> сверь с image CID;");
  console.log("   только .json -> сверь с meta CID. Запусти скрипт на каждую отдельно.");
}
console.log("--------------------------------------------------");
