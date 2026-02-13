const fs = require("fs");
const path = require("path");

const walletFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "wallet.js");
const telegramFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "strategies", "TelegramAppStrategy.js");

let patched = 0;

// Patch wallet.js — fix data.account_id crash
try {
    let s = fs.readFileSync(walletFile, "utf8");
    let changed = false;

    if (s.includes("if (data.account_id == null)") && !s.includes("if (data == null || data.account_id == null)")) {
        s = s.replace("if (data.account_id == null) {", "if (data == null || data.account_id == null) {");
        changed = true;
    }

    if (s.includes("if (data.payload == null || data.account_id == null)") && !s.includes("if (data == null || data.payload == null")) {
        s = s.replace(
            /if \(data\.payload == null \|\| data\.account_id == null\)/g,
            "if (data == null || data.payload == null || data.account_id == null)"
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(walletFile, s, "utf8");
        console.log("[patch] wallet.js — fixed data null checks");
        patched++;
    } else {
        console.log("[patch] wallet.js — already patched or not needed");
    }
} catch (e) {
    console.warn("[patch] wallet.js — skip:", e.message);
}

// Patch TelegramAppStrategy.js — remove close()
try {
    let s = fs.readFileSync(telegramFile, "utf8");

    if (s.includes(".close()")) {
        s = s.split("\n").map(function (line) {
            if (line.includes(".close()")) {
                return line.replace(/\.close\(\)/, "/* .close() disabled */");
            }
            return line;
        }).join("\n");
        fs.writeFileSync(telegramFile, s, "utf8");
        console.log("[patch] TelegramAppStrategy.js — removed close()");
        patched++;
    } else {
        console.log("[patch] TelegramAppStrategy.js — already patched");
    }
} catch (e) {
    console.warn("[patch] TelegramAppStrategy.js — skip:", e.message);
}

console.log("[patch] Done, " + patched + " file(s) patched");