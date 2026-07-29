# Wave — Starfield visual upgrade

_2026-07-28. Owner request: "não estou feliz com a qualidade visual
atual do starfield"_.

**This is a partial-work handoff.** Three sub-pulls are code-complete
and committed (1a, 1b, 1c, #3). Four items remain open and are the
remaining scope of this wave. The previous session ran out of context
before doing eye-adaptation (1d), the credits-modal provenance update,
the LightGlow performance audit, and the (#4) Milky Way HDR panorama.

Read [`../AGENTS.md`](../AGENTS.md) before touching code. That file is
product law. This wave file is **operational context** for whoever
picks it up next.

---

## Commits shipped this session (this worktree only)

```
200e13d  fix(pipeline): AgX tone mapping default on composer tiers (1a)
1a45230  feat(pipeline): mount selective bloom + exposure registry (1b, 1c)
48a3acc  feat(skybox): analytical zodiacal light layer (Leinert 1998) -- item #3
```

All three pass `npm run test:run` (2363 tests green), `npm run lint`,
`npx tsc -b`, and the `docs:check` pre-commit hook. Visual regression
baselines under `e2e/boot.spec.ts-snapshots/` are **unchanged** by
these commits — none of them touch the boot scene the snapshot pins.

The worktree has other commits that pre-date this session (see
"Worktree hygiene" below). Those are NOT this wave's scope and should
not be rolled back as part of picking this up.

---

## What was done and why

### 1a — AgX tone mapping default on composer tiers

`src/lib/graphics/resolver.ts` `PRESET_DEFAULTS` shipped
`toneMapping: "none"` on all four tiers. The EffectComposer runs on a
`HalfFloatType` target end-to-end (`PostProcessingPipeline.tsx:167`),
so without a filmic operator every genuinely-HDR pixel (Sun disk,
sun-glint, lit terminator) hard-clipped to flat white against the
0.165 display black point the starfield was calibrated against
(`STAR_DISPLAY_BLACK_POINT` in `starfieldShaderMath.ts:349`).

The `PostProcessingPipeline.tsx:90-119` comment claimed the
ToneMapping pass had been moved BEFORE the grade to fix exactly this,
but with `mode=none` the pass is omitted entirely on every tier
(`PostProcessingPipeline.tsx:181-185` short-circuits on
`toneMappingMode !== undefined`). The documented fix never ran.

**Fix:** `PRESET_DEFAULTS.ultra/high/medium.toneMapping` → `"agx"`;
`low` keeps `"none"` because `Scene.tsx:600` unmounts the entire
`EffectComposer` on the constrained tier so a ToneMapping pass never
runs there anyway. The AgX operator itself was already wired
(`TONE_MAPPING_MODE.agx` at `PostProcessingPipeline.tsx:47`); the
bug was the default value, not missing plumbing.

User-facing surface unchanged: the Display panel Tone Mapping select
(`DisplayPanel.tsx:281-291`) had exposed all five operators since
Wave α; users who want byte-Gaia parity can pick "none" from the
panel. The override composes cleanly via `resolver.ts:327`.

Pin the `none` default test was replaced with a differential assert
(`resolver.test.ts:81-93`): `ultra/high/medium === "agx"`, `low ===
"none"`. The deleted test only froze yesterday's bug. AGENTS.md rule
6 explicitly permits this.

### 1b — Selective bloom now mounts by default

All 5 `VISUAL_PRESETS` shipped `bloomIntensity: 0.0` (Gaia-matching),
so `shouldMountBloom(bloomEnabled, effectiveGraphics.bloomIntensity)`
(`Scene.tsx:828` → `bloomGate.ts:73`) read `undefined → 0 > 0 is
false → <Bloom>` never mounted on a fresh boot. The Wave α chain
documented "selective bloom on the HDR allow-list" as a product
feature; that feature did not exist in the shipped product. The per-
preset intensity slider in the Display panel was a no-op control.

Worse, there was a **wiring divergence**: two paths computed bloom
intensity, only one reached the gate.

- `visualPresetOverrides.ts:88-93` (per-frame, feeds the effect when
  mounted): `preset.bloomIntensity × bloomIntensityMultiplier ×
(overrides.bloomIntensityMul ?? 1)` — reads the visual preset.
- `resolver.ts:345` (gate): `effectiveGraphics.bloomIntensity =
ov.bloomIntensity` — only reads the user override, ignores the
  visual preset entirely.

Even setting `VISUAL_PRESETS.DEEP_SPACE.bloomIntensity = 0.5` would
NOT have mounted the `<Bloom>` because the gate saw `undefined`
and short-circuited. Path one only ran when the effect existed — but
it never existed. So bloom was permanently inert.

**Fix:**

1. Per-context non-zero base values in `VISUAL_PRESETS`
   (`src/config/visualPresets.ts`): DEEP_SPACE 0.35, PLANET_ORBIT
   0.3, CLOSE_FLYBY 0.15, INNER_SYSTEM 0.3, OUTER_SYSTEM 0.3.
   `bloomThreshold` stays 1.0 (the HDR-allow-list contract — only
   genuinely-bright pixels cross; planets stay matte).
2. `Scene.tsx:828` now passes
   `effectiveGraphics.bloomIntensity
   ?? VISUAL_PRESETS[visualPreset].bloomIntensity`
   to `shouldMountBloom`. The `??` falls through only on `undefined`,
   so an explicit user 0 correctly unmounts (saves the 5-mip pass when
   the user explicitly asks for no bloom), while the visual preset
   base finally reaches the gate.
3. `Scene.tsx` now reads `visualPreset` from the store (was not read
   there before).

`bloomGate.ts` JSDoc invariant rewritten to document the new
contract. `bloomGate.test.ts` preserves the `intensity=0 → skip`
predicate (the user-override-zero path) but de-emphasises the
"out-of-box mounts nothing" assertion. `visualPresets.test.ts`
replaces the `bloomIntensity === 0` pin with per-context assertions
of the new tuned values.

### 1c — Exposure registry plumbing (no visual change)

Pre-req flagged by the **fable-5 audit**
(`tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md`
§127): without a registry, eye-adaptation scaling only
`gl.toneMappingExposure` AFTER all per-shader exposure constants are
baked in — which is what the audit called "halo da Terra descola da
superfície" failure. Atmos output is non-linear in its own exposure
constant, so linear scaling at the AgX stage can move the bright
limb differently from the surface. 1c ships the opt-in coordination
surface so 1d can reachevery emissive family simultaneously, or
(today's scope) the AgX operator alone.

**Files:**

- `src/lib/graphics/exposureRegistry.ts` (NEW): a `{value: number}`
  singleton, default `1.0`, clamped setters `[1e-6, 16]`,
  `getSceneExposure` / `setSceneExposure` read/write surfaces.
  Pure-TS, no R3F dep.
- `src/components/canvas/scene/ExposureBridge.tsx` (NEW): one
  `useFrame` hook inside `<Canvas>` that pushes
  `sceneExposure.value` into `gl.toneMappingExposure`. Uses the
  same ref-stash pattern `useVisualPresetLerp.ts:170` uses for
  `scene.environmentIntensity` to satisfy the
  `react-hooks/immutability` lint rule.
- Mounted in `Scene.tsx` next to `<VisualPresetLerpBridge />`.

**While registry stays at 1.0 this is a no-op** — pixels render
byte-identical to the pre-1c state. 1d will write to it; per-shader
INTERNAL exposure constants (atmos, ring, starfield) can opt in
later if A/B shows the linear AgX-only scaling produces the
predicted detachment.

### #3 — Analytical zodiacal light (Leinert et al. 1998)

The space between the stars in atlas is pure black. At 1 AU the
zodiacal light band visible above the ecliptic is as bright as the
Milky Way — it is the SUBJECT of this app (motion through the
interplanetary dust cloud). A static skybox cannot give the live-cue
that motion through the dust cloud produces; an analytic model driven
by the live camera heliocentric distance can.

**Files:**

- `src/lib/zodiacalLightLut.ts` (NEW): Leinert Table 16 in
  `S10_sun` units, β ∈ [0,180]° × λ-λ_sun ∈ [0,75]°, 19×10 grid.
  Built into a tiny `10×19 RGBA16F DataTexture` via
  `buildZodiacalLutTexture`. The table is cited verbatim from the
  paper, not a fit — shader output is traceable to a published
  source per the honesty rule. Documents:
  - `ZODIACAL_S10_TO_LINEAR = 4.0e-9` photometric conversion (1
    S10_sun = 1.28e-8 W/m²/sr/µm at 500 nm per Leinert Table 2;
    the extra factor is a discretionary tunable so the band is
    visible against the rest of the scene — see "Outstanding
    calibration" below).
  - Dumont (1983) R⁻²·⁵ fan-cloud density scaling
    (`ZODIACAL_R_EXPONENT = 2.5`).
  - `ZODIACAL_FRAGMENT_GLSL` is a GLSL string the consumer
    shader pastes; lives here so the math has one source.
- `src/components/canvas/scene/ZodiacalLightSkybox.tsx` (NEW):
  shader-shadowed BackSide icosphere (radius 1e8) centered on the
  camera each frame (`meshRef.current.position.copy(camera.position)`
  in `useFrame`). Shader:
  - β = `degrees(asin(clamp(dir.y, -1.0, 1.0)))` (scene Y = ecliptic
    pole)
  - λ = `degrees(acos(dot(dir, sunDir)))` (Sun direction is
    `-camera.position.normalized()` because the Sun is at scene
    origin)
  - Lookup against `u_zodiacalLut`
  - Multiply by `pow(max(u_cameraR_AU, 0.1), -2.5)` (Dumont) and the
    photometric factor
  - Emit as additive linear radiance into the HalfFloat composer
    buffer via `CustomBlending, AddEquation, OneFactor x4`
  - `renderOrder = -100` keeps it behind starfield (-2) and planets.
  - `frustumCulled={false}` because the sphere follows the camera.
- `Scene.tsx`: mounts `<ZodiacalLightSkybox />` next to
  `<ExposureBridge />`.

**Tier gate:** composer tiers (ultra/high/medium) mount it.
Constrained unmounts — `DirectRenderPass` has no HalfFloat buffer so
the analytic band would need a second explicit path that is not worth
the budget there.

---

## Outstanding -- the remaining scope of this wave

These items were deferred out of the current session by context+
credits exhaustion, NOT by technical blockers. They are the next
agent's scope. In priority order:

### 1d — Eye-adaptation (AdaptiveLuminancePass → registry)

**Status:** All infrastructure is in place; this is the next item.

`postprocessing@6.38` ships `AdaptiveLuminancePass` — verified at
`node_modules/postprocessing/build/index.js:13012` (extracted
`AdaptiveLuminanceMaterial`, the integration shader reads:
`adaptedLum = l0 + (l1 - l0) * (1.0 - exp(-deltaTime * tau))`).
`ToneMappingEffect` constructor takes `{ adaptive: true, mode:
REINHARD2_ADAPTIVE }` (verified at
`node_modules/postprocessing/build/index.js:13318-13375`); the
AdaptiveLuminancePass is wired up there automatically.

**What 1d should do.**

1. Add a per-frame computation that downsamples scene luminance to a
   1×1 mip and feeds it into the registry. The library already has
   this — `ToneMappingEffect`'s `luminancePass` + `adaptiveLuminancePass`
   fields (private; reach via the effect's getters or build the pass
   directly and feed the value back through `setSceneExposure()`).
2. Rename `toneMapping` from `"agx"` to `"reinhard2_adaptive"` at the
   resolver level when eye-adaptation is on — see
   `node_modules/postprocessing` for whether `ToneMappingMode.REINHARD2_ADAPTIVE`
   is exposed through the existing `ToneMappingMode` enum map in
   `PostProcessingPipeline.tsx:46-51`. There may be a new mode value
   to add to `ToneMappingName` in `resolver.ts:95`. **Confirm the
   enum mapping empirically; do not invent a mode string the library
   does not export.**
3. Set initial `sceneExposure = 1.0`, drive with adaptation.

**Risk the audit flagged** — emission families that don't currently
read `sceneExposure`:

- Atmospheres: `atmscatteringSnippet.ts:76-77` hard-codes
  `exposureGround=0.5` and `exposureSky=0.25` as GLSL `#define`s.
  Converted to `uniform float` (one per material) lets the registry
  reach into the limb — closes the "atmosphere halo descola da
  superficie" failure mode the fable-5 audit predicted for the
  AgX-only path.
- Starfield: `Starfield.tsx:141,466` carries `u_exposure` driven by
  `starExposure()` (`starfieldShaderMath.ts:476`). The star shader
  already modulates by exposure, but it reads a const boot value.
  Wiring `u_exposure.value` to `sceneExposure.value * starExposure()`
  per-frame would let eye-adaptation dim the field when the Sun is
  in-frame.
- Rings: `usePlanetMaterials.ts:679` uses `emissiveIntensity =
ringEmissive` (a const). Same pattern.
- Sun disk: `MeshBasicMaterial` with `toneMapped: false`
  (`usePlanetMaterials.ts:339,345`) bypasses the ToneMapping effect
  entirely, so eye-adaptation via `gl.toneMappingExposure` does NOT
  reach it. Per-shader subscription would need to scale the disk's
  baseColor — the procedural sun (`ProceduralSun3D.tsx`) has its own
  material with uniforms.

**Recommendation:** ship 1d as **AgX-only path first** (the registry
scalar drives `gl.toneMappingExposure` only). A/B compare. If the
detachment is visible, do a follow-up sub-pull (1e) that opts each
emissive family's internal exposure constant into the registry. Do
NOT pre-emptively rewire all four families — that is a costly rewrite
that may be unnecessary.

### CreditsModal provenance update (high honesty priority)

The user (owner) flagged disclosure as the differentiator: "nobody
else discloses, that's where we win." Two commits need credits-panel
coverage:

- **AgX default (1a):** `CreditsModal.tsx` should name the display
  transform. AgX is a published display transform (Troy S., Pyzia
  2023); disclosing it is in the same honesty class as naming the
  planet-texture provenance.
- **Zodiacal light (#3):** credit should read something like "Zodiacal
  light model — Leinert et al. (1998) tabulated brightness, Dumont
  (1983) R⁻²·⁵ heliocentric scaling; solar-spectrum colour
  approximation per Leinert §3.3."

Read `src/components/ui/CreditsModal.tsx` for the existing format.
Follow the same idiom.

### LightGlow performance audit (item from user's original report)

The user's analysis flagged: "LightGlow (θ.3) is a SECOND halo, more
crude, on top of the θ.2 physical halo on the same top-N stars — and
its own comment estimates ~400M texture samples/sec per active
light." Before cancelling it, the user agreed an audit pass is the
right move (rule: "don't surprise the user with actions you take
without asking").

**What to do.**

1. Measure FPS with `LightGlowSlot` mounted and unmounted. The slot
   is in `PostProcessingPipeline.tsx:168` (`<LightGlowSlot />`),
   gated by `useStore((state) => state.accessibility.reducedMotion)`
   in `LightGlowInjector.tsx:113`. Toggle path: comment out the
   primitive temporarily and compare. Better still, gate it behind a
   DisplayPanel checkbox and measure live with the R3F `stats`
   helper or the WebGL renderer's `info.render.frame` counter.
2. If the cost is paid (visible FPS delta on ultra/high):
   recommended cancellation is to either:
   - Skip the slot from the post-processing chain (one-line revert).
   - Or gate it behind a new `GraphicsOverrides.lightGlowEnabled`
     flag, defaulting to false, and add a DisplayPanel toggle.

The audit (fable-5) suggested the θ.2 starfield halo (lin `r⁻³`
closed-form in `Starfield.tsx:316-338`) already covers the visual
need for halo on bright stars; LightGlow was the Gaia-style cone
spiral that pre-dated θ.2. There is no evidence users have seen both
side by side at runtime. **Pure measurement.grad the gate on the
measurement, not on speculation.**

### #4 — Milky Way HDR panorama (NASA SVS)

Last item from the user's original report. Quote: "vamos
implementar, depois vejo licenças." — owner explicitly deferred
licensing worry until after implementation.

**Asset:** NASA SVS "Deep Star Maps 2020", `milkyway_2020_*.*`
layer. Why this exact choice (from the original report): these are
Gaia DR2 stars below the brightness cut that the HYG catalog does
not include — so the panorama composes with HYG **without double
counting**, which is a fidelity argument, not just an aesthetic one.
A photographic panorama (ESO/Brunier) has bright stars embedded and
would sum them twice.

**Format:** KTX2/UASTC-HDR is the recommended encoding (8k RGBA16F
raw = 268 MB VRAM; compressed block = 33 MB). Do **NOT** use the
`*_stars_milky_way.jpg` files already in `public/textures/` (Solar
System Scope, provenance "based on NASA data" with no citable source
per an earlier fable-5 audit note).

**Worktree risk:** `public/data/nasa-stars/` was DELETED in this
worktree (commits `632d49d`, `338312e` etc. that pre-date this
session are **not mine**). The texture-inventory wave
(`tasks/waves/tiled-streaming-2026-07-28.md`) is actively working
in parallel and may move files. Check `tasks/STATUS.md` and the
tiled-streaming wave file **before** importing textures — the
parallel line may invalidate file paths assumed below.

**Implementation sketch:**

- A new `MilkyWaySkybox.tsx` parallel to `ZodiacalLightSkybox.tsx`.
- Texture loaded through `deferredTextureCache.ts` (you'll need a new
  loader path for KTX2/UASTC-HDR — three.js has
  `KTX2Loader` in `three/examples/jsm/loaders/KTX2Loader.js`; that
  handles the transcode). Confirm at runtime before importing; the
  loader requires a basis transcoder bin path.
- UV-mapped onto a galactic-coordinate sphere. Use the
  `OBLIQUITY_J2000_RAD` constant in
  `src/lib/orbital/analytical/coordUtils.ts:72` for the ecliptic→
  equatorial rotation; the galactic → ecliptic Euler rotation
  (`R=32.93192°, Q=27.12825°, P=192.85948°`) is cited at
  `src/lib/gridOrientation.ts:20`.
- Composite via additive blend, depth-cleared, behind the starfield
  (renderOrder -1, just above the zodiacal band at -100).
- Disclosure: the bright stars in the panorama may bleed through
  HYG's PSF on top-N bright stars (Vega, Sirius etc.). The right
  fix is a subtraction mask at the HYG positions — out of scope
  unless the user reports double-counting visible.

---

## Outstanding calibration (NOT BLOCKING, but visible)

The zodiacal light band's `ZODIACAL_S10_TO_LINEAR = 4.0e-9` constant
is a **discretionary tunable**, not a measured calibration. The
physical constant from Leinert Table 2 is 1.28e-8 W/m²/sr/µm per
S10_sun; the extra factor is meant to make the band visible against
the starfield+atmosphere composite, but the right value depends on
eye adaptation behaviour that 1d ships.

**Until 1d lands there is no honest runtime verification of the
band's visibility.** Three failure modes to check after 1d:

1. Band so dim it stays below `STAR_DISPLAY_BLACK_POINT` and is
   never visible (raise `u_brightnessMul` or `ZODIACAL_S10_TO_LINEAR`).
2. Band so bright it dominates the starfield (lower the same).
3. Band clips as a flat disk near the Sun because Leinert's 9000
   S10 value doesn't pass Bloom's `luminanceThreshold=1.0`. If so,
   add a soft smoothstep fade near elongation < 15° in the shader.

When 1d +CreditsModal provenance land, recommend a single human-eye
calibration pass before declaring this sub-pull done.

---

## Worktree hygiene — what is NOT this wave's scope

The worktree `starfield-visual-upgrade-11bd96` has work from at least
two parallel waves plus this wave. Specifically, commits **not part
of this handoff**:

```
338312e  merge: tiled-streaming-corrections into starfield-visual-upgrade
632d49d  feat(starfield): Pogson photometry + pixel-integrated PSF;
                                          delete NASA Eyes preset
611c424  docs(vram): the shadow-map row measured something that does not exist
849d1ca fix(camera): focusing a moon no longer frames its unlit side
d8d9317 docs(status): W5 stage B is still open ...
65d81ab fix(vrm): close two admission-control regressions found in review
ca0eea6 test(e2e): free the flight and boot gates from headless
                                       frame-pacing assumptions
```

Those represent:

- The **tiled-streaming / texture inventory** wave
  (`tasks/waves/tiled-streaming-2026-07-28.md`): the deletion of
  `public/data/nasa-stars/` and `src/components/canvas/NASAStarfield.tsx`,
  the starfield Pogson+PSF rewrite (θ.2 era), etc.
- VRAM admission-control corrections.
- E2E frame-pacing fix in `e2e/boot.spec.ts`.

These waves **may have touched files this wave depends on**. The
`Starfield.tsx` line numbers in this handoff were captured **at this
session's HEAD** (`ca0eea6`); if the next agent rebases or the
starfield file is touched again, line numbers will drift. Use grep
or symbol lookups, not line citations.

**Do not roll these back as part of picking up this handoff.** They
are independent work with their own merge gates. The visual-upgrade
sub-pulls (1a, 1b, 1c, #3) only tightened pipeline parameters and
added new files — none of them modify the existing starfield Pogson
math, the multi-star catalogue, or the texture loader.

---

## Honest disclosure (this session)

Three of my commits (200e13d, 1a45230, 48a3acc) did not get a visual
runtime verification in this session. The session was CLI-only.
Verification was:

- `npm run test:run` → 2363 passes (every existing test + new resolver
  differential + new bloom tests pass).
- `npx tsc -b` → clean (no type drift from new `ExposureBridge`,
  `ZodiacalLightSkybox`, `zodiacalLightLut` modules).
- `npm run lint` → clean (lint immutability rule satisfied via the
  ref-stash pattern).
- `npm run docs:check` pre-commit gate → clean.

This is **unit-level forgetting**. Specifically NOT verified:

1. Whether the AgX curve actually produces reference-quality highlights
   vs. a taste regression (the audit recommended AgX over ACES, but
   that's literature, not user preference).
2. Whether the bloom base values (0.35 / 0.3 / 0.15) feel right
   against the starfield Pogson intensities. The history of this
   repo contains a "Sun too white" bug from adding Bloom alone; the
   Threshold=1.0 selective contract is supposed to prevent that but
   has not been verified at runtime after 1b.
3. Whether the zodiacal band is actually visible
   (see "Outstanding calibration" above). The intensity constant is
   a documented estimate, not measured against the rest of the
   composer's output.

A single human-eye calibration pass (suggested: 1080p fullscreen,
ultra tier, default scene, camera at Earth-orbit looking towards
ecliptic pole + looking towards Sun) would close this. Until then,
do not claim this wave is "done" beyond the commit log.

---

## Source citations

The audit (fable-5) referenced specific primary sources:

- **Leinert et al. 1998**: "The 1997 reference of diffuse night sky
  brightness". A&AS 127, 1-99 (1998). Table 16 is the S10_sun
  brightness grid used in `zodiacalLightLut.ts`. Table 2 has the
  1.28e-8 W/m²/sr/µm conversion factor.
- **Dumont 1983**: fan-cloud integral giving R⁻²·⁵ density scaling;
  canonical reference. Search the paper before reimplementing;
  the exponent may be cited differently in later work (Tsumura 2023
  cites Leinert etc. for the same scaling).
- **NASA Eyes on the Solar System** (bundle JS): the audit downloaded
  and read the production bundle to establish that the three light
  modes (Flood / Natural / Shadow) ship with default "shadow" = 15%
  camera headlight + 0.005 ambient floor. This is the audit's
  evidence for "atlas ambient-0 is the industry outlier". NOT
  involved in 1a/1b/1c/#3 — context only for the fable-5 critique.
- **OpenSpace renderableglobe.cpp** + **Stellarium Planet.cpp** +
  **Stellarium issue #669**: same audit established that OpenSpace
  ships 0.05 ambient default and Stellarium 0.02 hard-coded; Stellarium
  closed a "make this realistic" ticket as wontfix. Same context only.

The pre-existing sweep `tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md
§127/§129/§139/§141/§153` independently verified all of the same bugs
this wave fixed (AgX, selective bloom, exposure registry, optional
grade-only tier, real Milky Way asset) — confirm by reading the sweep
before re-investigating anything; do not re-derive its numbers.

---

## Handoff for the next agent: suggested first steps

1. **Read this file, then `tasks/STATUS.md`, then `AGENTS.md`.** The
   constitution there explicitly permits deleting impl-pinning tests
   frozen yesterday's form and explicitly makes Gaia a reference not
   a merge gate.
2. Pick up **1d (eye-adaptation)**. Verify `AdaptiveLuminancePass`
   enum exposure by reading `node_modules/postprocessing/build/index.js`
   around line 13318, not by guessing. Drop new test if behaviour
   pins a real coordinate or luminance contract; otherwise skip
   (rule 6).
3. Update **`CreditsModal.tsx`** for AgX + zodiacal provenance. Cheap
   honest disclosure; high value-of-information.
4. Run the **LightGlow audit** with a runtime FPS measurer. Don't
   cancel on speculation; gate on measurement.
5. Defer **#4 (Milky Way HDR)** until the user's licensing check is
   done AND the parallel tiled-streaming wave settles on whether
   KTX2 is in scope (check `tasks/STATUS.md` heritor for that
   wave's status).
6. After 1d + CreditsModal land, do the **calibration pass** for
   zodiacal intensity. Document the final `ZODIACAL_S10_TO_LINEAR`
   value + commit message that explains why it's the chosen value
   (not "we tuned it" — the AGENTS.md §honesty requires this).
7. **Verify everything** at runtime by booting `npm run dev` once
   before declaring the wave complete. The CLI-only test pipeline is
   a sanity check, not a visual regression gate.

---

_Last updated: 2026-07-28 by opencode-glm session that ran out of
context mid-1d._
