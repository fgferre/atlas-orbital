# Wave α — HDR foundation + Graphics panel (atomic bundle)

Copy everything between the markers into a fresh Claude Code session.

```text
===COMEÇA===

Atlas Orbital — Implementation Wave α: HDR foundation + Graphics panel

Role:
You are continuing Atlas Orbital's orbital-realism initiative. Three research
sessions (R1 / R2 / R3) and one cross-track synthesis have shipped as
markdown docs in tasks/. This session ships **Wave α** — the atomic bundle
of R1 items #1A/#1B/#2 plus R2 Waves 0 and 1. The synthesis roadmap
(tasks/implementation-roadmap.md) explains why this bundle is atomic: R2
Wave 1 ships Bloom Intensity / Threshold / Tone Mapping / Exposure controls
that only do the thing users expect when R1 #1A/#1B/#2 have flipped the
pipeline to HDR-linear. Shipping either half alone produces dead controls
or invisible features.

Mission:
1. PLAN FIRST (CLAUDE.md #1 + L8 literal). Append a new dated "Wave α"
   section to tasks/todo.md under Active.
2. Ship three commits in strict order — Wave 0 refactor first, then HDR
   pipeline, then graphics slice / panel.
3. Every commit green through lint + test:run + build. Playwright e2e green
   after commits 2 and 3. Wave 0 refactor is an identity operation: visual-
   diff ≤ 0.1% (Playwright).
4. Update HANDOFF.md status block and any doc that cites
   ReinhardToneMapping as the live tone mapper.
5. Final chat report in the format specified at the end of this prompt.

### Authoritative references (load FIRST, in parallel, single message):

- tasks/implementation-roadmap.md — the wave card for α (scope, commit
  strategy, risks, open questions). THIS IS THE GOVERNING DOC.
- tasks/lighting-backlog.md — R1 items #1A, #1B, #2 in detail (§1.1, §1.2,
  §1.3). Read each item's full card including risk log.
- tasks/graphics-settings-design.md — R2 architecture. Read §1 (UI
  location rationale), §3 (full control catalog), §4 (preset↔granular
  Custom-label flow), §5 (store slice shape), §6 (persist v0→v1 migration).
- tasks/graphics-settings-implementation-plan.md — R2 phased rollout. Read
  Wave 0 (identity refactor) and Wave 1 (full file list + test plan +
  commit strategy) in full.

### Standard read-set:

- AGENTS.md, CLAUDE.md — engineering standards (literal precedence)
- HANDOFF.md — current project status
- PLAN.md — phase roadmap
- tasks/lessons.md — ALL of L15 (ShaderMaterial uniforms race — critical
  for R1 #1B), L17 (DPR math — critical because Wave 0 touches lerp),
  L18 (simulation clock outside React), L19 (overlay hot paths)

### Critical code read-set (before touching any file):

- src/components/canvas/Scene.tsx — line 267 (Reinhard tone mapping
  assignment), lines 272–277 (effect refs), lines 364–375 (VisualPresetLerp
  plumbing), lines 439–446 (EffectComposer mount)
- src/components/canvas/scene/PostProcessingPipeline.tsx — lines 58–71
  (effects chain; ordering matters for HDR)
- src/components/canvas/scene/useVisualPresetLerp.ts — ALL of it. Wave 0's
  identity refactor centres on this.
- src/lib/qualityProfile.ts — tier definitions (constrained / balanced /
  high / ultra) + the 28 consumer sites.
- src/store.ts — current AppState, partialize list, persist config.
- src/components/canvas/Starfield.tsx — ShaderMaterial wiring (L15 pattern
  reference — R1 #1B must follow)
- src/components/canvas/NASAStarfield.tsx — sibling to Starfield; same
  pattern.
- src/components/ui/LayersPanel.tsx — where the new Display panel routes
  from.
- src/components/ui/controlPanelConfig.ts — rail button registry.

### Scope in this wave

Three commits in strict sequence. Do NOT reorder. Gates between each.

**Commit 1 — R2 Wave 0 — `refactor(graphics): single-source overrides via
visualPreset lerp`**

- Objective: collapse every per-frame visual-parameter write to a single
  source of truth (visual preset + future overrides), WITHOUT changing
  any rendered pixel.
- See graphics-settings-implementation-plan.md Wave 0 for the exact file
  list and refactor steps.
- **Important — visual-diff infrastructure is NEW, not pre-existing**
  (Finding 6 in the roadmap). Today's `e2e/boot.spec.ts`,
  `e2e/focus.spec.ts`, `e2e/postprocessing.spec.ts` validate structure
  only (canvas sizing, search flow, `data-postprocessing` attribute);
  they do NOT do pixel-diff. Commit 1 MUST add `toHaveScreenshot`
  assertions to each of the three specs with `maxDiffPixelRatio: 0.001`,
  capture baseline PNGs, and commit the baselines alongside the refactor.
  This is the new gate — without it, the "Wave 0 identity invariant" is
  a handshake, not a check.
- Gates: lint + test:run + build + Playwright e2e. The new
  `toHaveScreenshot` assertions must pass on the refactored code against
  the baselines captured from pre-refactor code (record baseline from
  pre-commit state, then verify refactor stays within 0.1%). If
  `maxDiffPixelRatio` exceeds 0.001, **stop and rework the lerp math
  before piling on HDR changes**. A non-identity Wave 0 poisons
  everything downstream.

**Commit 2 — R1 #1A + #1B + #2 — `feat(vfx): HDR pipeline + AgX + selective
bloom + star emissive recal`**

R1 #1A (HDR pipeline contract):
- Remove `gl.toneMapping = THREE.ReinhardToneMapping` from Scene.tsx:267.
- Set `gl.outputColorSpace = THREE.SRGBColorSpace` explicitly (don't rely
  on default).
- In PostProcessingPipeline.tsx:68 replace `<ToneMapping />` with
  `<ToneMapping mode={ToneMappingMode.AGX} />`.
- Reorder the effect stack so tone mapping runs LAST (after bloom, hue/sat,
  brightness/contrast). Three.js r3f-postprocessing ordering is subtle —
  verify by reading the EffectComposer documentation and cross-checking
  against the existing pipeline.
- Grep the repo for every other assignment to `gl.toneMapping` before
  commit. There must be exactly zero remaining after R1 #1A lands.

R1 #1B (star emissive recalibration):
- Introduce `vfxHdrGain: number` uniform on both Starfield and NASAStarfield
  shader materials.
- Multiply the final fragment color by `vfxHdrGain` so bright stars emit
  >1.0 for bloom pickup.
- Tier-keyed defaults: ultra 2.0 / high 1.8 / balanced 1.5 / constrained
  1.0 (placeholder — R1 #1B §1.2 may prescribe different values; follow
  the doc).
- **L15 CRITICAL:** the uniform MUST flow through the existing useMemo'd
  THREE.ShaderMaterial reference, NOT via JSX `<shaderMaterial
  uniforms={{...}}>` children. Children pattern silently drops per-frame
  writes. See R1 #1B risk-log entry e and L15 in tasks/lessons.md.
- Update src/lib/starfieldShaderMath.test.ts expected values for the new
  gain uniform. Audit §4.3 of the backlog explains which 15 tests need
  touching.

R1 #2 (selective bloom):
- Set `luminanceThreshold={1.0}` and `luminanceSmoothing={0.1}` on the
  existing `<Bloom>` in PostProcessingPipeline.tsx.
- Bloom intensity + threshold + enabled become driven by
  `graphicsOverrides` (wired in Commit 3).

Gates: lint + test:run + build + Playwright e2e. Visual-diff WILL shift
at commit 2 (that's the point) — update baseline PNGs for any Playwright
snapshot tests that now fail, and verify the change is intentional (star
halos, subtle sun-side atmospheric tint boost, crisper bright-star
bloom) rather than a regression.

**Commit 3 — R2 Wave 1 — `feat(graphics): graphicsSlice + Display/A11y
panels + migration`**

New files (see implementation-plan Wave 1):
- src/store/graphicsSlice.ts — the slice (state + actions).
- src/lib/graphics/resolver.ts — resolveEffectiveGraphics + PRESET_DEFAULTS
  + projectToLegacyShape.
- src/lib/graphics/deviceSignals.ts — device-heuristic extraction (reused
  from qualityProfile auto-resolve logic).
- src/hooks/useEffectiveGraphics.ts — selector hook.
- src/components/ui/DisplayPanel.tsx — the panel itself.
- src/components/ui/A11yPanel.tsx — four rows per implementation-plan
  §83–98: Reduced Motion toggle (E, active), UI Scale slider (H, active),
  Colorblind Mode dropdown (grayed with tooltip "Available in a future
  update"), High Contrast toggle (grayed, same tooltip). Grayed rows
  establish panel scope for future waves — do NOT omit them.
- src/components/ui/primitives/Slider.tsx — new primitive.
- src/lib/graphics/resolver.test.ts — preset + overrides + auto-mode +
  custom-base cases.
- e2e/a11y.spec.ts — Reduced Motion toggle.

**Extended (NOT created — Finding 8)**:
- src/store.persistMigration.ts — owner of persist migration today at
  `PERSIST_VERSION = 0`. Bump to 1. Add `migrate()` branch: v0 envelope
  `{qualityMode, sunRenderMode, tutorialCompletionStatus}` → v1 envelope
  adding `graphicsPreset`, `graphicsAutoMode`, `graphicsOverrides: {}`
  derived from legacy `qualityMode`. Preserve sunRenderMode +
  tutorialCompletionStatus unchanged. Do NOT create a new migration file.
- src/store.persistMigration.test.ts — already has full coverage of v0
  flows. Extend with v0→v1 cases for every legacy `qualityMode` value
  (`auto | ultra | high | balanced | constrained`) and preservation
  assertions for the other two fields. Do NOT create a new test file.

Modified files:
- src/store.ts — integrate graphicsSlice, `partialize` expansion (expand
  from 3 fields to the 7 documented in design §5), wire the extended
  `migrate()`.
- src/lib/qualityProfile.ts — compat shim reading new slice via
  `resolveEffectiveGraphics`, projecting to legacy 7-field shape so the
  28 existing consumers keep working.
- src/hooks/useQualityProfile.ts — wrapper over `useEffectiveGraphics +
  projectToLegacyShape`.
- src/components/ui/controlPanelConfig.ts — add "display" + "a11y" entries
  to RIGHT_CONTROL_BUTTONS.
- src/components/ui/LayersPanel.tsx — route "display" → <DisplayPanel />,
  "a11y" → <A11yPanel />.
- e2e/quality.spec.ts — extend with panel open + preset change + override
  flip-to-Custom + Reset.
- tasks/graphics-settings-design.md §3 — apply Finding 7 override (see
  below) inline so the design doc reflects shipped reality, not the
  pre-α aspiration.

Ships all 19 E/H controls from graphics-settings-design.md §3, **with the
Finding 7 override applied to the Tone Mapping + Exposure rows**:
- **Tone Mapping** dropdown options become `{AgX [default], ACES,
  Reinhard, Cineon}` — drop `Linear` (no-tone-map breaks HDR contract),
  add `AgX` as default (per R1 #1A). Amend design §3 line 102 inline.
- **Exposure** slider's backing changes from `gl.toneMappingExposure` to
  the compositor `<ToneMapping>` effect's exposure uniform, exposed via
  ref mutation inside `useVisualPresetLerp` (same pattern as the bloom
  ref). `gl.toneMappingExposure` has no effect under R1 #1A's
  `NoToneMapping` renderer. Amend design §3 line 189 inline.

**Critical Wave 1 architectural resolution (per synthesis Finding 1):**
R1 references a `vfxSettings` slice; R2 references `graphicsSlice`. These
are the same concept under different names. The resolution is: NO separate
`vfxSettings` slice. Instead, R1's effect-id keyed toggles live as fields
inside `graphicsSlice.graphicsOverrides` (e.g. `bloomIntensityMul`,
`bloomThreshold`, etc. — per design §5's `GraphicsOverrides` shape). Single
root slice. Single persist entry. Future waves extend `GraphicsOverrides`
with new keys rather than adding new slices.

Gates: lint + test:run + build + Playwright e2e including the new a11y +
quality specs. Persist migration must preserve every user's existing
`qualityMode` preference (persistMigration.test.ts enforces this).

### Scope NOT in this wave — do not touch

- R1 #3 (atmosphere per-body) → Wave β
- R1 #5 (sun lens flare) → Wave γ
- R1 #4 beyond what R2 Wave 1 already implements → covered by this bundle
- R1 #6–#13 (exposure/eye-adaptation, SSAO, CA, DOF, film grain, vignette,
  motion blur, god rays, volumetric fog, multi-star lens flare) → Wave η
- R3 PBR tracks (sphere-texture + model-body) → Waves δ / ε / ζ
- Any refactor of qualityProfile consumers beyond the compat shim strictly
  required by migration
- Any new external dep (Wave α uses only what package.json already has:
  @react-three/postprocessing 3.0.4, three r181, n8ao transitive)

### Stretch (only if main scope green AND >2h context headroom)

None. Wave α is large enough (~800–1100 LOC, 3 commits). Attempting a
fourth item in the same session burns the commit-separation discipline
that lets this bundle ship cleanly. Defer.

### Gates (strict — no --no-verify, no commits against red tests)

Per commit:
  npm run lint
  npm run test:run
  npm run build
  (Playwright after commit 1: visual-diff ≤ 0.1% on identity specs;
   after commit 2: baselines updated for expected shift; after commit 3:
   new panel specs green)

Playwright invocation (per Finding 9):
  npx playwright test

That is the complete command. `playwright.config.ts:10` already declares
a `webServer` clause that starts `npm run preview:test` on the correct
port with `reuseExistingServer: !process.env.CI`. Running the preview
manually is redundant (local) or double-binds the port (CI). Do NOT
replicate the two-step pattern the old PLAN.md acceptance-gate text
described — it predated the `webServer` clause landing.

L11 pin: DO NOT use the Claude Preview MCP for visual confirmation — the
iframe 0×0 pin bites Canvas sizing. Use `npx playwright test` only.

### Pitfalls (real, not hypothetical)

- **L15 literal** — R1 #1B's `vfxHdrGain` uniform: JSX children pattern
  looks like it works in dev, then silently drops per-frame writes. Always
  useMemo + new THREE.ShaderMaterial + attach via `<primitive ref={...}>`
  or equivalent instance prop.
- **Double tone-map** — today's pipeline applies tone mapping TWICE
  (`gl.toneMapping = Reinhard` at the renderer level AND `<ToneMapping />`
  in the postprocessing chain). Both must be addressed in commit 2 or HDR
  colors get squashed before bloom picks them up.
- **Effect ordering** — `<ToneMapping>` must be the LAST effect in the
  chain. `<Bloom>` before, `<HueSaturation>` and `<BrightnessContrast>`
  between. Three.js r3f-postprocessing chain ordering trap: half the
  tutorials online put ToneMapping early; those are wrong for HDR.
- **Wave 0 identity invariant** — if visual-diff exceeds 0.1% at commit 1,
  STOP. The refactor has shifted math. Fix before piling on.
- **Persist migration** — test every v0 `qualityMode` value
  (`auto | ultra | high | balanced | constrained`) maps correctly to the
  new (graphicsPreset, graphicsAutoMode) pair. Losing a user's preference
  is the kind of bug that becomes a support issue.
- **L19 hot paths** — the Display panel MUST NOT subscribe to
  `displayedDatetime`. Shallow-select the specific store fields it needs.
  Audit new subscriptions before commit 3.
- **L17 DPR** — Resolution Scale slider writes to `qualityProfile.dprMax`;
  NEVER read `window.devicePixelRatio` directly. Use `gl.getPixelRatio()`
  for anything DPR-dependent inside components.
- **Migration compat shim** — qualityProfile.ts becomes a READ path on the
  new slice. All 28 existing consumer sites (listed in
  graphics-settings-current-audit.md) keep working unchanged. Verify by
  running full test suite AND manually smoke-testing at least
  `Scene.tsx`, `Starfield.tsx`, `SmartSunLight.tsx` after commit 3.

### Autonomy — full

- Commit-internal file ordering within the 3-commit spine.
- Test coverage depth beyond the minimum specified in implementation-plan.
- Minor UI polish within DisplayPanel that stays true to design §3.

### Autonomy — NONE

- Reordering or fragmenting the 3-commit sequence.
- Shipping any R1 item numbered > 2.
- Introducing any new dep.
- Creating a separate `vfxSettings` slice (Finding 1 resolution: nest in
  `graphicsOverrides`).
- Skipping research docs — they own the design decisions.
- --no-verify, force-push, amend previous session's commits.
- Touching PBR / model-body / atmosphere files outside the compat shim
  scope.

### Final report format (in chat at session end)

1. **Commit range** (e.g., 191408a..HEAD)
2. **Commits landed** (3 expected):
   - SHA + subject for each; what shipped in each
3. **Wave 0 identity invariant** — visual-diff percentage actually
   observed on each e2e spec. If > 0.1% anywhere, explain why this was
   acceptable (rare) or unavoidable (never, since this was the gate).
4. **Bloom / HDR visible verification** — Playwright snapshots before/after
   of a bright-star zoom + a sun-adjacent scene. Commit paths.
5. **Panel shell demo** — Playwright snapshot of Display panel open, with
   preset change → Custom flip visible.
6. **Persist migration test coverage** — all 5 v0 `qualityMode` values hit.
7. **Gate status** — lint / test:run / build / Playwright per commit.
8. **L15 verification** — confirm the `vfxHdrGain` uniform is wired via
   useMemo material ref pattern, not JSX children. Reference the exact
   file:line.
9. **Known limits** — any R1 item #1A/#1B/#2 detail that got compromised
   (e.g., AgX didn't land because mode enum unavailable in postprocessing
   3.0.4 — fallback to ACESFilmic).
10. **Codex review prompt** for the next reviewer — short, pointing at the
    3 commits + the HDR pipeline ordering + the persist migration + the
    L15 material wiring.

Today's date: [fill in at session start]. HEAD should be at or after the
last Phase 3 regression commit (see HANDOFF.md). If HEAD has moved in ways
that touch this wave's critical files (Scene.tsx, PostProcessingPipeline.
tsx, store.ts, Starfield.tsx), surface the drift and verify this prompt
still matches reality before starting commit 1.

===TERMINA===
```

## Usage

1. Open a fresh Claude Code window in the atlas-orbital repo.
2. Paste everything between `===COMEÇA===` and `===TERMINA===`.
3. Let the session execute — it will plan first (tasks/todo.md), then ship
   3 commits with gates between each.
4. When it returns the final report, review the SHA list and the Playwright
   artifacts before merging / pushing.

## After Wave α ships

Subsequent waves get their own short prompts derived from the roadmap + the
authoritative research docs. Use the template shape of this prompt but
point at the matching wave card. Waves β, γ, η share post-processing /
panel files and should be serialized; waves δ, ε, ζ share texture /
manifest files and must be strictly sequential. Waves from each column can
run in parallel.
