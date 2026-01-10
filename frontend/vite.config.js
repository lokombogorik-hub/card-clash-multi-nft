import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    plugins: [react()],

    resolve: {
        dedupe: ["react", "react-dom"],
        alias: {
            react: resolve(__dirname, "node_modules/react"),
            "react-dom": resolve(__dirname, "node_modules/react-dom"),
            "react-dom/client": resolve(__dirname, "node_modules/react-dom/client"),
        },
    },

    build: {
        minify: false, // пока оставь так для диагностики
    },
});