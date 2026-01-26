import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
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