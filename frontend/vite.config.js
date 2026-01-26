import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import inject from "@rollup/plugin-inject";

export default defineConfig({
    plugins: [
        react(),
        // Ensure globals exist inside every module (Telegram WebView safe)
        inject({
            process: "process",
            Buffer: ["buffer", "Buffer"],
        }),
    ],
    resolve: {
        alias: {
            process: "process/browser",
            crypto: "crypto-browserify",
            stream: "stream-browserify",
            util: "util",
        },
    },
    define: {
        global: "globalThis",
        "process.env": {},
    },
    optimizeDeps: {
        include: ["process", "crypto-browserify", "stream-browserify", "util"],
    },
});