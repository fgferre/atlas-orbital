# Graphics Settings — Current-State Audit

Research session: 2026-04-18. Every claim cites a file:line. Design decisions
downstream of this audit live in `tasks/graphics-settings-design.md`.

## 1. `qualityProfile` tier system

`src/lib/qualityProfile.ts` defines one resolved profile shape:

```ts
interface ResolvedQualityProfile {
  name: "ultra" | "high" | "balanced" | "constrained";
  antialias: boolean;
  dprMax: number;
  shadowMapSize: number;
  environmentResolution: number;
  bloomEnabled: boolean;
  bloomIntensityMultiplier: number;
}
```

Literal values from `qualityProfile.ts:69-106`:

| Field                      | ultra | high | balanced | constrained |
| -------------------------- | ----- | ---- | -------- | ----------- |
| `antialias`                | true  | true | false    | false       |
| `dprMax`                   | 2     | 1.75 | 1.5      | 1           |
| `shadowMapSize`            | 4096  | 4096 | 2048     | 1024        |
| `environmentResolution`    | 256   | 256  | 128      | 64          |
| `bloomEnabled`             | true  | true | true     | false       |
| `bloomIntensityMultiplier` | 1     | 1    | 0.75     | 0           |

`auto` resolution (`qualityProfile.ts:143-196`) sums heuristic signals:

- `navigator.deviceMemory`: ≤2 GB → −2, ≤4 GB → −1, ≥16 GB → +2, ≥8 GB → +1.
- `navigator.hardwareConcurrency`: ≤4 → −1, ≥12 → +2, ≥8 → +1.
- `navigator.connection.effectiveType`: `slow-2g`/`2g` → −2, `3g` → −1.
- Viewport `max(width, height)`: ≤900 → −1, ≥1400 → +1.
- `devicePixelRatio > 2.25` → −1.

Thresholds: score ≥4 → ultra, ≥2 → high, ≥−1 → balanced, else constrained.

## 2. Consumer survey — `qualityProfile` reads across `src/`

Eight consumer sites as of 2026-04-18:

1. **`src/hooks/useQualityProfile.ts:17-48`** — exports the hook; collects
   device signals, calls `resolveQualityProfile()`, re-runs on resize /
   orientationchange when mode is `auto`.
2. **`src/components/canvas/Scene.tsx:221`** — reads `qualityMode` from
   store; `useQualityProfile(qualityMode)`; consumes `antialias` (line 226),
   `dprMax` (228–229), `environmentResolution` (381), `shadowMapSize` (398).
3. **`src/components/ui/LayersPanel.tsx:90`** — reads `qualityMode` from
   store; calls `useQualityProfile(qualityMode)` to display the resolved
   tier name when mode is `auto` (lines 255–259).
4. **`src/components/canvas/Starfield.tsx:195-196`** — reads `qualityMode`;
   passes `profile.name` to `hygTierForQuality()` to select HYG catalog
   tier.
5. **`src/components/canvas/StarHoverPicker.tsx:121-122`** — reads
   `qualityMode`; uses `hygTierForQuality()` to pick catalog tier for hover
   picking.
6. **`src/components/canvas/scene/SceneLighting.tsx:9,16,33`** — receives
   `shadowMapSize` prop from Scene.tsx; passes it to SmartSunLight.
7. **`src/components/canvas/SmartSunLight.tsx:18-19`** — receives
   `shadowMapSize` prop (default 4096), applies to `shadow-mapSize`
   attribute.
8. **`src/lib/starfield.ts:172-183`** — `hygTierForQuality()`:
   `constrained` → low, `balanced` → high, `high` → high, `ultra` → full.

## 3. `visualPreset` + `useVisualPresetLerp` subsystem

**This is the second active system writing to the same visual-parameter
space.** Critical for the R2 design — any user-facing Bloom or Saturation
slider that ignores this will be overwritten 60 times per second by the
per-frame lerp.

### 3a. `VISUAL_PRESETS`

`src/config/visualPresets.ts:51-122` defines 5 presets
(`DEEP_SPACE | PLANET_ORBIT | CLOSE_FLYBY | INNER_SYSTEM | OUTER_SYSTEM`)
with 12 fields each:

```
bloomIntensity, bloomThreshold, bloomRadius,
saturation, contrast, brightness,
ambientIntensity, sunIntensity, shadowIntensity, envMapIntensity,
guideIntensity, vectorIntensity.
```

**Per-preset differentiation shipped** in commits `51c911d` (AgX base
recalibration) + `ce66ff3` (per-context deltas). Values below are the
current `PLANET_ORBIT` baseline; other presets compose deltas on top
(CLOSE_FLYBY drops bloom + lifts ambient, INNER warms saturation, OUTER
cools it, DEEP_SPACE lifts bloom + contrast). See the file header
narrative in `visualPresets.ts` for the per-context intent.

Reference values (PLANET_ORBIT baseline, post-AgX recalibration):

```
bloomIntensity 1.0, bloomThreshold 1.0, bloomRadius 0.3,
saturation 0.18, contrast 0.30, brightness 0.0,
ambientIntensity 0.035, sunIntensity 0.4, shadowIntensity 1.5,
envMapIntensity 1.9, guideIntensity ~1.0, vectorIntensity 1.0.
```

`getPresetForContext(distanceFromSun, cameraDistance)` at the bottom of
`visualPresets.ts` picks a preset from camera + sun distance thresholds
(< 200 → CLOSE_FLYBY, < 2000 → PLANET_ORBIT, then heliocentric AU
bands: < 3.5 AU → INNER_SYSTEM, < 50 AU → OUTER_SYSTEM, else
DEEP_SPACE). `distanceFromSun` is resolved as true heliocentric AU via
`resolveHeliocentricDistanceAU` (parent composition for satellites),
not `focusedBody.orbit.a`.

### 3b. `useVisualPresetLerp`

`src/components/canvas/scene/useVisualPresetLerp.ts:47-58` takes:

```ts
{
  bloomRef, hueSatRef, brightnessRef,
  ambientLightRef, sunLightRef, smartSunLightRef,
  controlsRef,
  debugValues,               // 10 Leva-seeded fields (DebugValues)
  debugMode,
  bloomIntensityMultiplier,  // from qualityProfile
}
```

Inside `useFrame`, the hook lerps the active `VISUAL_PRESETS[visualPreset]`
target — or, when `debugMode === true`, the Leva `debugValues` target —
onto the referenced render objects. Consumers: `Scene.tsx` (grep:
`useVisualPresetLerp` matches 4 files, 2 of them docs).

Net effect: bloom, saturation, contrast, brightness, ambient/sun/shadow/
envMap intensity are written to GPU-visible refs every frame by this hook.
`qualityProfile.bloomIntensityMultiplier` is multiplied in by this hook,
not read directly by PostProcessingPipeline.

### 3c. Implications for R2

- User-facing overrides for these 10 fields **must be routed through the
  lerp**, not through direct ref writes. Else the lerp overwrites the
  user's change next frame. See design doc §0 for the resolution.
- When `debugMode === true`, Leva currently wins over `visualPreset`. A
  user-facing panel that writes to the same refs must decide its precedence
  vs Leva before shipping.

## 4. Current UI surface — LayersPanel

`src/components/ui/LayersPanel.tsx` is the right-rail panel system. Entry
points live in `controlPanelConfig.ts:22-30`:

```ts
RIGHT_CONTROL_BUTTONS = [
  { id: "search", label: "Search" },
  { id: "scene", label: "Scene" },
  { id: "overlay", label: "Overlay" },
  { id: "project", label: "Project" },
];
```

Current Scene panel sections (`LayersPanel.tsx:174-293`):

- **Starfield** toggle.
- **Starfield Source** (HYG / NASA choice buttons).
- **Scale Mode** (Didactic / Realistic).
- **Quality** (5 choice buttons: Auto / Ultra / High / Balanced / Saver);
  shows resolved tier when `Auto`; warning banner when `Ultra`.
- **Sun Render** (Auto / Procedural / Texture).

Overlay panel (`LayersPanel.tsx:294-339`): body-category visibility toggles
(Planets/Moons/Dwarfs/Asteroids/TNOs) + guide toggles (Icons/Labels/Orbits/
Context Orbits/Ecliptic Grid/Prograde Vector).

Project panel (`LayersPanel.tsx:340+`): Replay Tutorial button, Mission
Report (toggleCredits), Debug Menu toggle.

Primitives available for reuse (defined locally in LayersPanel.tsx):

- `SectionLabel` (`LayersPanel.tsx:617-621`) — `border-b` accent header.
- `SubsectionLabel` (`623-627`) — muted sub-header.
- `ChoiceButton` (`629-652`) — accented button for preset-style selection.
- `Toggle` (`654-693`) — switch-style row with label + on/off state.
- `CategoryToggle` (`695-716`) — compact border toggle for visibility
  categories.

No dedicated settings modal exists today. No Radix / shadcn / lucide-react
imports anywhere in `src/`.

Sidebar (`src/components/ui/Sidebar.tsx`) is information-only: body stats,
provenance, no settings controls. Overloading it would cross a
single-responsibility boundary and widen its subscription surface
(currently narrow per L19).

## 5. Leva debug catalog — `useSceneDebugControls`

`src/components/canvas/scene/useSceneDebugControls.ts:15-239` exposes, when
`debugMode === true`:

- **Lighting** folder — 4 knobs: `ambientIntensity [0,1]`,
  `sunIntensity [0,5]`, `shadowIntensity [0,5]`, `envMapIntensity [0,5]`.
- **Post Processing** folder — 6 knobs: `bloomThreshold [0,1]`,
  `bloomIntensity [0,3]`, `bloomRadius [0,1]`, `saturation [0,1]`,
  `contrast [0,1]`, `brightness [-1,1]`.
- **Planet Material** folder — 4 knobs: `roughness [0,1]`,
  `metalness [0,1]`, `sunEmissive [0,10]`, `ringEmissive [0,5]`.
- **Shadows** folder — 1 knob: `ringShadowIntensity [0,1]`.
- **Calibration** folder — 2 knobs: `earthRotationOffset [0,360]`,
  `nightLightIntensity [0,10]`.
- **Tools** folder — 1 button: _Copy Settings_ (JSON → clipboard).
- **Camera** folder — 2 buttons: _Copy Camera Position_, _Log Camera Info_.

All initial values are seeded from `VISUAL_PRESETS.DEEP_SPACE` at
`useSceneDebugControls.ts:24,31,38,45,54,…` and sync on preset change
(`useSceneDebugControls.ts:220-236`). L20 in `tasks/lessons.md` documents
that `<Leva />` must remain mounted (with `hidden` prop) whenever any
`useControls` call is in the tree — gating the element with conditional JSX
breaks the implicit anchor.

## 6. Persistence shape

`src/store.ts:154-435` + `src/store.persistMigration.ts`:

- **Key:** `PERSIST_KEY` (`"atlas-orbital-store"`).
- **Version:** `PERSIST_VERSION = 0`. No `migrate` function defined yet.
- **`partialize`** (`store.ts:417-421`) — only 3 fields:

  ```ts
  {
    (qualityMode, sunRenderMode, tutorialCompletionStatus);
  }
  ```

- **Storage wrapper:** `createDedupedStorage(localStorage)` — Zustand 5
  calls `setItem` on every `set()`; this wrapper skips writes when the
  serialized value is identical to prior write. Necessary because
  `displayedDatetime`, overlay updates, etc. mutate multiple times per
  second (simulationClock UI tick at ~4 Hz, overlay tracker at up to
  60 Hz).
- **`migrateLegacyStorage()`** runs synchronously at module load
  (`store.ts:150`), before `persist` evaluates, to migrate pre-persist
  individual-key localStorage layouts into the unified envelope. This is
  **not** a zustand-persist `migrate` — it's a one-shot pre-hydration
  compat helper.
- **`onRehydrateStorage`** (`store.ts:422-432`) — derives `showTutorial`
  from `tutorialCompletionStatus === null`. `showTutorial` is not
  persisted.

No accessibility-related fields currently persisted. No graphics-override
fields currently persisted beyond `qualityMode`.

## 7. Gaps — knobs that exist in code but are not user-exposed

1. **Starfield `particleSize` divisor** —
   `src/components/canvas/useStarfieldParticleSize.ts:32-35`:
   `scale = sqrt(max(width, height) * effectiveDpr) / 60`. Hard-coded 60.
2. **Bloom intensity/threshold/radius at runtime** —
   `src/components/canvas/scene/PostProcessingPipeline.tsx:59-67`:
   `bloomEnabled` is gated by quality profile, but the three numeric
   bloom parameters flow only through Leva + the per-frame lerp. No
   non-debug user can change them.
3. **PBR constants** —
   `src/components/canvas/planet/usePlanetMaterials.ts:50-150`:
   `roughness`, `metalness`, `sunEmissive`, `ringEmissive`,
   `ringShadowIntensity`, `nightLightIntensity` injected via
   `onBeforeCompile`, sourced from Leva debug state. No user slider.
4. **Env-map intensity** — `Scene.tsx:381` sets `environmentResolution`
   from profile; `envMapIntensity` multiplier has no user control.
5. **Tone mapping / exposure** —
   `PostProcessingPipeline.tsx:68` always mounts the tone-mapping effect;
   no toggle, no operator choice, no exposure slider.
6. **Bloom radius disabled** — `PostProcessingPipeline.tsx:63` comment:
   `// Removed to prevent serialization issues`. Radius is live in Leva
   debug but not applied to the running bloom effect.
7. **Shadow bias hard-coded** — `SmartSunLight.tsx:93`:
   `shadow-bias={-0.00005}`.
8. **HYG transfer curve constant 250** —
   `src/components/canvas/Starfield.tsx:14` in the Pogson log-compression
   formula. Calibrated against NASA Eyes per L17 but not user-controllable.
9. **Visual-preset differentiation shipped** — `visualPresets.ts` now
   carries distinct numeric values per context (commits `51c911d` +
   `ce66ff3`). The auto-selector resolves `distanceFromSun` via
   `resolveHeliocentricDistanceAU`, composing parent chains for the 22
   satellites in the dataset so moons no longer misroute to
   INNER_SYSTEM.
10. **Antialias granularity** — `qualityProfile.antialias` is a boolean
    gate on WebGL context creation (`Scene.tsx:226`). No FXAA / SMAA /
    MSAA level choice; no post-process AA path.

## 8. UI dependencies (`package.json:31-42`)

- React 19.2.0.
- Zustand 5.0.8 (persist middleware included).
- Leva 0.10.1.
- Framer Motion 12.23.24.
- Tailwind CSS 4.1.17 (via `@tailwindcss/postcss`).
- `@react-three/drei` 10.7.7.
- `@react-three/fiber` 9.4.0.
- `@react-three/postprocessing` 3.0.4 (Bloom, HueSaturation,
  BrightnessContrast, ToneMapping already wired).
- Three.js 0.181.2.

**No Radix UI / Headless UI / shadcn.** No `lucide-react` or similar icon
library — current icons are inline SVG literals inside
`LayersPanel.RailButtonIcon`. The R2 Display / A11y panels must reuse the
existing primitives + inline SVG pattern rather than install a UI kit.

## 9. Constrained-tier / mobile handling

Implicit. `qualityProfile.ts:117-180` never checks `navigator.userAgent` or
WebGL capability — only memory / CPU / connection / viewport / DPR
heuristics. A modern mobile device with 4 GB RAM, 8 cores, 4G, and DPR 3
lands somewhere near `score = 0` (balanced). A low-end laptop with 4 GB /
4 cores lands at `score = −3` (constrained).

Mobile media query lives in
`src/components/ui/LayersPanel.tsx:49`:
`useMediaQuery("(max-width: 767px)")`. Used for panel placement (bottom
drawer vs right-rail flyout), not for quality decisions.

## 10. Summary

The app has a **solid tiered quality system** plus a **parallel visual-preset
lerp system** plus a **debug Leva surface**, all writing to overlapping
parameter spaces. User-facing controls today are a 5-button Quality row
and a 3-button Sun Render row, both inside the Scene panel. Persistence
covers 3 fields. Any R2 work must first establish a single source of truth
for the overlap — see the design doc §0.
