import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

const setAppHeight = () => {
  document.documentElement.style.setProperty("--app-h", `${window.innerHeight}px`);
};
setAppHeight();
window.addEventListener("resize", setAppHeight);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);