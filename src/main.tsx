import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initializeOrbitalEngine } from "./lib/orbital/setup";

// Global error listeners (debug helper from 2026-04-23 white-canvas
// bisect, commit `b5df427`). REMOVED 2026-04-24 after post-mortem
// identified the listeners themselves as a cumulative amplifier of
// the bug they were added to diagnose: every Vite HMR hot-update
// re-executes `main.tsx` and appends a fresh pair of listeners
// without removing the previous ones. After ~N save-cycles in a
// long dev session the `window` accumulates N duplicated error
// handlers; each caught error logs N times with stack trace,
// flooding the main thread during the exact scenarios we wanted
// to diagnose (a 7-second rAF stall). Removing the listener pair
// entirely is simpler than adding `import.meta.hot.dispose()`
// just to defuse a debug helper — if a fresh diagnostic session
// needs them back, re-add WITH a dispose handler (see
// `tasks/white-canvas-bug-external-prompt.md` for the audit notes).

initializeOrbitalEngine();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
