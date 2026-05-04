import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { initializeOrbitalEngine } from "./lib/orbital/setup";

// Global error listeners (debug helper from 2026-04-23 white-canvas
// bisect, commit `b5df427`). REMOVED 2026-04-24 after post-mortem
// identified the listeners themselves as a cumulative amplifier of
// the bug they were added to diagnose (HMR hot-updates re-executed
// main.tsx and appended a fresh pair of listeners without removing
// the previous ones). Full remediation history in `tasks/STATUS.md`
// §"White-canvas remediation wave (2026-04-24)" + §"Chronic dev-mode
// Context Lost — root-caused + fixed (2026-05-04, `b564c3d`)".

// React.StrictMode REMOVED 2026-05-04 after diagnosing the chronic
// dev-mode WebGL `Context Lost` cascade as a StrictMode double-mount
// problem. R3F's `<Canvas>` + atlas's GPU-resource-owning components
// (`SunBillboard`'s SpriteMaterial sharing a singleton texture map,
// `ProceduralSun3D`'s `WebGLCubeRenderTarget(512)`, all 4 Sun
// ShaderMaterials) cannot be made idempotent across StrictMode's
// "mount → unmount → remount synchronously" cycle without
// architectural surgery. During the brief overlap window two GPU
// contexts coexist; Chrome's per-tab WebGL context budget gets
// pressured and kills the older context, surfacing as
// `THREE.WebGLRenderer: Context Lost.` followed by the
// `SceneReadyChecker` 8 s safety hatch firing on a dead frame loop.
//
// Cost: dev-only double-render diagnostic for the React tree is
// disabled. Production builds never executed StrictMode (it's a
// dev-only no-op in production), so prod behavior is unchanged.
//
// Per-subagent diagnosis trail in commit message of the fix that
// landed this change.

initializeOrbitalEngine();

createRoot(document.getElementById("root")!).render(<App />);
