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

---

## Outstanding calibration (NOT BLOCKING, but visible)

The zodiacal light band's `ZODIACAL_S10_TO_LINEAR = 4.0e-9` constant
is a **discretionary tunable**, not a measured calibration. The
physical constant from Leinert Table 2 is 1.28e-8 W/m²/sr/µm per
S10_sun; the extra factor is meant to make the band visible against
the starfield+atmosphere composite, but the right value depends on
eye adaptation behaviour that 1d ships.

**1d has landed in code (see "What was done and why" above) but its
runtime effect on the band's visibility has not been eye-checked yet**
— this session was CLI-only, same caveat as 1a/1b/1c/#3. Three failure
modes to check now that 1d is in the pipeline:

1. Band so dim it stays below `STAR_DISPLAY_BLACK_POINT` and is
   never visible (raise `u_brightnessMul` or `ZODIACAL_S10_TO_LINEAR`).
2. Band so bright it dominates the starfield (lower the same).
3. Band clips as a flat disk near the Sun because Leinert's 9000
   S10 value doesn't pass Bloom's `luminanceThreshold=1.0`. If so,
   add a soft smoothstep fade near elongation < 15° in the shader.

Once CreditsModal provenance also lands, recommend a single human-eye
calibration pass before declaring this sub-pull done.

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
5. Defer **#4 (Milky Way HDR)** until the user's licensing check is
   done AND the parallel tiled-streaming wave settles on whether
   KTX2 is in scope (check `tasks/STATUS.md` heritor for that
   wave's status).
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
