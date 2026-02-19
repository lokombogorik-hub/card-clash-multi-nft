import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: [
        "buffer",
        "process",
        "crypto",
        "stream",
        "util",
        "assert",
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
      crypto: "crypto-browserify",
      stream: "stream-browserify",
    },
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
});