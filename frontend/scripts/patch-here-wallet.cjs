// frontend/scripts/patch-here-wallet.cjs

const fs = require("fs");
const path = require("path");

const walletFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "wallet.js");
const telegramFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "strategies", "TelegramAppStrategy.js");

let patched = 0;

// Patch 1: wallet.js — fix data null checks
try {
    let s = fs.readFileSync(walletFile, "utf8");
    let changed = false;

    if (s.includes("if (data.account_id == null)") && !s.includes("data == null || data.account_id")) {
        s = s.replace("if (data.account_id == null) {", "if (data == null || data.account_id == null) {");
        changed = true;
    }

    if (s.includes("data.payload == null || data.account_id == null") && !s.includes("data == null || data.payload")) {
        s = s.replace(
            /if \(data\.payload == null \|\| data\.account_id == null\)/g,
            "if (data == null || data.payload == null || data.account_id == null)"
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(walletFile, s, "utf8");
        console.log("[patch] wallet.js — fixed");
        patched++;
    } else {
        console.log("[patch] wallet.js — ok");
    }
} catch (e) {
    console.warn("[patch] wallet.js skip:", e.message);
}

// Patch 2: TelegramAppStrategy.js — comment out the close() LINE
try {
    let s = fs.readFileSync(telegramFile, "utf8");
    let changed = false;

    if (s.includes(".close()") && !s.includes("// PATCHED: close disabled")) {
        let lines = s.split("\n");
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(".close()")) {
                lines[i] = "            // PATCHED: close disabled";
                changed = true;
            }
        }
        s = lines.join("\n");
    }

    if (changed) {
        fs.writeFileSync(telegramFile, s, "utf8");
        console.log("[patch] TelegramAppStrategy.js — close removed");
        patched++;
    } else {
        console.log("[patch] TelegramAppStrategy.js — ok");
    }
} catch (e) {
    console.warn("[patch] TelegramAppStrategy.js skip:", e.message);
}

console.log("[patch] Done, " + patched + " file(s) patched");