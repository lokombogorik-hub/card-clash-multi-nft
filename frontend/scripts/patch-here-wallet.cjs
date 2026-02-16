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

console.log("🔧 Patching @here-wallet/core@3.4.0...");

// ========== PATCH 1: wallet.js ==========
if (fs.existsSync(WALLET_PATH)) {
    let code = fs.readFileSync(WALLET_PATH, "utf8");

    // Fix data checks
    code = code.replace(
        /if\s*\(\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.account_id == null)"
    );

    code = code.replace(
        /if\s*\(\s*data\.payload\s*==\s*null\s*\|\|\s*data\.account_id\s*==\s*null\s*\)/g,
        "if (data == null || data.payload == null || data.account_id == null)"
    );

    // ✅ CRITICAL: Force WidgetStrategy in Telegram WebApp
    code = code.replace(
        /if\s*\(\s*\(\s*\(_a\s*=\s*window\.Telegram\)\s*===\s*null\s*\|\|\s*_a\s*===\s*void\s*0\s*\?\s*void\s*0\s*:\s*_a\.WebApp\)\s*!=\s*null\s*\)\s*\{[^}]*return\s+new\s+TelegramAppStrategy[^}]*\}/,
        `if (((_a = window.Telegram) === null || _a === void 0 ? void 0 : _a.WebApp) != null) {
                console.log('[HOT PATCH] Forcing WidgetStrategy in Telegram');
                return new WidgetStrategy_1.WidgetStrategy(this, options);
            }`
    );

    fs.writeFileSync(WALLET_PATH, code, "utf8");
    console.log("✅ Patched wallet.js (data checks + force WidgetStrategy)");
} else {
    console.warn("⚠️  wallet.js not found");
}

// ========== PATCH 2: TelegramAppStrategy.js ==========
if (fs.existsSync(TELEGRAM_STRATEGY_PATH)) {
    let code = fs.readFileSync(TELEGRAM_STRATEGY_PATH, "utf8");

    code = code.replace(
        /WebApp\.close\(\s*\);?/g,
        "/* WebApp.close() removed by patch */"
    );

    fs.writeFileSync(TELEGRAM_STRATEGY_PATH, code, "utf8");
    console.log("✅ Patched TelegramAppStrategy.js (removed close)");
} else {
    console.warn("⚠️  TelegramAppStrategy.js not found");
}

// ========== PATCH 3: WidgetStrategy.js ==========
if (fs.existsSync(WIDGET_STRATEGY_PATH)) {
    let code = fs.readFileSync(WIDGET_STRATEGY_PATH, "utf8");

    // Add allow-same-origin to iframe sandbox
    code = code.replace(
        /sandbox\s*=\s*["']([^"']*)["']/g,
        function (match, attrs) {
            if (!attrs.includes("allow-same-origin")) {
                return `sandbox="${attrs} allow-same-origin"`;
            }
            return match;
        }
    );

    fs.writeFileSync(WIDGET_STRATEGY_PATH, code, "utf8");
    console.log("✅ Patched WidgetStrategy.js (sandbox)");
} else {
    console.warn("⚠️  WidgetStrategy.js not found");
}

console.log("🎉 Patch complete! WidgetStrategy forced in Telegram.");