import process from "process";
import { Buffer } from "buffer";

// Make globals available ASAP (some deps read them at import-time)
globalThis.process = globalThis.process || process;
globalThis.Buffer = globalThis.Buffer || Buffer;

if (typeof window !== "undefined") {
  window.process = window.process || process;
  window.Buffer = window.Buffer || Buffer;
}

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);