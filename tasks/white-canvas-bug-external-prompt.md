# External research prompt — atlas-orbital white-canvas regression

**Copy everything below the separator line and paste into a fresh session of another AI (Codex CLI, ChatGPT o3, Gemini 2.5, Grok, etc.). The goal is an independent second opinion — do NOT paste our Claude session history alongside it.**

---

## Problem statement

I have a React + Vite + React Three Fiber (R3F) application that
renders a solar-system visualization. **Until about 18 commits
ago the app ran cleanly. Now the canvas goes white a few seconds
after load.** I want a second opinion on what regressed.

## Repro signature

Browser console, in order:

```
[atlas] WebGL renderer info: { vendor: 'Google Inc. (NVIDIA)',
  renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 ...)' }
[Violation] 'requestAnimationFrame' handler took 7176ms
[atlas] WebGL context lost — preventing default so the browser
  can attempt recovery.
[atlas] WebGL context lost — preventing default so the browser
  can attempt recovery.   (repeats 6-8x)
[SceneReadyChecker] Scene-ready fallback fired after 8000 ms —
  frame loop may not be running. Loader exiting anyway.
```

After those messages the canvas is white. React UI chrome
(top bar, tabs, side panels) is visible because the loader
exits via an 8-second `setTimeout` safety hatch; it's the
3D canvas that's dead.

## What already failed to fix it

- `rm -rf node_modules/.vite` + restart dev server — no change.
- Added `webglcontextlost.preventDefault()` + `webglcontextrestored` handler on the Canvas — lock stays lost.
- Added `try/catch` around every `useFrame` body — no change.
- Added 8s loader safety hatch so the 96% hang doesn't block — loader does exit, canvas still white.

## Stack

- React 18, Vite dev server (HMR enabled).
- Three.js + `@react-three/fiber` + `@react-three/drei` + `postprocessing`.
- Zustand store (`src/store.ts`) with in-memory + persisted slices.
- `OrbitControls` from `three-stdlib`.
- `troika-three-text` (SDF fonts).

## What changed in the suspect window

The last ~18 commits added, in chronological order:

1. `677ee5c` — meta: lessons M5 (pre-session).
2. `3c3846d` — T4.9a' Sun billboard at stellar distances.
3. `e9eb1e6` — ROADMAP sub-wave plan.
4. `49a44f9` — T4.5-β body name labels via drei `<Text>` (troika).
5. `dae3815` — T4.2-α per-frame `controls.dampingFactor` mutation inside a new `useFrame` in `CameraController`.
6. `032cba9` — T4.2-γ inertial wheel-zoom: new wheel handler pushes impulses into a velocity ref; new `useFrame` decays velocity + dispatches per-frame `OrbitControls.dollyIn/dollyOut`.
7. `06e7f5e` — T4.2-β surface-mode flag: `CameraController`'s `useFrame` now ALSO calls `useStore.getState().setSurfaceModeActive(active)` every frame (with no dedup inside the setter, I think).
8. `a9fc1bf` — `SunBillboard` vertex precision cap.
9. `a68ddce` — `SceneReadyChecker` 8s setTimeout safety hatch.
10. `2884592` — `webglcontextlost`/`restored` event handlers on the R3F Canvas.
11. `b5df427` — global error listener + WebGL renderer-info diagnostic in `handleCanvasCreated`.
12. `159090b` — re-enabled some components after a bisect.
13. `4571e86` — T4.2-β-handler Bronze: `CameraController` mutates `controls.target = camera.position + forward × 1.0` **every frame while `surfaceModeActive`**, zeros the focus-tracking `cameraDelta`. (Later superseded.)
14. `1612f07` — T5.1 atmosphere dynamic uniforms: per-frame write of 4 uniforms (fKrESun, fKmESun, fAlpha, nSamples) on the atmosphere material.
15. `dd02e1a` — T5.2 atmosphere blend mode (`THREE.AdditiveBlending` → `THREE.NormalBlending`).
16. `e0f7ae1` — T4.2-β-handler Silver: new `SurfaceModeFirstPerson` R3F component that calls `canvas.requestPointerLock()` via a `useEffect` whenever the `surfaceModeActive` store flag flips true; subscribes `document` listeners for `pointerlockchange`, `pointerlockerror`, `mousemove`, and `window` listeners for `keydown`/`keyup` (Q/E for roll). Disables OrbitControls while locked.

## What to do

Please analyze this **without asking me clarifying questions
first**. Make reasonable assumptions and say when you're
guessing.

1. **Most-likely culprit** — which of the 18 commits introduces
   the regression? Rank your top 3 with rationale. You don't
   have the code — reason from the commit descriptions and
   common R3F failure modes.

2. **Failure-mode taxonomy** — is this more likely:
   - (a) a render-loop storm (per-frame store writes cascading
     into re-renders),
   - (b) a memory / resource leak (event listeners, WebGL
     objects, HMR accumulation),
   - (c) a shader-compilation stall (new material per frame),
   - (d) an infinite-effect loop (useEffect dep changes that
     feed each other),
   - (e) a Pointer Lock API state bug (Chromium-specific),
   - (f) something else.

3. **Concrete diagnostic commands** I can run to confirm the
   cause in under 5 minutes. Assume I have Chrome DevTools and
   a local terminal.

4. **Concrete code-level hypotheses** — describe the specific
   bug pattern you believe is at play and WHAT the suspect code
   should look like if so.

5. **Rank-ordered remediation plan** — given the bug lives in
   this session's commits, which is the cheapest fix path:
   (a) `git revert` the Silver commit only,
   (b) `git revert` Bronze + Silver + surfaceMode flag,
   (c) revert all 18 commits and re-ship selectively,
   (d) patch without reverting — describe what to patch.

6. **One-sentence headline**: if forced to give one answer,
   what is the bug?

Be brief, be opinionated, cite framework-level reasoning. No
boilerplate. Under 1500 words.
