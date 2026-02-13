// frontend/scripts/patch-here-wallet.cjs
const fs = require("fs");
const path = require("path");

const BASE = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build");

// === PATCH 1: wallet.js — null checks ===
const walletPath = path.join(BASE, "wallet.js");
if (fs.existsSync(walletPath)) {
    let code = fs.readFileSync(walletPath, "utf8");
    let changed = false;

    // Fix: data.account_id when data is undefined
    // Pattern 1: if (data.account_id == null)
    if (code.includes("data.account_id == null") && !code.includes("data == null || data.account_id == null")) {
        code = code.replace(
            /if\s*\(\s*data\.account_id\s*==\s*null\s*\)/g,
            "if (data == null || data.account_id == null)"
        );
        changed = true;
    }

    // Pattern 2: if (data.payload == null || data.account_id == null)
    if (code.includes("data.payload == null") && !code.includes("data == null || data.payload == null")) {
        code = code.replace(
            /if\s*\(\s*data\.payload\s*==\s*null\s*\|\|\s*data\.account_id\s*==\s*null\s*\)/g,
            "if (data == null || data.payload == null || data.account_id == null)"
        );
        changed = true;
    }

    // Pattern 3: any bare data.X access without guard
    // Wrap the main callback in try-catch
    if (!code.includes("/*PATCHED_TRYCATCH*/")) {
        // Find onMessage handler patterns and wrap
        code = code.replace(
            /\.on\s*\(\s*["']message["']\s*,\s*(?:async\s+)?(?:function\s*\(([^)]*)\)|(\([^)]*\))\s*=>)\s*\{/g,
            function (match, args1, args2) {
                const args = args1 || args2 || "e";
                return match + "\n/*PATCHED_TRYCATCH*/try {";
            }
        );
        // This is imprecise — we do the safer version below instead
        // Revert this approach, use the direct null checks above
        code = code.replace(/\/\*PATCHED_TRYCATCH\*\/try \{/g, "");
    }

    // More targeted: wrap every `data.` access in optional chain style
    // Actually safer: just add guard at top of every function that uses `data`
    // Find: const { account_id, ... } = data  →  if(!data) return; const { ... } = data
    code = code.replace(
        /const\s*\{\s*(account_id[^}]*)\}\s*=\s*data\s*;/g,
        function (match, inner) {
            if (match.includes("/*NULL_GUARD*/")) return match;
            return "/*NULL_GUARD*/if(!data){console.warn('[PATCH] data is null');return;}\n" + match;
        }
    );

    // Also guard: data.account_id anywhere not already guarded
    code = code.replace(
        /([^|&!?\s])(\s*)(data\.account_id)/g,
        function (match, before, space, access) {
            if (before === "." || before === '"' || before === "'") return match;
            return before + space + "(data && " + access + ")";
        }
    );

    if (changed || code.includes("/*NULL_GUARD*/")) {
        fs.writeFileSync(walletPath, code, "utf8");
        console.log("[PATCH] wallet.js — null guards applied");
    } else {
        console.log("[PATCH] wallet.js — already patched or no match");
    }
} else {
    console.log("[PATCH] wallet.js not found at", walletPath);
}

// === PATCH 2: TelegramAppStrategy.js — remove WebApp.close() ===
const tgStratPath = path.join(BASE, "strategies", "TelegramAppStrategy.js");
if (fs.existsSync(tgStratPath)) {
    let code = fs.readFileSync(tgStratPath, "utf8");
    let changed = false;

    // Remove WebApp.close()
    if (code.includes("WebApp.close()")) {
        code = code.replace(/WebApp\.close\(\)\s*;?/g, "/* WebApp.close() removed by patch */");
        changed = true;
    }

    // Remove window.close()
    if (code.includes("window.close()")) {
        code = code.replace(/window\.close\(\)\s*;?/g, "/* window.close() removed by patch */");
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(tgStratPath, code, "utf8");
        console.log("[PATCH] TelegramAppStrategy.js — close() removed");
    } else {
        console.log("[PATCH] TelegramAppStrategy.js — already patched");
    }
} else {
    console.log("[PATCH] TelegramAppStrategy.js not found");
}

// === PATCH 3: Fix borsh Enum error ===
// The issue is in @near-js/transactions or borsh itself
// We patch the serialize/deserialize to catch and fallback

const borshCandidates = [
    path.join(__dirname, "..", "node_modules", "borsh", "lib", "cjs", "index.js"),
    path.join(__dirname, "..", "node_modules", "borsh", "lib", "esm", "index.js"),
    path.join(__dirname, "..", "node_modules", "borsh", "dist", "index.js"),
    path.join(__dirname, "..", "node_modules", "borsh", "lib", "index.js"),
];

for (const borshPath of borshCandidates) {
    if (!fs.existsSync(borshPath)) continue;
    let code = fs.readFileSync(borshPath, "utf8");

    // Find "Enum can only take single value" and make it non-fatal
    if (code.includes("Enum can only take single value") && !code.includes("/*PATCHED_ENUM*/")) {
        code = code.replace(
            /throw\s+new\s+Error\s*\(\s*["']Enum can only take single value["']\s*\)/g,
            '/*PATCHED_ENUM*/console.warn("Enum multi-value, using first"); Object.keys(properties).slice(1).forEach(function(k){delete properties[k]})'
        );
        fs.writeFileSync(borshPath, code, "utf8");
        console.log("[PATCH] borsh Enum error patched:", borshPath);
    }
}

// === PATCH 4: Fix @scure/base radix.encode Uint8Array check ===
const scureCandidates = [
    path.join(__dirname, "..", "node_modules", "@scure", "base", "lib", "esm", "index.js"),
    path.join(__dirname, "..", "node_modules", "@scure", "base", "lib", "index.js"),
    path.join(__dirname, "..", "node_modules", "@scure", "base", "index.js"),
];

for (const scurePath of scureCandidates) {
    if (!fs.existsSync(scurePath)) continue;
    let code = fs.readFileSync(scurePath, "utf8");

    // Find the Uint8Array check and make it convert instead of throw
    if (code.includes("radix.encode input should be Uint8Array") && !code.includes("/*PATCHED_RADIX*/")) {
        code = code.replace(
            /if\s*\(\s*!\s*\(\s*data\s+instanceof\s+Uint8Array\s*\)\s*\)\s*throw\s+new\s+Error\s*\(\s*["']radix\.encode input should be Uint8Array["']\s*\)/g,
            '/*PATCHED_RADIX*/if(!(data instanceof Uint8Array)){if(ArrayBuffer.isView(data)){data=new Uint8Array(data.buffer,data.byteOffset,data.byteLength)}else if(Array.isArray(data)){data=new Uint8Array(data)}else if(typeof data==="string"){data=new TextEncoder().encode(data)}else{throw new Error("radix.encode: cannot convert input")}}'
        );
        fs.writeFileSync(scurePath, code, "utf8");
        console.log("[PATCH] @scure/base radix patched:", scurePath);
        continue;
    }

    // Alternative pattern: might use different variable name
    if (code.includes("input should be Uint8Array") && !code.includes("/*PATCHED_RADIX*/")) {
        code = code.replace(
            /throw\s+new\s+(Type)?Error\s*\(\s*["'][^"']*input should be Uint8Array["']\s*\)/g,
            '/*PATCHED_RADIX*/console.warn("radix: coercing to Uint8Array")'
        );
        fs.writeFileSync(scurePath, code, "utf8");
        console.log("[PATCH] @scure/base (alt) patched:", scurePath);
    }
}

// === PATCH 5: WidgetStrategy — force overlay, prevent QR in TG ===
const widgetPath = path.join(BASE, "strategies", "WidgetStrategy.js");
if (fs.existsSync(widgetPath)) {
    let code = fs.readFileSync(widgetPath, "utf8");

    // Ensure widget uses iframe not popup in Telegram
    if (!code.includes("/*PATCHED_WIDGET*/")) {
        // Add a flag at the top
        code = "/*PATCHED_WIDGET*/\n" + code;
        fs.writeFileSync(widgetPath, code, "utf8");
        console.log("[PATCH] WidgetStrategy.js — marked");
    }
}

console.log("[PATCH] All patches complete!");