# Atlas Orbital — Lighting & VFX AAA Backlog

**Status:** research artifact. No production code changes implied.
Implementation sessions will execute against this document; each item below
has seven fields filled per AGENTS.md #8 ("call out assumptions, known
risks, anything not verified").

**Reads alongside:**
[lighting-audit-current.md](./lighting-audit-current.md) (what the scene
looks like today, with file:line citations) and
[lighting-aaa-benchmark.md](./lighting-aaa-benchmark.md) (what the rest of
the industry and R3F ecosystem ships in 2026). Items below reference both
by section number.

**Document layout:**

1. §1 Rendering Invariants — four architectural decisions that gate
   everything below.
2. §2 Settings model — preset + custom coexistence design.
3. §3 Backlog items (13) — ranked by ROI.
4. §4 Cross-cutting flags — dependencies, interactions, new-vs-prior.
5. §5 ROI ordering rationale.

---

## §1 Rendering Invariants

These four contracts must be pinned **before** any HDR-adjacent backlog
item lands. Today's scene breaks #1 and #3 in subtle ways that would
propagate forward if left implicit.

### §1.1 Tone-mapping authority

**Decision:** the **composer** owns tone mapping; the renderer stays
linear (`NoToneMapping`).

**Evidence of the current conflict:** [Scene.tsx:267](../src/components/canvas/Scene.tsx)
sets `gl.toneMapping = THREE.ReinhardToneMapping` _and_
[PostProcessingPipeline.tsx:68](../src/components/canvas/scene/PostProcessingPipeline.tsx)
mounts `<ToneMapping />`. Both active ⇒ a double tone-map: Reinhard on the
main render target's composite, then the composer runs another curve.
Observable symptom: compressed highlights entering the bloom pass, a
narrower usable HDR range, and opaque coupling between bloom threshold
tuning and the renderer curve.

**Required change (scope of item #1A below):** remove the
`gl.toneMapping = ReinhardToneMapping` line; set the composer's
`<ToneMapping />` to **AgX** mode (three.js r164+ native, see benchmark
§Axis 3/HDR pipeline). AgX preserves color fidelity at extremes better
than ACES and is the Blender 4 default.

Why composer-authoritative: HDR energy has to travel through bloom, lens
flare, god rays, and exposure _before_ being tone-mapped, or each of
those effects operates on a pre-compressed buffer.

### §1.2 Exposure authority

**Decision:** exposure lives alongside tone mapping in the composer,
controlled by the same effect.

- Manual exposure as the first iteration (landing with #1A).
- Adaptive exposure (#7) slots in as a downsampled luminance reducer
  feeding the existing effect — no architectural change when it arrives.
- The renderer's `toneMappingExposure` is irrelevant once §1.1 is in
  place; leave at default.

### §1.3 HDR-emissive contract

**Decision:** explicit allow-list of surfaces that may emit color > 1.0.

| May emit > 1.0 (HDR)                   | Must stay ≤ 1.0 (LDR)                             |
| -------------------------------------- | ------------------------------------------------- |
| Starfield fragment output (HYG + NASA) | Planet surface MeshStandardMaterial               |
| Sun MeshBasicMaterial                  | Ring MeshStandardMaterial                         |
| Future lens-flare cores (#6, #8)       | Cloud MeshStandardMaterial + depth caster         |
|                                        | Fresnel atmosphere shell (#4, current + extended) |
|                                        | Orbit lines                                       |

Consequence: selective bloom's `luminanceThreshold = 1.0` becomes a clean
cutoff. No planet pixel can accidentally bloom. No test harness has to
reason about whether a planet's dayside bright limb should trigger
bloom — it can't, by contract.

### §1.4 Background vs environment lighting separation

**Decision:** the starfield and any future Milky Way layer (item #12)
are **backdrop only**. They **must not** feed `Environment` / IBL.

Project history here is load-bearing: there has been at least one prior
regression where a starfield layer leaked into environment lighting and
affected planet shading. This invariant makes that non-repeatable. If
physically-based planetary environment lighting is ever wanted (distant
star contribution to shadow fill, for example), it gets its own
low-resolution cubemap, not the display starfield.

---

## §2 Settings model — preset + custom coexistence

Codex review flagged (correctly) that the project already ships a Scene
panel at [`src/components/ui/LayersPanel.tsx`](../src/components/ui/LayersPanel.tsx)
with rows for `Starfield Source` (line 185), `Quality` (line 239), and
`Sun Render` (line 269). **No new panel** is being proposed; item #5
below extends this file.

### §2.1 Preset ↔ custom flip

- Quality presets (`ultra / high / balanced / constrained`) continue to
  define defaults per feature (as in
  [`src/lib/qualityProfile.ts:69-106`](../src/lib/qualityProfile.ts)).
- A user override on any individual VFX control flips the active profile
  to **`custom`** (new mode). Standard AAA convention
  (Universe Sandbox 2 "Artificial Starlight" toggle, Elite Dangerous
  `GraphicsConfiguration.xml` overrides).
- Custom state persists via existing Zustand store (same path as
  `qualityMode`, `sunRenderMode`, `starfieldSource`).
- Reset-to-preset button reverts every override to the active preset's
  default and flips back out of custom.

### §2.2 Control states beyond boolean

Not every effect is a toggle. Three shapes:

- `off / on` — simple toggles (CA, vignette, film grain, lens dirt).
- `off / low / high` — graded effects where cost scales (SSAO, god rays,
  volumetrics).
- `off / auto / on` — where **auto** defers to the preset (bloom
  intensity multiplier, adaptive exposure responsiveness).

### §2.3 Hard-disable on constrained tier

Some overrides are force-disabled regardless of custom intent, because
they cannot run on the hardware class `constrained` represents (volumetric
dust, adaptive exposure at high resolution, n8ao Ultra). The settings UI
shows these controls grayed with a short tooltip explaining the tier
gate. Switching to a higher tier re-enables them.

### §2.4 What item #5 actually builds

- New slice in the Zustand store: `vfxSettings` record keyed by effect id.
- New subsection in `LayersPanel.tsx` labeled `Visual Effects` (below
  `Sun Render` at :269).
- Thin presenter components for each control state (`BooleanToggle`,
  `GradedToggle`, `AutoToggle`).
- Migration / default-population logic: on first boot, populate
  `vfxSettings` from the active preset's defaults.

This is **not** a design-doc deliverable — it's a schema extension + UI
component set. Expected ~200–400 LOC. Visual impact: zero on its own
(just unblocks downstream items' user-facing surfaces).

---

## §3 Backlog items (13)

Each item has fields **(a)–(g)** populated. No "TBD", no "N/A" placeholders.

---

### 1A — Pipeline HDR contract landing

- **(a) Summary:** Make the composer authoritative over tone mapping and
  exposure; renderer becomes linear (`NoToneMapping`).
- **(b) Visual impact:** **Unlock** — zero direct visual change, but
  every HDR-adjacent item below stops being blocked by the double tone-map.
- **(c) Implementation sketch:**
  - Edit [Scene.tsx:267](../src/components/canvas/Scene.tsx) — remove
    `gl.toneMapping = THREE.ReinhardToneMapping`; set
    `gl.toneMapping = THREE.NoToneMapping`.
  - Edit [PostProcessingPipeline.tsx:68](../src/components/canvas/scene/PostProcessingPipeline.tsx)
    — replace `<ToneMapping />` with `<ToneMapping mode={ToneMappingMode.AGX} />`.
  - Decide post-stack ordering; target chain: `Bloom → n8ao (#10) →
GodRays (#9) → LensFlare (#6, #8) → ToneMapping (incl. exposure) →
ChromaticAberration → Vignette → Noise`. Current chain only has
    Bloom/ToneMapping/HueSat/BrightnessContrast; the latter two stay at
    end as user-facing color grades.
  - No new dependencies (uses existing `@react-three/postprocessing`
    `ToneMappingMode.AGX`; verify enum available in 3.0.4 or bump).
- **(d) Dependencies:** Rendering Invariants §1.1, §1.2 (this item lands
  both).
- **(e) Risks:**
  - Without #1B landing in the same session, bloom may visibly
    over-trigger on bright planet edges because the renderer no longer
    pre-compresses highlights. Land #1A + #1B + #3 together or plan a
    brief "uglier intermediate" window.
  - Existing `<Bloom>` has no `luminanceThreshold` set (audit §3);
    default ~0.9. Must tune concurrently.
  - Post-stack reordering is a mechanical edit but affects visual output
    across every test snapshot. Every Playwright pixel-diff test must be
    re-baselined.
  - AGX enum may not be re-exported through `@react-three/postprocessing`
    3.0.4 — if not, patch by consuming the raw three.js constant
    (`THREE.AgXToneMapping`) via a renderer-side one-time set, or bump
    `@react-three/postprocessing` (verify changelog first).
- **(f) LOC + sessions:** ~80–150 LOC across three files + pipeline-
  ordering comments. **1 session** (half a day) if #1B lands together;
  otherwise estimate 2 sessions split.
- **(g) Gating:** all tiers (ultra / high / balanced / constrained). No
  user toggle — this is pure infrastructure, not a feature.

---

### 1B — Star emissive recalibration for HDR pipeline

- **(a) Summary:** Retune
  [`src/lib/starfieldShaderMath.ts`](../src/lib/starfieldShaderMath.ts) so
  bright-mag catalog entries emit linear HDR values > 1.0 in the fragment
  output, preserving the L16/L17 log-compression transfer curve and keeping
  the 15 unit tests green.
- **(b) Visual impact:** **High** — once #1A lands, stars selectively
  bloom only at the high end, pulling the starfield visually closer to
  NASA Eyes / SpaceEngine reference.
- **(c) Implementation sketch:**
  - Keep transfer shape `brightness = 2.0 * log(1 + flux * C)`
    (audit §4.1, §4.2).
  - Multiply fragment output color by a new `vfxHdrGain` uniform so the
    top-percentile stars cross the 1.0 luminance floor while median-mag
    stars stay ≤ 1.0.
  - Update [`src/lib/starfieldShaderMath.ts`](../src/lib/starfieldShaderMath.ts)
    test expectations atomically (15 tests per audit §4.3).
  - Update both [Starfield.tsx](../src/components/canvas/Starfield.tsx) and
    [NASAStarfield.tsx](../src/components/canvas/NASAStarfield.tsx)
    consumers with the gain uniform pathway.
  - Files: `starfieldShaderMath.ts`, `Starfield.tsx`, `NASAStarfield.tsx`,
    `shaders/nasaStarShaders.ts`, `starfieldShaderMath.test.ts`.
  - No new deps.
- **(d) Dependencies:** #1A (renderer must be linear or the gain lives in
  a pre-compressed space).
- **(e) Risks:**
  - L15 uniform-race pattern: the gain must flow through the
    existing `useMemo`'d material reference, not via JSX `<shaderMaterial
uniforms={{}}>` child (audit §4.4).
  - Recalibrating without updating tests breaks CI — must be one commit.
  - DPR double-dip per L17#7 is already fixed; any new path that reads
    `window.devicePixelRatio` would re-introduce the bug. Gain should
    be DPR-independent.
  - Risk of over-bright top-percentile stars flooding the lens flare #8;
    tune thresholds in the same session.
- **(f) LOC + sessions:** ~80–120 LOC across four files + test updates.
  **1 session** (half day). Usually lands together with #1A.
- **(g) Gating:** all tiers. The gain uniform has tier-keyed defaults
  (higher gain on ultra, lower on constrained where bloom is off and
  HDR stars would just clip). No direct user control — governed by the
  preset.

---

### 2 — Selective luminance-threshold bloom

- **(a) Summary:** Set `luminanceThreshold=1.0` on the existing
  `<Bloom>` so only the HDR-allow-listed surfaces (§1.3) bloom.
- **(b) Visual impact:** **High** — stars, sun, and future flare cores
  become the only bright sources; background doesn't glow. This is the
  "classic space" look Digital Foundry flags as AAA's highest-ROI move
  for this genre (benchmark §Axis 3/Selective bloom).
- **(c) Implementation sketch:**
  - Edit [PostProcessingPipeline.tsx:60](../src/components/canvas/scene/PostProcessingPipeline.tsx)
    — add `luminanceThreshold={1.0} luminanceSmoothing={0.1}` to `<Bloom>`.
  - Expose `bloomIntensity` / `bloomThreshold` already live in
    `useSceneDebugControls`; add new `off/auto/on` state (§2.2) wired
    through `vfxSettings`.
  - No new deps.
- **(d) Dependencies:** #1A (HDR authority), #1B (stars have to be above
  1.0 for the threshold to pick them up), Settings model §2 for the user
  toggle.
- **(e) Risks:**
  - Threshold 1.0 is a contract — any surface accidentally crossing it
    (e.g. a roughness-map edge case on a planet) will bloom unintentionally.
    Mitigation: audit every material's max output during the #1A /#1B
    session (should be protected by §1.3 contract but verify).
  - `luminanceSmoothing` kills flicker on magnitude-stable pixels; tune
    alongside #1B gain.
  - Mobile constrained tier already unmounts EffectComposer (audit
    §3.1) — no mobile cost increase.
- **(f) LOC + sessions:** ~20–40 LOC. **1 session**, usually folded into
  the #1A / #1B / #3 landing.
- **(g) Gating:**
  - ultra / high: on by default, intensity tuned per preset.
  - balanced: on, intensity ×0.75 (existing `bloomIntensityMultiplier`
    pattern).
  - constrained: off (matches existing `bloomEnabled` gate).
  - User control: `off / auto / on`. `auto` = use preset default.

---

### 3 — Per-body atmospheric metadata schema + fresnel-glow extension

- **(a) Summary:** Add structured `atmosphere` metadata to
  `celestialBodies.ts`; extend the existing Earth-only fresnel shell shader
  to any body with `atmosphere.present = true`.
- **(b) Visual impact:** **High** — Venus, Mars, Titan, the gas giants
  gain a tinted limb glow. Core to project identity: this is a scientific-
  visualization deliverable, not a cinematic one.
- **(c) Implementation sketch:**
  - Audit §5.2 finding: `celestialBodies.ts.atmosphere` is currently a
    prose string (e.g. Venus at :123 = `"96% carbon dioxide, clouds of
sulfuric acid"`). Introduce a new typed record — **without** removing
    the prose string (which is user-facing flavor text in the info panel).
    Shape:
    ```ts
    atmosphereProfile?: {
      present: boolean;
      tintHex: number;        // base glow color
      densityScale: number;   // 0.5 = thin, 1.5 = thick
      falloffPower: number;   // replaces the hard-coded 4.0 in atmosphereShader
      rayleighStub?: { /* reserved for #11 */ };
      mieStub?: { /* reserved for #11 */ };
    };
    ```
  - Populate for Earth, Venus, Mars, Titan, Jupiter, Saturn, Uranus,
    Neptune (Pluto optional; no atmosphere on airless bodies).
  - Generalize [atmosphereShader.ts](../src/components/canvas/shaders/atmosphereShader.ts)
    to consume uniforms driven by the profile (tint, density, falloff).
  - Hoist the atmosphere-mount guard from Earth-only to "any body where
    `atmosphereProfile.present === true`" in
    [usePlanetMaterials.ts:155-168](../src/components/canvas/planet/usePlanetMaterials.ts).
  - No new deps.
- **(d) Dependencies:** Settings model §2 for an optional user toggle
  (`off / on`, probably on by default on all tiers). Independent of the
  HDR pipeline (atmosphere shell stays ≤ 1.0 per §1.3).
- **(e) Risks:**
  - Schema migration risk: the current prose `atmosphere` string is
    referenced by info panels — must **not** be removed. The new field is
    additive.
  - Fresnel power per-body needs tuning; without good defaults, gas
    giants may look like cartoonish jellybeans. Mitigate by baselining
    Venus/Mars first (documented scientific reference imagery exists) and
    extrapolating.
  - Schema-first matters: if #11 (Bruneton) lands later with its own
    parallel fields, they'd collide. Include `rayleighStub` / `mieStub`
    placeholders now so #11 can populate without breaking this schema.
  - Earth atmosphere shader (audit §2.3) currently hardcodes
    `color = 0x00aaff` and `pow(..., 4.0)`. Preserving Earth's visual
    while generalizing is a regression risk — Playwright pixel-diff the
    Earth view before/after.
- **(f) LOC + sessions:** ~250–400 LOC (schema declaration per body +
  shader generalization + materials.ts glue). **2 sessions** — first for
  schema + Earth parity refactor, second for applying to all atmospheric
  bodies.
- **(g) Gating:**
  - All tiers default **on** (cheap fragment-only cost).
  - User control: `off / on` under new "Visual Effects" subsection.
  - constrained: on (same cost regardless of tier since it's a single
    sphere pass per body).

---

### 4 — Settings model + Scene-panel extension for VFX feature toggles

- **(a) Summary:** Implement preset ↔ custom coexistence (§2.1), graded
  control states (§2.2), hard-disable handling (§2.3), new `Visual
Effects` subsection in `LayersPanel.tsx`.
- **(b) Visual impact:** **Low (direct)** / **Unlock** for downstream.
  No visual change on its own; unblocks user-facing surfaces for #2, #5,
  #6, #7, #8, #9, #10, #11, #12.
- **(c) Implementation sketch:**
  - Extend [`src/store.ts`](../src/store.ts) (or wherever `qualityMode`
    lives) with `vfxSettings: Record<EffectId, EffectState>` slice.
  - Define `EffectState` discriminated union for the three control shapes
    in §2.2.
  - Write `resolveEffectState(effectId, preset, vfxSettings)` helper that
    returns the active state (handles `auto` → preset default).
  - Add `Visual Effects` subsection to
    [`src/components/ui/LayersPanel.tsx`](../src/components/ui/LayersPanel.tsx)
    after `Sun Render` (:269). Small presenter components per control
    shape.
  - Expose `vfxProfile === "custom" | "preset"` derived selector; show
    `Custom` label on the tier button row when any override is active.
  - **Do not create a new panel** — all rows land inside `LayersPanel`.
- **(d) Dependencies:** none technical. Conceptually blocks user-facing
  toggles for every item below, but those items can land first with
  internal-only toggles if desired; #4 can follow in a later session to
  externalize them.
- **(e) Risks:**
  - Persistence / migration: a user's existing Zustand localStorage won't
    have `vfxSettings` — migration must gracefully populate defaults.
  - Tier-swap during custom: if user is `custom` and hits `Quality:
Balanced`, should overrides persist or reset? AAA convention is
    persist; Atlas can match or deviate — decision point in the
    implementation session, flag in commit message.
  - UX risk of cluttering the Scene panel — mitigate by collapsible
    `Visual Effects` subsection, closed by default.
  - L11 preview-iframe cascade risk: adding new controls means new HMR
    surface. Test with quick edit burst.
- **(f) LOC + sessions:** ~200–400 LOC across store, panel, and two or
  three new presenter components. **2 sessions** — one for store /
  resolver logic, one for UI wiring and persistence migration.
- **(g) Gating:** This item _is_ the gating infrastructure; it is available
  on every tier because the settings surface itself must work everywhere
  (including `constrained`, where most effect toggles are hard-disabled and
  display the tooltip from §2.3). No user "off" state — the panel can be
  collapsed but cannot be disabled.

---

### 5 — Sun lens flare — ektogamat Ultimate Lens Flare integration

- **(a) Summary:** Replace the three portal'd sprites in `SunScreenFlare.tsx`
  with a postprocessing `Effect` (ektogamat R3F-Ultimate-Lens-Flare).
- **(b) Visual impact:** **High** — modern anamorphic streaks, ghost chain,
  star burst, lens dirt; replaces the hand-rolled sprite trio that has
  worked but looks dated next to AAA references (Star Citizen, EVE
  Frontier tech demo).
- **(c) Implementation sketch:**
  - **New dependency:** `ektogamat/R3F-Ultimate-Lens-Flare` (not in
    lockfile today — net-new install).
  - Add lens-dirt 16:9 texture to `assetManifest.ts` (currently empty —
    audit §7.1); source from ektogamat repo or license-compatible
    equivalent.
  - Mount the effect inside `PostProcessingPipeline.tsx` at the
    post-bloom / pre-tone-mapping position in the ordering established
    by #1A.
  - Remove (or deprecate behind a fallback flag) the sprite
    implementation in [SunScreenFlare.tsx:97-275](../src/components/canvas/planet/SunScreenFlare.tsx).
    Keep the screen-space culling math (it still feeds the effect the
    sun's screen position).
  - Wire user toggle via settings model §2 (`off / on`, default `on`
    for ultra / high / balanced).
- **(d) Dependencies:** #1A (effect reads HDR luminance buffer, needs
  linear pipeline). Settings model §4 for user toggle.
- **(e) Risks:**
  - L15 uniform-race: ektogamat's effect exposes its params through
    uniforms; follow the instance-prop pattern, not JSX child.
  - Existing sprite fade logic (SunScreenFlare.tsx:178-186 — fade in
    when sun visual radius < 12 px) does not map 1:1 to a post-processing
    effect that operates on the whole frame. Losing the fade behavior
    may cause the flare to feel "on all the time"; retain a screen-
    projected gate.
  - Bundle size: ektogamat's effect is moderate; measure before merging.
  - Visual regression risk across existing Playwright snapshots with sun
    visible — re-baseline explicitly.
  - Mobile tier: flare effect has non-trivial cost at high resolution;
    hard-disable on constrained.
- **(f) LOC + sessions:** ~200–300 LOC (effect wire-up + asset + settings
  glue + sprite deprecation path). **2 sessions** — one to integrate, one
  to tune defaults and validate A/B.
- **(g) Gating:**
  - ultra / high: on by default, anamorphic mode.
  - balanced: on by default, classic (non-anamorphic) mode.
  - constrained: hard-disabled (§2.3).
  - User control: `off / on`.

---

### 6 — Adaptive exposure / auto-exposure

- **(a) Summary:** Enable `adaptive` mode on the composer's
  `<ToneMapping>` so exposure reacts to scene luminance; eliminates the
  "sun-in-frame vs deep-void" whiplash on fast camera moves.
- **(b) Visual impact:** **Medium** — subtle but high-quality. Matches
  Elite Dangerous / SpaceEngine behavior (benchmark §Axis 1). Biggest
  payoff on zoom transitions into / out of the sun vicinity.
- **(c) Implementation sketch:**
  - With #1A landed, flip `<ToneMapping mode={AGX} adaptive
adaptationRate={0.05} middleGrey={0.1} maxLuminance={16} />` in
    `PostProcessingPipeline.tsx`.
  - Requires `EXT_shader_texture_lod` (WebGL2 standard; Atlas's
    `logarithmicDepthBuffer: true` canvas already implies WebGL2).
  - User control: `off / auto / on`. `auto` = use preset default (on for
    ultra/high, off for balanced, hard-disabled for constrained).
  - No new deps.
- **(d) Dependencies:** #1A (exposure authority = composer, per §1.2).
  Settings model §4.
- **(e) Risks:**
  - Camera-cut flicker: adaptation rate must be tuned or fast cuts
    (timeline jumps) produce visible exposure ramp. Consider a reset-on-
    cut hook.
  - Interacts with #5 lens flare and #2 bloom luminance threshold — a
    dimmer overall exposure post-adapt can pull star luminance below the
    1.0 threshold unexpectedly. Mitigation: threshold should be
    pre-tonemap (which with §1.1 it already is).
  - `maxLuminance` caps the top of the HDR range; too low crushes the
    sun, too high makes adaptation sluggish. Tunable via vfxSettings.
  - L11 preview iframe cascade: adaptive exposure's downsampled
    luminance buffer takes a few frames to stabilize on reload; preview
    screenshot timing should account for this.
- **(f) LOC + sessions:** ~40–80 LOC. **1 session**.
- **(g) Gating:**
  - ultra / high: on by default.
  - balanced: off by default, user-togglable.
  - constrained: hard-disabled (downsample pass too expensive).
  - User control: `off / auto / on`.

---

### 7 — Per-star lens flare on mag ≤ 0 catalog entries

- **(a) Summary:** Additive billboards with anamorphic texture on the
  ~20 brightest cataloged stars (Sirius, Canopus, Rigel Kentaurus,
  Arcturus, Vega, Capella, Rigel, Procyon, Achernar, Betelgeuse, etc.).
- **(b) Visual impact:** **Medium** — named-star recognition. Matches
  Star Citizen and NASA Eyes "the sky has specific bright points worth
  looking at" affordance.
- **(c) Implementation sketch:**
  - Post-#1B, enumerate catalog entries with `mag ≤ 0` (likely ≤ 20
    stars from HYG catalog at normal scale; full catalog at 109k has a
    fixed small top-percentile).
  - Per-star billboard: `THREE.Sprite` with a pre-baked anamorphic flare
    texture, positioned at the star's scene coordinates, scaled by
    magnitude, oriented as a screen-space billboard.
  - Layer above the starfield (renderOrder between starfield's `-2` and
    sun flare's `5000+`; likely `100` range).
  - `toneMapped: false` + additive blending — these participate in the
    HDR-emissive allow-list (§1.3) so they bloom appropriately.
  - Asset: pre-baked anamorphic flare texture (new entry in
    assetManifest.ts — audit §7.1).
  - No new deps (pure three.js sprite).
- **(d) Dependencies:** #1B (HDR stars), Settings model §4 for toggle.
- **(e) Risks:**
  - Catalog reconciliation: HYG path and NASA Eyes path use different
    identifiers. Name-mapping table needs both; handle the case where the
    user switches `starfieldSource` mid-session.
  - Proper motion: each catalog applies proper motion in the vertex
    shader (audit §4). Per-star billboards must apply the same
    displacement on the CPU, or use InstancedMesh and match the GPU
    transform.
  - Interaction with #5 sun flare: if a bright star is near the sun in
    screen space, both flare stacks compositing can clip. Cap total
    flare intensity per frame or layer them through the same post-
    processing pass.
  - Overlap with catalog picking
    ([StarHoverPicker.tsx](../src/components/canvas/StarHoverPicker.tsx)):
    billboards must not steal raycasts. Set `raycast = () => null`.
- **(f) LOC + sessions:** ~200–350 LOC (data extraction, billboard
  component, proper-motion sync, settings wiring, asset pipeline). **2
  sessions**.
- **(g) Gating:**
  - ultra / high: on by default.
  - balanced: on by default (cost is ~20 sprites, negligible).
  - constrained: off by default (consistent with bloom-disabled tier —
    without bloom these sprites look fuzzy rather than flare-like).
  - User control: `off / on`.

---

### 8 — Screen-space god rays (occlusion radial blur)

- **(a) Summary:** Custom pmndrs/postprocessing `Effect` implementing
  GPU Gems 3 Ch.13 occlusion-based radial blur from the sun's screen
  position.
- **(b) Visual impact:** **Medium** — drama on planet-silhouette-occludes-
  sun moments (eclipse, orbital transit). Cheap vs benefit.
- **(c) Implementation sketch:**
  - New custom `Effect` class (pmndrs pattern). Not an npm package;
    ~100 LOC shader + effect descriptor.
  - Sample opacity/occlusion mask from the main color buffer's luminance
    on a low-res pass; radial-blur composite toward the sun's projected
    screen position.
  - Sun screen position is already computed every frame in
    [SunScreenFlare.tsx:136-189](../src/components/canvas/planet/SunScreenFlare.tsx).
    Share that computation via a ref or a store slice.
  - Mount between Bloom and LensFlare in the composer ordering
    (benchmark §Axis 3/Per-light god rays).
  - Graded control `off / low / high` — resolution of the occlusion
    pass is the main cost lever.
  - No new deps.
- **(d) Dependencies:** #1A (runs on HDR luminance). Settings model §4.
  Synergistic with #5 (sun flare): both consume sun screen position;
  share the computation.
- **(e) Risks:**
  - Off-screen sun: god rays need a screen position; when sun is culled
    (behind camera), early-out to zero contribution. SunScreenFlare
    already has culling math — share the gate.
  - Occlusion mask quality: any HDR-allow-listed surface (other stars,
    future flares) appears bright in the luminance buffer and can pull
    rays toward itself. Mask to sun-only or threshold above star-peak
    luminance.
  - Cost scales with radial-blur sample count; `low / high` modes are
    the graded control.
  - Visual regression on every Playwright test with sun in frame —
    re-baseline.
- **(f) LOC + sessions:** ~300–500 LOC (custom Effect + shader +
  wiring + settings). **2 sessions** — one for the Effect, one for
  polish and tier defaults.
- **(g) Gating:**
  - ultra: high mode default on.
  - high: low mode default on.
  - balanced: off by default, user-togglable to low.
  - constrained: hard-disabled.
  - User control: `off / low / high`.

---

### 9 — n8ao SSAO

- **(a) Summary:** Add `N8AOPostPass` between Bloom and tone mapping for
  contact darkening at crater rims, ring-planet interfaces, and
  near-surface features.
- **(b) Visual impact:** **Medium** — recognizable AAA cue; biggest
  payoff on high-detail bodies (Vesta, Pallas, Hygiea with loaded glTF
  models per audit §7).
- **(c) Implementation sketch:**
  - Promote `n8ao` from transitive to direct dep (already at `1.10.1`
    in `package-lock.json`, see benchmark §Axis 2/n8ao). Pin in
    `package.json`.
  - Import `N8AOPostPass`; mount inside `PostProcessingPipeline.tsx`.
  - Graded `off / low / high` → maps to n8ao's own quality presets.
  - Tune `aoRadius`, `distanceFalloff`, `intensity` per preset.
  - No shader writing needed (library provides everything).
- **(d) Dependencies:** #1A for post-stack ordering; Settings model §4.
- **(e) Risks:**
  - Ordering matters: SSAO before tone mapping is correct; verify no
    conflict with bloom (SSAO darkens, bloom brightens — can interact).
  - SSAO at logarithmic-depth-buffer scene: three.js
    `logarithmicDepthBuffer: true` is active (audit §3.2); n8ao's depth
    reconstruction must support this. `[unverified]` in current n8ao
    release notes — test with a dev build before merging.
  - Temporal stability: n8ao is better than pmndrs SSAO on this axis but
    can still shimmer on low-res tier; SMAA pairing is recommended in
    upstream docs.
  - Bundle size increase: n8ao is ~40-60 KB min+gz.
- **(f) LOC + sessions:** ~80–120 LOC. **1 session** for integration +
  tuning.
- **(g) Gating:**
  - ultra: high mode default on.
  - high: low mode default on.
  - balanced: off by default.
  - constrained: hard-disabled.
  - User control: `off / low / high`.

---

### 10 — Bruneton/Hillaire precomputed atmospheric scattering

- **(a) Summary:** Replace the extended fresnel shell (#3) with
  `@takram/three-atmosphere` for Earth, Venus, Mars, Titan.
- **(b) Visual impact:** **High** — physically plausible sky color,
  sunrise/sunset, aerial perspective. Biggest single scientific-fidelity
  lift on the body-detail axis.
- **(c) Implementation sketch:**
  - New dep: `@takram/three-atmosphere` (not in lockfile — net-new).
  - Per-body LUT parameters populate from the schema defined in #3
    (`rayleighStub`, `mieStub` become populated fields).
  - Replaces the fresnel atmosphere invocation in
    [usePlanetMaterials.ts:155-168](../src/components/canvas/planet/usePlanetMaterials.ts)
    for bodies flagged `atmosphereProfile.model === "bruneton"`; other
    bodies stay on the cheap fresnel shell from #3.
  - Asset: precomputed LUT textures (generated once at dev-time, shipped
    as static assets — new entries in `assetManifest.ts`).
  - User control `off / low / high` — `low` falls back to fresnel shell.
- **(d) Dependencies:** **#3 must land first** (schema must exist).
  Settings model §4.
- **(e) Risks:**
  - Large dep: `@takram/three-atmosphere` ships LUT generation +
    runtime; bundle cost is meaningful. Verify size before committing.
  - LUT generation is CPU/GPU intensive; doing it at dev-time and
    shipping static LUTs is the correct path.
  - Integration complexity with sun light positioning: Bruneton assumes
    a directional light from infinity. Atlas's SmartSunLight already
    satisfies this — but the sun-direction uniform must flow through.
  - Per-body LUT doubling: each unique atmosphere profile needs its own
    LUT set. Four bodies ≈ 4 sets; cost is bounded but not trivial.
  - Interaction with #3's fresnel fallback: must not double-render the
    shell + the Bruneton volume — mutual exclusion in the shader mount
    logic.
- **(f) LOC + sessions:** ~500–900 LOC, plus LUT generation pipeline and
  asset additions. **3–4 sessions** (this is one of the heaviest items
  on the list).
- **(g) Gating:**
  - ultra: high mode on for all four bodies.
  - high: low mode on (simpler LUT, lower sample count).
  - balanced: falls back to #3 fresnel shell.
  - constrained: falls back to #3 fresnel shell.
  - User control: `off / low / high`.

---

### 11 — Milky Way equirect layer — experimental, backdrop-only

- **(a) Summary:** ESA Gaia EDR3 or NASA SVS OpenEXR on an inside-out
  sphere beneath the star catalog. Explicitly **off by default**; user
  toggle to opt in for A/B comparison.
- **(b) Visual impact:** **Medium** as experiment; **Unclear** as
  default — a real question whether the project identity wants the
  interpretative layer. Handle honestly: ship with toggle off, document
  visual A/B in the backlog item commit, decide whether to flip default
  based on feedback.
- **(c) Implementation sketch:**
  - Asset: one of the equirect HDR sources from
    benchmark §Axis 3/Milky Way. Add to `assetManifest.ts` with explicit
    provenance + license. Do not bundle into a default build path that
    auto-loads on first paint — lazy-load behind the toggle.
  - Inside-out sphere, `MeshBasicMaterial` with
    `colorSpace = LinearSRGBColorSpace` for the EXR so tone mapping can
    compress it; `side = BackSide`, `depthWrite = false`, rendered
    below the starfield's `renderOrder = -2` (use `-3`).
  - **Explicit constraint per §1.4:** must not feed `Environment` / IBL.
    Guardrail: the loading function takes a separate path from any
    future `Environment` loader; code comment at load site.
  - User toggle: `off / on`, default **off** on all tiers.
- **(d) Dependencies:** Rendering Invariants §1.4 (explicit backdrop-only
  constraint). Settings model §4 for the toggle.
- **(e) Risks:**
  - Scientific identity risk: prior todo.md block placed this high, but
    codex review correctly argued this is an interpretative layer, not
    a catalog. Defaulting **off** manages this directly.
  - Asset licensing: ESA Gaia = CC BY-SA 3.0 IGO; NASA SVS = public
    domain. Both usable, but attribution line required in
    `CreditsModal` — tally the license touchpoints in the implementation
    session.
  - File size: equirect HDR is large (tens of MB). Progressive or
    downsampled loading path.
  - Ordering regression: starfield renders at `renderOrder = -2`; layer
    at `-3` assumes three.js honors the ordering. Verify on switch to
    constrained tier (which changes DPR).
  - Interaction with #3 fresnel atmosphere: from ground-level camera
    (if future scene introduces it), Milky Way should be behind the
    atmosphere; today Atlas is camera-above-atmosphere, so this is
    not yet a concern.
- **(f) LOC + sessions:** ~150–300 LOC (loader + mount + settings wiring
  - asset pipeline). **1–2 sessions**.
- **(g) Gating:**
  - All tiers: off by default.
  - ultra / high / balanced: user-togglable on.
  - constrained: hard-disabled (asset size alone disqualifies).
  - User control: `off / on`.

---

### 12 — Volumetric zodiacal light / interplanetary dust

- **(a) Summary:** Screen-space raymarch through a procedural 3D noise
  volume concentrated along the ecliptic.
- **(b) Visual impact:** **Medium** — subtle but authentic. Zodiacal
  light is a known astronomical phenomenon; adds continuum density to
  the inner solar system view.
- **(c) Implementation sketch:**
  - Two options: (i) Ameobea `three-volumetric-pass` (new dep), or
    (ii) custom Effect using Maxime Heckel cloudscape raymarch
    (benchmark §Axis 3/Volumetric). Prefer the library path unless bundle
    cost is prohibitive.
  - 3D noise texture: procedurally generated at dev-time, density
    concentrated near the ecliptic plane.
  - Raymarch in world space; clip to near/far to avoid integrating
    through empty void.
  - Custom `Effect` mount in the composer between LensFlare and
    ToneMapping.
  - Graded `off / low / high` — raymarch sample count.
- **(d) Dependencies:** #1A, #6 (benefits from adaptive exposure to
  avoid washing out). Settings model §4.
- **(e) Risks:**
  - Banding without dithering — use blue-noise per benchmark reference.
  - Cost is meaningful even at low sample count; hard-disable on
    constrained.
  - Ecliptic plane orientation: Atlas applies J2000 obliquity rotation
    to the starfield (audit §4.1); volumetric dust plane must use the
    same transform or stars and dust will visibly disagree.
  - Scientific accuracy: zodiacal light is asymmetric (brighter toward
    the sun). Cheap version shows symmetric density; accurate version
    needs sun-direction shaping. Document trade-off in the commit.
  - Likely the highest-cost runtime item on the list; flag clearly.
- **(f) LOC + sessions:** ~400–700 LOC (raymarch + noise + composer
  wiring + ecliptic transform + settings). **2–3 sessions**.
- **(g) Gating:**
  - ultra: high mode default on.
  - high: low mode default on.
  - balanced: off by default.
  - constrained: hard-disabled.
  - User control: `off / low / high`.

---

### 13 — Chromatic aberration + vignette + film grain polish pass

- **(a) Summary:** Enable the pmndrs built-in `<ChromaticAberration>`,
  `<Vignette>`, `<Noise>` effects with gentle defaults.
- **(b) Visual impact:** **Low** per effect, **Medium** combined — the
  "cinematic finish" cue. Matches every modern game's default post-stack.
- **(c) Implementation sketch:**
  - Add three effects to `PostProcessingPipeline.tsx` at end-of-chain
    (after tone mapping, per #1A ordering).
  - Low defaults: CA offset ≈ (0.0005, 0.0005) radial, vignette
    `darkness: 0.3 offset: 0.5`, noise `opacity: 0.02`.
  - Three independent toggles in the Settings panel (`off / on` each).
  - No new deps (pmndrs built-ins).
- **(d) Dependencies:** #1A (ordering). Settings model §4.
- **(e) Risks:**
  - Over-applied CA is the #1 community complaint in games; start subtle.
  - Vignette on a space scene can look wrong if it darkens stars; test
    carefully.
  - Noise at high opacity is visually noisy; keep default low.
  - Cheap pass, low regression surface, but every Playwright snapshot
    with these on needs re-baseline.
- **(f) LOC + sessions:** ~50–100 LOC. **1 session** for all three.
- **(g) Gating:**
  - ultra / high: all three on by default.
  - balanced: vignette only, off for CA and noise.
  - constrained: all off.
  - User control: three independent `off / on`.

---

## §4 Cross-cutting flags

### §4.1 Items blocked by Rendering Invariants §1

Must land **after** §1.1 (tone-mapping authority) and §1.2 (exposure
authority) are pinned. Landing any of these against the current
double-tone-map scene produces visibly wrong results:

- #1B, #2, #5, #6, #7, #8, #10, #12, #13.

### §4.2 Items blocked by Settings model §2 for user-facing toggles

Each can land with an internal / debug-only toggle first, but the user
surface requires §2 / item #4:

- #2 (bloom auto mode), #3 (atmosphere on/off), #5, #6, #7, #8, #9,
  #10, #11, #12, #13.

### §4.3 Shared infrastructure / interactions

- **Sun screen position** is computed in
  [`SunScreenFlare.tsx:136-189`](../src/components/canvas/planet/SunScreenFlare.tsx);
  items #5, #8 both need it — share via ref or store.
- **HDR-emissive allow-list (§1.3)** is contract between #1B, #2, #5, #7.
  Any new shader that emits > 1.0 must be added to the list explicitly.
- **Composer ordering** is the integration surface for #1A, #2, #5, #6,
  #8, #9, #12, #13. Document the canonical chain in code comments when
  #1A lands.
- **Settings store slice `vfxSettings`** is introduced by #4; every item
  with a user toggle reads from it via the §2.4 resolver.
- **Quality profile** in [`qualityProfile.ts:69-106`](../src/lib/qualityProfile.ts)
  gains per-effect default maps — already partly present via
  `bloomEnabled` / `bloomIntensityMultiplier`.

### §4.4 Items from prior todo.md AAA backlog block (~:1567-1599)

Prior research listed five items; mapping to this backlog:

- "HDR + tone-mapped selective bloom" → **#1A + #1B + #2** (split into
  three for landing discipline).
- "Milky Way + zodiacal light layer" → **split** into #11 (Milky Way,
  explicit backdrop) and #12 (zodiacal / dust, explicit volumetric —
  they are not the same thing).
- "Per-star lens flare on mag ≤ 0 stars" → **#7**.
- "Sprite-size floor" → shipped as L17 side-effect (audit §4.1); not a
  backlog item.
- "WebGPU + TSL compute path" → still deferred; not in this backlog.

### §4.5 New items vs prior research

- New: #1A (pipeline contract), #3 (schema-first atmosphere), #4
  (settings model extension), #6 (adaptive exposure), #5 (sun lens flare
  integration — prior block listed it as "Star Citizen-style anamorphic
  streaks on the brightest catalogue entries" which is actually #7; this
  item is a separate thing, replacing the existing sun sprite trio), #8
  (god rays), #9 (n8ao), #10 (Bruneton), #12 (volumetric dust), #13
  (CA/vignette/grain).

### §4.6 Dependency matrix (visual)

```
#1A (pipeline contract)  ──┬── #1B (star HDR)  ── #2 (selective bloom) ── #7 (per-star flare)
                            │                                                 │
                            ├── #5 (sun lens flare) ──────────────┬─── shared luminance/screen pos
                            │                                     │
                            ├── #6 (adaptive exposure)            │
                            │                                     │
                            ├── #8 (god rays) ────────────────────┘
                            │
                            ├── #9 (n8ao)
                            ├── #12 (volumetric dust)
                            └── #13 (CA / vignette / grain)

#3 (atmosphere schema + fresnel)  ── #10 (Bruneton LUTs)

#4 (settings model) ── (gates user-facing toggles for everything)

#11 (Milky Way) ── constrained by §1.4 backdrop-only invariant
```

---

## §5 ROI ordering rationale

The ordering is **not** a pure cinematic-spectacle list. Codex review
correctly argued for body/atmosphere work to rank higher given the
project's scientific identity. Final logic:

- **#1A / #1B / #2** — foundation. Unlocks everything else. Skipping or
  deferring means every downstream item runs against a double-tone-map
  pipeline with no threshold on bloom.
- **#3** — core to the project's scientific identity (per-body
  atmospheres); schema-first so #10 doesn't scramble metadata later. This
  is the highest-ROI "scientific visualization" item; it outranks every
  cinematic effect below except the pipeline unlock.
- **#4** — the coexistence model for UI settings; not spectacle, but
  required before any toggleable item reaches the user. Can land after
  the first cinematic items if internal toggles suffice for initial
  review builds.
- **#5 / #6** — cheap cinematic cost / benefit stack; both nearly-free
  with #1A in place. Lens flare is the single biggest "looks AAA" tell
  for sun-visible frames.
- **#7 / #8 / #9** — quality layer; nice-to-have but clearly downstream.
- **#10** — heaviest scientific-fidelity investment. High cost, landing
  later in the roadmap because #3 provides an adequate intermediate
  visual.
- **#11** — explicitly interpretative; default-off; real question
  whether it ships enabled at all. Deliberately low on list.
- **#12** — biggest "space spectacle" runtime-cost item. Last of the
  runtime items.
- **#13** — pure polish layer; easy to merge late, cheap to tune.

---

_End of backlog._
