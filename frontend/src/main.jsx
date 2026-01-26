import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import "@near-wallet-selector/modal-ui/styles.css";

// Buffer polyfill for wallet libs (Telegram WebView / Vite)
import { Buffer } from "buffer";
if (!globalThis.Buffer) globalThis.Buffer = Buffer;
import process from "process";
if (!globalThis.process) globalThis.process = process;
const getAppHeight = () => {
  const tg = window.Telegram?.WebApp;
  return tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
};

const setAppHeight = () => {
  document.documentElement.style.setProperty("--app-h", `${getAppHeight()}px`);
};

setAppHeight();
window.addEventListener("resize", setAppHeight);

try {
  const tg = window.Telegram?.WebApp;
  tg?.onEvent?.("viewportChanged", setAppHeight);
} catch { }

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);