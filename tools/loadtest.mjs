// loadtest.mjs — простой нагрузочный тест бэкенда (без авторизации).
// Гоняет публичные эндпоинты параллельно и меряет p50/p95/p99, RPS, ошибки.
//
// Запуск:
//   node loadtest.mjs <BASE_URL> [concurrency] [seconds]
// Пример:
//   node loadtest.mjs https://card-clash-multi-nft-production.up.railway.app 50 20
//
// Node 18+ (встроенный fetch).

const BASE = (process.argv[2] || "").replace(/\/$/, "");
const CONC = parseInt(process.argv[3] || "50", 10);
const SECS = parseInt(process.argv[4] || "20", 10);

if (!BASE) {
  console.error("Использование: node loadtest.mjs <BASE_URL> [concurrency] [seconds]");
  process.exit(1);
}

// Лёгкие GET-эндпоинты (читают БД/память, как при реальном онлайне)
const PATHS = ["/health", "/api/online", "/api/matches/leaderboard?limit=10", "/api/tournaments"];

const lat = [];
let ok = 0, err = 0, done = false;

async function worker() {
  while (!done) {
    const p = PATHS[Math.floor(Math.random() * PATHS.length)];
    const t0 = performance.now();
    try {
      const r = await fetch(BASE + p, { method: "GET" });
      const dt = performance.now() - t0;
      if (r.ok) { ok++; lat.push(dt); } else { err++; }
    } catch (e) {
      err++;
    }
  }
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

console.log(`Нагрузка: ${BASE}\nПотоков: ${CONC}, время: ${SECS}с\n`);
const start = Date.now();
const workers = Array.from({ length: CONC }, worker);
setTimeout(() => { done = true; }, SECS * 1000);
await Promise.all(workers);

const elapsed = (Date.now() - start) / 1000;
const total = ok + err;
console.log("──────────── РЕЗУЛЬТАТ ────────────");
console.log("Запросов всего:", total, " | успешно:", ok, " | ошибок:", err);
console.log("RPS:", (total / elapsed).toFixed(1));
console.log("Задержка p50:", pct(lat, 0.50).toFixed(0) + "ms",
            "| p95:", pct(lat, 0.95).toFixed(0) + "ms",
            "| p99:", pct(lat, 0.99).toFixed(0) + "ms");
console.log("Ошибок:", total ? ((err / total) * 100).toFixed(1) + "%" : "0%");
console.log("───────────────────────────────────");
console.log(err / Math.max(1, total) > 0.02
  ? "⚠️ Ошибок >2% — сервер захлёбывается на этой нагрузке."
  : pct(lat, 0.95) > 1500
    ? "⚠️ p95 высокий — близко к пределу, дальше будет тормозить."
    : "✅ Держит уверенно на этой нагрузке.");
