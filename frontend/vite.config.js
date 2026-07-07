import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Конфиг-функция: в продакшн-сборке вырезаем console.* и debugger,
// в dev — оставляем для отладки.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      crypto: "crypto-browserify",
      stream: "stream-browserify",
      buffer: "buffer",
      process: "process",
    },
  },
  define: {
    "process.env": {},
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["buffer", "process"],
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
    },
  },
  esbuild: {
    drop: mode === "production" ? ["console", "debugger"] : [],
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
}));
