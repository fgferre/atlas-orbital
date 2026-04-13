# Atlas Orbital Handoff

Last updated: 2026-04-13

## Purpose

This file is the canonical handoff for starting a new Codex conversation on this repository without relying on prior thread memory.

The goal is to preserve validated context, prevent repeated false assumptions, and give the next conversation a low-noise starting point.

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

- The orbital runtime is based on simplified keplerian elements stored in `src/data/celestialBodies.ts`.
- This is not the same as high-fidelity SPICE or Horizons ephemeris propagation.
- Marketing and presentation copy currently overstate precision in places, especially in `APRESENTACAO.md`.
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
