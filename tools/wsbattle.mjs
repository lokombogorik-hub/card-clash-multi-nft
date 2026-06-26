// wsbattle.mjs — нагрузочный тест БОЯ по WebSocket.
// Поднимает N пар ботов, каждая пара играет реальную партию через движок,
// меряет задержку хода, ошибки, throughput.
//
// Требует: STRESS_TEST_SECRET задан в ENV на Railway, и установлен пакет ws:
//   cd tools && npm init -y && npm i ws
//
// Запуск:
//   node wsbattle.mjs <BASE_URL> <SECRET> [matches] [timeoutSec]
// Пример:
//   node wsbattle.mjs https://card-clash-multi-nft-production.up.railway.app МОЙ_СЕКРЕТ 50 40

import WebSocket from "ws";

const BASE = (process.argv[2] || "").replace(/\/$/, "");
const SECRET = process.argv[3] || "";
const MATCHES = parseInt(process.argv[4] || "50", 10);
const TIMEOUT = parseInt(process.argv[5] || "40", 10) * 1000;
const WS_BASE = BASE.replace(/^http/, "ws");

if (!BASE || !SECRET) {
  console.error("node wsbattle.mjs <BASE_URL> <SECRET> [matches] [timeoutSec]");
  process.exit(1);
}

const lat = [];
let movesTotal = 0, done = 0, failed = 0, wsErrors = 0;

async function post(path, body) {
  const r = await fetch(BASE + path, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(path + " -> " + r.status + " " + (await r.text()).slice(0, 120));
  return r.json();
}

function bot(matchId, token, myId, onMove) {
  return new Promise((resolve) => {
    let sentAt = 0, finished = false;
    const ws = new WebSocket(WS_BASE + "/ws/match/" + matchId);
    const close = (ok) => { if (!finished) { finished = true; try { ws.close(); } catch (_) {} resolve(ok); } };
    ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token })));
    ws.on("message", (raw) => {
      let m; try { m = JSON.parse(raw.toString()); } catch { return; }
      if (m.type === "game_over") { close(true); return; }
      if (m.type === "game_state" && m.state) {
        if (sentAt) { lat.push(performance.now() - sentAt); sentAt = 0; }
        if (String(m.state.current_turn) === String(myId)) {
          const board = m.state.board || [];
          let cell = -1;
          for (let i = 0; i < board.length; i++) if (board[i] == null) { cell = i; break; }
          if (cell >= 0) {
            sentAt = performance.now();
            movesTotal++;
            ws.send(JSON.stringify({ type: "play_card", card_index: 0, cell_index: cell }));
          }
        }
      }
    });
    ws.on("error", () => { wsErrors++; close(false); });
    ws.on("close", () => close(false));
  });
}

async function runMatch(i) {
  const p1 = String(900000 + i * 2), p2 = String(900001 + i * 2);
  try {
    const [t1, t2] = await Promise.all([
      post("/api/_stress/login", { secret: SECRET, user_id: p1 }),
      post("/api/_stress/login", { secret: SECRET, user_id: p2 }),
    ]);
    const m = await post("/api/_stress/match", { secret: SECRET, p1, p2 });
    const res = await Promise.race([
      Promise.all([bot(m.match_id, t1.token, p1), bot(m.match_id, t2.token, p2)]),
      new Promise((r) => setTimeout(() => r("timeout"), TIMEOUT)),
    ]);
    if (res === "timeout") failed++; else done++;
  } catch (e) {
    failed++;
    if (failed <= 3) console.error("match err:", e.message);
  }
}

function pct(a, p) { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

console.log(`Бой-нагрузка: ${BASE}\nПар (матчей) одновременно: ${MATCHES}\n`);
const t0 = Date.now();
await Promise.all(Array.from({ length: MATCHES }, (_, i) => runMatch(i)));
const elapsed = (Date.now() - t0) / 1000;

console.log("──────────── РЕЗУЛЬТАТ БОЯ ────────────");
console.log("Матчей завершено:", done, "| не доиграно:", failed, "| WS-ошибок:", wsErrors);
console.log("Ходов всего:", movesTotal, "| ходов/сек:", (movesTotal / elapsed).toFixed(1));
console.log("Задержка хода p50:", pct(lat, 0.5).toFixed(0) + "ms",
            "| p95:", pct(lat, 0.95).toFixed(0) + "ms",
            "| p99:", pct(lat, 0.99).toFixed(0) + "ms");
console.log("Время теста:", elapsed.toFixed(1) + "с");
console.log("───────────────────────────────────────");
const bad = failed / Math.max(1, MATCHES);
console.log(bad > 0.05
  ? "⚠️ >5% матчей не доиграно — сервер не тянет столько одновременных боёв."
  : pct(lat, 0.95) > 1200
    ? "⚠️ Задержка хода p95 высокая — на пределе."
    : "✅ Бои тянет на этой нагрузке.");
