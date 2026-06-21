// pin_to_pinata.mjs
// Заливает готовый CAR на Pinata с СОХРАНЕНИЕМ CID (флаг car=true, public сеть).
// После этого контент попадает в публичную IPFS-сеть, и старые ссылки в NFT
// оживают ВЕЗДЕ: HotCraft, HOT Wallet, игра. Рарность/номера не трогаем.
//
// Подготовка:
//   1) node verify_cid.mjs ./bunny_media   (убедись, что CID совпал и создан bunny.car)
//   2) Зарегистрируйся на pinata.cloud (бесплатно), API Keys -> создай ключ -> скопируй JWT
//   3) set PINATA_JWT=...   (Windows cmd)   /   export PINATA_JWT=...  (Mac/Linux)
//
// Запуск:  node pin_to_pinata.mjs bunny.car
// Нужен Node 18+ (fetch/FormData/Blob встроены).

import { readFile } from "node:fs/promises";

const CAR = process.argv[2] || "out.car";
const TARGET_CID = process.argv[3] || ""; // ожидаемый CID (из verify_cid.mjs); необязательно
const JWT = process.env.PINATA_JWT;

if (!JWT) {
  console.error("❌ Не задан PINATA_JWT. Pinata -> API Keys -> New Key -> скопируй JWT.");
  console.error("   Windows:  set PINATA_JWT=твой_jwt");
  console.error("   Mac/Linux: export PINATA_JWT=твой_jwt");
  process.exit(1);
}

console.log("Читаю", CAR, "...");
const buf = await readFile(CAR);

const form = new FormData();
form.append("file", new Blob([buf]), "bunny.car");
form.append("network", "public");
form.append("car", "true");
form.append("name", "bunny-collection");

console.log("Заливаю CAR на Pinata (public, с сохранением CID)...");
const res = await fetch("https://uploads.pinata.cloud/v3/files", {
  method: "POST",
  headers: { Authorization: "Bearer " + JWT },
  body: form,
});

const text = await res.text();
let j;
try { j = JSON.parse(text); } catch { j = { raw: text }; }
console.log("Ответ Pinata:", JSON.stringify(j, null, 2));

const cid = j && j.data && j.data.cid;
console.log("\n--------------------------------------------------");
console.log("Залитый CID:", cid || "(не получен)");
console.log("Нужен CID:  ", TARGET_CID);
console.log("--------------------------------------------------");

if (cid && TARGET_CID && cid === TARGET_CID) {
  console.log("\n✅ CID совпал с ожидаемым! Контент в публичной IPFS-сети.");
  console.log("Дай сети 5-15 минут и проверь NFT на HotCraft / HOT Wallet.");
} else if (cid && TARGET_CID) {
  console.log("\n⚠️ CID отличается от ожидаемого (" + TARGET_CID + ").");
  console.log("Сначала добейся совпадения в verify_cid.mjs (та же папка -> тот же CID).");
} else if (cid) {
  console.log("\n✅ Залито. CID:", cid);
  console.log("Сверь его с тем, что показал verify_cid.mjs (image/meta CID). Совпал -> оживёт везде.");
} else {
  console.log("\n❌ Pinata не вернула CID — смотри ответ выше (часто: неверный JWT или нет прав org:files:write).");
}
