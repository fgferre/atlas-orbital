import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initializeOrbitalEngine } from "./lib/orbital/setup";

// Global error listeners (added 2026-04-23 for white-canvas boot
// investigation). Captures unhandled errors + promise rejections that
// React's error boundaries / try/catch wrappers would otherwise
// swallow silently — useful when a user reports the canvas going
// blank with no obvious console output.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    // Print message + stack as separate strings so the browser
    // console formats them readably (passing an object literal
    // shows up as "[object Object]" in some contexts).
    console.error(
      `[atlas] Uncaught error: ${event.message} (${event.filename}:${event.lineno}:${event.colno})`
    );
    if (event.error?.stack) {
      console.error("[atlas] Stack:", event.error.stack);
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? `${reason.message}\n${reason.stack ?? ""}`
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason, null, 2);
    console.error(`[atlas] Unhandled promise rejection: ${message}`);
  });
}

initializeOrbitalEngine();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
