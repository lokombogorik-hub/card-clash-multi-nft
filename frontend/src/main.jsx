import { Buffer } from "buffer";
globalThis.Buffer = Buffer;

import process from "process/browser";
globalThis.process = process;
if (!globalThis.process.env) globalThis.process.env = {};
globalThis.global = globalThis;

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);