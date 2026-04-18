# Atlas Orbital — Graphics Settings Implementation Plan

**Version:** 2026-04-18 (post-Codex review v2)
**Scope:** Phased rollout of the design in `tasks/graphics-settings-design.md`. Wave 0 is an architectural prerequisite; Wave 1 is the user-facing foundation; Waves 2+ follow R1 backlog.

---

## Wave 0 — Architectural prerequisite (no user-facing UI)

**Goal:** collapse the three-writer ambiguity documented in design §0. Must land before Wave 1 so that user-facing knobs can actually write to state without fighting the per-frame lerp.

### Changes

1. **Refactor `src/components/canvas/scene/useVisualPresetLerp.ts`** to accept `(presetTarget, userOverrides)`:

   ```ts
   useVisualPresetLerp({
     // ...existing refs,
     presetTarget: VISUAL_PRESETS[visualPreset],
     userOverrides: graphicsOverrides, // NEW
   });
   ```

   Per-frame computation becomes:

   ```
   ref.current = presetTarget.<field> × (overrides.<field>Mul ?? 1)
                                       + (overrides.<field>Delta ?? 0)
   // Absolute-override fields (e.g. bloomThreshold):
   ref.current = overrides.<field> ?? presetTarget.<field>
   ```

2. **Route `useSceneDebugControls` through the new slice.** When `debugMode === true`, Leva reads/writes `graphicsOverrides` rather than owning its own refs. Leva gates panel visibility; not state ownership.

3. **No user-facing UI yet.** Commit as a single PR titled `refactor(graphics): single-source overrides via visualPreset lerp`.

### Verification

- **Identity test:** with `graphicsOverrides = {}`, Playwright visual-diff suite (`e2e/boot.spec.ts`, `e2e/focus.spec.ts`, `e2e/postprocessing.spec.ts`) shows ≤ 0.1% pixel delta vs. main. This is the gate.
- **Unit:** new `useVisualPresetLerp.test.ts` covering: empty overrides ⇒ preset-only; `{bloomIntensityMul: 2}` ⇒ doubled lerp target; `{bloomThreshold: 0.5}` ⇒ absolute 0.5 regardless of preset.
- Visible diff > 0.1% blocks merge until root-caused.

### Commit shape

- Branch: `wave0/graphics-override-layer`
- One commit. Tests alongside. Updates `tasks/todo.md` + `tasks/lessons.md` on land.

---

## Wave 1 — Foundation UI

**Goal:** ship the Display panel and A11y panel with only E / H rows from design §3. No R1-dependent controls. No empty sections.

### New files

- `src/store/graphicsSlice.ts` — the slice per design §5.
- `src/lib/graphics/resolver.ts` — `resolveEffectiveGraphics` + `PRESET_DEFAULTS` + `projectToLegacyShape`.
- `src/lib/graphics/deviceSignals.ts` — extraction of the signal collection already inside `qualityProfile.ts` (deviceMemory, hardwareConcurrency, connection, viewport, DPR).
- `src/hooks/useEffectiveGraphics.ts` — selector hook returning `EffectiveGraphics`.
- `src/components/ui/DisplayPanel.tsx` — the panel itself.
- `src/components/ui/A11yPanel.tsx` — placeholder shell (reduced-motion + UI-scale only).
- `src/components/ui/primitives/Slider.tsx` — new primitive (number input with range, numeric readout, reset-to-default chevron). Rest are reused.
- `src/store.persistMigration.test.ts` — one case per v0 `qualityMode`.
- `src/lib/graphics/resolver.test.ts` — preset + overrides + auto-mode + custom-base.
- `e2e/a11y.spec.ts` — reduced-motion toggle.

### Modified files

- `src/store.ts`:
  - Integrate `graphicsSlice` + `AccessibilityState`.
  - `PERSIST_VERSION: 0 → 1`.
  - `partialize` expanded to 7 fields (keeps `qualityMode` as compat).
  - Add `migrate(persistedState, version)`.
- `src/lib/qualityProfile.ts`:
  - Becomes compat shim — reads new slice via `resolveEffectiveGraphics`, projects to legacy 7-field shape.
  - `RESOLVED_PROFILES` stays in the file until Wave 6 as backup for unmigrated consumers.
- `src/hooks/useQualityProfile.ts`:
  - Thin wrapper over `useEffectiveGraphics` + `projectToLegacyShape`.
- `src/components/ui/controlPanelConfig.ts`:
  - Add `"display"` + `"a11y"` entries to `RIGHT_CONTROL_BUTTONS`.
- `src/components/ui/LayersPanel.tsx`:
  - Route `"display"` → `<DisplayPanel />`, `"a11y"` → `<A11yPanel />`.
- `e2e/quality.spec.ts`:
  - Extend: rail click opens Display panel; preset change updates DPR; override flip-to-Custom; Reset restores.

### Sections rendered in Wave 1

**DisplayPanel:**

- Rendering — Preset + Auto + Resolution Scale + Antialias (read-only) + Shadow Map Size + Env Map Resolution.
- Post-Processing — Bloom toggle + Bloom Intensity + Bloom Threshold + Tone Mapping + Exposure + Contrast + Brightness + Saturation.
- Atmosphere & Sun — Ambient Light + Sun Brightness + Shadow Light + Env Reflections + Sun Render.
- _Performance section_ — only if `performance.memory` present (heap indicator).
- _Textures & LoD_ — hidden in Wave 1.
- _Camera Effects_ — hidden in Wave 1.

**A11yPanel:**

- Reduced Motion toggle (E).
- UI Scale slider (H).
- Colorblind Mode dropdown (grayed out, tooltip "Available in a future update").
- High Contrast toggle (grayed out, same tooltip).

### Verification

- `pnpm tsc --noEmit` clean.
- `pnpm test` — new unit tests pass; existing suite unchanged.
- `npx playwright test e2e/quality.spec.ts e2e/a11y.spec.ts` — passes (CLI per L21, not MCP per L11).
- Boot + postprocessing + focus visual specs unchanged (Wave 0 invariant).
- Manual: each Wave-1 row changes the render within one frame (or within 300 ms for DPR); each override triggers Custom; Reset restores.

### Commit strategy

- Branch: `wave1/display-and-a11y-foundation`
- Two commits:
  1. `feat(graphics): add graphicsSlice + resolver + migration`
  2. `feat(graphics): add Display and A11y panels`
- Updates `tasks/todo.md` + `tasks/lessons.md` after land.

---

## Wave 2 — Post-Processing deep dive

**Assumes R1 ranks bloom tuning first.** If not, skip to whichever R1 item lands first.

- No new controls (they were already Wave-1 H-class). Wave 2 is the presentation pass:
  - Add tooltip previews with before/after icons.
  - Add per-preset "recommended range" annotations on sliders.
  - A/B toggle: "Compare to preset default" (ghosted overlay, 1 s snap).
- Commit: `feat(graphics): post-processing presentation polish`.

---

## Wave 3 — Camera Effects (R1-gated)

Triggers when R1 lands motion blur / DoF / CA / grain / vignette / lens flare as `@react-three/postprocessing` effects.

- Populate `CameraEffectsSection` inside `DisplayPanel`.
- New overrides in `GraphicsOverrides`: `motionBlurEnabled`, `motionBlurIntensity`, `dofEnabled`, `dofFocalDistance`, `dofFocalLength`, `caIntensity`, `grainIntensity`, `vignetteIntensity`, `vignetteRadius`, `lensFlareIntensity`.
- `PRESET_DEFAULTS` extended; Low preset → all disabled.
- Persist migration v1 → v2: optional fields default to preset values.

---

## Wave 4 — Accessibility expansion (R1-gated)

Triggers when R1 lands `ColorBlindCorrection` post-process effect + high-contrast theme tokens.

- Activate Colorblind Mode dropdown (un-gray, wire to effect).
- Activate High Contrast toggle (wire to CSS custom property swap).
- Add Caption Scale slider (if captions system lands).

---

## Wave 5 — LoD & textures

Triggers when R1 lands LoD system + orbit-line density modulator.

- Populate `TexturesAndLoDSection`.
- New overrides: `bodyLodBias`, `orbitLineDensity`, `textureTier`.
- New preset defaults per tier.

---

## Wave 6 — Compat cleanup

**Removes the `qualityMode` compat layer** one release cycle after Wave 1.

- Delete `qualityMode` from `partialize` envelope.
- Delete `RESOLVED_PROFILES` literal from `qualityProfile.ts`.
- `qualityProfile.ts` becomes pure re-export of `resolver.ts`.
- Persist bump v2 → v3 with drop migration (discard `qualityMode` on read).
- Update all consumers that still reference `qualityMode` directly (grep pass — should be zero after Wave 5 audit).

---

## Per-wave checklist template

Each wave PR must include:

1. **File-by-file change list** in PR description.
2. **Unit + Playwright test plan** — CLI only (`npx playwright test`), not MCP (per L11 + L21).
3. **Persist-migration delta** — note version bump + round-trip test.
4. **Accessibility regression** — tab order, ARIA labels on new controls, screen-reader smoke.
5. **Commit message shape + `tasks/todo.md` entry + `tasks/lessons.md` update** (if corrections happened during the wave).

---

## Risk log

### Wave 0 Playwright visual-diff drift

**Risk:** the lerp refactor introduces a 1-frame delay or ordering change that shifts the rendered pixel output, breaking the no-op invariant.

**Mitigation:** run `e2e/postprocessing.spec.ts` against the refactor branch before opening the PR. Any diff > 0.1% blocks merge. Root-cause by bisecting the change (compute-order vs. identity math). Do not relax the threshold.

### DPR live-apply flicker

**Risk:** `gl.setPixelRatio` mid-frame causes visible flash, especially when post-processing buffers get resized.

**Mitigation:** measure in Wave 1 verification. If flicker is visible, gate the DPR change behind a 300 ms overlay spinner + `frameloop="demand"` toggle. If still visible after spinner, fall back to "takes effect next time the panel closes" behavior and log.

### Persist v0 → v1 migration

**Risk:** a user on a v1 build reading a v0 payload without a valid `qualityMode` (corrupted localStorage) could crash the boot.

**Mitigation:** `migrate` must treat missing/unknown `qualityMode` as `"auto"`. Unit-test every known v0 value **plus** the undefined and unknown-string cases. Test the rollback path: a v0 build opening a v1 payload (forward compat) degrades gracefully by ignoring extra keys. Zustand persist already handles unknown keys in partialize; verify.

### Antialias toggle semantics

**Risk:** users click the AA toggle, expect live change, see nothing, report bug.

**Mitigation:** Wave 1 ships AA as **read-only** with visible "(takes effect on reload)" label and a toast on click. Do not ship a live toggle. Wave N migrates to post-process AA; the toggle flips to live at that point. Document the Wave-N migration path in `src/hooks/useEffectiveGraphics.ts` as a code comment pointing to this plan.

### localStorage quota

**Risk:** `graphicsOverrides` grows the persist envelope; unbounded future additions could overflow quota on long-lived tabs.

**Mitigation:** `createDedupedStorage` keeps writes cheap. Add a size assertion in Wave 1 tests: serialized envelope stays under 4 KB. Future waves that add many overrides (e.g. Wave 3's ~10 camera-effect fields) must re-check.

### Leva / user-override double-write after Wave 0

**Risk:** a stale Leva subscription survives the Wave 0 refactor and keeps writing directly to refs, racing the slice.

**Mitigation:** Wave 0 verification includes a grep for `ref.current =` outside `useVisualPresetLerp` — should be zero after refactor for the parameters listed in §0. Any residual direct write is a blocker.

### Custom-base state loss

**Risk:** user sets Custom, navigates away, returns; `customBase` must persist or the Reset button loses meaning.

**Mitigation:** `customBase` is in `partialize`. Verified by unit test (set Custom → reload → Reset button still says "Reset to High").

---

## Out of scope for this implementation plan

- Ranking R1 backlog priorities (Wave 2+ order depends on R1 decisions).
- Visual mockups / screenshots (design doc describes structure; Wave 1 PR carries visuals).
- Dependency upgrades (no new npm packages in Wave 0 or Wave 1; Wave 3 may need `@react-three/postprocessing` effect additions).
- HDR path (Wave 6+, WebGPU-dependent).
