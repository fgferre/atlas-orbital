# Atlas Orbital — Graphics Settings Design

**Version:** 2026-04-18 (post-Codex review v2)
**Status:** Architectural spec — Wave 1 + Wave N implementers should follow without interpretation slack.
**Scope:** Resolves how user-facing graphics controls coexist with existing `qualityProfile`, `visualPreset`, and Leva debug systems; proposes UI surface, state slice, resolver, persistence migration, and live-apply semantics.

---

## §0. Source of Truth (prerequisite — resolve before any UI lands)

Atlas currently has **three systems** writing to overlapping visual parameters. Before introducing user-facing sliders, the canonical writer for each parameter family must be named; otherwise, a new Bloom slider gets overwritten 60×/s by `useVisualPresetLerp`.

| Parameter family                                                         | Current writer(s)                                                  | New canonical writer                                                                                                                    | Legacy writers' new role                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `dprMax` (resolution scale)                                              | `qualityProfile.ts` → Scene.tsx                                    | `graphicsSlice.graphicsOverrides.resolutionScale`                                                                                       | `qualityProfile.ts` becomes compat shim; reads from new slice                                                    |
| `antialias`                                                              | `qualityProfile.ts` → Canvas `gl={{antialias}}`                    | `graphicsSlice.graphicsOverrides.antialias`                                                                                             | same compat shim                                                                                                 |
| `shadowMapSize`                                                          | `qualityProfile.ts` → directional light                            | `graphicsSlice.graphicsOverrides.shadowMapSize`                                                                                         | same compat shim                                                                                                 |
| `environmentResolution`                                                  | `qualityProfile.ts` → env-map loader                               | `graphicsSlice.graphicsOverrides.environmentResolution`                                                                                 | same compat shim                                                                                                 |
| `bloomEnabled` + `bloomIntensityMultiplier`                              | `qualityProfile.ts` → PostProcessingPipeline                       | `graphicsSlice.graphicsOverrides.bloomEnabled` + `.bloomIntensityMul`                                                                   | same compat shim                                                                                                 |
| Bloom intensity (per-frame lerp target)                                  | `VISUAL_PRESETS[context].bloomIntensity` via `useVisualPresetLerp` | `visualPreset` remains the per-context **base**; `graphicsOverrides.bloomIntensityMul` is a **multiplier layer** applied after the lerp | `useVisualPresetLerp` refactored to `(presetTarget, userOverrides) → ref = preset × overrideMul + overrideDelta` |
| `bloomThreshold`, `bloomRadius`                                          | same as above                                                      | same — override is absolute where marked, multiplier where marked                                                                       | same                                                                                                             |
| `saturation`, `contrast`, `brightness`                                   | same per-frame lerp                                                | same override-layer pattern (delta for contrast/brightness, multiplier for saturation)                                                  | same                                                                                                             |
| `ambientIntensity`, `sunIntensity`, `shadowIntensity`, `envMapIntensity` | same per-frame lerp                                                | same multiplier-layer pattern                                                                                                           | same                                                                                                             |
| Leva debug knobs                                                         | `useSceneDebugControls` writes directly to its own refs            | Leva becomes a **UI over the same slice**; reads/writes routed through `graphicsSlice` when `debugMode === true`                        | Leva gates panel visibility only, not state ownership                                                            |
| `guideIntensity`, `vectorIntensity`                                      | `visualPreset` per-frame lerp                                      | unchanged — stays in visualPreset-lerp land                                                                                             | out of scope for user-facing Graphics UI                                                                         |
| Calibration (Earth-rotation offset, night-light intensity)               | Leva + calibration store                                           | unchanged                                                                                                                               | out of scope for Graphics UI                                                                                     |
| `sunRenderMode`                                                          | already user-facing via `store.sunRenderMode`                      | unchanged — stays on root slice                                                                                                         | —                                                                                                                |

**Invariants this table enforces:**

1. Every row in §3's control catalog must trace to a canonical writer in this table.
2. The `Mul` / `Delta` field-name suffix (§5) telegraphs composition mode with `visualPreset`.
3. Identity overrides (`graphicsOverrides = {}`) must yield byte-identical rendering to today's behavior. This is the verification gate for the Wave 0 refactor.

---

## §1. UI location decision

**Decision: new top-level rail panel ("Display"), sibling of Scene / Overlay / Project.** Rail expands from 4 buttons → 5. A second new top-level rail button ("A11y") opens the Accessibility panel.

### Why a new panel, not a Scene-tab section

- **Benchmark alignment** — all 7 AAA titles surveyed (CP2077, RDR2, Starfield, Death Stranding, HFW, Star Citizen, MSFS 2024) put graphics under their own surface. None nest graphics inside a general settings page.
- **SRP** — Sidebar and Scene panel are information-oriented (layers, epochs, project scope). Display is action-oriented (tweaks + immediate visual feedback).
- **Hot-path hygiene** — Sidebar subscribes to `displayedDatetime` every frame (L19). Widening Scene panel grows its subscription surface; a dedicated panel keeps hot paths narrow.
- **Scroll budget** — Scene panel already holds 4 sections under a 78vh scroll limit. Adding ~20 rows for Display would blow the budget.
- **Reuses rail infra** — `controlPanelConfig.ts` already builds the right-rail button stack from config; adding entries is two lines.
- **Mobile** — rail pattern works bottom-anchored on <768px per the existing media query; no new responsive scaffolding.

### Accessibility placement — resolved

A11y ships as a **separate top-level rail button**, sibling of Display — not nested inside it. All 7 benchmarked titles treat Accessibility as a top-level peer, never as a graphics sub-section. Atlas follows that pattern.

Wave 1 delivers `A11yPanel.tsx` as a placeholder shell (reduced-motion toggle + UI-scale slider only); Wave N populates per R1 backlog.

### Rail ordering (new)

`search | scene | overlay | display | a11y | project`

Rationale: Display + A11y sit left of Project because they're session-scoped (tweak-then-forget) rather than document-scoped (project name, epoch range).

---

## §2. Category hierarchy (inside Display panel)

Six sections, each rendered with the existing `<SectionLabel>` primitive. Sections with no Wave-1 content are **not rendered** until real backing exists (no "coming soon" headers — Codex review #11).

1. **Rendering** — master preset, resolution scale, antialiasing, shadows.
2. **Textures & LoD** — _deferred, no Wave 1 content. Section hidden until LoD system lands (Wave 5)._
3. **Post-Processing** — bloom toggle + intensity + threshold, tone mapping, exposure, contrast, brightness, saturation.
4. **Atmosphere & Sun** — sun render mode (already user-facing), environment-map intensity.
5. **Camera Effects** — _deferred, hidden in Wave 1. Populated when R1 adds motion blur / DoF / CA / grain / vignette / lens flare._
6. **Performance** — best-effort heap indicator (only if `performance.memory` present; otherwise section hidden), auto-downgrade toggle (Wave N).

Within each section, rows use existing `<ChoiceButton>` (enum), `<Toggle>` (boolean), and a new primitive `<Slider>` (number — to be added in Wave 1 alongside the panel).

---

## §3. Control catalog — classified E / H / R1 / F

Every row tagged exactly one of:

- **(E)** — exists today as user-facing or quality-profile field.
- **(H)** — exists today but hidden behind Leva debug mode.
- **(R1)** — depends on an R1 backlog item (feature not yet in code).
- **(F)** — future / deferred past Wave 2.

**Ship rule:** only E and H rows ship in any wave before R1 lands. No untagged rows. No row without a backing reference.

### Wave-1 eligible rows (Display panel)

| Name                   | Type                                            | Default L / M / H / U     | Class | Backing ref                                               |
| ---------------------- | ----------------------------------------------- | ------------------------- | ----- | --------------------------------------------------------- |
| Preset                 | dropdown (Low / Medium / High / Ultra / Custom) | —                         | E     | `store.qualityMode` → mapped                              |
| Auto                   | checkbox                                        | —                         | E     | `qualityMode === "auto"`                                  |
| Resolution Scale       | slider 1.0–2.0 step 0.25                        | 1.0 / 1.5 / 1.75 / 2.0    | E     | `qualityProfile.dprMax` @ `qualityProfile.ts:73–104`      |
| Antialias              | read-only toggle ("reload required")            | off / off / on / on       | E     | `qualityProfile.antialias` — see §8                       |
| Shadow Map Size        | dropdown (1024 / 2048 / 4096)                   | 1024 / 2048 / 4096 / 4096 | E     | `qualityProfile.shadowMapSize`                            |
| Env Map Resolution     | dropdown (64 / 128 / 256)                       | 64 / 128 / 256 / 256      | E     | `qualityProfile.environmentResolution`                    |
| Bloom                  | toggle                                          | off / on / on / on        | E     | `qualityProfile.bloomEnabled`                             |
| Bloom Intensity        | slider 0–2 step 0.05                            | 0 / 0.45 / 0.60 / 0.60    | H     | `VISUAL_PRESETS.bloomIntensity` × new `bloomIntensityMul` |
| Bloom Threshold        | slider 0–1 step 0.02                            | 0.78 absolute             | H     | `VISUAL_PRESETS.bloomThreshold` (absolute override)       |
| Tone Mapping           | dropdown (ACES / Reinhard / Cineon / Linear)    | ACES                      | H     | `PostProcessingPipeline` tone-effect operator             |
| Exposure               | slider 0–2 step 0.05                            | 1.0                       | H     | Maps to three's `gl.toneMappingExposure`                  |
| Contrast               | slider −1..1 step 0.05                          | 0.42                      | H     | `VISUAL_PRESETS.contrast` + `contrastDelta`               |
| Brightness             | slider −1..1 step 0.05                          | 0.0                       | H     | `VISUAL_PRESETS.brightness` + `brightnessDelta`           |
| Saturation             | slider 0–1 step 0.05                            | 0.29                      | H     | `VISUAL_PRESETS.saturation` × `saturationMul`             |
| Ambient Light          | slider 0–1 step 0.01                            | 0.035                     | H     | `VISUAL_PRESETS.ambientIntensity` × `ambientIntensityMul` |
| Sun Brightness (Point) | slider 0–5 step 0.1                             | 0.4                       | H     | `VISUAL_PRESETS.sunIntensity` × `sunIntensityMul`         |
| Shadow Light (Dir)     | slider 0–5 step 0.1                             | 1.5                       | H     | `VISUAL_PRESETS.shadowIntensity` × `shadowIntensityMul`   |
| Env Reflections (IBL)  | slider 0–5 step 0.1                             | 1.9                       | H     | `VISUAL_PRESETS.envMapIntensity` × `envMapIntensityMul`   |
| Sun Render             | dropdown (Auto / Procedural / Texture)          | existing                  | E     | `store.sunRenderMode`                                     |

### R1-dependent rows (NOT Wave 1)

| Name                 | Class | R1 blocker                                          |
| -------------------- | ----- | --------------------------------------------------- |
| Motion Blur          | R1    | Add `@react-three/postprocessing` MotionBlur effect |
| Depth of Field       | R1    | Add DoF effect                                      |
| Chromatic Aberration | R1    | Add CA effect                                       |
| Film Grain           | R1    | Add Grain effect                                    |
| Vignette             | R1    | Add Vignette effect                                 |
| Lens Flare           | R1    | Add LensFlare effect                                |
| Body Mesh LoD        | R1    | LoD system + streaming                              |
| Orbit Line Density   | R1    | Density modulator in `OrbitLines`                   |

### Future / deferred (F)

FPS target, auto-downgrade watchdog, texture-tier override, HDR (WebGPU path), SSR, SSAO.

### Accessibility catalog (A11y panel — not Display)

| Name            | Type                                       | Class       | Backing ref                                                                   |
| --------------- | ------------------------------------------ | ----------- | ----------------------------------------------------------------------------- |
| Reduced Motion  | toggle                                     | E (partial) | `prefers-reduced-motion` media query read + new `accessibility.reducedMotion` |
| UI Scale        | slider 80–150% step 5%                     | H           | Tailwind root `font-size` CSS var                                             |
| Colorblind Mode | dropdown (None / Protan / Deuter / Tritan) | R1          | New `ColorBlindCorrection` post-process effect                                |
| High Contrast   | toggle                                     | R1          | New theme tokens                                                              |
| Caption Scale   | —                                          | F           | Depends on captions system                                                    |

### Notes

- Numeric `dprMax` defaults are 1.0 / 1.5 / 1.75 / 2.0 — verified against `qualityProfile.ts:73–104`, not the incorrect v1 plan values.
- "VRAM budget" is **not** an available control. What ships is a **best-effort heap indicator** labeled "Est. heap" in the UI, using `performance.memory.usedJSHeapSize`. Hidden when the API is undefined (Firefox, Safari).
- All H rows require the Wave 0 `useVisualPresetLerp` refactor before they are user-facing without fighting the per-frame write.

---

## §4. Preset ↔ granular transition model

### Values

- Preset dropdown: `Low | Medium | High | Ultra | Custom`.
- Mapping to existing `qualityMode`: Low → constrained, Medium → balanced, High → high, Ultra → ultra.
- `Auto` is a checkbox **above** the dropdown. When on, it disables the dropdown and runs `calculateQualityScore(signals)` to pick a tier. Decoupled from `Custom` semantics.

### Transition rules

1. Changing any granular knob silently flips the preset label to `Custom` (CP2077 / Starfield pattern). No modal, no confirm.
2. Selecting a named preset from the dropdown clears `graphicsOverrides` (= restores preset defaults).
3. When preset label is `Custom`, a "Reset to [base preset]" button appears. Base preset is whichever preset was active when Custom started; tracked in `graphicsSlice.customBase`.
4. Selecting Auto clears overrides and locks the dropdown.

### User-facing copy

- Dropdown label: "Preset"
- Auto checkbox label: "Auto-detect quality"
- Custom indicator: badge reading "Custom" next to the dropdown
- Reset button: "Reset to High" (or whichever base)

---

## §5. Zustand slice — `graphicsSlice`

Naming is prefixed to avoid collision with the existing `store.visualPreset` / `store.autoPresetEnabled` fields (which govern the per-frame context lerp, not user overrides).

```ts
// src/store/graphicsSlice.ts

export type GraphicsPresetName = "low" | "medium" | "high" | "ultra" | "custom";

export interface GraphicsOverrides {
  resolutionScale?: number;
  antialias?: boolean;
  shadowMapSize?: 1024 | 2048 | 4096;
  environmentResolution?: 64 | 128 | 256;
  bloomEnabled?: boolean;
  bloomIntensityMul?: number; // multiplier over visualPreset base
  bloomThreshold?: number; // absolute override
  toneMapping?: "aces" | "reinhard" | "cineon" | "linear";
  exposure?: number; // absolute (maps to toneMappingExposure)
  contrastDelta?: number; // additive delta over visualPreset
  brightnessDelta?: number; // additive delta
  saturationMul?: number; // multiplier
  ambientIntensityMul?: number;
  sunIntensityMul?: number;
  shadowIntensityMul?: number;
  envMapIntensityMul?: number;
}

export interface GraphicsState {
  graphicsPreset: GraphicsPresetName;
  graphicsAutoMode: boolean; // replaces qualityMode === "auto"
  graphicsOverrides: GraphicsOverrides;
  customBase: Exclude<GraphicsPresetName, "custom">; // tracks Reset target
  setGraphicsPreset: (p: GraphicsPresetName) => void;
  setGraphicsAutoMode: (on: boolean) => void;
  setGraphicsOverride: <K extends keyof GraphicsOverrides>(
    key: K,
    value: GraphicsOverrides[K]
  ) => void;
  resetGraphicsOverrides: () => void;
}

export interface AccessibilityState {
  reducedMotion: boolean;
  uiScale: number; // 0.8 – 1.5
  colorblindMode: "none" | "protanopia" | "deuteranopia" | "tritanopia";
  highContrast: boolean;
  setAccessibility: <K extends keyof AccessibilityState>(
    key: K,
    value: AccessibilityState[K]
  ) => void;
}
```

### Design notes

- `GraphicsOverrides` is a single flat object with optional keys. `undefined` = "use preset default". Makes `resetGraphicsOverrides` a one-liner: `set({ graphicsOverrides: {} })`.
- Field-name suffix convention: `Mul` (multiplier over preset), `Delta` (additive over preset), bare (absolute override). This is contract from §0 — not a cosmetic choice.
- `shadowMapSize` and `environmentResolution` are discrete enums (Three.js wants power-of-two for shadow maps; mis-specified sizes silently degrade).
- `customBase` is the preset that was active when the user first edited a knob. Enables "Reset to High" rather than always "Reset to default".
- `AccessibilityState` is a **sibling** state of `GraphicsState` on the root store, not nested under Graphics — mirrors the UI split.
- Any setter that mutates `graphicsOverrides` while `graphicsPreset !== "custom"` also sets `customBase = graphicsPreset` and flips `graphicsPreset = "custom"`. Single transition rule, enforced in the setter, not at UI.

---

## §6. Persistence & migration

Per Codex review #5 — `qualityMode` kept as compat layer through one release cycle; not killed in Wave 1.

### Version bump

`PERSIST_VERSION: 0 → 1` in `src/store.ts`.

### `migrate(persistedState, version)`

- **v0 → v1:** read persisted `qualityMode`, derive `graphicsPreset` + `graphicsAutoMode`:
  - `qualityMode === "auto"` → `graphicsAutoMode = true`, `graphicsPreset = "high"` (safe default, ignored when Auto on).
  - `qualityMode === "ultra"` → `graphicsPreset = "ultra"`, `graphicsAutoMode = false`.
  - `qualityMode === "high"` → `graphicsPreset = "high"`.
  - `qualityMode === "balanced"` → `graphicsPreset = "medium"`.
  - `qualityMode === "constrained"` → `graphicsPreset = "low"`.
  - Always set `graphicsOverrides: {}`, `customBase: graphicsPreset` (or `"high"` when auto).
- Default `accessibility`: `{ reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, uiScale: 1, colorblindMode: "none", highContrast: false }`.

### `partialize` envelope expansion (3 → 7 fields)

```ts
partialize: (s) => ({
  qualityMode: s.qualityMode, // compat — read by shim
  graphicsPreset: s.graphicsPreset,
  graphicsAutoMode: s.graphicsAutoMode,
  graphicsOverrides: s.graphicsOverrides,
  accessibility: s.accessibility,
  sunRenderMode: s.sunRenderMode,
  tutorialCompletionStatus: s.tutorialCompletionStatus,
});
```

### Compat shim

`src/lib/qualityProfile.ts` becomes a thin projection:

```ts
// Reads new slice when present, falls back to qualityMode.
export const getQualityProfile = (state: AppState): ResolvedQualityProfile => {
  const effective = resolveEffectiveGraphics(state, deviceSignals());
  return projectToLegacyShape(effective);
};
```

Consumers of the existing 7-field shape (Scene.tsx, PostProcessingPipeline, etc.) keep working unchanged. Wave 6 deletes `qualityMode` from the envelope and inlines the new reads.

### Tests (new file: `src/store.persistMigration.test.ts`)

One round-trip case per v0 `qualityMode` value → v1 shape. Plus a v0-rollback case: a v1 build reading a v0 payload must not crash; missing `graphicsPreset` triggers derivation.

---

## §7. Resolver

```ts
// src/lib/graphics/resolver.ts

export interface EffectiveGraphics {
  // Rendering
  resolutionScale: number;
  antialias: boolean;
  shadowMapSize: 1024 | 2048 | 4096;
  environmentResolution: 64 | 128 | 256;
  bloomEnabled: boolean;
  // Post-process override layer (multiplicative / additive over VISUAL_PRESETS)
  bloomIntensityMul: number;   // default 1
  bloomThreshold?: number;     // absolute; undefined = use preset
  toneMapping: "aces" | "reinhard" | "cineon" | "linear"; // default "aces"
  exposure: number;            // default 1
  contrastDelta: number;       // default 0
  brightnessDelta: number;     // default 0
  saturationMul: number;       // default 1
  ambientIntensityMul: number; // default 1
  sunIntensityMul: number;
  shadowIntensityMul: number;
  envMapIntensityMul: number;
}

const PRESET_DEFAULTS: Record<Exclude<GraphicsPresetName, "custom">, EffectiveGraphics> = {
  ultra:  { resolutionScale: 2.0,  antialias: true,  shadowMapSize: 4096, environmentResolution: 256, bloomEnabled: true,  /* all *Mul = 1, *Delta = 0, exposure = 1, toneMapping = "aces" */ ... },
  high:   { resolutionScale: 1.75, antialias: true,  shadowMapSize: 4096, environmentResolution: 256, bloomEnabled: true,  ... },
  medium: { resolutionScale: 1.5,  antialias: false, shadowMapSize: 2048, environmentResolution: 128, bloomEnabled: true,  ... /* bloomIntensityMul: 0.75 */ },
  low:    { resolutionScale: 1.0,  antialias: false, shadowMapSize: 1024, environmentResolution: 64,  bloomEnabled: false, ... /* bloomIntensityMul: 0 */ },
};

export const resolveEffectiveGraphics = (
  state: GraphicsState,
  signals: DeviceSignals,
): EffectiveGraphics => {
  const presetName = state.graphicsAutoMode
    ? mapTierToPreset(autoResolvePreset(signals))
    : state.graphicsPreset === "custom"
      ? state.customBase
      : state.graphicsPreset;
  return { ...PRESET_DEFAULTS[presetName], ...state.graphicsOverrides };
};
```

`PRESET_DEFAULTS` replaces `RESOLVED_PROFILES` and extends it with the override-space fields. Numbers in the Rendering block must byte-match `qualityProfile.ts:73–104` — the Wave 0 no-op verification depends on this.

`projectToLegacyShape(effective)` returns the legacy 7-field `ResolvedQualityProfile` for unmigrated consumers.

---

## §8. Live-apply semantics

### Trivial live-apply (change ref, next frame picks up)

bloom intensity/threshold, saturation, contrast, brightness, ambient/sun/shadow/envMap intensity multipliers, tone mapping operator (swap effect in `PostProcessingPipeline`), exposure.

### Cheap re-init (one THREE state mutation)

`shadowMapSize` and `environmentResolution` — already handled by `Scene.tsx` when `qualityProfile` changes. Keep behavior; hook the new slice to the same effect.

### DPR change (`resolutionScale`)

`gl.setPixelRatio(x)` via `@react-three/fiber`. Flicker measurement is a Wave 1 verification item: if visible, gate the change behind `<Canvas frameloop="demand">` toggle + 300 ms overlay spinner. Otherwise apply directly.

### Antialias — corrected

**Antialias is fixed at WebGL context creation.** It cannot live-apply.

Wave 1 choice: **read-only toggle** labeled "Antialiasing (takes effect on reload)". Click shows a toast "Reload to apply". Do not attempt a `<Canvas>` remount — that drops all GPU state and re-downloads textures / env maps.

Wave N: migrate AA to post-process FXAA/SMAA via `@react-three/postprocessing`; the toggle then becomes truly live. This is called out explicitly so the implementation session does not trip on the WebGL constraint mid-way.

---

## §9. Constrained-tier & accessibility integration

### Constrained-tier

- If `calculateQualityScore(signals) ≤ -3` on first visit: force `graphicsAutoMode = true` and show a one-time banner: "Running in Low mode for your device. Change in Display." (RDR2-style hint.)
- On Low preset: hide Ultra from the dropdown (not just warn — RDR2 pattern).
- Camera Effects section: hidden entirely on Low (CP2077 pattern). Wave 1 doesn't ship that section, so moot until Wave N.

### Accessibility

- `prefers-reduced-motion` media query auto-flips `accessibility.reducedMotion = true` on first visit if unset in localStorage. Respects OS setting by default.
- `reducedMotion: true` disables: camera auto-rotate, Framer Motion transitions with duration > 120 ms, orbit-line pulse effects. Keeps functional animations (loading, focus rings).
- `uiScale` is applied to the root HTML element's `font-size` via CSS var; all Tailwind rem-based sizes scale together.
- `colorblindMode` — R1-dependent. Wave 1 ships the dropdown grayed out with tooltip "Available in a future update".
- `highContrast` — R1-dependent theme tokens. Same Wave-1 placeholder treatment.

---

## Verification gates for the design

Before any Wave 1 implementation PR merges, the following must all be true:

1. **§0 invariant** — every control-catalog row in §3 traces to a canonical writer named in §0.
2. **Numeric parity** — `PRESET_DEFAULTS` Rendering block byte-matches `RESOLVED_PROFILES` at `qualityProfile.ts:73–104`.
3. **Identity-override no-op** — with `graphicsOverrides = {}`, Playwright visual-diff (`e2e/postprocessing.spec.ts`) shows ≤ 0.1% pixel delta vs. main.
4. **Naming discipline** — every override field composing with `visualPreset` carries `Mul` or `Delta` suffix; every absolute override is suffix-free.
5. **Persistence round-trip** — every v0 `qualityMode` value has a migration test.

Anything that fails these gates blocks merge.
