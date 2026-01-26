import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

import "@near-wallet-selector/modal-ui/styles.css";

// Polyfills (still keep here)
import process from "process";
if (!globalThis.process) globalThis.process = process;

import { Buffer } from "buffer";
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

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