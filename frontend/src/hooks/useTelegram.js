import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            include: [
                "buffer",
                "stream",
                "crypto",
                "util",
                "assert",
                "process",
                "readable-stream",
                "string_decoder",
                "safe-buffer",
                "process-nextick-args",
            ],
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
        }),
    ],
    resolve: {
        alias: {
            buffer: "buffer",
            stream: "stream-browserify",
            crypto: "crypto-browserify",
            util: "util",
            assert: "assert",
            process: "process/browser",
        },
    },
    optimizeDeps: {
        include: [
            "buffer",
            "stream-browserify",
            "crypto-browserify",
            "util",
            "assert",
            "process",
            "readable-stream",
            "string_decoder",
            "safe-buffer",
            "process-nextick-args",
        ],
        esbuildOptions: {
            define: {
                global: "globalThis",
            },
        },
    },
});