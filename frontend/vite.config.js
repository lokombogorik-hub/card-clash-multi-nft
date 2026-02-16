import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

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
        "path",
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
      path: "path-browserify",
      "node:path": "path-browserify",
      "node:fs": path.resolve(__dirname, "./src/polyfills/empty.js"),
      "node:fs/promises": path.resolve(__dirname, "./src/polyfills/empty.js"),
      "node:url": "url",
      "node:buffer": "buffer",
      "node:stream": "stream-browserify",
      "node:crypto": "crypto-browserify",
      "node:util": "util",
      "node:assert": "assert",
      "node:process": "process/browser",
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
      "path-browserify",
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
  build: {
    rollupOptions: {
      external: ["fsevents"],
      onwarn(warning, warn) {
        if (warning.code === "UNRESOLVED_IMPORT" && warning.message.includes("fsevents")) {
          return;
        }
        warn(warning);
      },
    },
  },
});