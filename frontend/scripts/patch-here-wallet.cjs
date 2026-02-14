// frontend/scripts/patch-here-wallet.cjs
const fs = require("fs");
const path = require("path");

// === PATCH 1: base-x — accept string/Uint8Array, not just Buffer ===
const basexPath = path.join(__dirname, "..", "node_modules", "base-x", "src", "index.js");
if (fs.existsSync(basexPath)) {
    let code = fs.readFileSync(basexPath, "utf8");
    if (!code.includes("/*PATCHED_BASEX*/")) {
        // Replace the Buffer check with universal acceptance
        code = code.replace(
            /if\s*\(\s*!_Buffer\.isBuffer\(source\)\s*\)\s*\{\s*throw\s+new\s+TypeError\s*\(\s*'Expected Buffer'\s*\)\s*\}/g,
            "/*PATCHED_BASEX*/if(!_Buffer.isBuffer(source)){if(source instanceof Uint8Array){source=_Buffer.from(source)}else if(typeof source==='string'){source=_Buffer.from(source,'utf8')}else if(Array.isArray(source)){source=_Buffer.from(source)}else{throw new TypeError('Expected Buffer')}}"
        );
        fs.writeFileSync(basexPath, code, "utf8");
        console.log("[PATCH] base-x — accept string/Uint8Array");
    } else {
        console.log("[PATCH] base-x — already patched");
    }
} else {
    console.log("[PATCH] base-x not found at", basexPath);
}

// === PATCH 2: borsh baseEncode — ensure Buffer conversion ===
const borshPath = path.join(__dirname, "..", "node_modules", "borsh", "lib", "index.js");
if (fs.existsSync(borshPath)) {
    let code = fs.readFileSync(borshPath, "utf8");
    if (!code.includes("/*PATCHED_BORSH_ENCODE*/")) {
        // Find baseEncode function and add Buffer coercion
        code = code.replace(
            /function\s+baseEncode\s*\(\s*value\s*\)\s*\{/,
            "function baseEncode(value) {\n/*PATCHED_BORSH_ENCODE*/if(typeof value==='string'){value=Buffer.from(value,'utf8')}else if(value instanceof Uint8Array&&!Buffer.isBuffer(value)){value=Buffer.from(value)}"
        );
        fs.writeFileSync(borshPath, code, "utf8");
        console.log("[PATCH] borsh baseEncode — Buffer coercion added");
    } else {
        console.log("[PATCH] borsh — already patched");
    }
} else {
    console.log("[PATCH] borsh not found at", borshPath);
}

// === PATCH 3: wallet.js — null checks for data.account_id ===
const HERE_BASE = path.join(__dirname, "..", "node_modules", "@here-wallet", "core", "build");
const walletPath = path.join(HERE_BASE, "wallet.js");
if (fs.existsSync(walletPath)) {
    let code = fs.readFileSync(walletPath, "utf8");
    let changed = false;

    // Fix: if (data.account_id == null) when data might be undefined
    if (code.includes("data.account_id == null") && !code.includes("/*PATCHED_NULL*/")) {
        code = code.replace(
            /if\s*\(\s*data\.account_id\s*==\s*null\s*\)/g,
            "/*PATCHED_NULL*/if(!data || data.account_id == null)"
        );
        changed = true;
    }

    // Fix: if (data.payload == null || data.account_id == null)
    if (code.includes("data.payload == null") && !code.includes("/*PATCHED_NULL2*/")) {
        code = code.replace(
            /if\s*\(\s*data\.payload\s*==\s*null\s*\|\|\s*data\.account_id\s*==\s*null\s*\)/g,
            "/*PATCHED_NULL2*/if(!data || data.payload == null || data.account_id == null)"
        );
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(walletPath, code, "utf8");
        console.log("[PATCH] wallet.js — null guards applied");
    } else {
        console.log("[PATCH] wallet.js — already patched or no match");
    }
} else {
    console.log("[PATCH] wallet.js not found");
}

// === PATCH 4: @scure/base if exists ===
const scurePaths = [
    path.join(__dirname, "..", "node_modules", "@scure", "base", "lib", "esm", "index.js"),
    path.join(__dirname, "..", "node_modules", "@scure", "base", "lib", "index.js"),
];
for (const sp of scurePaths) {
    if (!fs.existsSync(sp)) continue;
    let code = fs.readFileSync(sp, "utf8");
    if (code.includes("input should be Uint8Array") && !code.includes("/*PATCHED_RADIX*/")) {
        code = code.replace(
            /if\s*\(\s*!\s*\(\s*data\s+instanceof\s+Uint8Array\s*\)\s*\)\s*throw\s+new\s+Error\s*\(\s*["']radix\.encode input should be Uint8Array["']\s*\)/g,
            '/*PATCHED_RADIX*/if(!(data instanceof Uint8Array)){if(typeof data==="string"){data=new TextEncoder().encode(data)}else if(ArrayBuffer.isView(data)){data=new Uint8Array(data.buffer,data.byteOffset,data.byteLength)}else if(Array.isArray(data)){data=new Uint8Array(data)}else{throw new Error("radix.encode: cannot convert")}}'
        );
        fs.writeFileSync(sp, code, "utf8");
        console.log("[PATCH] @scure/base radix patched:", sp);
    }
}

console.log("[PATCH] All patches complete!");