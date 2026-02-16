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

console.log("🔧 Patching @here-wallet/core@2.0.2...");

// ========== PATCH 1: wallet.js (data checks) ==========
if (fs.existsSync(WALLET_PATH)) {
    let code = fs.readFileSync(WALLET_PATH, "utf8");

    // Fix: data.account_id → check data first
    code = code.replace(
        /if\s*\(\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.account_id == null)"
    );

    code = code.replace(
        /if\s*\(\s*data\.payload\s*==\s*null\s*\|\|\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.payload == null || data.account_id == null)"
    );

    fs.writeFileSync(WALLET_PATH, code, "utf8");
    console.log("✅ Patched wallet.js");
} else {
    console.warn("⚠️  wallet.js not found");
}

// ========== PATCH 2: TelegramAppStrategy.js (remove close) ==========
if (fs.existsSync(TELEGRAM_STRATEGY_PATH)) {
    let code = fs.readFileSync(TELEGRAM_STRATEGY_PATH, "utf8");

    code = code.replace(
        /WebApp\.close\(\s*\);?/g,
        "/* WebApp.close() removed by patch */"
    );

    fs.writeFileSync(TELEGRAM_STRATEGY_PATH, code, "utf8");
    console.log("✅ Patched TelegramAppStrategy.js");
} else {
    console.warn("⚠️  TelegramAppStrategy.js not found");
}

console.log("🎉 Patch complete!");