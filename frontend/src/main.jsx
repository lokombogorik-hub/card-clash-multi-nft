import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// CSS модалки NEAR Wallet Selector — импортируем в entrypoint
import "@near-wallet-selector/modal-ui/styles.css";

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