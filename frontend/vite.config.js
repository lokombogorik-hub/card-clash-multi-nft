import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            crypto: "crypto-browserify",
            stream: "stream-browserify",
            process: "process/browser",
            util: "util",
        },
    },
    define: {
        "process.env": {},
        global: "globalThis",
    },
    optimizeDeps: {
        include: ["crypto-browserify", "stream-browserify", "process", "util"],
    },
});