import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            // polyfills for @here-wallet/core deps, do NOT touch react
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
});