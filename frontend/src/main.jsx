// frontend/src/main.jsx
import { Buffer } from "buffer";
import process from "process/browser";

// Polyfills MUST be set before any imports that use them
globalThis.Buffer = Buffer;
globalThis.process = process;
window.Buffer = Buffer;
window.process = process;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);