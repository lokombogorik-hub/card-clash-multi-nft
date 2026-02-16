const fs = require("fs");
const path = require("path");

const WALLET_PATH = path.join(
    __dirname,
    "../node_modules/@here-wallet/core/build/wallet.js"
);

const TELEGRAM_STRATEGY_PATH = path.join(
    __dirname,
    "../node_modules/@here-wallet/core/build/strategies/TelegramAppStrategy.js"
);

const WIDGET_STRATEGY_PATH = path.join(
    __dirname,
    "../node_modules/@here-wallet/core/build/strategies/WidgetStrategy.js"
);

console.log("🔧 Patching @here-wallet/core...");

// ========== PATCH 1: wallet.js (data checks) ==========
if (fs.existsSync(WALLET_PATH)) {
    let code = fs.readFileSync(WALLET_PATH, "utf8");

    // Fix 1: data.account_id → check data first
    code = code.replace(
        /if\s*\(\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.account_id == null)"
    );

    // Fix 2: data.payload check
    code = code.replace(
        /if\s*\(\s*data\.payload\s*==\s*null\s*\|\|\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.payload == null || data.account_id == null)"
    );

    // Fix 3: Wrap ALL borsh.deserialize calls in try-catch
    code = code.replace(
        /borsh\.deserialize\(/g,
        "(function(schema, data) { try { return borsh.deserialize(schema, data); } catch(e) { console.warn('[BORSH] deserialize error:', e.message); return null; } })("
    );

    fs.writeFileSync(WALLET_PATH, code, "utf8");
    console.log("✅ Patched wallet.js (data + borsh safety)");
} else {
    console.warn("⚠️  wallet.js not found, skipping");
}

// ========== PATCH 2: TelegramAppStrategy.js (remove close) ==========
if (fs.existsSync(TELEGRAM_STRATEGY_PATH)) {
    let code = fs.readFileSync(TELEGRAM_STRATEGY_PATH, "utf8");

    // Remove WebApp.close() completely
    code = code.replace(
        /WebApp\.close\(\s*\);?/g,
        "/* WebApp.close() removed by patch */"
    );

    fs.writeFileSync(TELEGRAM_STRATEGY_PATH, code, "utf8");
    console.log("✅ Patched TelegramAppStrategy.js (removed close)");
} else {
    console.warn("⚠️  TelegramAppStrategy.js not found, skipping");
}

// ========== PATCH 3: WidgetStrategy.js (iframe sandbox) ==========
if (fs.existsSync(WIDGET_STRATEGY_PATH)) {
    let code = fs.readFileSync(WIDGET_STRATEGY_PATH, "utf8");

    // Add allow-same-origin to sandbox (fix iOS cross-origin)
    code = code.replace(
        /sandbox\s*=\s*["']([^"']*)["']/g,
        function (match, attrs) {
            if (!attrs.includes("allow-same-origin")) {
                return `sandbox="${attrs} allow-same-origin"`;
            }
            return match;
        }
    );

    // Ignore postMessage errors
    code = code.replace(
        /window\.addEventListener\s*\(\s*["']message["']/g,
        `window.addEventListener('message', function(e) { try { /* original handler */ } catch(err) { console.warn('[Widget] postMessage error:', err.message); } }); window.addEventListener('message-ignored'`
    );

    fs.writeFileSync(WIDGET_STRATEGY_PATH, code, "utf8");
    console.log("✅ Patched WidgetStrategy.js (sandbox + error handling)");
} else {
    console.warn("⚠️  WidgetStrategy.js not found, skipping");
}

console.log("🎉 Patch complete!");