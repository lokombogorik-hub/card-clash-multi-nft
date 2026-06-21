// download_bunny.mjs
// Скачивает ВСЕ картинки коллекции bunny.nfts.tg с IPFS (пока w3s.link жив),
// чтобы потом перезалить их (тот же CID -> старые ссылки в NFT оживут везде)
// ИЛИ отдавать из своего хранилища только в игре.
//
// Запуск:  node download_bunny.mjs
// Нужен Node 18+ (есть встроенный fetch). Папка с картинками: ./bunny_media

import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";

const CONTRACT = "bunny.nfts.tg";
const RPC = "https://rpc.mainnet.near.org"; // можно заменить на свой/fastnear

// Шлюзы по очереди — берём первый, который отдал файл.
const GATEWAYS = [
  (cid, file) => `https://${cid}.ipfs.w3s.link/${file}`,
  (cid, file) => `https://w3s.link/ipfs/${cid}/${file}`,
  (cid, file) => `https://ipfs.io/ipfs/${cid}/${file}`,
  (cid, file) => `https://${cid}.ipfs.dweb.link/${file}`,
  (cid, file) => `https://gateway.pinata.cloud/ipfs/${cid}/${file}`,
  (cid, file) => `https://ipfs.near.social/ipfs/${cid}/${file}`,
];

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64");

async function callView(method, args) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: "1", method: "query",
      params: {
        request_type: "call_function", finality: "final",
        account_id: CONTRACT, method_name: method, args_base64: b64(args),
      },
    }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return JSON.parse(Buffer.from(j.result.result).toString());
}

async function allTokens() {
  const out = [];
  let from = 0;
  while (true) {
    const batch = await callView("nft_tokens", { from_index: String(from), limit: 100 });
    if (!Array.isArray(batch) || batch.length === 0) break;
    out.push(...batch);
    console.log("получено токенов:", out.length);
    if (batch.length < 100) break;
    from += batch.length;
  }
  return out;
}

function parseMedia(url) {
  if (!url) return null;
  let m = url.match(/^https?:\/\/([a-z0-9]+)\.ipfs\.[^/]+\/(.+)$/i);
  if (m) return { cid: m[1], file: m[2] };
  m = url.match(/\/ipfs\/([a-z0-9]+)\/(.+)$/i);
  if (m) return { cid: m[1], file: m[2] };
  m = url.match(/^ipfs:\/\/([a-z0-9]+)\/(.+)$/i);
  if (m) return { cid: m[1], file: m[2] };
  return null;
}

async function downloadOne(cid, file) {
  for (const gw of GATEWAYS) {
    try {
      const r = await fetch(gw(cid, file), { signal: AbortSignal.timeout(25000) });
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > 0) return buf;
      }
    } catch (_) {}
  }
  return null;
}

const OUT = "./bunny_media";
await mkdir(OUT, { recursive: true });

console.log("Тяну список токенов с контракта", CONTRACT, "...");
const tokens = await allTokens();
console.log("Всего токенов:", tokens.length);

let ok = 0, fail = 0;
const failed = [];
let imgCid = null;

for (const t of tokens) {
  const media = (t.metadata && t.metadata.media) || "";
  const p = parseMedia(media);
  if (!p) { fail++; failed.push(t.token_id); continue; }
  imgCid = p.cid;
  const dest = `${OUT}/${p.file}`;
  if (existsSync(dest)) { ok++; continue; }
  const buf = await downloadOne(p.cid, p.file);
  if (buf) {
    await writeFile(dest, buf);
    ok++;
    if (ok % 25 === 0) console.log("скачано:", ok);
  } else {
    fail++; failed.push(t.token_id);
  }
}

console.log(`\nГОТОВО. Скачано: ${ok}, не удалось: ${fail}`);
console.log("CID папки картинок (должен совпасть после перезаливки):", imgCid);
if (failed.length) console.log("Не скачались token_id:", failed.join(","));
console.log("\nФайлы в папке:", OUT);
console.log("Дальше: залить ЭТУ папку целиком в Storacha/IPFS -> CID совпадёт -> ссылки в NFT оживут.");
