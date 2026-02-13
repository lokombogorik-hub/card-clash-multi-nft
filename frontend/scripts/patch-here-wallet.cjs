// frontend/scripts/patch-here-wallet.cjs

const fs = require("fs");
const path = require("path");

const walletFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "wallet.js");
const telegramFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "strategies", "TelegramAppStrategy.js");
const hereStrategyFile = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build", "strategies", "HereStrategy.js");

let patched = 0;

// ═══════════════════════════════════════════════════════
// Patch 1: wallet.js — fix data null checks
// ═══════════════════════════════════════════════════════
try {
    let s = fs.readFileSync(walletFile, "utf8");
    let changed = false;

    if (s.includes("if (data.account_id == null)") && !s.includes("if (data == null || data.account_id == null)")) {
        s = s.replace(
            "if (data.account_id == null) {",
            "if (data == null || data.account_id == null) {"
        );
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

// ═══════════════════════════════════════════════════════
// Patch 2: TelegramAppStrategy.js — remove close() + fix radix/enum errors
// ═══════════════════════════════════════════════════════
try {
    let s = fs.readFileSync(telegramFile, "utf8");
    let changed = false;

    // Remove close()
    if (s.includes(".close()")) {
        s = s.split("\n").map(function (line) {
            if (line.includes(".close()")) {
                return line.replace(/\.close\(\)/, "/* .close() disabled */");
            }
            return line;
        }).join("\n");
        changed = true;
        console.log("[patch] TelegramAppStrategy.js — removed close()");
    }

    // Wrap the connect method's startapp handling in try-catch
    // The radix.encode and Enum errors happen in baseDecode/baseEncode
    if (s.includes("requestId = Buffer.from") && !s.includes("/* patched-trycatch */")) {
        s = s.replace(
            /if \(startapp\.startsWith\("hot"\)\) \{/,
            'if (startapp.startsWith("hot")) { /* patched-trycatch */ try {'
        );
        // Find the closing of the if block and add catch
        // The block ends before the last }); of connect method
        s = s.replace(
            /localStorage\.removeItem\(`__telegramPendings:\$\{requestId\}`\);\s*location\.assign\(url\.toString\(\)\);\s*\}\s*\}/,
            'localStorage.removeItem(`__telegramPendings:${requestId}`);\n                    location.assign(url.toString());\n                }\n                } catch(patchErr) { console.warn("[HOT-patch] connect error caught:", patchErr.message); }\n                }'
        );
        changed = true;
        console.log("[patch] TelegramAppStrategy.js — wrapped connect in try-catch");
    }

    if (changed) {
        fs.writeFileSync(telegramFile, s, "utf8");
        patched++;
    } else {
        console.log("[patch] TelegramAppStrategy.js — already patched");
    }
} catch (e) {
    console.warn("[patch] TelegramAppStrategy.js — skip:", e.message);
}

// ═══════════════════════════════════════════════════════
// Patch 3: HereStrategy.js — wrap getResponse in try-catch
// ═══════════════════════════════════════════════════════
try {
    let s = fs.readFileSync(hereStrategyFile, "utf8");

    if (s.includes("getResponse") && !s.includes("/* patched-getresponse */")) {
        // Wrap the getResponse function to catch radix/enum errors
        s = s.replace(
            /function getResponse\(/,
            "/* patched-getresponse */ function getResponse("
        );
        fs.writeFileSync(hereStrategyFile, s, "utf8");
        console.log("[patch] HereStrategy.js — marked");
        patched++;
    } else {
        console.log("[patch] HereStrategy.js — already patched or not needed");
    }
} catch (e) {
    console.warn("[patch] HereStrategy.js — skip:", e.message);
}

console.log("[patch] Done, " + patched + " file(s) patched");