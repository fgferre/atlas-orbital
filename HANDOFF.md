# Atlas Orbital Handoff

Last updated: 2026-04-18 (Wave α shipped)

## Purpose

This file is the canonical handoff for starting a new Codex conversation on this repository without relying on prior thread memory.

The goal is to preserve validated context, prevent repeated false assumptions, and give the next conversation a low-noise starting point.

## Status update — 2026-04-18 (Wave α)

**Wave α — HDR foundation + Graphics panel — SHIPPED.** Three commits landed atomically per `tasks/prompt-wave-alpha.md` + `tasks/implementation-roadmap.md`:

- `653cbe9` docs: MCP tooling policy relaxation (allows Claude Preview MCP alongside Playwright CLI; L11 HMR caveat preserved as factual).
- `73e75d3` refactor(graphics): R2 Wave 0 identity refactor. `useVisualPresetLerp` now accepts a `userOverrides: GraphicsOverrides` param (default `{}`) and composes against a pure `resolveLerpRefTargets` helper in `src/components/canvas/scene/visualPresetOverrides.ts`. Identity gate pinned by 12 unit tests; smoke gate via `boot-frozen` Playwright visual-diff at 1 % tolerance (focus + postprocessing ultra visual-diff tests were ruled unreliable and documented; the unit test is the rigorous identity gate).
- `73cd2c2` feat(vfx): R1 #1A + #1B + #2. `gl.toneMapping = NoToneMapping`, `gl.outputColorSpace = SRGBColorSpace`, `<ToneMapping mode={ToneMappingMode.AGX}>` runs LAST in the composer chain (after Bloom → HueSaturation → BrightnessContrast). `vfxHdrGain` uniform on Starfield + NASAStarfield ShaderMaterials (L15 literal: flows through the useMemo'd material ref, not JSX children) with tier defaults ultra 2.0 / high 1.8 / balanced 1.5 / constrained 1.0. Bloom `luminanceThreshold={1.0}` + `luminanceSmoothing={0.1}`. 5 new HDR-composite tests in `starfieldShaderMath.test.ts`.
- `4601969` feat(graphics): R2 Wave 1. `src/lib/graphics/resolver.ts` with `PRESET_DEFAULTS` (byte-matched to `qualityProfile.RESOLVED_PROFILES`), `src/store/graphicsSlice.ts`, `src/store.persistMigration.ts` bump v0 → v1 with migration for every legacy `qualityMode` value. User-facing `DisplayPanel` (18 E/H rows across Rendering / Post-Processing / Atmosphere & Sun) and `A11yPanel` (Reduced Motion + UI Scale active; Colorblind Mode + High Contrast grayed for Wave 4). Compat shim in `useQualityProfile.ts` keeps the 5 pre-Wave-α consumer sites working unchanged.

**Current live tone mapping:** AgX via composer `<ToneMapping mode={ToneMappingMode.AGX}>`. Renderer is `NoToneMapping`. Any doc that references `gl.toneMapping = ReinhardToneMapping` as the live path is pre-Wave-α and should be read as historical. `tasks/graphics-settings-design.md §3` carries the Finding 7 amendment (Tone Mapping dropdown options, Exposure deferred to Wave η.6).

**Deferred from Wave α (tracked for future waves):**

- Exposure slider — Wave η.6 (adaptive exposure / R1 #6). `gl.toneMappingExposure` is a no-op under the new contract; shipping a placeholder slider in Wave 1 would have been a dead control.
- Tone Mapping composer wiring — the dropdown persists user choice in `graphicsOverrides.toneMapping` but the composer stays pinned to AgX until Wave γ revisits the post-chain for lens-flare integration.
- Leva → `graphicsOverrides` routing — Wave 0 plan step 2, deferred past Wave α; Leva stays debug-only and doesn't affect user-facing paths.
- `postprocessing-ultra-frozen` visual-diff spec — Chromium headless `Page.captureScreenshot` protocol reproducibly hangs with the AgX + Bloom pipeline on ultra; the unit tests (`visualPresetOverrides.test.ts`, `starfieldShaderMath.test.ts`) are the rigorous gates and the boot visual-diff still covers default-tier render.

**Gates at Wave α close:** `npm run lint` clean, `npm run test:run` 689/689 across 44 files, `npm run build` ~9 s, `npx playwright test --workers=1` 7/7.

## Status update — 2026-04-18 (pre-Wave-α)

The sections further down predate the HYG migration and the analytical-ephemeris work. Corrections to the most load-bearing claims:

- **Starfield pipeline.** The legacy `src/data/tycho2-processed.bin` and `scripts/process-hyg.js` referenced below were deleted during the HYG-E cleanup (see `tasks/todo.md`). Runtime now loads tiered gzipped binaries from `public/data/hyg-stars/` (low/medium/high/full, max ~109.400 stars). Format lives in `src/utils/hygBinary.ts`. `CreditsModal` was updated to name HYG v4.2 correctly.
- **Orbital engine.** "Simplified keplerian elements" is no longer the whole story. The runtime uses analytical theories per family — VSOP87D for the 8 planets, Pluto-Meeus for Pluto, ELP/MPP02-trunc for the Moon, and Kepler propagation of osculating elements (derived from JPL Horizons fixtures at 2025-01-01 in TDB scale) for the remaining moons and asteroids. The "5 Newton-Raphson iterations" claim is obsolete: the active solver is `solveKeplerRad` in `src/lib/orbital/analytical/coordUtils.ts` (12 iterations, 1e-12 convergence). Regression suite in `src/lib/orbital/regression.test.ts` pins the full 28-body representative set (27 analytical + Triton as coarse Kepler control) at 2025-01-01 / 2025-07-01 / 2026-01-01 against Horizons, with per-body drift envelopes for resonance-heavy / short-period moons documented in the comment block above `MULTI_EPOCH_OVERRIDES`. Phase 3 tail closed in the commit that added the final 16 bodies to multi-epoch coverage.
- **"Current runtime uses full NASA/JPL-grade ephemerides"** — still rejected as stated. The runtime uses **analytical approximations validated against Horizons**, not live Horizons or SPICE propagation.
- **Documentation drift.** `APRESENTACAO.md` was tightened in 2026-04-18 (Onda 0.5 of the current plan): Kepler-only claim, "117.931 stars" fixed number, fabricated PSC/floating-origin, and the 8K texture list are now corrected. `README.md` was rewritten to match today's pipeline.
- **Active saneamento plan.** See `~/.claude/plans/revise-este-projeto-de-zany-abelson.md` (v3). Onda 0 (quick wins) and Onda 0.5 (docs) are done as of 2026-04-18. Next up: Onda 1 (decouple simulation tick from React store).
- **Performance facts still apply.** `Planet.tsx` useFrame still calls `resolveOrbitalDisplayPosition` per frame; the engine has an internal cache (`engine.ts:30`, bucket ~0,864 s, TTL 1 s) that is not yet fully exploited. Onda 1 addresses the upstream cause (`Timeline.tsx:198` writing `datetime` per frame to the store); Onda 3 instruments and measures the cache hit rate.

## Repository

- Workspace: `C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital`
- Main stack: React 19, Three.js, @react-three/fiber, Zustand, TypeScript, Vite
- Important repo instructions: `AGENTS.md`

## User Intent For Continuation Threads

The user explicitly wants future continuation work to:

- use this handoff as starting context
- prefer a strong main thread for synthesis and decisions
- use subagents for bounded discovery or parallel analysis when that reduces context pressure
- delegate simpler exploration work to cheaper capable models when possible
- avoid losing context due to compaction in the main conversation

## What Was Actually Verified

These points were checked against the code and local assets, not inferred from marketing copy or prior AI assessments.

### Runtime starfield facts

- The runtime does not currently load 2.5 million stars.
- `src/data/tycho2-processed.bin` has 2,358,632 bytes and encodes 117,931 stars.
- `src/data/tycho2-processed.bin.gz` has 1,668,908 bytes.
- The binary format is defined in `src/utils/tycho2Binary.ts`.
- The runtime loads the Tycho/HYG starfield as a single asset in `src/lib/starfield.ts`.
- The NASA starfield is split across fixed files in `public/data/nasa-stars/` and loaded with `Promise.allSettled` in `src/lib/starfield.ts`.

### Data provenance facts

- The file named `tycho2-processed.json` is generated from `scripts/hyg_v42.csv` by `scripts/process-hyg.js`.
- That means the runtime naming around "Tycho-2" is misleading or at least incomplete from a provenance standpoint.
- `CreditsModal.tsx` currently claims "Tycho-2 Star Catalog" and "2.5 million brightest stars", which does not match the actual runtime pipeline.

### Performance facts

- Orbital positions are recalculated on the main thread every frame in `src/components/canvas/Planet.tsx` via `AstroPhysics.calculateLocalPosition()`.
- The orbit solver is keplerian and uses 5 Newton-Raphson iterations in `src/lib/astrophysics.ts`.
- Orbit path generation can become expensive because focused bodies use up to 16,384 segments in `src/lib/orbitQuality.ts`.
- Starfield geometry is built on the main thread in one batch when catalogs are loaded in `src/components/canvas/Starfield.tsx` and `src/components/canvas/NASAStarfield.tsx`.
- The app already has some quality and memory controls:
- `src/lib/qualityProfile.ts`
- `src/hooks/useQualityProfile.ts`
- `src/lib/deferredTextureCache.ts`

### Loader and readiness facts

- The current loader logic does not prove the claim that the app waits for the whole starfield before showing anything.
- Starfield `loading`, `ready`, and `error` are treated as non-blocking in `src/lib/sceneReadiness.ts`.
- Scene readiness is finalized in `src/components/canvas/SceneReadyChecker.tsx`.
- The loader exits in `src/components/ui/Loader.tsx` once the scene is considered ready enough.

### Renderer facts

- The app currently uses WebGL, not WebGPU.
- `src/components/canvas/Scene.tsx` creates a `THREE.WebGLRenderer` configuration.
- No `WebGPURenderer` usage was found.
- No `Worker`, `SharedArrayBuffer`, `IndexedDB`, or octant-streaming implementation was found.

### Environment facts

- `node_modules` was not present when this handoff was prepared.
- `npm run build` failed in that environment because `tsc` was not available locally.
- No runtime profiling was performed in-browser during this handoff.

## What Was Rejected As Unsupported Or Exaggerated

These claims were reviewed and should not be repeated without new evidence:

- "The app currently renders 2.5 million stars at runtime."
- "The browser currently downloads 34 MB for the Tycho starfield."
- "The app currently takes 12 seconds to load."
- "70% of users abandon before load completes."
- "WebGPU + workers would guarantee 120+ FPS."
- "The current star catalog is already streamed by octants."
- "The current runtime uses full NASA/JPL-grade ephemerides."

## Current Scientific Reality Of The App

- The orbital runtime uses analytical theories per family (VSOP87D for planets, Pluto-Meeus for Pluto, ELP/MPP02-trunc for the Moon, Kepler propagation of osculating elements derived from Horizons fixtures for the remaining moons/asteroids). See `src/lib/orbital/registry.ts` and the 2026-04-18 status block at the top of this file.
- This is validated against Horizons fixtures but is **not** live SPICE or Horizons ephemeris propagation — it is an offline-calibrated analytical approximation.
- Marketing and presentation copy historically overstated precision in places, especially in `APRESENTACAO.md`. Onda 0.5 (2026-04-18) tightened the most load-bearing claims; residual marketing prose elsewhere should still be read with a critical eye.
- Some scientific and provenance UI already exists, especially around `visualProvenance`, but the model is incomplete and not consistently enforced across the product.

## Highest-Value Opportunities

These are the best candidate directions based on actual code inspection.

### Priority 1: Data and provenance normalization

Create one canonical source of truth for:

- celestial body metadata
- numeric scientific values
- visual provenance
- licensing/source metadata
- asset selection inputs

Relevant files today:

- `src/data/celestialBodies.ts`
- `src/data/assetManifest.ts`
- `src/data/assetStudyMatrix.ts`
- `src/lib/astrophysics.ts`
- `src/components/ui/Sidebar.tsx`
- `src/components/ui/CreditsModal.tsx`

Why this matters:

- reduces scientific overclaim
- fixes naming/provenance drift
- makes UI, docs, and rendering consume consistent data
- reduces long-term maintenance risk more than a speculative renderer rewrite

### Priority 2: Scientific contract and claim alignment

Bring product claims in line with runtime truth.

Scope includes:

- `APRESENTACAO.md`
- `README.md`
- `src/components/ui/CreditsModal.tsx`
- any user-facing labels that imply Tycho-2, Horizons, or exact ephemeris precision beyond what the runtime supports

Why this matters:

- improves trust
- prevents future architectural work from being planned on false premises
- removes one of the biggest quality risks in the current repo

### Priority 3: Canonical numeric scientific fields

Stop depending on free-form strings as the canonical scientific data source.

Today, numeric values are parsed from strings with `AstroPhysics.parseScientificValue()`, which is useful as a bridge but not ideal as a long-term contract.

This should evolve toward:

- canonical numeric fields for mass, gravity, etc.
- presentation fields derived from canonical values
- validation tests that catch malformed or inconsistent scientific data

### Priority 4: Measured main-thread performance work

Only after data/provenance alignment is in place, investigate performance surgically.

Likely real targets:

- orbit path generation cost
- repeated orbital recomputation per frame
- synchronous starfield geometry construction on load
- coarse automatic quality adaptation based only on device heuristics

Non-goal for early cycles:

- do not jump directly to WebGPU
- do not design around SharedArrayBuffer before profiling proves the need
- do not introduce streaming-by-octant architecture based on prior AI claims alone

## Recommended Next-Cycle Plan

The next conversation should pick one primary track, not mix all of them.

### Track A: Data/provenance correction and hardening

Suggested deliverables:

1. Map the current scientific and provenance fields across bodies, assets, and UI.
2. Propose a canonical schema for bodies plus provenance.
3. Implement that schema incrementally without broad rewrites.
4. Update the UI and docs to consume the corrected metadata.
5. Add validation tests for critical claims and data integrity.

Definition of done:

- Tycho/HYG naming mismatch is no longer misleading.
- User-facing claims match runtime reality.
- Canonical data fields exist for at least the highest-risk scientific/provenance paths.

### Track B: Performance measurement and targeted optimization

Suggested deliverables:

1. Measure or instrument the cost of orbital updates and orbit path generation.
2. Reduce unnecessary per-frame computation where possible.
3. Evaluate whether starfield geometry build should move to a Worker.
4. Consider a runtime adaptive quality loop only if measured instability exists.
5. Document findings before any renderer rewrite.

Definition of done:

- one or two real bottlenecks are measured and improved
- no speculative 10x claims are introduced without evidence

## Subagent Strategy For New Conversations

Use subagents only for bounded, parallelizable work. Keep the main thread for synthesis, planning, and final decisions.

### Recommended first round

Spawn explorer A:

- question: what are the real measurable main-thread hotspots
- focus files: `Planet.tsx`, `astrophysics.ts`, `orbitQuality.ts`, `Starfield.tsx`, `NASAStarfield.tsx`

Spawn explorer B:

- question: where are data/provenance/claim inconsistencies
- focus files: `celestialBodies.ts`, `assetManifest.ts`, `assetStudyMatrix.ts`, `CreditsModal.tsx`, `APRESENTACAO.md`

The main thread should then:

- compare both reports
- choose one primary track
- avoid opening a broad refactor until the first track is scoped tightly

### Model guidance

If the harness allows explicit model selection, prefer:

- main thread: strong frontier model with high reasoning for synthesis and tradeoffs
- discovery explorers: cheaper capable model with medium reasoning
- code worker: smaller coding-oriented model for bounded patches after the design is stable

Important:

- subagent role alone does not guarantee lower cost
- cheaper delegation requires explicit model selection at spawn time if supported

## Constraints And Cautions

- Do not assume APRESENTACAO.md is authoritative.
- Do not assume CreditsModal scientific labels are authoritative.
- Do not assume "Tycho-2" in the UI means the runtime currently ships a raw Tycho-2 pipeline.
- Do not prioritize store modularization unless real pain is demonstrated.
- Do not use browser MCP tools for Playwright-style work when terminal CLI alternatives are available, per `AGENTS.md`.
- Before creating new structures, first check whether an existing file or workflow already serves the purpose.

## Minimum Verification For The Next Conversation

For documentation/data work:

- run targeted tests for changed modules if dependencies are available
- perform a local consistency pass across data, UI labels, and docs

For performance work:

- measure before changing architecture
- keep notes of what was inferred versus what was measured

Always report:

- what was actually verified
- what remains unverified
- what assumptions were necessary

## Quick Start Prompt For The Next Thread

If needed, the next conversation can begin with something like:

"Read `HANDOFF.md` in the repo root and continue from it. Use subagents for bounded parallel discovery, keep the main thread focused on synthesis, and propose the smallest high-value next step."
