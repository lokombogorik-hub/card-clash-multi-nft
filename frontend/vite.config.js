import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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
    exclude: ["fsevents"],
    include: [
      "buffer",
      "stream-browserify",
      "crypto-browserify",
      "util",
      "assert",
      "process",
      "path-browserify",
      "url",
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
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: ["fsevents"],
      onwarn(warning, warn) {
        // Ignore node: module warnings
        if (
          warning.code === "UNRESOLVED_IMPORT" &&
          (warning.message.includes("fsevents") ||
            warning.message.includes("node:fs") ||
            warning.message.includes("node:"))
        ) {
          return;
        }
        warn(warning);
      },
    },
  },
});