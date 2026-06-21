// compute_cid.mjs <папка>
// Считает корневой CID папки РОДНЫМ кодировщиком web3.storage/storacha
// (@storacha/upload-client) — тем же, которым заливали коллекцию. Потоково,
// без перегруза памяти. Это проверка: совпадёт ли CID с тем, что в контракте.
//
// Установка (один раз):  npm i @storacha/upload-client
// Запуск:                node compute_cid.mjs "C:\путь\images"
//
// Нужен Node 20.4+ (есть openAsBlob). У тебя Node 24 — ок.

import { UnixFS } from "@storacha/upload-client";
import { openAsBlob } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const folder = process.argv[2];
if (!folder) { console.error("Использование: node compute_cid.mjs <папка>"); process.exit(1); }

const entries = (await readdir(folder, { withFileTypes: true }))
  .filter((d) => d.isFile() && !d.name.startsWith("."));
console.log("Файлов:", entries.length, "в", folder);

const files = [];
for (const d of entries) {
  const blob = await openAsBlob(path.join(folder, d.name));
  files.push({ name: d.name, stream: () => blob.stream() });
}

console.log("Кодирую тем же движком, что web3.storage (потоково)...");
const stream = UnixFS.createDirectoryEncoderStream(files);
const reader = stream.getReader();
let rootCID = null;
let n = 0;
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  rootCID = value.cid;          // последний блок = корень каталога
  if (++n % 500 === 0) console.log("  блоков:", n);
}

console.log("\n==================================================");
console.log("ВЫЧИСЛЕННЫЙ CID:", rootCID ? rootCID.toString() : "(пусто)");
console.log("Сравни с контрактом:");
console.log("  images   -> bafybeibqzbodfn3xczppxh2k2ek3bgvojhivqy4ntbkprcxesulth3yy5e");
console.log("  metadata -> bafybeigbxx7wp7hxhctq24lx3aj4oidiodz724xbfc7llckp3mmaa43c3q");
console.log("==================================================");
console.log("Совпало -> пишем мне, я дам шаги заливки/пина (Filebase, бесплатно).");
