# Wave — Starfield visual upgrade

_2026-07-28. Owner request: "não estou feliz com a qualidade visual
atual do starfield"_.

**This is a partial-work handoff.** Four sub-pulls are code-complete
and committed (1a, 1b, 1c, 1d, #3). Three items remain open and are the
remaining scope of this wave: the credits-modal provenance update, the
LightGlow performance audit, and the (#4) Milky Way HDR panorama.

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

A follow-up session in the same worktree then shipped **1d
(eye-adaptation)** as a fourth commit (see git log for the hash — this
doc was written in the same commit as the code, before the hash
existed). Same verification profile: `npm run test:run` (2427 tests
green), `npm run lint`, `npx tsc -b`, `npm run docs:check` all clean.
`npm run test:e2e` (the `boot-frozen.png` pixel-diff gate) was **not**
run this session — CLI-only, same caveat as the rest of this wave. The
registry still starts at neutral `1.0` and the intro-flight boot pose
is far from the Sun (near-black sky per the θ.2 comment further down
in `boot.spec.ts`), so a diff is unlikely but not verified. Whoever
does the runtime pass (see "Handoff" below) should run
`npm run test:e2e -- boot` as part of it.

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

### 1d — Eye-adaptation (AdaptiveLuminancePass → registry)

Picked up where the previous session's context ran out. The wave's own
1d spec said "confirm the enum mapping empirically; do not invent a
mode string the library does not export" — doing that turned up a firm
**no** on the spec's suggested path.

**Empirical finding (`node_modules/postprocessing@6.38.0/build/index.js`):**
`ToneMappingEffect`'s `mode` setter only enables its internal
`adaptiveLuminancePass` when `mode === ToneMappingMode.REINHARD2_ADAPTIVE`
(index.js:13416), and the compound tone-mapping fragment shader only
samples the luminance buffer for `TONE_MAPPING_MODE == 2 || 3`
(Reinhard2 family) — the AGX branch (`#else toneMapping(texel)`,
index.js:13307-13315) never touches it. There is no "AGX but adaptive"
mode to opt into; renaming `resolver.ts`'s `toneMapping` to
`"reinhard2_adaptive"` per the original spec draft would have swapped
the ENTIRE visible tone curve away from AGX, not just added adaptation
— out of scope for the "ship AgX-only path first" recommendation.

Separately verified `toneMappingExposure` DOES reach the AGX branch:
three.js's `WebGLRenderer.setProgram` (`WebGLRenderer.js:2525`) pushes
`renderer.toneMappingExposure` into any compiled program that declares
the uniform, every frame, regardless of `mode` — confirming
`ExposureBridge` (1c) was already the correct carrier for whatever 1d
produces.

**What shipped instead:** `PostProcessingPipeline` still mounts
`<ToneMapping mode={AGX}>` exactly as before (1a's visible curve is
unchanged) but now also refs the underlying `ToneMappingEffect`
instance. A new `EyeAdaptationBridge.tsx` force-enables that instance's
internal `adaptiveLuminancePass` every frame — bypassing the mode-gated
auto-toggle, not replacing it — so the library's OWN
downsample-to-1×1-mip + exponential-decay pass runs against the
composer's real HDR buffer exactly as it would under
`REINHARD2_ADAPTIVE`, just without changing what's on screen. The
bridge then reads that 1×1 texture back with
`gl.readRenderTargetPixels` (unpacking three.js's standard
`packDepthToRGBA`/`unpackRGBAToDepth` RGBA8 encoding — reimplemented in
JS since there's no public API to sample a mip level from the CPU
side), converts it to an exposure scalar, and writes it via
`setSceneExposure()`. `ExposureBridge` (1c) carries that number into
`gl.toneMappingExposure` unchanged.

`adaptiveLuminancePass` and its `renderTargetAdapted` render target are
real runtime properties the package's `.d.ts` omits (only
`adaptiveLuminanceMaterial`/`texture` getters are typed); reaching them
needed a narrow, documented local type augmentation rather than an
`any` — see the full citation trail in `EyeAdaptationBridge.tsx`'s
module doc comment.

**Bounding:** `<ToneMapping minLuminance={STAR_DISPLAY_BLACK_POINT}>`
floors the GPU-side adaptive sample at the same 0.165 linear constant
`starfieldShaderMath.ts` already calibrates the display black point
against. The exposure formula reuses that constant as both floor and
numerator (`exposure = TARGET / max(luminance, TARGET)`); since the
library's own luminance render target is `UnsignedByteType` (WebGL
clamps HDR fragment output to ≤ 1.0 before it's stored), `luminance`
always lands in `[TARGET, 1.0]` and so does `exposure` — a near-empty
starfield frame (the common case) reads back at neutral `1.0` (pixel-
identical to pre-1d), and the most a blown-out frame can be dimmed to
is the display's own black point. This satisfies the spec's "a black
frame cannot blow exposure to 16" requirement structurally, not just
via the registry's outer `[1e-6, 16]` clamp.

**Files:**

- `src/components/canvas/scene/EyeAdaptationBridge.tsx` (NEW): the
  `useFrame` hook described above.
- `src/components/canvas/scene/PostProcessingPipeline.tsx`: added
  `toneMappingRef` prop + `assignToneMappingRef` callback (same
  pattern as `bloomRef`/`hueSatRef`/`brightnessRef`); `<ToneMapping>`
  now takes `ref` + `minLuminance={STAR_DISPLAY_BLACK_POINT}`.
- `src/components/canvas/Scene.tsx`: added `toneMappingRef`, mounted
  `<EyeAdaptationBridge>` next to `<ExposureBridge>`, threaded the ref
  into `<PostProcessingPipeline>`.
- No changes to `resolver.ts` — no new `ToneMappingName` value was
  needed (see the "empirical finding" above), so no `resolver.test.ts`
  changes either.

**Tier gate:** self-gating, not a new explicit check. `toneMappingRef`
stays `null` on the constrained tier (`PostProcessingPipeline` never
mounts there) and whenever a user picks `toneMapping="none"` from the
Display panel — `EyeAdaptationBridge` no-ops in both cases the same
way `ExposureBridge` already does.

**Deferred to 1e**, unchanged from the original recommendation: the
four emissive families that don't read the registry (atmospheres'
`exposureGround`/`exposureSky` `#define`s, the starfield's
`u_exposure`, ring `emissiveIntensity`, the `toneMapped: false`
procedural Sun disk) are still untouched. Only a per-shader A/B pass
after a runtime look at 1d would justify that follow-up.

**Not verified at runtime this session** (CLI-only, same caveat as
1a/1b/1c/#3): whether the adaptation is visually perceptible at all
inside `[0.165, 1.0]`, whether the 1-frame GPU-readback lag reads as
smooth or as a stutter on a real dimming event (Sun entering frame),
and whether `adaptationRate`'s library default (`tau=1`) feels right
for this scene's pacing. `npm run test:run` (2427 tests, all green —
zero new unit tests added per AGENTS.md §6, this is experimental look
work), `npx tsc -b`, and `npm run lint` are all clean; that is a type-
and-logic check, not a visual one.

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

These items were deferred out of prior sessions by context/credits
exhaustion, NOT by technical blockers. They are the next agent's
scope. In priority order:

### 1d — Eye-adaptation — SHIPPED, see "What was done and why" above

The 1e follow-up this section used to describe (per-shader emissive
families opting the four families — atmospheres, starfield, rings, Sun
disk — into the registry) is still open and still gated on an A/B
runtime look at the AgX-only path shipped in 1d; see that section's
"Deferred to 1e" note for the exact list and file/line pointers
(`atmscatteringSnippet.ts:76-77`, `Starfield.tsx:141,466`,
`usePlanetMaterials.ts:339,345,679`). Do NOT pre-emptively rewire all
four — that is a costly rewrite that may be unnecessary until someone
actually looks at the running scene.

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

**RUNTIME AUDIT ATTEMPTED 2026-07-28 (lighting-audit session) — no
real-GPU number obtained; toggle shipped instead of a default flip.**

Two independent tool paths were tried, both structurally blocked:

1. **Claude Browser preview pane.** Every tab in this session reported
   `Viewport: 0x0` from `read_page`, `computer{screenshot}` errored
   "the Browser pane is not displayed, so the page is not compositing
   frames" on every attempt (including a full `preview_stop` +
   `preview_start` cycle per the HMR-accumulation lesson), and a direct
   probe confirmed `document.hidden === true` /
   `visibilityState === "hidden"` with `requestAnimationFrame` never
   firing (30 s timeout, zero callbacks). This session is
   non-interactive — nobody's screen shows this pane — so real-GPU
   visual/FPS verification is structurally impossible from here, not a
   transient bug to retry.
2. **Headless Playwright (substitute path).** Drove the dev server
   directly with `playwright`'s `chromium.launch({headless: true})`,
   using the repo's existing test-only hooks
   (`window.__ATLAS_TEST_STORE__`, `window.__ATLAS_TEST_CAMERA__`) —
   this DOES run real frames (rAF fires normally in a real headless
   Chromium page, unlike the non-compositing pane above) and produced
   numbers: two 5 s rAF-counted runs at **8.28 fps** and **8.40 fps**
   with `LightGlowSlot` mounted. **These numbers are NON-DECISIONAL.**
   Confirmed via the `console.info("[atlas] WebGL renderer info", …)`
   diagnostic Scene.tsx already logs at boot:
   `renderer: ANGLE (…, SwiftShader Device …)`, `qualityTier:
constrained`. `resolveGlTierCeiling` in `src/lib/qualityProfile.ts`
   hard-ceilings any `softwareRenderer === true` GPU to `constrained`
   regardless of CPU/RAM signals, and on `constrained` Scene.tsx
   unmounts the entire `EffectComposer` — so `LightGlowSlot`,
   `<Bloom>`, `<ToneMapping>`, and `ZodiacalLightSkybox` never mount at
   all under headless Playwright. The A/B this audit needs (LightGlow
   mounted vs. unmounted on a real ultra/high-tier composer) cannot run
   in ANY environment available this session — headless Chromium always
   resolves to the software-renderer floor unless launched with real
   GPU passthrough (`--use-gl=angle` + a real backend), which this
   sandbox does not provide either.

**What shipped instead of a measurement-gated default:** per the
coordinator's call, `GraphicsOverrides.lightGlowEnabled` (new,
`src/lib/graphics/resolver.ts`) — same idiom as `bloomEnabled` —
default **`true`** on every tier (preserves current visuals exactly,
zero behavior change out of the box), plus a "Light Glow" toggle in
`DisplayPanel.tsx` right after the "Bloom" toggle, and
`PostProcessingPipeline`'s `<LightGlowSlot />` now conditional on a new
`lightGlowMounted` prop threaded from `Scene.tsx`'s
`effectiveGraphics.lightGlowEnabled`. This converts the blocked audit
into an instrument: the owner (or anyone with a real GPU) can flip the
toggle live and feel the frame-time difference on their own hardware.
Minimal differential test added in `resolver.test.ts` ("lightGlowEnabled
defaults true on every tier and an override can flip it off"), mirroring
the existing `bloomEnabled` test — AGENTS.md §6, new product-contract
field.

**The decision rule from the original ask still stands, unexecuted:**
if removing LightGlow improves frame time by ≥10 % on a **real**
ultra/high-tier GPU, flip `PRESET_DEFAULTS.*.lightGlowEnabled` to
`false` (or just the composer tiers where it matters) and update this
section. If <10 %, leave the default `true` and close this item. Do
NOT use the SwiftShader numbers above for that call even directionally
— a software rasterizer's bottleneck profile (pixel-fill / texture-
sample bound) is not guaranteed to track a real GPU's the same way, and
in this case the tier ceiling makes the comparison void outright (both
arms of the A/B ran on `constrained`, where LightGlow was never even
mounted).

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

### #4 shipped (2026-07-29)

Owner explicitly approved implementation including downloading the
NASA source image ("vamos implementar, depois vejo licenças" +
follow-up approval this session); **the formal licensing check for
redistribution remains with the owner** and is disclosed as such in
`CreditsModal.tsx`. Everything below is code-complete, gated, and
committed; the one thing not done is a human-eye look at a real GPU.

**Files:** `src/lib/milkyWayOrientation.ts` (NEW, orientation math +
GLSL + calibration), `src/lib/milkyWayOrientation.test.ts` (NEW, 16
tests), `src/components/canvas/scene/MilkyWaySkybox.tsx` (NEW, the
renderer), `public/textures/4k_milkyway_2020_gal.jpg` (NEW, the
asset), plus small edits to `Scene.tsx` (mount) and `CreditsModal.tsx`
(disclosure entry).

**Asset.** NASA SVS "Deep Star Maps 2020" (svs.gsfc.nasa.gov/4851),
the `milkyway_2020` layer specifically — SVS's own description: "This
is a version of the star map that omits the bright (Hipparcos and
Tycho) stars." Atlas already draws every HYG-catalogue star
individually (`Starfield.tsx`); the sibling `starmap_2020` layer HAS
those same bright stars baked in and would draw them twice. Using
`milkyway_2020` is a fidelity argument (no double-counting against the
star catalogue), not an aesthetic pick — this is the whole reason the
wave file names this exact layer.

Downloaded: `milkyway_2020_4k_gal.exr` — galactic-coordinate
projection, 4096×2048, OpenEXR half-float (linear), 33.2 MB, from
`https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_gal.exr`.
The galactic-projection variant was available (no extra "celestial +
rotate" step needed for the texture itself — the shader's own
galactic→scene rotation, below, still has to exist regardless of which
input projection is used).

**Encoding tradeoff — a judgment call, recorded per the spec's
instruction to report judgment calls.** The wave file's sketch assumed
NASA would offer a "standard web format" (PNG/TIF) directly; in
reality SVS only publishes this layer as EXR (plus a 1024×512 JPEG
preview, too small to use). Two options were weighed:

1. **Ship the EXR via `three`'s bundled `EXRLoader`.** Zero new
   dependency, no lossy re-encode, genuinely linear HDR data. Rejected
   because `deferredTextureCache.ts` — the app's ONE deferred-loading
   contract, used by every other texture — wraps `THREE.TextureLoader`
   only; adding an EXR branch means changing shared infrastructure
   every other texture consumer depends on, for one caller. Also
   costs ~85 MB VRAM (HalfFloat RGBA, 4k, with mips) versus the
   ~33 MB an 8-bit RGB texture costs for the same pixel count.
2. **Re-encode to an 8-bit sRGB image and reuse the existing
   `useDeferredTexture` path unchanged.** Chosen. Matches the wave
   file's own "pragmatic fallback" framing (a standard web format is
   what the spec expected to be available) and needs zero changes to
   shared code.

KTX2/UASTC was evaluated first, per the spec's instruction to prefer
it if encodable via an npm-only devDependency: confirmed (via
research) that `three`'s bundled `KTX2Loader` can only **decode** an
existing `.ktx2`; no encoder exists in `package.json`'s current
devDependencies, and adding one (e.g. `@gltf-transform/cli`) was
judged out of scope for this change — recorded here as the **KTX2
upgrade path** for whoever next touches texture encoding pipeline-wide
(the tiled-streaming line is the natural owner, since it already
touches `deferredTextureCache.ts`).

**The build step:** the source EXR (linear, half-float) was decoded
with `three`'s own `EXRLoader.parse()` run headless in Node (same
decoder the app would otherwise use, so no independent
reimplementation to drift), normalised by a measured 99.9th-percentile
luminance ceiling (0.382635 — a robust near-max that excludes a
handful of literal-1.0 outlier texels, not the true max), clamped to
[0,1], sRGB-encoded, and saved as `public/textures/4k_milkyway_2020_gal.jpg`
(quality 95 mozjpeg, 3.6 MB, PSNR ≈37 dB against the lossless
intermediate). Full derivation, including the exact anchor numbers
measured off the real pixel data, is in `milkyWayOrientation.ts`'s
`MILKY_WAY_BRIGHTNESS_MULTIPLIER` doc comment. The source EXR itself
is NOT committed (nothing at runtime reads it; keeping it would be
dead weight).

**VRAM math** (per `deferredTextureCache.ts`'s own estimator,
`inferTextureEdge` correctly reads the `4k_` filename prefix): 4096×2048
RGBA8 with mips ≈ 44.7 MB estimated / ~33 MB measured actual — small
against the tiled-streaming wave's measured admission-control budgets
(ultra 512 MB / high 256 MB / balanced 64 MB; only `constrained` at
32 MB would be tight, and the layer self-unmounts there anyway, same
gate as `ZodiacalLightSkybox`). No LFS: repo has no `.gitattributes`
and already commits larger plain blobs (`4k_oberon.png` ≈37.8 MB) —
this asset follows existing practice, not a new one.

**Orientation — the classic failure mode, and how it was caught.**
`gridOrientation.ts`'s cited Euler recipe (`R=32.93192°, Q=27.12825°,
P=192.85948°` via `getRotationMatrix(alpha,beta,gamma) =
Ry(gamma)·Rz(beta)·Ry(alpha)`, attributed to Gaia Sky's
`Coordinates.java:153-157`) was re-implemented and numerically checked
against the two facts a galactic rotation must reproduce (NGP at RA
192.85948°/Dec 27.12825°; Galactic Center at RA 266.405°/Dec −28.936°)
— **it reproduced neither, off by tens of degrees.** Rather than
guess at a different multiplication order from a comment citing a
file not in this repo, `milkyWayOrientation.ts` constructs the
rotation directly from the SAME three cited angles via an unambiguous
Gram-Schmidt method (two known vector correspondences — NGP↔galactic
pole, NCP↔galactic-frame position — fix the rotation uniquely) and
cross-checks the result against the independently published numeric
ICRS↔Galactic matrix (Liu, Zhu & Zhang 2010 / ESA Hipparcos catalogue)
to 1e-12.

The map's OWN convention needed a second, independent check: NASA's
page documents the longitude direction ("centered at 0°, longitude
increases to the LEFT") but not which pole is at the image's top edge.
That half was determined empirically — the LMC and SMC are isolated,
unambiguous bright features at known galactic coordinates well south
of the plane; sampling the actual downloaded EXR at both candidate
polarities found the LMC ~14× brighter than same-latitude baseline sky
under "row 0 = south galactic pole", and statistically indistinguishable
from baseline under "row 0 = north" (SMC independently gave ~9×). **Row
0 = south galactic pole**, opposite the "north up" default a Plate
Carrée map would otherwise be assumed to use — exactly the kind of
convention a wrong assumption would have shipped silently.

**Test result:** `milkyWayOrientation.test.ts`, 16 tests, all passing.
Includes the exact pin the spec named — galactic center (l=0,b=0) →
ecliptic lon 266.8395° / lat −5.5363° against the target (266.84°,
−5.54°), well inside a 0.05° tolerance chosen to still catch a
tens-of-degrees wrong-handedness bug — plus an independent second pin
(NGP → ecliptic lon 180.02°/lat 29.81°, not given in the task text, so
a rotation that happened to pass the first pin by coincidence would
still be caught), a determinant/orthogonality check, a forward/inverse
round-trip check, and the UV-mapping/LMC-polarity assertions.

**Calibration.** Same discipline as `zodiacalLightLut.ts`: two
anchors measured off the real image (row-average — not single-pixel —
luminance at the disk's brightest latitude, and at ±20° from it, so a
resolved nebula or the LMC core cannot set the scale), mapped via the
same geometric-mean-into-the-visible-window construction. Result:
`MILKY_WAY_BRIGHTNESS_MULTIPLIER ≈ 3.201`, putting the disk's own
brightest latitude band right at the bloom gate (≈1.02×, a soft kiss)
and the ±20° edge at the display black point (≈0.162×) — clearly
subordinate to the zodiacal band's peak (19.7× black point / 3.26×
bloom), per the spec's explicit "do not make it dominate" requirement.
Isolated real hotspots the row-average smooths over (Carina Nebula,
measured directly at ≈0.447 linear, above the JPEG's normalisation
ceiling) clip and bloom harder in the actual texture — comparable in
degree to zodiacal's own near-Sun overshoot, confined to the same
handful of resolved nebular knots in the source data.

**Renderer.** `MilkyWaySkybox.tsx` mirrors `ZodiacalLightSkybox.tsx`'s
structure: camera-centered `BackSide` icosphere (radius 1e8, same as
zodiacal), additive `CustomBlending`/`AddEquation`/`OneFactor` into the
HalfFloat composer buffer, `depthTest`/`depthWrite` both false,
`frustumCulled={false}`. `renderOrder = -50`, between the zodiacal
band (`-100`, furthest back) and the star catalogue (`-2`) — read from
the live files rather than assumed, since the wave file's own
"Worktree hygiene" section warned line numbers/values could have
drifted. Colour space: the JPEG is sRGB; `texture.colorSpace =
THREE.SRGBColorSpace` (the deferred cache's own default, passed
explicitly for the record) makes the GPU decode to linear on sample —
one place, documented, no manual `pow()` in the shader. Loads through
`useDeferredTexture` (pinned, priority 3, lowest) exactly like every
other scene texture; never blocks boot. Tier gate is the same
`qualityProfile.name !== "constrained"` self-gate `ZodiacalLightSkybox`
uses.

**e2e outcome: unchanged, and here is why that is the correct
(not merely convenient) result.** `npx playwright test e2e/` — 12/12
passing, including `boot.spec.ts`'s pixel-diff gate — needed **no
re-bless**. Per the spec's own standing order, `test-results/` was
inspected before concluding this: the boot test still passes against
the existing baseline, meaning headless Chromium's frame is
byte-for-byte within tolerance of the pre-#4 baseline. Root cause,
confirmed by the same tier-detection finding this wave already
documented for the LightGlow audit: headless Playwright resolves to
`qualityTier: constrained` (SwiftShader software rasteriser), where
`Scene.tsx` swaps in `DirectRenderPass` instead of the
`EffectComposer` — `MilkyWaySkybox` (like `ZodiacalLightSkybox`) never
mounts there, so there is genuinely nothing for the pixel gate to
change. **Zero change is the correct outcome here, not an inconclusive
one** — it does not mean the layer is broken, and it does not mean
the layer is confirmed correct either; it means this test exercises a
tier the layer intentionally excludes.

**Owner's Browser-pane attempt this session:** tried once, per the
"inspect before blessing" standing order and to see if anything new
was learnable. Same structural block the lighting-audit session
already recorded: `document.hidden === true` /
`visibilityState === "hidden"`, confirmed via a direct JS probe;
`requestAnimationFrame` never fires because the pane never composites
in this non-interactive session. No new information beyond
re-confirming the prior finding — not attempted-and-inconclusive,
structurally blocked, same as every other visual check this wave has
tried.

**Owed to the owner** (same status as the zodiacal band, plus the
licensing check): a human-eye pass on real hardware, composer tier,
confirming (a) the panorama band appears where the real Milky Way
should relative to the ecliptic/zodiacal band, (b) it reads as
subordinate to zodiacal light rather than washing it out, (c) no
double-counted bright stars are visible against the HYG catalogue's
own points, and (d) the formal licensing determination for
redistributing the NASA asset.

### #4 pulled (2026-07-29) — owner eye-pass verdict

The human-eye pass owed above happened, and the verdict was negative.
Owner quote, verbatim: **"muito ruim, confuso e não integrado com o
starfield. ele some nos fly-bys"** — bad, confusing, not integrated
with the starfield, and it disappears during fly-bys. Owner decision:
remove it now, rethink the approach later. This is a **product pull**,
not a bug-fix request — the integration was not attempted to be fixed
in place.

**Removed:**

- `src/components/canvas/scene/MilkyWaySkybox.tsx` (the renderer) and
  its mount + import in `src/components/canvas/Scene.tsx`.
- The Milky Way `CreditItem` entry in `src/components/ui/CreditsModal.tsx`
  (a disclosure must not describe something no longer rendered).
- No component-level test existed for `MilkyWaySkybox.tsx` to delete.

**Kept (deliberately):**

- `src/lib/milkyWayOrientation.ts` + `milkyWayOrientation.test.ts` — the
  galactic→ecliptic transform was independently verified to 1e-12
  against the published ICRS↔Galactic matrix. It stays as the verified
  reference implementation for a future retry, and for auditing
  `gridOrientation.ts` (a separate audit line). A note was added at the
  top of the file's header comment pointing back to this section.
- `public/textures/4k_milkyway_2020_gal.jpg` (3.6 MB) stays on disk —
  hard to reproduce (EXR download + measured-percentile re-encode).
  Checked: the texture was never wired through `assetManifest.ts` or
  `textureVariantManifest.ts` — `MilkyWaySkybox.tsx` loaded it via a
  hardcoded URL straight into `useDeferredTexture`, bypassing the
  manifest system entirely. With that component deleted, nothing in
  the codebase references the file any more; it just parks in the repo.
  `src/lib/textureReachability.test.ts` only asserts requestable paths
  exist on disk (deliberately does NOT assert the inverse — see that
  file's own doc comment on why an orphan-file sweep is a trap), so it
  does not fail for a parked, unreferenced file — no allowlist entry or
  relocation was needed.

**Failure-mode hypotheses for a future retry (recorded, not
investigated this pass):**

- _"Disappears during fly-bys"_ — candidates: deferred-texture eviction
  under VRAM pressure during the transition; the camera-centered
  sphere's `frustumCulled={false}`/`renderOrder=-50` interplay with
  whatever camera-rig swap a fly-by does; or the additive band getting
  tone-mapped/adapted below visibility when a bright body enters frame
  (1d's eye-adaptation dims exposure, and the panorama has no camera-
  distance-driven brightening the way zodiacal light does to compensate).
- _"Not integrated with the starfield"_ — the JPEG is a display-referred
  bake (sRGB, fixed exposure) composited additively behind a
  physically-derived Pogson+PSF star catalogue; the two do not share a
  photometric system, so the seam between "real stars" and "painted
  backdrop" is visible by construction. A future retry should probably
  composite the panorama INTO the starfield's own photometric pipeline
  (e.g. as a per-pixel radiance contribution scaled the same way
  starlight is) rather than as an independent additive shell layered on
  top.

No code beyond the removals above was touched to chase these — this is
a scoped pull per the owner's explicit "remove now, rethink later"
instruction, not a fix.

---

## Outstanding calibration (NOT BLOCKING, but visible)

**2026-07-29 — this section's suspicion (failure mode 1 below) was
right, and the layer was broken in four independent ways. All four are
now fixed; see "Zodiacal rebuild" immediately below. The eye pass is
still owed.**

**2026-07-29 (later, near-Sun whiteout fix) — a FIFTH, latent defect
was found by owner report on real hardware and fixed: the heliocentric
`R^-2.5` term had no inward bound, so the 1 AU calibration above
(correct at 1 AU) multiplied by up to ~316× as the camera approached
the Sun, washing the whole screen white. See the dated entry near the
end of this file ("near-Sun whiteout fix session") for the full root
cause, arithmetic, and the bound shipped. This did not change anything
in the "Zodiacal rebuild" or "derived visibility constant" sections
below — the 1 AU calibration and the outward `R ≥ 1 AU` dimming are
untouched and still exactly as documented there.**

### Zodiacal rebuild (2026-07-29)

An external review, independently reproduced, found the layer shipped
in 48a3acc could not have rendered correctly. Four defects, in the
order they would have bitten:

1. **The shader never compiled.** `u_sunDir` was read in `main()` but
   declared nowhere. A `ShaderMaterial`'s fragment prefix carries
   three.js built-ins only (verified against
   `three/build/three.module.js`'s `prefixFragment`), so an undeclared
   custom uniform is a link failure, not a warning. The layer had
   therefore never produced a pixel on any tier — which is also why no
   amount of eye-checking would have surfaced defects 2-4.
2. **The table axes were transposed verbatim.** The file declared
   rows = β over 19 values reaching 180°, which is not a latitude any
   sky has, and cols = λ−λ☉ over 10 stopping at 75°. Leinert Table 16
   is the other way round: rows = λ−λ☉ (19 knots, 0…180°),
   cols = β (10 knots, 0…75°). The DATA was always in Table-16 order;
   only the labels and every consumer's sampling math were wrong.
   Consequences: sampling at λ−λ☉ = 15°, β = 0° returned 0 instead of
   the table's 9000 S10☉ peak, and `v = |β|/180` left rows 10-18 dead.
3. **Both axes are non-uniform** (5° then 15°, on each axis) while the
   TS sampler and the GLSL both assumed a uniform grid.
4. **λ−λ☉ was computed as the 3D angular separation**
   `acos(dot(dir, sunDir))`. That is a different quantity off the
   ecliptic: `cos ε = cos β · cos Δλ` pulls ε toward 90°, so the old
   path sampled too far from the Sun inside quadrature and too near it
   beyond. At β = 60°, Δλ = 120° the two differ by 15.5°.

Plus a comment that promised a "smoothstep fade" past 75° which was a
`clamp` plateau. It is gone; the domain now reaches the pole, so there
is nothing to fade.

**What replaced it** (`src/lib/zodiacalLightLut.ts`,
`ZodiacalLightSkybox.tsx`, `src/lib/zodiacalLightLut.test.ts`):

- Table 16 kept verbatim with correct axis labels, and blank cells now
  `null` rather than `0` — "no datum" and "no light" are opposite
  claims and the gap between them is 9000 S10☉ wide. Every blank cell
  is inside 15° of the Sun (pinned by test); that solid angle is the
  solar F-corona, a component this layer does not model. They are
  filled by holding the innermost tabulated value of the same β column
  inward: a constant extension that invents no shape and deliberately
  under-states a region that is in reality far brighter.
- The grid is extended with a β = 90° column of a constant 60 S10☉ —
  Leinert's own published pole brightness, 60 ± 3, which the table's
  own β = 75° column (56-78) brackets. Not decoration: ecliptic
  longitude is undefined at the pole, so a grid stopping at 75° makes
  the pixels around the pole sample a λ-dependent value the geometry
  cannot resolve, i.e. a ±20 % pinwheel.
- **Non-uniform axes resolved at build time, not in the shader.**
  `buildZodiacalUniformGrid()` resamples onto a uniform 5° lattice
  (37 λ × 19 β = 703 texels, RGBA16F ≈ 5.6 KB). Every source knot is a
  multiple of 5°, so the lattice reproduces the table EXACTLY at its
  knots and linearly between — it is not an approximation of the
  non-uniform table, it is the same piecewise-bilinear function, and
  the GPU's uniform `LinearFilter` fetch of it is then correct with no
  axis LUT in GLSL. Pinned by a test that walks all 171 tabulated cells.
- Angles from projections rather than the `cos ε / cos β` inversion:
  β = asin(dir.y) (scene +Y is the ecliptic pole — the three.js Y-up
  remap in `orbital/analytical/coordUtils.ts`), and |Δλ| = the angle
  between the XZ-plane projections of `dir` and `sunDir`. No division
  by `cos β`, and exact when the observer is off the ecliptic, where
  the Sun itself is no longer at β = 0.
- Every GLSL constant is interpolated from the TypeScript, so the
  shader and the pure-TS mirrors cannot drift. The old file kept its
  own GLSL copy of `ZODIACAL_S10_TO_LINEAR` and its own axis maxima.

### The derived visibility constant

`ZODIACAL_S10_TO_LINEAR = 4.0e-9` was a **discretionary tunable**, not
a calibration, and it was arithmetically invisible: it put the
brightest cell in the whole table at `9000 × 4.0e-9 = 3.6e-5` linear,
4600× below `STAR_DISPLAY_BLACK_POINT = 0.165` and still 286× below it
at `SCENE_EXPOSURE_MAX = 16`. Failure mode 1 was not a risk, it was
the shipped state.

It is now derived against the pipeline's own two numbers, the same
discipline `starfieldShaderMath.ts` uses:

- The graded pipeline's visible window for a diffuse surface is
  `[STAR_DISPLAY_BLACK_POINT = 0.165, Bloom luminanceThreshold = 1.0]`
  — a span of **6.06:1**. (Bloom runs before the tone-mapping pass, so
  it gates on raw linear buffer values; that is why the ceiling is the
  bloom gate and not a post-operator number.)
- The band's own contrast range along the ecliptic runs from
  9000 S10☉ (λ−λ☉ = 15°) to 140 S10☉ (the minimum at 135-150°, between
  the cone and the gegenschein) — **64.3:1**.
- It does not fit. The only choice free of taste is equal margin at
  both ends: map the geometric mean of the band's range to the
  geometric mean of the window.

```
k = √(0.165 × 1.0) / √(9000 × 140) = 0.406202 / 1122.50 = 3.618734e-4
```

Each end overshoots by exactly `√((9000/140)/(1.0/0.165))` = **3.257×**,
by construction. The constant is 90 468× larger than what shipped.

What that puts on screen at 1 AU, neutral exposure (linear, ×black point):

| λ−λ☉, β=0° | S10☉ | linear | × black point      |
| ---------- | ---- | ------ | ------------------ |
| 15°        | 9000 | 3.257  | 19.7 (3.26× bloom) |
| 25°        | 3000 | 1.086  | 6.58 (1.09× bloom) |
| 30°        | 1940 | 0.702  | 4.25               |
| 45°        | 710  | 0.257  | 1.56               |
| 60°        | 395  | 0.143  | 0.87               |
| 90°        | 202  | 0.0731 | 0.44               |
| 180°       | 180  | 0.0651 | 0.39 (gegenschein) |
| pole       | 60   | 0.0217 | 0.13               |

So the band crosses the black point at λ−λ☉ ≈ 57° in the ecliptic and
the bloom gate at ≈ 26°: a visible cone about 30° long with a bloomed
root at the Sun. The gegenschein sits at 0.39× the black point — below
threshold until eye adaptation lifts exposure past ≈ 2.5×, which is
the honest answer for a feature most observers have never seen.

**The bright end is accepted, not clamped, and it is stated here
rather than hidden.** The near-Sun cells cross the bloom gate by up to
3.26×. The 64:1 ratio is measured data; squashing it would falsify the
one thing a tabulated model is for. The region above the gate reaches
≈ 26° from the Sun along the ecliptic and ≈ 20° across it, which is
the same solid angle the Sun's own disc and bloom already occupy, and
AgX's shoulder is downstream of it on every tier that mounts the layer.

**If the eye pass says "too dim"**, the derived alternative is to
anchor the canonical quadrature value (λ−λ☉ = 90°, β = 0°, 202 S10☉)
directly on the black point: `k = 0.165/202 = 8.168e-4`, 2.26×
brighter, band visible out to 90° elongation, peak at 7.35× the bloom
gate. For a smaller correction the dial is `u_brightnessMul`, which
needs no material rebuild.

**Boot frame is unaffected by construction.** The boot camera parks at
~148 AU (be78310), where `R^-2.5 = 3.75e-6` puts even the 9000 S10☉
peak at 1.2e-5 linear — two orders below the black point. `e2e/boot.spec.ts`
re-run after the change: pass, no re-bless.

### Original note (kept for the failure modes, which still frame the eye pass)

The physical constant from Leinert Table 2 is 1.28e-8 W/m²/sr/µm per
S10_sun; the extra factor is what makes the band visible against
the starfield+atmosphere composite, and the right value depends on
eye adaptation behaviour that 1d ships.

**1d has landed in code (see "What was done and why" above) but its
runtime effect on the band's visibility has not been eye-checked yet**
— this session was CLI-only, same caveat as 1a/1b/1c/#3. Three failure
modes to check now that 1d is in the pipeline:

1. Band so dim it stays below `STAR_DISPLAY_BLACK_POINT` and is
   never visible (raise `u_brightnessMul` or `ZODIACAL_S10_TO_LINEAR`).
   — **2026-07-29: confirmed as the shipped state, and fixed.** The
   band is now above the black point out to ≈ 57° elongation by
   construction. Still worth checking that it reads as a cone and not
   as a wash.
2. Band so bright it dominates the starfield (lower the same).
   — Untested. The band peaks at 4.25× the black point at 30°
   elongation, against a magnitude-8 star's 1.0×; a bright star is
   ~6×. Plausible but unverified.
3. Band clips as a flat disk near the Sun because Leinert's 9000
   S10 value doesn't pass Bloom's `luminanceThreshold=1.0`.
   — **2026-07-29: inverted.** It now passes the gate deliberately, at
   3.26×, over a region ≈ 26° × 20° around the Sun. This is the single
   most likely thing the eye pass will object to. The escape hatch is
   `u_brightnessMul`; a fade near the Sun is NOT the right fix, because
   the blank-cell wedge is already a constant hold rather than a ramp.

CreditsModal provenance has landed (8598028, wording updated
2026-07-29). A single human-eye calibration pass is what remains
before declaring this sub-pull done.

**2026-07-28 runtime-verification attempt (lighting-audit session):
still NOT runtime-verified — blocked by tooling, not attempted-and-
inconclusive.** This session's Browser pane never composited a frame
(see the LightGlow section above for the full diagnostic — `Viewport:
0x0`, `document.hidden === true`, no screenshot possible; this is a
non-interactive session, nobody's screen shows this pane, so it cannot
be made to render). No screenshots were taken of the eye-adaptation
behavior or the zodiacal band, so none of the three failure modes above
can be reported on with evidence. Recording "not verified" rather than
guessing.

A substitute headless-Playwright pass (see the LightGlow section) was
tried for the eye-adaptation check too, but it is voided by the SAME
`constrained`-tier finding: `EyeAdaptationBridge` only does anything
when `toneMappingRef` is non-null, which requires a mounted
`<ToneMapping>` pass inside `PostProcessingPipeline` — and that
component never mounts on `constrained` (Scene.tsx swaps in
`DirectRenderPass` instead). Per the coordinator's explicit
precondition ("if… the composer actually mounts there"), the cheap
exposure-registry read-back was skipped rather than run against a path
that structurally cannot exercise the code under test. Same applies to
`ZodiacalLightSkybox` — it does not mount on `constrained` either (see
its own "Tier gate" note above) — so a zodiacal screenshot from this
environment would show nothing regardless of the real shader's
behavior and would not be honest evidence either way.

**Owed to the owner:** a human-eye pass on real hardware (ultra tier,
default scene) covering all of: the three zodiacal failure modes listed
above, whether 1d's eye-adaptation is perceptible/smooth/flicker-free,
and the resulting calibration decision on `ZODIACAL_S10_TO_LINEAR`. None
of that can be produced from this sandbox — every environment available
to it (non-compositing pane, headless-Playwright-on-SwiftShader) either
cannot render a frame or hard-floors to the tier where the effects under
test don't mount.

**2026-07-29: still owed, and now it is the ONLY thing owed on this
layer.** The rebuild above is math that puts the band inside the
visible window by construction — every number in it is checked by unit
test — but no frame of it has been seen by anyone. To do the pass:
camera near 1 AU (the boot pose at ~148 AU shows nothing, correctly),
ultra tier, look 30-60° off the Sun along the ecliptic, then pan to
frame the Sun (failure mode 3), then to the antisolar point
(gegenschein) and to the ecliptic pole (should be black).

**2026-07-29 (forced-ultra headless verification pass) — the "cannot
render a frame at all" blocker is gone; the "cannot aim the camera at
a chosen elongation" blocker replaced it, and it wasn't fully solved
either.** Prior sessions' non-compositing Browser pane and
constrained-tier headless Playwright are BOTH bypassed by driving
`window.__ATLAS_TEST_STORE__.getState().setGraphicsAutoMode(false)` +
`setGraphicsPreset("ultra")` immediately after `__ATLAS_TEST_STORE__`
appears (before the Canvas mounts) — confirmed via the boot
diagnostic: `qualityTier: ultra`, `renderer: ANGLE (..., SwiftShader
Device ...)`. Composer, Bloom, AgX, and ZodiacalLightSkybox all mount.
Evidence lives in the throwaway scratchpad (not committed); screenshot
paths were handed to the orchestrator.

What got verified:

- **The geometry/distance pipeline into the shader is correct.**
  `camera.position.length() / AU_TO_3D_UNITS` (1000) was cross-checked
  against the Sidebar's own "CURRENT DIST … From Sun" telemetry (which
  is computed independently, from the orbital engine, not from camera
  state) at four bodies and agreed to within 1%: Mercury 0.461 vs
  0.463 AU, Venus 0.727 vs 0.727 AU, Jupiter 5.17 vs 5.212 AU, Neptune
  29.88 vs ~29.9 AU. `u_cameraR_AU` is receiving the right number.
- **The band is correctly ABSENT past the black-point crossing.**
  Screenshots centred at elongation ≈ 110-173° (Venus, Jupiter, Moon —
  see below) show no visible band, which is the predicted outcome:
  the derivation above puts the crossing at ≈ 57°, and none of these
  frames get closer to the Sun than 110°. This is a negative result
  that matches the model, not an absence of evidence.
- **No composer-mount console errors** were introduced by forcing
  ultra (separately from the planetshine defect recorded in the
  lighting-redesign wave file's Onda 2.3 section — that error is real
  but unrelated to this layer).

What did NOT get verified, and why — **camera aiming, not rendering,
was the blocker this time**:

- Every technique tried to pin the camera at "~1 AU, elongation
  30-60°" failed or landed elsewhere. `setFocusId("hyg:K")` mid-flight
  (the intended "sample early frames of a fly-to" trick) turns out to
  cover the vast majority of an interstellar distance within ~100-200
  ms of real time even at t≈0 (`HygPhysicsFlight`'s exponential
  distance-proportional velocity, `MAX_VELOCITY_FACTOR = 3.0/s` — see
  `hygPhysicsFlight.ts`), so "near 1 AU" and "aimed at a star" are
  mutually exclusive on the timescale a `waitForTimeout` can hit
  reliably. Curated-body focus (`selectId("venus")` etc.) reliably
  lands near the body's own true distance (see the cross-check above)
  but its "view the lit face" framing convention put every body tried
  — Mercury, Venus, Mars, Jupiter, Neptune, the Moon — at 100-173°
  elongation, never inside 30-60°.
- **`setFocusId("sun")` does not give a close-up bright Sun.** In the
  current default (realistic scale mode), focusing the Sun triggers
  `AstroPhysics.resolveFocusExtent`'s system-overview special case
  (the same one that sizes the ≈148 AU boot pose) — the result is a
  ≈250+ AU wide establishing shot, not a close-up disc. This means
  the failure-mode-3 check ("does the band clip into an ugly flat
  disk near the Sun") could not be performed via body-focus at all;
  it needs a genuine free-look/first-person control this pass did not
  get working (see below).
- A synchronous OrbitControls mouse-drag approach (zoom out from a
  focused body, then drag to sweep elongation through the full 0-180°
  range while staying near the body's ~1 AU distance) was designed and
  is geometrically sound, but the `page.mouse.wheel()` zoom step hung
  for an undiagnosed reason in this session and was abandoned rather
  than debugged further against the clock.
- **Antisolar / gegenschein**: closest achieved was Venus at 149.998°
  and 172.7° (two different sessions), R_AU 0.71-0.73 — reproducibly
  band-absent, consistent with 0.39× black-point gegenschein
  prediction, but not a clean 180.000° sample.
- **Ecliptic pole**: not attempted — no reliable aiming technique was
  available by the time this was reached in the budget.

**Net:** the shader/pipeline correctness claim is now evidence-backed
(not just unit-tested); the actual eye-pass on the visible band
(30-60° cone, near-Sun clipping, gegenschein, pole) is still owed,
same as every prior session recorded here. The blocker moved from
"can't render" to "can't aim a synchronous camera", which is a
narrower, more tractable problem for the next session — the mouse-drag
approach above is the recommended next attempt, debugged rather than
abandoned.

**Fly-by fade (`cbc1bf6`, the shell-outrun fix) — verified headless
forced-ultra (SwiftShader) 2026-07-29: no pop, no discontinuity,
partial coverage.** Started from a band-in-frame pose (Jupiter focus,
elongation ≈159°, R_AU ≈5.13 — cross-checked against the Sidebar's
5.212 AU) and dispatched `setFocusId("hyg:5")`, sampling 5 frames
(pre-flight + 200/600/1200/2000 ms). Camera-to-Sun distance grew
**continuously and monotonically** (5.13 → 1.37M → 2.34M → 2.57M →
2.69M AU) with no reset, no NaN, no jump back — the elongation stayed
locked at exactly 179.9999° throughout (the aim-lerp target tracked
correctly, no snap). All 5 screenshots render a normal, smooth
starfield/target-star approach with no black-hole or blank-frame
artifact — the specific pre-fix failure mode (camera outruns its own
1e8-world-unit shell, band vanishes for the whole mid-flight) did not
reproduce. **Caveat, stated plainly**: the starting pose (159°) was
already past the ≈57° visibility threshold, so there was no bright
band actually on screen to watch fade — this run confirms the
mechanism (continuous per-frame shell recentring, no lag) rather than
watching a visible band dim to black in real time. `hygPhysicsFlight`'s
exponential distance-proportional velocity (`MAX_VELOCITY_FACTOR =
3.0/s`) covers most of an interstellar distance within ~100-200 ms
regardless of start point, which is faster than this session's
sampling could usefully resolve for a "watch it fade" capture even
starting inside the visible cone. Screenshot paths handed to the
orchestrator (`item7-flyby-*.png`).

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

## Honest disclosure (this session, plus the 1d follow-up)

Three of the prior session's commits (200e13d, 1a45230, 48a3acc) did
not get a visual runtime verification. This session's 1d commit did
not either — also CLI-only. Verification for 1d was:

- `npm run test:run` → 2427 passes (all pre-existing tests green; zero
  new tests added, per AGENTS.md §6's "experimental look work needs
  zero new unit tests" — no new `ToneMappingName` value was added, so
  no `resolver.test.ts` differential to extend either).
- `npx tsc -b` → clean (including the narrow undeclared-property type
  augmentation in `EyeAdaptationBridge.tsx` — see that file's module
  doc comment).
- `npm run lint` → clean.
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
4. Whether 1d's eye-adaptation is visually perceptible at all, whether
   its 1-frame GPU-readback lag reads as smooth or as a stutter, and
   whether the library's default `adaptationRate` (tau=1) paces
   correctly for this scene — see the 1d section above.

A single human-eye calibration pass (suggested: 1080p fullscreen,
ultra tier, default scene, camera at Earth-orbit looking towards
ecliptic pole + looking towards Sun, then panning to frame the Sun)
would close this. Until then, do not claim this wave is "done" beyond
the commit log.

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
2. ~~Pick up 1d (eye-adaptation).~~ **Shipped** — see "What was done
   and why" above. First runtime look should confirm the adaptation is
   perceptible and not a stutter (see "Honest disclosure" item 4)
   before considering a 1e per-shader follow-up.
3. Update **`CreditsModal.tsx`** for AgX + zodiacal provenance. Cheap
   honest disclosure; high value-of-information.
4. ~~Run the **LightGlow audit** with a runtime FPS measurer.~~
   **Attempted 2026-07-28, blocked** — see the LightGlow section above.
   No environment available that session could produce a real-GPU
   number (non-compositing pane; headless Playwright hard-floors to
   `constrained` tier, where LightGlow never mounts). Shipped
   `GraphicsOverrides.lightGlowEnabled` (default `true`, DisplayPanel
   toggle) as an instrument instead of guessing a default. The real
   measurement + gate decision is still owed — whoever has real GPU
   access next should flip the toggle live, compare frame times, and
   update `PRESET_DEFAULTS` per the recorded decision rule.
5. ~~Defer **#4 (Milky Way HDR)** until the user's licensing check is
   done AND the parallel tiled-streaming wave settles on whether
   KTX2 is in scope.~~ **Shipped 2026-07-29** — owner explicitly
   approved implementing ahead of the licensing check (see "#4
   shipped" section above). KTX2 was evaluated and deferred as a
   documented upgrade path, not blocked on; the 8-bit JPEG fallback
   needed no changes to the tiled-streaming line's territory
   (`deferredTextureCache.ts` was read, not modified). The licensing
   determination itself is still owed to the owner.
6. After CreditsModal lands, do the **calibration pass** for zodiacal
   intensity (now unblocked on the 1d side — see "Outstanding
   calibration"). Document the final `ZODIACAL_S10_TO_LINEAR` value +
   commit message that explains why it's the chosen value (not "we
   tuned it" — the AGENTS.md §honesty requires this).
7. **Verify everything** at runtime by booting `npm run dev` once
   before declaring the wave complete. The CLI-only test pipeline is
   a sanity check, not a visual regression gate. This now includes
   confirming 1d's eye-adaptation doesn't fight the zodiacal
   calibration in step 6 — do them in the same sitting.
   **2026-07-28: still not done** (see "Outstanding calibration"
   above) — this session's environment could not render a frame at
   all. `npm run test:e2e -- e2e/boot.spec.ts` WAS run this session
   (build + Playwright preview server, separate from the blocked
   interactive pane) — both tests passed cleanly, including the
   `boot-frozen.png` pixel-diff gate, with no baseline changes needed.
   That confirms 1d's neutral-exposure boot pose doesn't move boot
   pixels as the wave doc predicted, but it is not a substitute for the
   human-eye pass — it only covers one frozen frame far from the Sun.

---

_Last updated: 2026-07-28. 1d (eye-adaptation) shipped by a follow-up
session; CreditsModal, LightGlow audit, and #4 remain open._

_2026-07-28 (lighting-audit session): e2e boot gate re-run clean, no
re-bless needed. LightGlow audit attempted, blocked by environment
(non-compositing pane + headless-Playwright SwiftShader → constrained
tier); shipped `lightGlowEnabled` toggle (default true) as an
instrument instead of a measurement-gated default — see the LightGlow
section for the full trail. 1d/zodiacal runtime verification attempted,
also blocked by the same environment limits — still owed a human-eye
pass. CreditsModal and #4 untouched this session (out of scope for this
pass)._

_2026-07-29: **#4 (Milky Way HDR panorama) shipped** — see "#4 shipped
(2026-07-29)" above for the full asset/orientation/calibration trail.
CreditsModal also gained the Milky Way disclosure entry (AgX's own
CreditsModal entry was already present from an earlier session; not
re-verified this pass). `npm run test:run` (2502 tests), `tsc -b`,
`lint`, `docs:check`, `build`, and `npx playwright test e2e/` (12/12,
including the boot pixel gate, no re-bless) all clean. Runtime eye
verification remains structurally impossible from this sandbox
(confirmed again this session — `document.hidden === true`, same as
every prior attempt) and is owed to the owner, same as the zodiacal
band and 1d. LightGlow audit and W5/eye-adaptation items untouched
this session._

_2026-07-29 (owner eye-pass session): **#4 (Milky Way HDR panorama)
PULLED** — the human-eye pass owed above landed and the verdict was
negative ("muito ruim, confuso e não integrado com o starfield. ele
some nos fly-bys"). `MilkyWaySkybox.tsx` and its `Scene.tsx` mount plus
the CreditsModal disclosure entry were removed; see "#4 pulled
(2026-07-29)" above for the full removal record, what was kept
(`milkyWayOrientation.ts` + its test, and the source JPEG, now
unreferenced and parked), and the failure-mode hypotheses recorded for
a future retry. This is a product pull per explicit owner instruction,
not a bug fix — no attempt was made to fix the integration in place._

_2026-07-29 (halo-alignment fix session): **Fixed a fourth missed call
site of the 2026-07-23 `hygFrame.ts` migration**, found by a read-only
audit. `LightGlowInjector.tsx` (`LightGlowSlot`) built a bare
`R_x(23.4°)` obliquity `Matrix3` for LightGlow light positions instead
of the composed equatorial→scene transform (`hygEquatorialToScene`) the
starfield, `StarHoverPicker`, and `hygFocusResolver` already went
through — same bug class as the original three sites, just never
migrated. Measured world-direction error at HEAD: Sirius 131.96°, Vega
134.62°, α Cen 119.19°, Canopus 136.26° — halos rendered over the wrong
patch of sky or not at all for on-screen bright stars, default-on on
every tier except `constrained`. **Fix (deletion-shaped):**
`lightRegistry.ts`'s `pickTopHygByBrightness` now calls
`hygEquatorialToScene` directly (scale-then-rotate, matching
`StarHoverPicker.buildPickCandidates`'s convention); the `obliquityMatrix:
THREE.Matrix3 | null` parameter and its cache-key plumbing were deleted
end to end (`pickTopHygByBrightness`, `getTopHygCandidates`,
`UpdateLightRegistryParams`, `updateLightRegistry`), and
`LightGlowInjector.tsx`'s hand-rolled matrix + its pass-through were
removed — one transform, one owner. `hygFrame.ts`'s doc comment now
names `lightRegistry.ts` as a fourth consumer. New regression pin in
`lightRegistry.test.ts` ("hygFrame alignment regression" describe
block): a real Sirius direction (RA 101.287°, Dec −16.716°, 2.637 pc)
projects to the same NDC position via `updateLightRegistry` as via
`hygEquatorialToScene` directly, within 1e-6 — the rotation path was
previously untested (`obliquityMatrix: null` in every existing test).
Three pre-existing ranking/frustum tests needed a new `makeHygCamera()`
fixture (conjugates the old camera position through the same rotation)
since they were built assuming no rotation. All gates green: `npm run
test:run` (2503 tests), `tsc -b`, `lint`, `build`,
`npx playwright test e2e/boot.spec.ts` (2/2, no pixel-diff regression —
confirms `constrained` still never mounts LightGlow headless). Shipped
on `main` directly per solo-dev workflow._

_2026-07-29 (forced-ultra headless verification pass): **halo-alignment
fix (`481f429`) verified headless forced-ultra (SwiftShader) — PASS.**
`setFocusId("hyg:0")` (Sirius) from a near-Earth pose, sampled after the
aim-lerp settles: a soft radial halo is present and visually CENTRED on
the star's disc (screenshot `item5-sirius-halo.png`, handed to the
orchestrator) — no floating halo, no offset, matching the fixed
`hygEquatorialToScene` transform's prediction (pre-fix this would have
shown Sirius ~132° from any halo, i.e. no halo near the star at all).
A handful of other captured views (Jupiter, Venus, Moon, Io — taken for
other verification items, not a dedicated sweep) showed no floating
halo with no star beneath, but none of those frames specifically
targeted a bright HYG star either, so this is corroborating rather than
an exhaustive sweep. Composer confirmed mounted via the boot diagnostic
(`qualityTier: ultra`) before this check, per the forced-ultra unlock —
see the "Outstanding calibration" section above for the full technique
and its limits._

\_2026-07-29 (near-Sun whiteout fix session): **owner-reported visual
regression fixed — the zodiacal band's inward `R^-2.5` scaling was
unbounded and washed the whole screen white as the camera approached
the Sun.** Owner report (real GPU, with screenshots): a white
"penumbra"/glare grows around the Sun on zoom-in "até a tela inteira
ficar branca" (until the whole screen goes flat white); "esse efeito
visual (parece um glare) é muito estranho e não cumpre sua função
planejada" (looks like a glare, doesn't serve its intended purpose).
Introduced by `f900c99` ("Zodiacal rebuild" above): that commit
correctly raised `ZODIACAL_S10_TO_LINEAR` 90 468× (it had been
arithmetically invisible, see "The derived visibility constant"), but
did not touch `zodiacalBrightness`'s heliocentric term, which still
multiplied by `pow(max(u_cameraR_AU / ZODIACAL_REFERENCE_R_AU, 0.1),
-2.5)` with no upper bound. That factor was harmless at 4.0e-9 (still
invisible at any R) and only became a display bug once the calibration
made the band visible in the first place — a defect that had been
latent since `48a3acc`, not introduced by this rebuild, just unmasked
by it.

**Root cause, with arithmetic.** `ZODIACAL_S10_TO_LINEAR` is derived
entirely AT `R = 1 AU` (see "The derived visibility constant" above):
it already puts the brightest tabulated cell at 3.2569× the bloom gate
by design. The unbounded factor multiplied that ceiling further: at the
shader's own 0.1 AU floor, `pow(0.1, -2.5) = 10^2.5 ≈ 316.2×`, so the
inner cone alone reached `3.2569 × 316.2 ≈ 1030×` the bloom gate — and
at Mercury's real orbital range (perihelion 0.307 AU to aphelion 0.467
AU, `pow(R,-2.5)` ≈ 19.2× to 6.7×), even the TABLE'S FAINTEST cell (140
S10☉ at the gegenschein, 0.0507 linear at 1 AU — already below the
0.165 black point by design) crossed back above it: `0.0507 × 6.7 ≈
0.34` to `0.0507 × 19.2 ≈ 0.97`. Because the factor is direction-
independent (it scales every texel of the LUT alike, only the texel
VALUE varies with look direction), this pushes brightness above the
black point in every direction at once past a certain R, not just
toward the Sun — which is exactly the "whole screen washes out" shape
of the owner's report, not a localised near-Sun clip.

**The bound (`zodiacalLightLut.ts`,
`zodiacalHeliocentricFactor`).** `factor(R) = pow(max(R, 1 AU) / 1 AU,
-2.5)`: unchanged for `R ≥ 1 AU` (the calibrated, verified, outward-
dimming regime), clamped to exactly `1.0` for every `R ≤ 1 AU`. The
band can never exceed its already-3.26×-over-gate 1 AU brightness, no
matter how close the camera gets to the Sun — it only ever dims going
outward. Continuous at `R = 1 AU` by construction (both branches
evaluate to 1.0 there). Disclosed as a display bound, not a
recalibration: Table 16 is the sky as measured FROM 1 AU, nothing in
Leinert licenses sliding the observer inward and reusing the same
table, and even if it did, the display has no ~300× of spare headroom
regardless of what the true sky radiance does inward of 1 AU (Helios
photopolarimeter data show the cloud genuinely keeps brightening to
about 0.3 AU, at a similar exponent — real physics, deliberately NOT
reproduced past this bound, same "no invented shape, only a floor"
policy the blank-cell fill already uses). Implementation used
`ZODIACAL_REFERENCE_R_AU` itself as the clamp floor (both are the same
1 AU quantity) rather than a second magic constant. `CreditsModal.tsx`
and `ZodiacalLightSkybox.tsx`'s doc comments updated with the same
disclosure. `ZODIACAL_R_EXPONENT` (previously a bare `2.5` hardcoded
only inside the GLSL template) was promoted to an exported TS constant
so the shader and the new pure-TS mirror (`zodiacalHeliocentricFactor`,
used by tests and available for future pure-TS callers) cannot drift —
same pattern the file already uses for every other shared constant.

**Verified headless, forced-ultra (SwiftShader), same technique as the
"forced-ultra headless verification pass" above** —
`setGraphicsAutoMode(false)` + `setGraphicsPreset("ultra")` dispatched
via `__ATLAS_TEST_STORE__` immediately after it appears, then
`setFocusId("mercury")` (R inside Mercury's 0.307-0.467 AU range).
Screenshots at the IDENTICAL pose (same frozen simulation time, same
camera transform, same "MARTE"/"PLUTÃO" labels) before vs. after the
fix, throwaway repro script + PNGs in the scratchpad verify folder
(not committed): **before** — the entire sky is a flat, uniform medium-
grey wash from horizon to horizon, the ecliptic grid lines barely
visible through it, exactly the reported regression, just short of a
literal 100%-white clip at this particular R (consistent with the
6.7-19.2× arithmetic above, well short of the 316× floor-case); **
after** — normal black sky, stars crisp and coloured, ecliptic grid
lines clearly visible in cyan, no wash at all. `boot.spec.ts` also
re-run clean (boot camera is at ~148 AU, `pow(148,-2.5) ≈ 3.7e-6`, far
inside the `R ≥ 1 AU` branch this fix left untouched — zero pixel
change expected and observed).

**Near-Sun total-output check (requirement of this fix, not a re-
tune).** At the bound, the near-Sun peak is CAPPED at the same
3.2569×-over-gate value the 1 AU calibration already ships and has
already been accepted as a deliberate, documented overshoot (see "The
derived visibility constant" — confined to ≈26°×20° around the Sun,
the same solid angle the Sun's own disc/bloom already occupy). At
Mercury's distance this session could reach headlessly, the sky-wide
wash from the bug is fully gone and the remaining scene reads as a
normal star field — the AgX shoulder is not being asked to roll off
anything more than it already handles at 1 AU. A tighter near-Sun
frame (elongation < 30°, R closer to 0.1-0.3 AU) was not reachable this
session (same camera-aiming blocker recorded in "Outstanding
calibration" above — curated `setFocusId` frames the LIT face, i.e.
Sun roughly BEHIND the camera, and a native-PointerEvent drag-rotate
attempt to swing the Sun into frame hung for ~90s+ and was aborted,
same failure shape as the wheel-zoom attempt recorded above). Given the
bound provably caps the near-Sun peak at the already-accepted 1 AU
ceiling regardless of R, and that ceiling was already judged acceptable
in the "Outstanding calibration" analysis above, no further numeric
finding is owed here — but the eye pass owed above should still glance
at an actual close Sun approach on real hardware to confirm the AgX
shoulder reads well against a MOVING near-Sun band, not just a static
1 AU frame.

**Hexagon artifact — identified, pre-existing, NOT the zodiacal
geometry.** The owner's screenshots show a faint hexagonal shape inside
the glow. Traced to `LensFlareEffect.ts`'s `regShape(p, N)` (a regular-
polygon SDF, `N = 6` hardcoded at the `lensFlareCircle` call site) —
the COMPLEX lens-flare's "aperture-blade ghost" term, a 1:1 port of
Gaia Sky's `lensflare.frag.glsl`/ShaderToy origin, deliberately hexagon-
shaped to simulate a 6-blade camera iris. This is pre-existing (the
`APERTURE_GHOST_OFFSET_REMOVED` fix for exactly this "hex blob" report
already landed 2026-07-25, well before this session) and structurally
CANNOT be the zodiacal icosphere: `ZodiacalLightSkybox.tsx`'s fragment
shader colours every pixel from a continuous analytic function of the
per-fragment world direction (`zodiacalBrightness(betaDeg, lambdaDeg)`
sampled from a bilinear LUT) — there is no per-vertex colour and
therefore no mechanism for icosahedron subdivision to produce facets, at
any subdivision level. No fix applied here (out of scope: it is not
the zodiacal layer, and it is not new). Confirmed by reading
`LensFlareEffect.ts` directly (`regShape`/`lensFlareCircle`), not by a
visual repro — a Sun-focused headless capture this session
(`setFocusId("sun")`, realistic-mode system-overview framing, ~250+ AU)
put the Sun's disc at only a few pixels, too small at that distance to
visually resolve the hexagon either way.

**Tests** — `zodiacalLightLut.test.ts` gained a
`zodiacalHeliocentricFactor` describe block: `factor(R≥1) === R^-2.5`
exactly (spot-checked at R=2, 5.17 (Jupiter), 29.9 (Neptune)),
`factor(R≤1) === 1.0` exactly (spot-checked at the OLD 0.1 AU floor,
Mercury/Venus distances, and R=0), continuity at R=1 (both sides →
1.0), monotonic outward decline preserved, the near-Sun peak never
exceeding its calibrated 1 AU value at any inward R, and a GLSL-source
assertion that the shader clamps against `ZODIACAL_REFERENCE_R_AU`
(not a re-introduced `0.1` literal). No prior test pinned the old
unbounded form, so nothing needed deleting.

**Gates**: `npm run test:run` (2542 tests, all green — 6 new in the
heliocentric-scaling block, `zodiacalLightLut.test.ts` now 25 tests),
`npx tsc -b` clean, `npm run lint` clean,
`npm run docs:check` clean, `npm run build` clean, `npx playwright test
e2e/boot.spec.ts` clean (no pixel-diff change, as predicted). Shipped
directly on `main` per solo-dev workflow.\_
