# Atlas Orbital — Implementation Roadmap (post R1/R2/R3 synthesis)

Date: 2026-04-18
Synthesized from three research tracks shipped as 11 markdown docs in `tasks/`.

## Purpose

R1 (lighting backlog), R2 (graphics settings architecture), and R3 (PBR source
matrix) ran as parallel research sessions and produced detailed plans. This
roadmap is the cross-track synthesis: it resolves naming collisions, identifies
atomic-bundle dependencies that any sane implementation order must respect,
and sequences the waves across all three tracks with parallelization
annotations.

Implementation sessions (one per wave) execute **against this roadmap**, not
against the raw research docs. The research docs remain authoritative on
the details; the roadmap is authoritative on the order.

## Research inventory

| Doc                                              | Role                                                 |
| ------------------------------------------------ | ---------------------------------------------------- |
| `tasks/lighting-audit-current.md`                | R1: current-state audit                              |
| `tasks/lighting-aaa-benchmark.md`                | R1: benchmark                                        |
| `tasks/lighting-backlog.md`                      | R1: **13-item ranked backlog (authoritative)**       |
| `tasks/graphics-settings-benchmark.md`           | R2: AAA benchmark                                    |
| `tasks/graphics-settings-current-audit.md`       | R2: current-state audit                              |
| `tasks/graphics-settings-design.md`              | R2: **UI + store architecture (authoritative)**      |
| `tasks/graphics-settings-implementation-plan.md` | R2: **phased rollout W0→W6 (authoritative)**         |
| `tasks/pbr-local-inventory.md`                   | R3: local audit                                      |
| `tasks/pbr-sources-research.md`                  | R3: per-body source research                         |
| `tasks/pbr-shipping-priority.md`                 | R3: **ranked Wave 1/2/3 (authoritative)**            |
| `tasks/pbr-pipeline-extension.md`                | R3: **pipeline extension + recipes (authoritative)** |

## Cross-track consistency findings

> **Post-synthesis Codex review flagged 5 additional findings (#6–#10 below)
> that this doc originally missed. All were verified against the code and
> are resolved in Wave α's scope below.**

### Finding 1 — `vfxSettings` (R1) vs `graphicsSlice` (R2) naming collision

R1 §2.4 references `vfxSettings`; R2 §5 defines `graphicsSlice`. Both docs
are architecturally coherent but use different names for overlapping
concerns.

**Resolution:** nest R1's concerns inside R2's store shape as
`graphicsSlice.graphicsOverrides` (single root slice, single persist entry).
Implementation sessions follow R2's naming; R1 items plug into R2's override
record via effect-id keys (`bloomIntensity`, `bloomThreshold`, etc.).

### Finding 2 — R2 Wave 1 ships Bloom controls that need R1 #1A/#1B/#2 to be meaningful

R2 Wave 1 ships the `Bloom Intensity`, `Bloom Threshold`, `Tone Mapping`, and
`Exposure` controls. These sliders only produce the AAA look the design
expects when operating against an **HDR-linear pipeline**. Today's renderer
uses `ReinhardToneMapping` on `gl` AND a `<ToneMapping>` postprocessing
effect — double tone-map, pre-HDR bloom, sRGB-clipped emissive.

R1 #1A (pipeline HDR contract) + #1B (star emissive recalibration) + #2
(selective luminance-threshold bloom) are the items that flip the pipeline to
the state R2 Wave 1's controls assume.

**Resolution:** **Wave α** bundles R1 #1A/#1B/#2 AND R2 W0/W1 as one atomic
session. Shipping R2 W1 before R1 #1A/#1B/#2 lands would give users 19 new
controls wired to a fake bloom. Shipping R1 #1A/#1B/#2 before R2 W0/W1 would
give users an HDR unlock with no way to tune it. Both fragments are less
valuable than the atomic bundle.

### Finding 3 — `textureVariantManifest.ts` variant coverage gap (for PBR waves)

`pbr-pipeline-extension.md:175-176` flags that today's manifest only lists
the 2k tier for Earth's normal/roughness variants, not 4k or 8k. The Wave δ
(PBR sphere-texture) sessions must extend the manifest for every shipping
body at every tier or the `high`/`ultra` profiles waste bandwidth.

**Resolution:** the first PBR wave (δ) includes manifest entries at boot/2k/
4k/8k for every shipping body AND retroactively backfills Earth's missing
tiers. Tracked as sub-item in Wave δ's scope.

### Finding 4 — Wave 3 (Vesta) requires `PlanetModel.tsx` architecture that doesn't exist

R3 scopes Vesta as "blocked until `PlanetModel.tsx` supports `normalMap`/
`roughnessMap`". Today `PlanetModel.tsx:50-64,129-141` assembles
`MeshStandardMaterial` with only `map`, `roughness`, `metalness` (scalars, not
maps) — never wires `normalMap` or `roughnessMap`.

**Resolution:** **Wave ζ** is a dedicated model-body architecture wave (1
design commit + 1 Vesta implementation commit) that lands before any
model-rendered body can get PBR.

### Finding 5 — R1 #5 (lens flare) and #10 (atmosphere scattering) need net-new deps

R1 #5 proposes `ektogamat/R3F-Ultimate-Lens-Flare` (not in package.json);
R1 #10 proposes `@takram/three-atmosphere` (not in package.json). R1 #9
(SSAO) wants `n8ao` promoted from transitive to direct dep.

**Resolution:** each wave that introduces a new dep is responsible for (a)
vendoring-assessment (license, bundle size, maintenance), (b) adding to
package.json with pinned version, (c) routing through lazy-chunk mechanism
where applicable (ondas 7 pattern). No I1/Wave α requires new deps.

### Finding 6 — Playwright visual-diff gate claimed but not implemented

This roadmap (and R2's implementation-plan) claimed `e2e/boot.spec.ts`,
`e2e/focus.spec.ts`, `e2e/postprocessing.spec.ts` enforce ≤ 0.1% visual-
diff as Wave 0's identity invariant. The actual specs validate structure
only — canvas sized (boot), search-focus flow (focus), `data-postprocessing`
attribute (postprocessing). Zero `toHaveScreenshot` calls exist.

**Resolution:** Wave α Commit 1 **adds** `toHaveScreenshot` capture to
these three specs with `maxDiffPixelRatio: 0.001`. Baseline PNGs are
committed with Commit 1. Wave 0's identity claim becomes a real gate.

### Finding 7 — R2 design §3 Tone Mapping / Exposure conflict with R1 #1A

R2 design §3 lines 102, 189, 345 define:

- Tone Mapping dropdown: `{ACES, Reinhard, Cineon, Linear}`
- Exposure slider: backed by `gl.toneMappingExposure`

R1 #1A mandates removal of `gl.toneMapping` from the renderer (tone
mapping moves to the compositor via `<ToneMapping mode={AgX}>`). Under
that contract:

- `Linear` means no tone mapping at all → HDR values clip, bloom breaks
- `gl.toneMappingExposure` has no effect because renderer is at
  `NoToneMapping`
- The dropdown options are wrong for the new pipeline (missing AgX,
  shouldn't offer Linear)

**Resolution:** Wave α Commit 3 amends R2 design §3 inline as part of the
wave:

- Tone Mapping options become `{AgX [default], ACES, Reinhard, Cineon}`.
  AgX replaces the default; Linear is dropped.
- Exposure slider's backing changes from `gl.toneMappingExposure` to the
  compositor `<ToneMapping>` effect's exposure uniform (exposed via ref
  mutation inside `useVisualPresetLerp`, same pattern as bloom ref).
- The design doc edit is part of Commit 3's diff so future readers see the
  reconciled contract, not the pre-α aspiration.

### Finding 8 — Persist migration owner already exists

`src/store.persistMigration.ts` exists at `PERSIST_VERSION = 0`, owns
`migrateLegacyStorage` + `createDedupedStorage`. Its test
`src/store.persistMigration.test.ts` covers every legacy `qualityMode`
value + the deduped-storage contract. Wave α's R2 scope calls these
"new files" — they are not.

**Resolution:** Wave α **extends** these existing files:

- `store.persistMigration.ts` — bump `PERSIST_VERSION 0 → 1`; add
  `migrate()` branch that accepts v0 envelopes (shape: `{qualityMode,
sunRenderMode, tutorialCompletionStatus}`) and emits v1 envelopes
  (additional field: `graphicsPreset`, `graphicsAutoMode`,
  `graphicsOverrides: {}`, derived from `qualityMode`).
- `store.persistMigration.test.ts` — extend with v0→v1 cases for every
  legacy `qualityMode` value + preservation of `sunRenderMode` and
  `tutorialCompletionStatus`.

No new migration files; respect the existing architecture.

### Finding 9 — Playwright webServer already declared, manual preview is redundant

`playwright.config.ts:10` declares `webServer: { command: "npm run
preview:test", url: "http://127.0.0.1:4174/atlas-orbital/",
reuseExistingServer: !process.env.CI, timeout: 60000 }`. Running
`npm run preview:test` manually in a separate terminal then `npx playwright
test` either double-binds the port (CI) or runs redundantly (local,
because `reuseExistingServer` picks up the manual one).

**Resolution:** Wave α's Playwright invocation is just `npx playwright
test`. The config handles preview lifecycle. Remove the two-step from
prompt instructions and PLAN.md acceptance-gate text.

### Finding 10 — Wave η was not faithful to R1 backlog items #6–#13

This roadmap's original Wave η card summarized `#6–#13` as "exposure +
eye adaptation, SSAO, CA, DOF, film grain, vignette, motion blur, god
rays, volumetric fog, multi-star lens flare". That list dropped R1 #10
(Bruneton atmosphere), #11 (Milky Way backdrop), #12 (zodiacal light),
collapsed #13 (combined CA + vignette + grain polish pass) into three
items, and invented "DOF" and "motion blur" which are not R1 items.

**Resolution:** Wave η card below is rewritten as a literal mirror of R1
items #6–#13. No renaming, collapsing, or inventing. Three items
previously in the "Deferred / out-of-scope" section (multi-star lens
flare = #7; Bruneton atmosphere = #10; Milky Way = #11) were R1 backlog
items and have been moved into Wave η.

## Wave sequence

Seven waves total. Waves are labeled Greek letters to avoid confusion with
R1/R2/R3 internal numbering.

```
                        ┌─────────────────── (depends)
                        │
  α ──► β ──► γ         │
  │                     │
  ├──► δ ──► ε ──► ζ ◄──┘
  │
  └──► η (independent, ROI-ordered)
```

### Wave α — HDR foundation + Graphics panel (COUPLED ATOMIC BUNDLE)

**Ships:** R1 #1A + R1 #1B + R1 #2 + R2 Wave 0 + R2 Wave 1.

**Why atomic:** see Finding 2 above. Fragmenting this wave produces either
dead controls or invisible features.

**Scope:**

- **R2 Wave 0** (identity refactor): single-source visual overrides via
  `visualPreset` lerp. Visual-diff ≤ 0.1% invariant. Single commit
  `refactor(graphics): single-source overrides via visualPreset lerp`.
- **R1 #1A** (HDR pipeline contract): remove `gl.toneMapping =
ReinhardToneMapping` from `Scene.tsx:267`; replace `<ToneMapping />` mode
  in `PostProcessingPipeline.tsx:68` with `AgX`; reorder postprocessing
  stack so tone mapping runs last; set `gl.outputColorSpace =
THREE.SRGBColorSpace` (explicit).
- **R1 #1B** (star emissive recalibration): introduce `vfxHdrGain` uniform;
  wire through `Starfield.tsx` and `NASAStarfield.tsx` via the existing
  `useMemo`'d material ref pattern (L15 literal — NOT JSX children); tier-
  keyed defaults; update `starfieldShaderMath.test.ts` expectations.
- **R1 #2** (selective bloom): `luminanceThreshold=1.0`, `luminanceSmoothing
=0.1` on `<Bloom>` in `PostProcessingPipeline.tsx`; expose intensity +
  threshold + enabled via store override.
- **R2 Wave 1** (graphics slice + Display panel):
  - New files: `src/store/graphicsSlice.ts`, `src/lib/graphics/resolver.ts`,
    `src/lib/graphics/deviceSignals.ts`, `src/hooks/useEffectiveGraphics.ts`,
    `src/components/ui/DisplayPanel.tsx`, `src/components/ui/A11yPanel.tsx`,
    `src/components/ui/primitives/Slider.tsx`, + 2 unit test files
    (`resolver.test.ts`, `useVisualPresetLerp.test.ts`) + 1 e2e spec
    (`e2e/a11y.spec.ts`).
  - **Extended** (NOT created — per Finding 8):
    `src/store.persistMigration.ts` (bump `PERSIST_VERSION 0→1`; add
    `migrate()` branch emitting `graphicsPreset + graphicsAutoMode +
graphicsOverrides` from legacy `qualityMode`),
    `src/store.persistMigration.test.ts` (v0→v1 cases for every legacy
    `qualityMode` value; preservation of `sunRenderMode` and
    `tutorialCompletionStatus`).
  - Modified files: `src/store.ts` (integrate graphicsSlice,
    `partialize` expansion, wire migrate), `src/lib/qualityProfile.ts`
    (compat shim reading new slice), `src/hooks/useQualityProfile.ts`
    (wrapper), `src/components/ui/controlPanelConfig.ts` (+ "display" +
    "a11y" entries), `src/components/ui/LayersPanel.tsx` (route).
  - Ships 19 E/H controls from design §3 catalog, **with the Finding 7
    override applied**: Tone Mapping options become `{AgX [default], ACES,
Reinhard, Cineon}` (drop Linear, add AgX); Exposure slider writes to
    compositor `<ToneMapping>` exposure prop instead of
    `gl.toneMappingExposure`. Amend `graphics-settings-design.md §3`
    inline as part of this commit so the doc reflects shipped reality.
  - A11yPanel ships 4 rows per `graphics-settings-implementation-plan.md`
    §83-98: Reduced Motion toggle (E, active), UI Scale slider (H,
    active), Colorblind Mode dropdown (grayed with tooltip "Available in
    a future update"), High Contrast toggle (grayed, same tooltip). The
    grayed rows establish panel scope for future waves.

**Commit strategy:** 3 commits.

1. `refactor(graphics): single-source overrides via visualPreset lerp`
   (R2 Wave 0)
2. `feat(vfx): HDR pipeline + AgX + selective bloom + star emissive recal`
   (R1 #1A/#1B/#2)
3. `feat(graphics): graphicsSlice + Display/A11y panels + migration`
   (R2 Wave 1)

**LOC:** ~800-1100 across ~15-20 files. Commit 1 adds ~15-25 LOC + 3
baseline PNGs for the new `toHaveScreenshot` gate (per Finding 6).

**Gates:** lint + test:run + build + Playwright e2e. Wave 0 identity
invariant is enforced via new `toHaveScreenshot` assertions in
`e2e/boot.spec.ts`, `e2e/focus.spec.ts`, `e2e/postprocessing.spec.ts`
with `maxDiffPixelRatio: 0.001` (added in Commit 1 — see Finding 6).
Baselines committed with Commit 1. After Commit 2 (HDR pipeline shift)
baselines are re-captured intentionally. After Commit 3 (panel +
migration) existing baselines hold; new specs ship with their own
baselines.

Playwright invocation is simply `npx playwright test`; the config's
`webServer` clause handles preview lifecycle (Finding 9). Do NOT run
`npm run preview:test` separately.

**Risks:**

- **L15 (critical):** `vfxHdrGain` uniform MUST flow through
  `useMemo`'d material ref, never JSX children. R1 #1B risk-log cites this.
- **Double tone-map removal:** verify no other code path sets
  `gl.toneMapping`. Grep before commit 2.
- **Persist migration:** Wave 0 changes lerp wiring; v0→v1 migration must
  preserve all user's existing `qualityMode` preferences.
- **Playwright visual-diff:** Wave 0 must be identity (≤0.1%). If the
  refactor shifts pixels, rollback and rework lerp math before piling on
  HDR changes.

**Depends on:** nothing (foundation).

**Blocks:** β, γ, η (every wave that user-tunes postprocessing assumes
Wave α shipped).

---

### Wave β — Atmosphere scientific identity

**Ships:** R1 #3 (per-body atmospheric metadata schema + fresnel-glow
extension).

**Scope:**

- Add typed `atmosphereProfile` record to `src/data/celestialBodies.ts`:
  `{ tintHex, densityScale, falloffPower, rayleighStub, mieStub }` as
  placeholders (Wave η or a later wave upgrades to real Rayleigh/Mie).
- Generalize the existing atmosphere shader in
  `src/components/canvas/shaders/atmosphereShader.ts` to consume per-body
  uniforms. Today it's Earth-only.
- Populate profiles for 8 bodies: Venus, Mars, Titan, Jupiter, Saturn,
  Uranus, Neptune, Earth (parity baseline).
- Hoist guard in `usePlanetMaterials.ts:155-168` to any
  `atmosphereProfile.present === true`.
- R2 Wave 2 lands the "Atmosphere & Sun" panel section with `Atmosphere
Glow` toggle (default on all tiers).

**Commit strategy:** 2 commits.

1. `feat(planet): per-body atmosphere profile schema + Earth parity`
2. `feat(planet): atmosphere glow for Venus/Mars/Titan/gas-giants`

**LOC:** ~250-400.

**Gates:** full standard. Visual review via Playwright snapshots for each
body before/after (not visual-diff gate — just verification artifacts).

**Depends on:** Wave α (graphics panel exists for the toggle; HDR pipeline
correctly handles fresnel-boosted emissive).

---

### Wave γ — Sun lens flare

**Ships:** R1 #5 (sun lens flare with anamorphic option).

**Scope:**

- Install `ektogamat/R3F-Ultimate-Lens-Flare` as direct dep (vendor
  assessment first: license OK, bundle impact, last commit date).
- Alternative if vendoring fails: use `three/examples/jsm/objects/Lensflare`
  native with pre-baked sprite sheet. R1 #5 scopes both paths.
- Wire to Sun position via existing `SmartSunLight` ref.
- Add `Lens Flare` toggle + `Flare Style (Modern/Classic)` dropdown to R2
  Display panel (Camera Effects subsection, currently hidden per design §2;
  unhide with this wave).
- Default: on for `ultra`/`high`, off for `balanced`/`constrained`.

**Commit strategy:** 1-2 commits.

1. `chore(deps): add R3F-Ultimate-Lens-Flare with vendor assessment`
2. `feat(vfx): sun lens flare with anamorphic/classic toggle`

**LOC:** ~150-250.

**Gates:** standard + manual visual review (flare is aesthetic — Playwright
visual-diff will churn; use `test.skip()` annotation for visual regression
on Sun views).

**Depends on:** Wave α (graphics panel + HDR — flare texture sprites emit

> 1.0 and rely on the bloom pass).

**Stretch:** per-star lens flare on mag ≤ 0 catalog stars. Scope this
separately (~1 extra session) — multi-instance is the hard part, not
covered by the ektogamat lib.

---

### Wave δ — PBR sphere-texture Wave 1 (Moon + Mars + Mercury + Venus)

**Ships:** R3 Wave 1 — 4 bodies with full PBR.

**Scope:**

- Create `scripts/pbr-bake-recipes.ts` with `PbrBakeRecipe[]` array. TS
  chosen for compile-time enum/bodyId validation.
- Create `scripts/lib/dem-derive.ts` (shared helper): Sobel gradient →
  tangent-space normal; slope-variance → roughness; cosine-latitude
  correction for equirect projection poles.
- Per-body recipes:
  - **Moon:** LROC WAC 100m albedo + SLDEM2015 59m DEM → dem-slope-variance
    path. USGS PD.
  - **Mars:** Viking MDIM 2.1 + MOLA MEGDR 463m → dem-slope-variance.
    USGS PD.
  - **Mercury:** MDIS BDR 166m + MESSENGER DEM 665m → dem-slope-variance.
    USGS PD + cite.
  - **Venus:** Magellan C3-MDIR 2025m + meter-slope → specular-invert
    (radar-slope maps directly to roughness via inversion). USGS PD + cite.
- Extend `scripts/bake-earth-pbr.js` → refactor to `scripts/bake-pbr.js`
  that takes `--body=mars` etc. and consumes a recipe. Earth's existing
  config becomes the first entry.
- Extend `src/lib/textureVariantManifest.ts` with per-body normal +
  roughness variants at boot/2k/4k/8k. Backfill Earth's missing tiers
  (Finding 3).
- Update `src/data/assetManifest.ts` with new texture URLs.
- Update `src/data/celestialBodies.ts` `visualProvenance` entries to cite
  new sources per body.
- Update `src/components/ui/CreditsModal.tsx` with required attributions.
- Playwright visual-review snapshot per body (not gated, for human
  inspection).

**Commit strategy:** 2 commits.

1. `chore(scripts): generalize bake-pbr pipeline + dem-derive helper`
   (recipes file, refactored script, no texture changes yet)
2. `feat(planet): ship PBR maps for Moon/Mars/Mercury/Venus`
   (texture files committed + manifest + credits + provenance)

**LOC:** ~400-600 (mostly recipe entries + credits + manifest). Texture
files are binary; ~14 MB at ultra tier aggregate.

**Gates:** standard + bundle-size check (assert `high`/`ultra` tier growth
matches projection).

**Depends on:** Wave α (not strictly — PBR materials work with or without
AgX — but if α hasn't shipped, the new maps will be tone-mapped by Reinhard
and look off). Run δ AFTER α.

**Does not depend on:** β, γ (parallel-safe).

---

### Wave ε — PBR sphere-texture Wave 2 (Enceladus + Ceres + Pluto + Charon + Phobos)

**Ships:** R3 Wave 2 — 5 more bodies.

**Scope:**

- Add recipes for Enceladus, Ceres, Pluto, Charon (all dem-slope-variance)
  and Phobos (Viking 5m + HRSC DEM 100m; tangent-space care for
  non-spherical).
- **Phobos blocker:** HRSC DEM is CC-BY-SA-3.0-IGO. If share-alike license
  conflicts with Atlas' redistribution model, ship Viking-albedo-only
  variant of Phobos. R3 flags this; wave-time decision.
- **Pluto/Charon caveat:** New Horizons covers ~±60° of encounter
  hemisphere only. `visualProvenance` must NOT advertise uniform
  resolution — include "encounter hemisphere only" qualifier in
  CreditsModal text.
- Manifest entries at all tiers.

**Commit strategy:** 1-2 commits (split if >400 LOC).

**LOC:** ~300-500.

**Gates:** standard + bundle-size.

**Depends on:** Wave δ (shared `bake-pbr.js` + dem-derive helper; manifest
migration already landed).

---

### Wave ζ — Model-body PBR architecture (PlanetModel.tsx) + Vesta

**Ships:** R3 Wave 3 — model-body architecture + first model body (Vesta).

**Scope (commit 1 — architecture):**

- Extend `src/components/canvas/PlanetModel.tsx`:
  - `OBJModel:129-141` and `GLBModel:50-64` add `normalMap` + `roughnessMap`
    to `MeshStandardMaterialParameters`.
  - Thread `mapRequest` pattern to include `normal` + `roughness` channels
    via `resolveTextureRequest`.
  - Load with `THREE.NoColorSpace` (tangent-space correctness for normal,
    linear grayscale for roughness).
  - GLBModel decision: override (lose GLB artist material, gain control) vs
    patch-in-place (preserve GLB). R3 recommends override; revisit at
    wave-time.
  - Verify UV0 for equirect normals (Vesta known good).
- No changes to `usePlanetAssets` / `usePlanetMaterials` (sphere track
  remains untouched).

**Scope (commit 2 — Vesta):**

- Recipe for Vesta: Dawn HAMO 60m + DTM 93m → dem-slope-variance. USGS PD.
- Manifest + credits + provenance.
- Playwright snapshot for visual confirmation.

**Commit strategy:** 2 commits.

1. `feat(planet): normalMap + roughnessMap support in PlanetModel`
2. `feat(planet): ship PBR maps for Vesta (glb-model track)`

**LOC:** ~200 (architecture) + ~50 (Vesta recipe).

**Gates:** standard. Sphere-track Playwright snapshots must be unchanged
(regression check).

**Depends on:** Wave ε (inherits bake-pbr pipeline + manifest).

---

### Wave η — Remaining R1 items #6–#13 (literal mirror of lighting-backlog.md)

**Ships:** eight distinct items from R1's backlog, in the exact form the
backlog publishes them. Each ships in its own implementation session (or
groups of two if LOC is small) with a prompt derived from R1 + this
roadmap.

- **η.6 — Adaptive exposure / auto-exposure.** Enable `<ToneMapping
adaptive adaptationRate middleGrey maxLuminance>` on the composer so
  exposure reacts to scene luminance. User control `off / auto / on`.
  Session count: 1. ~40-80 LOC. Depends on α (#1A). Hard-disabled on
  constrained.
- **η.7 — Per-star lens flare on mag ≤ 0 catalog entries.** Additive
  billboards with anamorphic texture on the ~20 brightest HYG stars.
  User control `off / on`. Session count: 2. ~200-350 LOC. Depends on
  α (#1B) + R2 settings model. Works with γ (sun flare) — shared
  HDR-emissive allow-list.
- **η.8 — Screen-space god rays (occlusion radial blur).** Custom
  pmndrs/postprocessing `Effect` implementing GPU Gems 3 Ch.13 occlusion
  radial blur from the sun's screen position. User control `off / low /
high`. Session count: 2. ~300-500 LOC. Depends on α (#1A). Shares sun-
  screen-position computation with γ.
- **η.9 — n8ao SSAO.** Promote `n8ao` from transitive to direct dep
  (already at 1.10.1 in lockfile). Mount `N8AOPostPass` between Bloom
  and tone mapping. User control `off / low / high`. Session count: 1.
  ~80-120 LOC. Depends on α (#1A post-stack ordering). Flagged risk:
  n8ao depth reconstruction with `logarithmicDepthBuffer: true` — test
  with dev build before merging.
- **η.10 — Bruneton / Hillaire precomputed atmospheric scattering.**
  Replace the fresnel shell (β / R1 #3) with `@takram/three-atmosphere`
  for Earth, Venus, Mars, Titan. New dep. Per-body LUT assets.
  User control `off / low / high` (low = fallback to fresnel shell).
  Session count: 3-4 (heaviest η item). ~500-900 LOC + LUT generation
  pipeline. Depends on β (schema) + α (HDR).
- **η.11 — Milky Way equirect layer (experimental, backdrop-only,
  default off).** ESA Gaia EDR3 or NASA SVS equirect HDR on an inverted
  sphere beneath the star catalog. Default off on all tiers (user opts
  in). Asset size: tens of MB; progressive loading. Session count: 1-2.
  ~150-300 LOC. Depends on α. Rendering invariant: must not feed
  `Environment` / IBL — guardrail required.
- **η.12 — Volumetric zodiacal light / interplanetary dust.**
  Screen-space raymarch through procedural 3D noise concentrated along
  the ecliptic. Prefer `three-volumetric-pass` (Ameobea) lib path over
  custom shader unless bundle cost prohibitive. User control `off / low /
high`. Session count: 2-3. ~400-700 LOC. Depends on α + η.6
  (adaptive exposure prevents washout). Highest-cost runtime item in
  backlog — flag explicitly.
- **η.13 — Chromatic aberration + vignette + film grain combined polish
  pass.** Three pmndrs built-in effects at end-of-chain with gentle
  defaults (CA offset ≈ 0.0005 radial, vignette `darkness: 0.3`, noise
  `opacity: 0.02`). Three independent toggles. Session count: 1. ~50-100
  LOC. Depends on α (ordering).

**Common pattern across all η items:**

- New toggle(s) in R2 Display panel Camera Effects subsection (this
  subsection is hidden in Wave α; first η item to land unhides it).
- Default gating per quality tier matches backlog §(g) for each item.
- Persisted via existing `graphicsSlice.graphicsOverrides`.
- Playwright snapshots with the effect on need re-baseline.

**Depends on:** Wave α (panel + HDR) + whichever specific R1 item's
dependency chain. η.10 additionally depends on β (atmosphere schema).

**Does not depend on:** γ, δ, ε, ζ (fully parallel-safe with sun flare
and PBR tracks).

**Ordering within η:** by ROI as ranked in lighting-backlog.md §5. Exact
sequencing decided at wave-time (e.g. η.13 is cheapest + visible; η.10 is
most ambitious). A single η wave typically ships 1-2 items.

---

## Parallelization map

Once Wave α ships, the following run in parallel (different windows / agents
won't collide):

```
Wave α (prerequisite)
   │
   ├─► Wave β (atmosphere)          ┐
   ├─► Wave γ (lens flare)          │ — postprocessing / planet materials
   ├─► Wave η (remaining R1 items)  ┘   share some files; sequentialize
   │                                    carefully OR accept small merges
   │
   └─► Wave δ (PBR W1)   ──► Wave ε (PBR W2)   ──► Wave ζ (model-body arch + Vesta)
           (texture/manifest track — fully independent of postprocessing)
```

**Safe-to-parallelize pairs:**

- (β or γ or any η item) + (δ or ε or ζ).

**Serialize within each column:**

- β → γ → η items: they share `DisplayPanel.tsx`, `PostProcessingPipeline.
tsx`, `visualPresets.ts`. Merge conflicts manageable, but prefer
  sequential.
- δ → ε → ζ: they share `bake-pbr.js`, `textureVariantManifest.ts`. Strict
  sequential.

## Deferred / out-of-scope

- **Gas-giant cloud shader track** (Jupiter / Saturn / Uranus / Neptune
  surface PBR): flagged separate initiative in R3. Not a PBR wave; needs
  custom cloud-band shader. Estimate: 2-3 sessions post-Wave ζ.
- **PBR for Io / Europa / Ganymede / Callisto / Mimas / Iapetus / Tethys /
  Dione / Rhea / Triton / Uranian moons / Deimos / Haumea / Makemake / Eris
  / TNOs**: R3 classifies these as "normal-only weak" or "unresolved source"
  or "geometry-only" or "fictional". Defer pending new mission data or
  community texture releases.
- **Textures tab in Display panel:** R2 Wave 5. Defer until real content
  (PBR waves ship) justifies the subsection.
- **Import/export graphics profile**: deferred — user request has not
  surfaced yet.
- **Per-scene graphics override** (dev tool): deferred.

_(Items previously listed here and moved into Wave η after Finding 10:
multi-star lens flare = η.7; Bruneton atmospheric scattering = η.10;
Milky Way equirect layer = η.11.)_

## Open questions for wave-time decision

1. **Wave α:** Does `vfxHdrGain` tier-default tune the same sliders R2 W1
   exposes, or does it sit above them as a hidden multiplier? Resolve in
   Wave α kickoff by reading `useVisualPresetLerp.ts` and deciding whether
   `vfxHdrGain` is user-facing or preset-governed.
2. **Wave β:** Default state of `Atmosphere Glow` toggle on balanced tier —
   cost/benefit is fragment-only but multiplied across 8 bodies. Measure in
   balanced profile before committing default.
3. **Wave γ:** Vendor assessment of `R3F-Ultimate-Lens-Flare` — last commit
   date, license, bundle size. If stale / MIT-incompatible, fall back to
   three.js native `Lensflare`.
4. **Wave δ:** Venus radar-meter-slope inversion formula — R3 cites the
   source but does not lock the math. Verify at recipe-time that inverted
   grayscale matches physical roughness expectations.
5. **Wave ε:** Phobos CC-BY-SA-3.0-IGO license compatibility with Atlas
   redistribution. Wave-time decision: ship dual variant or skip HRSC DEM.
6. **Wave ζ:** GLBModel — override vs patch-in-place. R3 recommends
   override for Vesta; future glb-model bodies may vary.

## Next step

**Open Wave α session** in a new window with the prompt from
`tasks/prompt-wave-alpha.md`. That prompt is self-contained and references
this roadmap as an authoritative source. Subsequent waves get their prompts
derived similarly from R1/R2/R3 detail + this roadmap's wave card.
