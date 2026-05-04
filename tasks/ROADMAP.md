# Roadmap — Atlas Orbital visual port

Everything the 19-pass audit (2026-04-22) revealed, organized by tier
and effort. Each item cites Gaia Sky source (clone at `/tmp/gaiasky/`),
atlas state, estimated effort, and dependencies.

---

## Tier 1 — Bugs (days)

Small diffs, direct source citations, no new foundations.

### T1.1 — θ.4 starburst Y-coord drift ✅ **SHIPPED (`4cc35cb`)**

- **Gaia**: `/tmp/gaiasky/assets/shader/postprocess/lensdirt.frag.glsl:29,30`
  samples `u_texture2` (starburst) at `Y=0.0`.
- **Atlas (before)**: `PseudoLensFlareEffect.ts:198,202`
  sampled at `Y=0.5`. Undocumented drift caught by P10 mechanical diff.
- **Fix shipped**: extracted literal into
  `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` export with
  source-citation docstring; shader template interpolates the constant
  via `.toFixed(1)`; pinned by regression test in
  `lensFlareMath.test.ts`. Visual impact: zero today (atlas procedural
  starburst is 256×1 so Y=0 and Y=0.5 sample the same row); future-
  proof against 2D `lensstarburst.jpg` upgrades.
- **Status**: done — commit `4cc35cb`.

### T1.2 — Ring shadow frame mixing ✅ **SHIPPED (`6c0f82f`)**

- **Atlas (before)**: `usePlanetMaterials.ts:329,342` fed
  `float t = -vPos.y / lightDir.y` with `vPos` in object-space and
  `uSunPosition` stuck at world-space `(0,0,0)` (never updated).
  The frames coincided only under an identity model matrix —
  Saturn's 26.73° tilt + orbital translation both broke that.
  Bonus: `src/components/canvas/shaders/ringShadowShader.ts` had
  already been inlined into `usePlanetMaterials.ts` and was dead code.
- **Fix shipped**: added per-frame update in `Planet.tsx:247-284` that
  mirrors the existing ring-material pattern —
  `TMP_PLANET_INV_MATRIX.copy(rotationRef.current.matrixWorld).invert();`
  then `TMP_PLANET_SUN_LOCAL.set(0,0,0).applyMatrix4(...)` copies
  object-space sun into `uSunPosition`. GLSL intersection math
  unchanged. Deleted dead `ringShadowShader.ts`. Pinned by
  `src/components/canvas/planet/ringShadowMath.{ts,test.ts}` (6 tests,
  including a Saturn-like tilt+translation regression).
- **Status**: done — commit `6c0f82f`.

### T1.3 — LightGlow spiral not FOV-aware ✅ **SHIPPED (`a27dc42`, original θ.3 feature commit) — audit was stale**

- **Gaia**: `MainPostProcessor.java:562` wires
  `getGlowSpiralScale(..., fovFactor)` where
  `fovFactor = tan(FOV/2) / tan(20°)` (`AbstractCamera.java:148`;
  `TAN_REF_FOV = tan(40°/2)` at `AbstractCamera.java:42`).
- **Atlas (actual, verified 2026-04-22)**: FOV-aware from day one of θ.3.
  - `src/lib/lightRegistry.ts:78-82` — `computeFovFactor(fovDeg)` =
    `tan(fovDeg/2) / tan(GAIA_FOV_FACTOR_REFERENCE_DEG/2)`, i.e.
    `tan(fov/2) / tan(20°)`. Byte-identical formula to
    `AbstractCamera.java:148`. Pinned by
    `src/lib/lightRegistry.test.ts:107-114` (40°→1.0, 45°→1.138,
    60°→1.586).
  - `src/components/canvas/scene/LightGlowInjector.tsx:141-186` —
    per-frame `useFrame`: reads `camera.fov`, calls
    `computeFovFactor`, then
    `effect.setSpiralScale(LIGHT_GLOW_DEFAULT_SPIRAL_SCALE / fovFactor)`.
    Direct mirror of Gaia's `brightness × pointSize × 5e-5 / fovFactor`.
- **How the audit went wrong**: P10 read the docstring on
  `LightGlowEffect.ts:45-46`, which documents that the CONSTANT
  `LIGHT_GLOW_DEFAULT_SPIRAL_SCALE` assumes `fovFactor = 1.0`, and
  interpreted it as "runtime hardcodes 1.0". Missed that
  `LightGlowInjector.tsx` divides by the live fovFactor before
  pushing the value to the effect. See lesson **L25** in
  `tasks/lessons.md`.
- **Status**: done — no code change required. Doc-only correction
  shipped in this audit turn.

---

## Tier 2 — Lens splendor parity (1-2 weeks)

Fixes visible in user's reference screenshot comparison.

### T2.0 — Remove `SunScreenFlare` stacking ✅ **SHIPPED (`cd626dc`)**

- **Finding**: atlas runs two lens-flare systems simultaneously for
  the Sun. Discovered via cross-AI review of Phase θ shipped work
  (lesson L29).
  - **System A**: `src/components/canvas/planet/SunScreenFlare.tsx`
    — 3 sprites (core radial gradient, halo radial gradient, rays
    starburst canvas). Object-space, `AdditiveBlending`,
    `toneMapped=false` (legitimate HDR emissive per L28),
    `depthTest=true` (post-L28 fix). Mounted in `Planet.tsx:839-845`
    for `body.type === "star"`; import on `Planet.tsx:21`.
  - **System B**: `src/components/canvas/scene/effects/PseudoLensFlareEffect.ts`
    — Gaia θ.4 post-process port (bias → ghosts → CA → halo → dirt
    × starburst). Mounted in `PostProcessingPipeline.tsx:130` via
    `<LensFlareSlot />` (`scene/LensFlareInjector.tsx:30-55`).
- **Why system A must go**:
  1. **Replace-don't-stack rule** (memory
     `feedback_no_effect_stacking.md`): a Phase θ port REPLACES
     the pre-existing atlas-native equivalent. θ.4 shipped with
     the delete step missed — this is retroactive cleanup.
  2. **Gaia has no object-space sprite layer for the Sun**. Only
     the billboard + the post-process. Keeping `SunScreenFlare`
     is an atlas invention that violates Gaia-fidelity (memory
     `feedback_default_gaia_fidelity.md`).
  3. **Post-process is a strict superset**: bias-thresholded ghost
     march + halo + CA + dirt + starburst covers every feature
     `SunScreenFlare` provides (radial gradient, halo, star spikes).
  4. **Calibration blocker**: every planned lens improvement (T2.3
     assets, T2.2 blur + intensity raise, T2.1 COMPLEX port) tunes
     the pipeline's output. With sprites stacked on top, we'd be
     calibrating the sum and the tuning drifts as sprites render.
- **Fix shipped** (`cd626dc`):
  1. Mount at `Planet.tsx:838-845` removed (the `{body.type === "star" && (...)}` block).
  2. `import { SunScreenFlare } from "./planet/SunScreenFlare"` at
     `Planet.tsx:21` removed.
  3. `src/components/canvas/planet/SunScreenFlare.tsx` deleted (275 LOC).
  4. Orphan sweep: `createRadialGradientTexture` +
     `createStarburstTexture` were file-local; gone with the file.
     Grep `src/` confirms zero remaining refs.
  5. Gates green: `npm test -- --run` 873/873, `npm run lint` clean,
     `npm run build` clean (pre-existing chunk-size warnings only).
- **Runtime smoke**: Claude Preview MCP — scene renders full
  solar-system view with Sun visible as `ProceduralSun3D` billboard
  (no ghost sprite halo); 55-56 FPS sustained across two
  consecutive 2-second windows; zero console errors; WebGL context
  alive. Per-pixel temporal sampling via `readPixels` / `drawImage`
  returns zeros because Three.js sets `preserveDrawingBuffer: false`
  — acceptable fallback for this onda because T2.0 is a pure
  deletion adding no shader/uniform surface (L26's flicker failure
  mode cannot arise from removing a sprite layer).
- **Status**: done — commit `cd626dc`.

### T2.1 — Port COMPLEX lens flare ✅ **SHIPPED (`a2c6594`)**

- **Finding**: Gaia's **default** is `lensFlare.type: COMPLEX`
  (`config.yaml:606`). `MainPostProcessor.java:268-312` branches
  in two entirely separate pipelines:
  - `type == PSEUDO` → `PseudoLensFlare` effect (`pseudolensflare.frag.glsl`
    - 35-pass blur + dirt + combine). What θ.4 ported.
  - otherwise → `LensFlare` effect (`lensflare.frag.glsl`, SIMPLE
    or COMPLEX depending on `type.ordinal()`). **This is the
    default.** Uses a single all-in-one frag shader driven by
    `u_lightPositions[MAX_LIGHTS=10]` + `u_lightIntensities` +
    `u_viewport` + `u_color`, followed by optional dirt ×
    starburst and combine. **No blur chain** —
    `LensFlare.java:112-141` goes flare → dirt → combine,
    period.
- **Evidence**: user's reference Gaia screenshot shows rainbow
  dispersive spikes spanning the screen — that's COMPLEX output.
  Atlas renders PSEUDO (θ.4), which draws ghosts + halo + CA +
  dirt stripe, a fundamentally different visual signature.
- **Resolution** (Gaia-fidelity rule, 2026-04-22): **port COMPLEX
  and make it the atlas default**, matching `config.yaml:606`.
  PSEUDO (θ.4) stays registered as opt-in alternate — do not rip
  it out; users who prefer its subtle character should still be
  able to pick it. Atlas gains a variant selector (similar to
  Gaia's `type` config key) that defaults to COMPLEX.
- **Driver wiring** (from `LensFlare.java:65-67`):
  `flare.setLightPositions(nLights, positions, intensities)` — atlas
  needs a per-frame useFrame block that projects the Sun (and any
  other high-emissive source) into NDC, filters visibility, and
  pushes the array into the effect. Similar pattern to
  `LightGlowInjector.tsx:141-186` (FOV factor) but for multi-light
  screen-space positions.
- **Port structure**:
  1. New `LensFlareEffect.ts` (pmndrs `Effect` subclass).
     Frag shader literally a port of `lensflare.frag.glsl` SIMPLE
     - COMPLEX branches, gated by compile-time `#define` so the
       shader compiles only the branch atlas ships. Uniforms:
       `u_intensity`, `u_viewport`, `u_lightPositions[10]`,
       `u_lightIntensities[10]`, `u_nLights`, `u_color`, + dirt
       samplers carried over from T2.3a.
  2. New `LensFlareInjector` behaviour (or extend the existing
     `LensFlareInjector.tsx`): per-frame, read the scene-graph
     Sun world-pos, project to clip → NDC → uv, compute
     intensity from Sun's apparent brightness or a fixed 1.0,
     push array.
  3. Register COMPLEX as the default variant. PSEUDO remains
     importable but behind an explicit toggle (user setting or
     debug flag — match atlas conventions).
- **Fix shipped** (`a2c6594`):
  1. New file
     `src/components/canvas/scene/effects/LensFlareEffect.ts`
     — pmndrs Effect subclass containing the 1:1 port of
     `lensflare.frag.glsl` `#ifdef complexLensFlare` branch
     (lines 84-161). Helpers `lensFlareCircle`, `regShape`,
     `rnd1`, `rnd2` byte-for-byte. Main with 6-sample
     Archimedean-spiral luma occlusion check. Inline dirt +
     starburst modulation after the clamp (pmndrs architectural
     divergence from Gaia's separate `LensDirtFilter`; same
     pattern θ.4 uses for the same reason).
  2. `src/components/canvas/scene/effects/lensFlareMath.ts`
     extended with `ndcToLensFlareUv`,
     `computeLightIntensityAlpha`,
     `lensFlareSpiralSamplePositions` helpers + constants
     (`LENS_FLARE_FULL_ALPHA_ANGLE = 1e-6`,
     `LENS_FLARE_ZERO_ALPHA_ANGLE = 0.5e-7`,
     `LENS_FLARE_SPIRAL_AMPLITUDE_REF = 0.01`,
     `LENS_FLARE_SPIRAL_N_SAMPLES_REF = 6`).
  3. `src/components/canvas/scene/LensFlareInjector.tsx`
     rewritten to instantiate `LensFlareEffect` and push the
     per-frame Sun UV via `ndcToLensFlareUv`. Off-screen cull
     matches `MainPostProcessor.java:671` pattern
     (`setIntensity(0)` + `clearLights()`, belt-and-suspenders).
     Reduced-motion policy preserved (starburstOffset frozen
     at 0).
  4. PseudoLensFlareEffect preserved — importable for opt-in.
- **Verification stack**:
  - DIFF GATE self-check against `lensflare.frag.glsl:84-207`:
    every divergence documented (rnd rename, STRENGTH 0.35
    hardcode, constant loop bound + break, inline dirt,
    inputColor.a preservation).
  - SUBAGENT VERIFY (Explore/Sonnet, fresh context, cited
    `/tmp/gaiasky/` paths): 10/10 PASS.
  - Math tests: +13 pinned values (NDC→UV projection, alpha
    linstep monotonicity, spiral-position aspect-ratio
    correction).
  - Gates: 890/890 tests, lint clean, build clean.
  - Runtime smoke: COMPLEX ring pattern visible around the Sun
    at 58.5 FPS; zero console errors; WebGL context alive.
- **Status**: done — commit `a2c6594`. No further T2.1 work.

### T2.1-fix — LensFlare visual parity wave ✅ **SHIPPED 2026-05-04** (α `7674523` + β `2f88c6a` + γ `61ece1e`)

User reported huge white halo + chromatic edges + hex blob "exploding"
at 5-30 AU camera distances. Codex review (`gpt-5.2`, read-only against
`/tmp/gaiasky` + working tree) flagged 3 divergences vs Gaia's runtime
lens-flare pipeline. 3-subagent double-check verified+aggravated #2,
clarified #1's mis-attribution of `EffectAttribute.CONVOLUTION` (it's
a read-semantic flag, not auto-downscale).

**Root cause** (novel blindspot, not in Codex): atlas's
`EffectComposer` runs on `HalfFloatType` per
`PostProcessingPipeline.tsx:153`, declared "§5.1 hard invariant" with
stale "Chapman ghost weights" justification (PSEUDO mechanism; T2.1
flipped default to COMPLEX which doesn't use Chapman). HDR throughput
means LensFlare's spiral occlusion sampler reads
`texture2D(inputBuffer, curr_coord).rgb` with values > 1.0 from
ProceduralSun3D's emissive, driving `perLightIntensity > 1` and
amplifying the 10-iteration `lensFlareCircle` accumulator. Gaia's
chain side-steps this via `lightglow.frag.glsl:97 saturate(effectColor

- scene)`LDR-composite — which atlas's pmndrs`BlendFunction.ADD`LightGlow does NOT chain through`inputBuffer`(verified vs`postprocessing/build/postprocessing.js:1335-1365`).

**Fixes**:

- **α (`7674523`)** — single-line LDR clamp inside spiral sampler:
  `clamp(texture2D(inputBuffer, curr_coord).rgb, 0.0, 1.0)`. Emulates
  Gaia's LDR-boundary without changing chain order. Stale "§5.1
  Chapman" comment retired in favor of accurate "Bloom is the actual
  HDR consumer". 18 new pinned tests (numeric invariants + uniform
  contract + shader-source clamp pin).
- **β (`2f88c6a`)** — Bronze slider max 2 → 1 to prevent HDR-leak via
  `u_flareIntensity` exceeding `[0,1]` and feeding back into Bloom.
- **γ (`61ece1e`)** — wire alpha ramp (latent debt close):
  `computeLightIntensityAlpha(sunSolidAngle)` at LensFlareInjector
  replaces hardcoded `1.0`. `sunSolidAngle = (R_sun / dist) ×
starBrightness / fovFactor` mirrors `GraphUpdater.java:182`. New
  `SUN_RADIUS_WORLD_UNITS ≈ 4.654` constant from
  `celestialBodies.ts:13` (696,340 km / 1 AU × 1000 world-units/AU).
  At < 10 kAU ramp returns 1.0 (no visible change); past 10 kAU ramp
  fades flare to zero by 20 kAU per Gaia
  `MainPostProcessor.java:645-653`.

**Browser smoke** (per `feedback_browser_console_per_ship.md`):

- `preview_console_logs level: "error"` → clean after each ship
- `gl.isContextLost() === false` post-fix
- Exploding halo gone — Sun renders as small dot with normal subtle
  glow at 5-30 AU camera distances

**Gates**: 1267/1267 tests (+18 from α), lint + build clean. SUBAGENT
VERIFY 24/24 PASS, 0 flagged.

**Numerical sanity** (post-γ ramp behavior):

- 1 AU: sunSolidAngle ≈ 0.00908 → alpha = 1 (above 1e-6 threshold)
- 10 kAU: sunSolidAngle ≈ 9e-7 → alpha begins fading
- 20 kAU: sunSolidAngle ≈ 4.5e-7 → alpha ≈ 0.45 (mid-ramp)

**Bronze slider (`da6a175`)** retained as user-tuning knob alongside
the fixes; β only reduces the max from 2 to 1.

### T2.1-fix-δ — Half-res lens-flare ping-pong (DEFERRED, ~3-5 d)

Codex flagged Gaia constructs lens flare at `width × fboScale (= 0.4)`
resolution per `MainPostProcessor.java:301`. atlas runs at full composer
resolution. **Why deferred**: pmndrs `Effect` framework doesn't support
per-Effect render-target sizing natively. Fix requires a custom `Pass`
implementation outside pmndrs that:

1. Allocates a dedicated `WebGLRenderTarget` at `width × 0.4` /
   `height × 0.4`.
2. Renders the LensFlare shader into it.
3. Upscales (bilinear) the result and ADDs onto the composer chain.

Quality-of-life improvement (softer ghost edges from natural bilinear
filtering + lower fragment bandwidth) but **not a correctness gap** —
atlas's full-resolution output is mathematically equivalent to Gaia's
half-res-and-upscaled output, just sharper. Re-open if user reports
"flare still too sharp / aliased" after T2.1-fix wave. Not on critical
path.

**Status**: deferred. T2.1-fix-α/β/γ closed the user-perceivable
divergences; δ is the residual 1:1 pixel-match.

### T2.2 — PseudoLensFlare 35-pass blur (**demoted to opt-in on 2026-04-22**)

- **Demotion rationale**: T2.2 re-verification against
  `/tmp/gaiasky/` exposed that the 35-pass blur lives **inside**
  `PseudoLensFlare.java:197-212` (between the flare and dirt
  stages), not "between `PseudoLensFlareEffect` and Bloom" as the
  original ROADMAP text claimed. More importantly: it runs only
  when `lensFlare.type == PSEUDO`, which is **NOT** Gaia's default
  (`config.yaml:606: type: COMPLEX`). Under
  `feedback_default_gaia_fidelity.md`, polishing a non-default
  variant before porting the default violates 1:1 fidelity. T2.1
  (COMPLEX port) now holds the default-path seat; T2.2 becomes
  optional follow-up that's only meaningful for users who
  explicitly switch atlas into the PSEUDO variant.
- **Gaia**: `PseudoLensFlare.java:197-212` pipeline is
  `bias → flare → BLUR (N passes of separable Gaussian) → dirt →
combine`. The blur uses `BlurFilter` with type `Gaussian5x5b`
  (bilinear 5-tap variant, `PseudoLensFlare.java:270`) — NOT the
  generic `Gaussian5x5` default of `BlurFilter.java:41`. Count
  of passes comes from `config.yaml:614 blurPasses: 35`, and
  the blur FBO runs at `config.yaml:621 fboScale: 0.4` (40% of
  viewport), so cost ≈ 35 × 2 separable passes × 0.16 × fullres.
- **Atlas**: blur chain omitted (pmndrs Effect architectural
  limits noted in current `PseudoLensFlareEffect.ts:49-53`).
  Intensity reduced 0.15 → 0.03 (5×) to hide hard-edged artifacts
  at periphery when PSEUDO is active.
- **Options** (only matter if user selects PSEUDO variant):
  - Port the blur chain as a pmndrs `Pass` subclass with an
    internal ping-pong buffer (can't be a plain `Effect` — the
    composer's linear chain can't host multi-pass blur cleanly).
  - Keep current tuned intensity 0.03, document as atlas-native
    (PSEUDO rendering then diverges from Gaia's PSEUDO output
    until a user flips a config).
- **Effort**: 2-3 days to port blur; hours to document the
  atlas-native tuning path.
- **Dependencies**: T2.0 ✅ (`cd626dc`), T2.3a ✅ (`51750c3`),
  T2.1 (COMPLEX must be the default before we re-tune the
  alternate). Not architecturally blocking anything else.

### T2.3 — Native CC-BY-4.0 lens sprite assets (**D3 resolved → option (a)**)

- **Finding**: `lensstarburst.jpg`, `lensdirt.jpg`, `lenscolor.png`,
  `star-tex-03-*` are in Gaia's `$GS_DATA` bundle. No public license
  stated in `/tmp/gaiasky/ACKNOWLEDGEMENTS.md`.
- **Asset reality check** (2026-04-22, during Lens Closure Wave
  scoping): user initially believed Gaia hosted a ~285MB data pack
  containing the lens PNGs. Verified against
  `gaiasky.space/resources/datasets/`: public packs are
  `default-data` (v62, 73 MiB — solar system data only) and
  `hi-res-textures` (v15, 248 MiB — 4K/8K planet surfaces only).
  Neither includes lens PNGs. The `gaiasky.space/licenses/` page
  categorizes software (MPL 2.0), audiovisual (CC-BY), and datasets
  (CC-BY / original) but does NOT cover `tex/base/*.png|jpg` image
  textures. Direct vendoring is therefore not license-safe. Per
  `Settings.java:4351-4353`, the three PNGs live at
  `Constants.DATA_LOCATION_TOKEN + "tex/base/lens{color.png,dirt*.jpg,starburst.jpg}"`
  inside an installed Gaia runtime — NOT in any public download.
  **Reconstruct-natively path confirmed correct.**
- **Resolution** (Gaia-fidelity rule, 2026-04-22): **option (a)**.
  Reconstruct each sprite natively under CC-BY-4.0 to reproduce
  Gaia's visual output (not "stay procedural with a disclaimer" —
  that is the opposite of max fidelity). The permission-request
  path (c) was rejected for latency; no reconstruction blocker
  justifies it.
- **Ship phasing** (2026-04-22 user decision): to unblock pipeline
  verification without waiting for the external AI-generation
  pipeline, T2.3 splits into two phases:

  **T2.3a — Placeholder wiring ✅ SHIPPED (`51750c3`).** The 3
  Gaia originals from `references/gaia-sky-source/` are now at
  `public/textures/lens/{lenscolor.png, lensdirt-low.jpg,
lensstarburst.jpg}` (gitignored via
  `public/textures/lens/*.{png,jpg}`, added to `.gitignore`
  alongside the pre-existing `references/` rule). The procedural
  `DataTexture` bakes in
  `src/components/canvas/scene/effects/lensFlareSprites.ts` are
  replaced by `THREE.TextureLoader().load(...)` that reads
  `${import.meta.env.BASE_URL}textures/lens/...`. The shader
  sampling contract (LinearFilter / generateMipmaps=false /
  ClampToEdge wrap except starburst wrapS=RepeatWrapping for the
  `mod(abs(..),1)` sampling at `lensdirt.frag.glsl:24-26` /
  colorSpace=NoColorSpace matching Gaia's libGDX default) is
  pinned by 7 tests in the new jsdom-env file
  `lensFlareSprites.test.ts`. `LENS_*_SPRITE_SIZE` exports dropped
  (baking-era detail). Runtime smoke confirms all 3 URLs serve
  200 OK under Vite's `base: "/atlas-orbital/"`; loaded images
  arrive at their real Gaia sizes (256×1, 819×461, 502×60 — the
  bakes' 256×1 / 512×512 / 256×1 were atlas inventions). Scene
  renders cleanly at 59.5 FPS with zero console errors.
  **Blocker status**: files at `public/textures/lens/*` are the
  license-ambiguous Gaia originals — MUST NOT be published,
  committed, or bundled. The `.gitignore` rule is the safety
  rail; T2.3b is the remediation. **Placeholder provenance
  fingerprint** (verified matching at ship time by `sha256sum`
  so a future agent can prove by hash-delta that T2.3b actually
  swapped):

  ```
  lenscolor.png         3200 bytes  sha256 d59b923b...  mtime 2023-09-29
  lensdirt-low.jpg     59191 bytes  sha256 c61a00d7...  mtime 2023-09-29
  lensstarburst.jpg    10710 bytes  sha256 71da64eb...  mtime 2023-09-29
  ```

  **T2.3b — CC-BY-4.0 asset swap** (deferred to final asset
  wave, decision 2026-04-23). The Gaia originals stay in place
  at `public/textures/lens/` as gitignored placeholders for the
  duration of regular development; T2.3b is no longer treated
  as an active blocker. The placeholders MUST NOT be published,
  committed, or bundled in any release artifact — the
  `.gitignore` rule is the safety rail. Re-activate T2.3b
  during the final asset-licensing pass (alongside T4.9a' /
  any other deferred placeholder-vs-real-asset swaps). When
  the user drops AI-generated replacements into
  `references/gaia-sky-source/` (validate by hash-delta against
  the fingerprint above AND mtime check — genuine replacements
  MUST show mtimes ≥ `2026-04-22`; failing either check means
  the files are still the originals and the swap is a no-op):
  1. Copy the new files to `public/textures/lens/` overwriting
     the placeholders.
  2. Remove the targeted `public/textures/lens/*.{png,jpg}` rule
     from `.gitignore` so git tracks the new binaries.
  3. Add a CC-BY-4.0 credit line to the root `README.md` and to
     `public/textures/CREDITS.md` (create if absent).
  4. Run `git status` to verify the `.gitignore` removal does
     not accidentally un-ignore unrelated files.
     **Effort**: 2-4 h.

- **Effort**: total T2.3 = 6-12 h after T2.0 lands, across the two
  phases above.
- **Dependencies**: T2.0 (remove stacking before calibrating new
  assets — otherwise the assets tune against the sum of two
  effects and the calibration drifts when sprites go away later).
  T2.3b deferred to the final asset-licensing wave (no longer an
  active dependency for any non-licensing ship).
- **Note**: Milky Way panorama separately available from ESO under
  CC-BY-4.0 — can be vendored for T4.7.

### T2.4 — Tone map + bloom default alignment ✅ **SHIPPED (2026-04-22)**

- **Gaia defaults**: `postprocess.toneMapping.type: NONE`,
  `postprocess.bloom.intensity: 0.0` (`config.yaml`).
- **Atlas defaults (before)**: AgX tone mapping forced in composer
  (`resolver.ts` preset defaults), bloom 0.75-1.1 via visual presets.
- **Fix shipped**: preset tone mapping now defaults to `none`; the
  composer omits `<ToneMapping>` unless the Display panel override
  selects AgX/ACES/Reinhard/Cineon. `VISUAL_PRESETS[*].bloomIntensity`
  now defaults to `0.0`, matching Gaia's `postprocess.bloom.intensity`.
  The user-facing tone mapping dropdown is live instead of persisting a
  no-op value.
- **Dependencies**: none.

### T2.5 — `shadowIntensity` alignment on focused body ✅ **SHIPPED (2026-04-23, `9910eeb`) — Option 1 (empirical floor)**

- **Gaia ground truth**: `LightingUtils.java:49 pointLight.intensity = 1`.
  Per-body per-model point light. No supplemental directional source.
  Every body — focused or not — receives the same `intensity = 1` on
  the Sun-ward face.
- **Atlas before ship**: `visualPresets.ts` shipped `shadowIntensity:
1.3–1.5` across the 5 presets. `useVisualPresetLerp.ts:164-165`
  wrote that value to `SmartSunLight` (DirectionalLight). After T2.4's
  layer-scope fix (`SmartSunLight.tsx:63 layers.set(1)`), only the
  focused body received the directional supplement on top of the global
  PointLight (layer 0, `sunIntensity = 1.0`). Focused body total ≈
  2.3–2.5× Gaia; non-focused bodies at 1.0× already matched Gaia.
- **Atlas after ship (`9910eeb`)**: `shadowIntensity: 0.4` across all
  5 presets. Focused body total ≈ 1.4× Gaia (residual 40% drift).
  `SmartSunLight.tsx:46` default aligned 1.5 → 0.4 for first-frame
  consistency (useVisualPresetLerp overwrites per frame regardless).
- **Why 0.4 specifically**: Three.js couples shadow darkness to
  directional-light intensity (`contribution = intensity * NdotL *
shadowFactor`). Dropping to 0 would make crater/cloud self-shadows
  invisible. 0.4 is the floor that still resolves the shadow without
  lifting the focused-body luminance above ~1.4× Gaia.
- **Residual architectural divergence (documented)**: Gaia's libGDX
  PBR pipeline computes shadow from the point-light per-model shadow
  map. Three.js has no native point-light shadow cubemap for per-body
  shadow casting without custom shader work, so atlas's DirectionalLight
  shadow helper remains. Option 3 (PointLight + shadow-cube-map at
  origin, 3–5 d) would drop the drift to 0 at higher perf cost —
  tracked for later if exact parity becomes a requirement.
- **Dependencies (at ship)**: none; orthogonal to shader ports. JSDoc
  at `visualPresets.ts:33-49` cites the source lines and the Option 1
  rationale.

### T2.6 — `envMapIntensity` alignment ✅ **SHIPPED (2026-04-23, `9910eeb`) — Option 1 (Gaia-exact)**

- **Gaia ground truth**: `/tmp/gaiasky/assets/conf/config.yaml:20`
  `reflectionSkyboxLocation` is for **cubemap reflections only**
  (comment: "Location of the skybox used for cubemap reflections").
  `/tmp/gaiasky/assets/shader/pbr.fragment.glsl:620-621`:
  - `finalAmbient = (ambient * AO) * (vec3(1.0) - F_env)` — scalar-driven
    from `v_data.ambientLight`, NOT a cubemap sample.
  - `finalReflection = reflectionColor * AO` — specular-only (metallic
    path, line 501-516). The skybox never feeds diffuse IBL.
- **Atlas before ship**: `useVisualPresetLerp.ts:171` wrote
  `scene.environmentIntensity = preset.envMapIntensity = 1.9-2.1`
  across presets. Three.js's `MeshStandardMaterial` uses
  `environmentIntensity` as diffuse IBL contribution. Dark side of
  every body received ~1.9× of IBL irradiance that Gaia does not.
  Partially explains why T2.4's `ambientIntensity = 0` did not
  black-out dark sides as expected.
- **Atlas after ship (`9910eeb`)**: `envMapIntensity: 0.0` across all
  5 presets. Dark side now **true black** (no indirect illumination),
  matches Gaia's non-existence of diffuse IBL. JSDoc at
  `visualPresets.ts:33-49` cites `pbr.fragment.glsl:620-621` directly.
- **Resolution chosen**: Option 1 (Gaia-exact 0.0) under
  `feedback_default_gaia_fidelity.md` — D-type decisions resolve
  silently toward Gaia-default. No user-opinion taper applied.
- **Dependencies (at ship)**: none. Runtime smoke (Claude Preview):
  scene renders, zero shader errors, no visual regressions. DIFF GATE
  - SUBAGENT VERIFY both PASS for all 4 lighting axes.

---

## Tier 3 — Scene cinematic (2-3 weeks)

Transforms the scene's "cinematic feel" — lighting, shading, eclipses.

### T3.1 — Rayleigh + Mie atmospheric scattering ✅ **SHIPPED** (θ.5a `c2f05a6` + θ.5b+c `bc0a429` + θ.5d `f64411e`)

- **Gaia**: `assets/shader/atm.fragment.glsl` + `assets/shader/lib/atmscattering.frag.glsl`
  (note: snippet lives under `lib/`, not `snippet/` — ROADMAP-P10 citation drift corrected 2026-04-22)
  — multi-scatter 32-64 samples/px with phase functions and
  scale-depth attenuation.
- **Atlas**: `src/components/canvas/shaders/atmosphereShader.ts:21`
  has only rim-glow Fresnel `pow(max(...), 4.0)`.
- **Visual impact**: #1 cinematic gap. Earth / Mars atmospheres
  currently flat; Gaia is volumetric (sunset reddening, sunrise
  darkening).
- **Effort**: 5-7 days, split across sub-ondas θ.5a-d.
- **Progress**:
  - ✅ **θ.5a** — `c2f05a6` — snippet (`atmscatteringSnippet.ts`) +
    math mirrors (`atmosphereMath.ts` + `.test.ts`, 16 pinned values).
  - ⚠️ **θ.5b** first attempt — `56d0e38` **reverted in `422d794`**.
    Static defaults flickered against the cloud-layer transparent-
    sort. Lesson L26 captured.
  - ✅ **θ.5b+c** — `bc0a429` — combined shader rewrite + per-frame
    uniforms. Runtime smoke L26 maxDelta=0; user live-watch passed.
    **Note**: at ship-time carried 3 numerical drifts (fG=-0.85 not
    +0.76, nSamples=5 not 23, implicit eSun=20 not 10) that slipped
    past DIFF GATE + SUBAGENT VERIFY because both checked what the
    port CLAIMED, not what Gaia Java actually sets. Drifts fixed in
    θ.5d. Lesson L27 captured.
  - ✅ **θ.5d** — `f64411e` — per-body `AtmosphereScatteringConfig`
    interface on `CelestialBody`; `buildAtmosphereUniforms(config)`
    factory derives all scalars from config per
    `AtmosphereComponent.java:107-159`; 3 drifts fixed; atmosphere
    mesh + useFrame block generalized from Earth-hardcoded gate to
    `body.atmosphereScattering != null`. Adding Mars/Venus/Titan
    configs will auto-light-up their atmospheres with no further
    code changes.
- **Dependencies**: port `atmscattering.frag.glsl` snippet first as
  shared include.

### T3.2 — PBR metalness + AO hooks (partially stale; re-audited 2026-04-22 during T3.5 planning)

- **Gaia**: `pbr.fragment.glsl:268,286,300` reads from a packed
  ORM texture with channel order **R=AO, G=roughness, B=metallic**
  (glTF 2.0 / Three.js convention; ROADMAP's original "R=metallic,
  G=roughness, B=AO" claim was wrong). Energy-conservative
  Fresnel-Schlick `F0 = mix(vec3(0.04), diffuse, metallic)` is
  computed at `pbr.fragment.glsl:510`.
- **Atlas (actual, verified 2026-04-22)**:
  - `MeshStandardMaterial` is Fresnel-Schlick by design — atlas
    ALREADY gets correct dielectric specular "for free" from Three's
    built-in shader chunks.
  - `usePlanetMaterials.ts:217-226` wires `map` (albedo),
    `normalMap`, and `roughnessMap` for Earth. `8k_earth_roughness_map.jpg`
    is a dedicated single-channel map in `public/textures/`, not a
    packed ORM texture.
  - `usePlanetMaterials.ts` does NOT wire `metalnessMap` or `aoMap`
    — atlas has no packed ORM textures and no metalness texture for
    any body.
- **Actual gap**: narrower than ROADMAP claim. Two pieces:
  - **Plumbing**: add `metalnessMap` + `aoMap` hooks in
    `usePlanetMaterials.ts`. Trivial (~30 min) once we have
    textures that populate those fields.
  - **Assets**: atlas needs packed ORM (or dedicated metalness + AO)
    textures per body. None exist today. Earth ocean specular
    (probably the main visual gap) would come from pairing a
    metalness≈0 map with a very-low-roughness ocean mask. That's an
    asset-creation project — hours to make a procedural mask for
    Earth, day or more to hand-paint a proper ORM.
- **Effort**: 1-2 days total. Code plumbing 30 min; Earth ORM asset
  creation ~1 day; per-body repeat as assets become available.
- **Dependencies**: none for plumbing; per-body asset work blocks
  each body's visual delta.
- **Status**: pending — deprioritized vs smaller wins (T3.5 shipped,
  T3.6 small next) because plumbing without assets yields zero
  visual change.

### T3.3 — Eclipse geometry (umbra / penumbra / diffraction) ✅ **SHIPPED (`c44f913`)**

- **Gaia**: `/tmp/gaiasky/assets/shader/lib/eclipses.glsl` (123 LOC).
  Umbra = 0.04 × radius (hard-black), penumbra = 1.7 × radius
  (linear shadow ramp), diffraction band = [0.2×, 1.6×] radius
  (orange-brown spectrum × 4x(1-x)×0.3×edgeFade). Terminator
  edge-fade via `smoothstep(-0.1, 0.2, dot_NL)`. Near-side gate
  `dot_NM > -0.15` culls fragments facing away from the eclipsing
  body. Helper `math.glsl:dist_segment_point` for the ray-miss
  distance computation. Integration sites: `pbr.fragment.glsl:477`
  (call #1 to compute shadow) + `pbr.fragment.glsl:676` (call #2
  to blend into fragColor).
- **Atlas (before)**: no eclipse shading. Syzygies invisible —
  user couldn't see solar eclipses (Moon darkening a patch of
  Earth) or lunar eclipses (Earth shadow turning the Moon
  orange-red).
- **Fix shipped** (`c44f913`):
  1. Three new files in `src/components/canvas/shaders/`: - `eclipseMath.ts` — pure-TS mirror of the Gaia math.
     10 pinned constants (`ECLIPSE_UMBRA_CORE_RADIUS_RATIO =
0.04`, `ECLIPSE_PENUMBRA_RADIUS_RATIO = 1.7`,
     `ECLIPSE_DIFFRACTION_START_RATIO = 0.2`,
     `ECLIPSE_DIFFRACTION_END_RATIO = 1.6`,
     `ECLIPSE_EDGE_FADE_LO = -0.1`, `ECLIPSE_EDGE_FADE_HI = 0.2`,
     `ECLIPSE_NEAR_SIDE_DOT_THRESHOLD = -0.15`,
     `ECLIPSE_DIFFRACTION_INTENSITY_SCALE = 0.3`,
     `ECLIPSE_DIFFRACTION_SPECTRUM_SCALE = 0.5`, +
     spectrum endpoints `[0.41, 0.26, 0.013]` /
     `[0.88, 0.42, 0.063]`).
     Helpers: `distSegmentPoint`, `getDiffractionSpectrum`,
     `computeEclipseShading`, `eclipseBlend`. - `eclipseMath.test.ts` — 26 pinned tests covering
     constants + helper edge cases + shading pipeline. - `eclipseShaderPatch.ts` — reusable GLSL template strings
     that interpolate constants from `eclipseMath.ts` via
     string interpolation so math-JS ↔ GLSL parity is
     compile-time guaranteed.
  2. `src/lib/astrophysics.ts` — `CelestialBody.eclipsingBodyId?`
     added with docstring citing Gaia's `eclipsingBodyFlag`.
  3. `src/data/celestialBodies.ts` — Earth gets
     `eclipsingBodyId: "moon"`, Moon gets `eclipsingBodyId: "earth"`.
  4. `src/components/canvas/planet/usePlanetMaterials.ts`:
     - Earth day/night branch extended to compose the eclipse
       uniforms + helpers + output-fragment patch on top of its
       existing shader.
     - New `else if (body.eclipsingBodyId)` branch for
       eclipse-only bodies (Moon) — declares its own world-space
       varyings + uniforms + helpers + patch.
  5. `src/components/canvas/Planet.tsx` — per-frame driver block
     added after the atmosphere update. Looks up eclipsing body
     via `scene.getObjectByName(body.eclipsingBodyId)`, writes
     world-pos + semantic radius + `max(1, distance(receiver,
sun) × 2)` vrScale into the uniforms; sets
     `uEclipsingActive` to 1 when mesh found, 0 when not
     (shader early-outs on the 0 path).
- **Documented divergences** (L22):
  - Outline branch (`#ifdef eclipseOutlines` at
    `eclipses.glsl:79-91`) NOT ported — Gaia debug wireframe
    mode, not production visual.
  - `gs_` prefix on helper functions to avoid collision with
    Three.js ShaderChunk includes.
  - `uEclipsingActive` runtime gate (atlas-added; replaces
    Gaia's compile-time `#ifdef eclipsingBodyFlag`).
  - Single injection site before `<output_fragment>` vs Gaia's
    two-call split (shadow compute at `pbr.fragment.glsl:477`,
    blend at `:676`). Atlas folds both into one inline block
    that modifies `outgoingLight` before the Three.js chunk
    reads it.
- **Verification stack**:
  - DIFF GATE self-check against `eclipses.glsl:33-94`: all
    constants, gates, ramps, diffraction math byte-match.
  - SUBAGENT VERIFY (Explore/Sonnet, fresh context, cited
    `/tmp/gaiasky/` paths): 11/11 PASS.
  - Math tests: 26/26 PASS.
  - Gates: 916/916 tests, lint clean, build clean.
  - Runtime smoke: scene renders at 56.5 FPS, zero console
    errors, WebGL context alive. Visual umbra/penumbra bands
    visible only during actual eclipse events — time-warp to a
    known event (e.g. 2017-08-21 solar eclipse, 2025-03-14
    lunar eclipse) and zoom in on Earth/Moon to observe. Smoke
    scope limited to compile + static render + no flicker.
- **Status**: done — commit `c44f913`.

### T3.4 — Cloud / ring shadow casting cleanup ✅ **SHIPPED (`9c06c16`)**

- **Atlas (before)**: two meshes at cloud scale — a visible cloud
  (`castShadow=false`) plus an invisible shadow caster
  (`meshBasicMaterial(opacity=0) + customDepthMaterial`). Silhouette
  drift risk: the invisible caster's alphaTest used NTSC BT.601 luma
  weights `(0.299, 0.587, 0.114)`, Gaia `luma.glsl:3-4` uses Rec.709
  `(0.2126, 0.7152, 0.0722)`.
- **Gaia**: `cloud.fragment.glsl:168,174` writes depth from the visible
  cloud fragment directly — no separate shadow caster.
- **Fix shipped**: single visible mesh with `castShadow` and
  `customDepthMaterial` attached; NTSC → Rec.709 luma swap; new
  `CLOUD_SHADOW_LUMA_CUTOFF = 0.2` module constant deduplicates the
  threshold. `receiveShadow={false}` added to avoid self-shadow
  flicker (caught by L26 multi-frame smoke as maxDelta=15).
  Documented divergence: atlas keeps the `customDepthMaterial`
  pattern because cloudMaterial runs `depthWrite:false` (T3.6
  CustomBlending correctness), so it cannot serve as its own
  shadow depth source like Gaia does.
- **Status**: done — commit `9c06c16`.

### T3.5 — Earth night-lights terminator tightening ✅ **SHIPPED (`33807b6`)**

- **Atlas (before)**: `usePlanetMaterials.ts:268-285` used
  `nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity)` — cubic
  smoothing over a 0.4-wide band. Leaked 15.6% of night-lights
  texture onto day side at `intensity=0.1` (sun ~5.7° above horizon).
- **Gaia**: `pbr.glsl:98-99` uses `linstep(-0.1, 0.1, -NdotL)` —
  linear ramp over a 0.2-wide band centered on the terminator
  (`linstep` def at `math.glsl:58-61`).
- **Fix shipped**: `nightFactor = linstep(-0.1, 0.1, -intensity)`;
  `linstep` helper inlined into the shader patch; new
  `src/components/canvas/planet/nightLightsMath.{ts,test.ts}` mirrors
  the formula with 9 pinned values. Documented divergence: atlas
  skips Gaia's `selfShadow *= dayFactor` (`pbr.glsl:102`), which is
  ring-surface scope and not needed for Earth.
- **Status**: done — commit `33807b6`.

### T3.6 — Cloud additive blending terminator gate ✅ **SHIPPED (`785c925`)**

- **Atlas (before)**: `usePlanetMaterials.ts:56` used
  `THREE.AdditiveBlending` + `smoothstep(-0.2, 0.2, cloudIntensity)`
  - `mix(1.0, 0.05, nightFactor)`. Additive blend added even dim
    clouds to the background unconditionally → over-bright terminator.
- **Gaia**: `CloudComponent.java:116` sets `BlendMode.COLOR`
  (`GL_ONE, GL_ONE_MINUS_SRC_COLOR`, per `BlendMode.java:18`).
  `cloud.fragment.glsl:144,165` uses
  `1 - linstep(-0.25, 0.12, -NL)` (asymmetric linear band) +
  `clamp(_, 0.03, 1.0)` night floor.
- **Fix shipped**: blend mode swapped to
  `CustomBlending(OneFactor, OneMinusSrcColorFactor, AddEquation)`;
  formula ported 1:1 via new
  `src/components/canvas/planet/cloudTerminatorMath.{ts,test.ts}`
  (8 pinned tests). `linstep` helper injected into the cloud
  material's `onBeforeCompile` (shared Gaia `math.glsl:58-61`
  pattern with T3.5).
- **Status**: done — commit `785c925`.

### T3.7 — Atmosphere exponent parameterization ✅ **MOOT — superseded by θ.5b+c (`bc0a429`)**

- **Original claim**: atlas's `atmosphereShader.ts:21` hardcoded
  `pow(max(..), 4.0)` rim-glow Fresnel, not tunable per planet.
- **Current state (verified 2026-04-22)**: the rim-glow hardcode
  was **removed** when θ.5b+c shipped the Nishita Rayleigh+Mie
  scattering port. Atmosphere now renders via full multi-sample
  integrator (`atmosphereShader.ts:21-46` docstring) driven by
  per-body `AtmosphereScatteringConfig` on `CelestialBody`. No
  exponent parameter exists to parameterize. Bodies without
  `atmosphereScattering` have no atmosphere (atlas matches Gaia
  default behaviour — planet without configured scattering =
  no shell rendered).
- **Status**: moot — the parameter and its hardcode vanished with
  the θ.5b+c ship; no residual work to do. Doc-only correction
  captured 2026-04-22.

### T3.8 — Roughness-map color space audit ✅ **AUDIT CLOSED — `NoColorSpace` verified correct**

- **Atlas**: `usePlanetAssets.ts:145,152` forces
  `colorSpace: THREE.NoColorSpace` on normal + roughness
  texture loads.
- **Audit (2026-04-22)**: chain-of-custody traced for Earth's
  `{2k,8k}_earth_roughness_map.jpg`:
  1. Solar System Scope ships `*_earth_specular_map.tif` as a
     LINEAR grayscale specular intensity map (their documented
     convention — `scripts/bake-earth-pbr.js:11-12,48-53`).
  2. Atlas bake pipeline (`scripts/bake-earth-pbr.js:108-125`):
     - `.grayscale()` (single-channel — linearity preserved).
     - `.negate({alpha:false})` which is `255 - x` (specular →
       roughness inversion — linearity preserved).
     - `.jpeg({quality:85, mozjpeg:true})` (no colourspace
       conversion — sharp's default JPG path preserves byte
       values).
  3. Stored JPG byte = linear roughness × 255. Three's
     `MeshStandardMaterial` roughness sampler reads this byte
     as the linear roughness scalar directly — `NoColorSpace`
     is CORRECT. `SRGBColorSpace` would apply an unwanted
     `pow(x/255, 2.2)` decode, understating roughness on
     rough-surface bands by up to ~4×.
- **Fix shipped**: explanatory comment block added at
  `usePlanetAssets.ts:139-158` documenting the chain-of-custody
  so future agents don't re-audit. No code behaviour change.
- **Status**: done — doc/comment-only ship 2026-04-22. Audit
  closed; sRGB swap NOT required.

### T3.9 — Lightscattering god rays ❌ **NOT PORTING — Gaia dead code (2026-04-22)**

- **Gaia artefacts that exist but are NOT wired into the
  default post-process pipeline**:
  - `assets/shader/postprocess/lightscattering.frag.glsl` —
    60/100-sample volumetric raymarch, decay 0.96815, density
    0.926, weight 0.58767 (per `LightScatteringFilter.java:22-25`
    — note: ROADMAP's pre-correction values "decay 0.95, density
    0.5" were wrong even for the source).
  - `core/src/gaiasky/render/postprocess/effects/LightScattering.java`
    — Effect class, never instantiated.
  - `core/src/gaiasky/render/postprocess/filters/LightScatteringFilter.java`
    — Filter class, only referenced by the dead Effect above.
- **Discovery**: `grep -rn "new LightScattering(" /tmp/gaiasky/core/src`
  returns **ZERO** hits. `MainPostProcessor.java` wires `LightGlow`
  (atlas θ.3) but never `LightScattering`. The GUI button labelled
  `"gui.lightscattering"` (`GamepadGui.java:1029`,
  `PreferencesWindow.java:1187`) toggles `LightGlow`, not the
  inactive scattering effect — the i18n key is historical.
- **Gaia-active equivalent**: `lightglow.frag.glsl` (whose line 2
  comment literally reads "Light scattering implementation"). Atlas
  shipped this as **θ.3 LightGlow** (`a27dc42` + `fdb66ae`), 1:1
  verified. What users see in Gaia's "light scattering" UI toggle
  is already rendered in atlas by θ.3.
- **Decision** (Gaia-fidelity rule
  `feedback_default_gaia_fidelity.md`): atlas does not port dead
  Gaia code. Parity on the active path is already achieved.
  Porting `lightscattering.frag.glsl` would add an effect **Gaia
  itself doesn't ship** — opposite of fidelity.
- **Lesson captured**: **L31** (ROADMAP items can describe Gaia
  DEAD code; check for instantiation / wiring in
  `MainPostProcessor.java` before porting, not just shader file
  existence).
- **Status**: confirmed non-port — doc-only correction 2026-04-22.

### T3.10 — Cascaded Shadow Maps (optional, consider deferring)

- **Gaia**: `CascadedShadowMapRenderPass.java` — 10 cascades,
  `SPLIT_DIVISOR=3`.
- **Atlas**: single `THREE.PCFSoftShadowMap`.
- **Visual impact**: low at solar-system zoom; becomes noticeable
  only for very close planet views.
- **Effort**: 5-7 days.
- **Dependencies**: none.
- **Note**: may be overkill for current atlas scope. Probably deferred.

---

## Tier 4 — Foundations (longer)

High-impact but invasive. Do after Tiers 1-3 unless a specific need
elevates one.

### T4.1 — Camera-relative rendering (jitter fix)

- **Gaia**: `Vector3Q` quad-double precision class
  (`core/src/gaiasky/util/math/Vector3Q.java:19-22`). Subtracts
  `posInv` (quad-precision camera position) before uploading positions
  to float32 uniforms (`AbstractCamera.java:49-50`).
- **Atlas**: `THREE.Vector3` float32 in uniforms. Stars and planets
  upload absolute positions directly. ~1e7× precision loss at far
  distances.
- **Evidence of jitter already in code comments**:
  - `OverlayPositionTracker.tsx` — "Sub-pixel jitter (camera drift,
    focus-tracker smoothing)".
  - `Scene.tsx` — `minDistance={10} // Increased to prevent near-plane
clipping/jitter`.
  - `Starfield.tsx:92` — applies `degrees12/radians12` precision
    helpers on `solidAngle` but NOT on positions.
- **Effort**: 2-3 weeks total. High blast radius — touches every
  position upload path. Broken into sub-waves:
  - **T4.1-α ✅ SHIPPED (2026-04-24, `6105bed`)** — Vector3Q
    building-block math. Pure-TS `quadDouble.ts` (double-double
    primitives: Dekker TwoSum, Veltkamp-split TwoProduct, Hida-
    Li-Bailey qdAdd; 106-bit precision) + `vector3Q.ts` (7-method
    minimum-viable-API Vector3Q: fromDoubles, ZERO, add, sub,
    scl, toDoubles, lenDouble, cpy). 41 pinned tests incl. a
    concrete 50 Gpc camera-relative use case proving sub-meter
    precision preservation under cancellation. Three documented
    divergences: 106-bit double-double vs 128-bit Quadruple
    (JavaScript has no 128-bit primitive; 106 bits > 90 bits
    needed at atlas scale), immutable functional API vs mutating
    Java `set/add/sub`, length via double-sqrt-on-collapsed vs
    full-QD-sqrt. Zero runtime wiring; sets up the precision
    layer for T4.1-β + γ.
  - **T4.1-β-bridge ✅ SHIPPED (2026-04-24, `7b1d093`)** — camera-
    relative Three.js bridge helper. Pure-TS `cameraRelative.ts`
    with two functions: `cameraRelativeVector3(world, camera, out?)`
    (returns `THREE.Vector3`) + `writeCameraRelativeToFloat32(world,
camera, outArray, offset?)` (writes directly to a Float32Array
    slot). Mirrors Gaia's `posInv` pattern (`AbstractCamera.java:49` - `NaturalCamera.java:700-701` `posInv = -pos`, then
    `worldPos.add(posInv)` = `worldPos - cameraPos`); atlas computes
    the subtract directly via `vector3QSub` (algebraic identity, fewer
    ops, equivalent precision). Three documented divergences in file
    header: eager-cache vs per-call (Gaia caches once per frame —
    T4.1-γ may amortize); `THREE.Vector3 → Vector3Q` input boundary
    (caller-side QD low-part is zero, so helper's QD benefit is
    meaningful only at ~1e15+ stellar scales); functional vs mutating
    (R3F `out` scratch idiom). 11 pinned tests cover solar-system
    parity with `THREE.Vector3.sub`, stellar-scale precision, scratch
    reuse + fresh allocation, Float32Array offset writes. Forward-
    looking infrastructure ship — helper not yet wired into call
    sites; that's T4.1-β-wire below.
  - **T4.1-β-wire-α ✅ CLOSED-AS-MOOT (2026-05-04, doc-only)** for
    Starfield. R1 source-read of Gaia's actual star renderer
    showed atlas is already at float32-equivalent parity: - Gaia: `vec3 pos = particlePos - u_camPos;`
    (`assets/shader/star.group.quad.vertex.glsl:72`) with
    `uniform vec3 u_camPos` (line 12 — float32, NOT hi/lo split)
    written via `setUniformf("u_camPos", camera.getPos())`
    (`StarSetInstancedRenderer.java:89`). Gaia's quad-precision
    `Vector3Q posInv` (`AbstractCamera.java:49`, mutated per frame
    at `NaturalCamera.java:700-701`) is truncated to float32 at
    the GPU upload — Vector3Q precision does NOT survive the
    shader boundary. - Atlas: `vec4 viewPosition = modelViewMatrix * vec4(animatedPos,
1.0)` (`Starfield.tsx:148`); `modelViewMatrix.elements` is a
    `Float32Array` so the camera translation is float32 too. - Both code paths end with float32 GPU arithmetic. Different
    structure (atlas: matrix-multiply; Gaia: explicit subtract);
    same precision characteristics. - **Predecessor sweep correction**: the original ROADMAP framing
    "replace ad-hoc `THREE.Vector3.sub`" was inaccurate for the
    star site — grep confirms `Starfield.tsx` has zero `.sub()` /
    `subVectors()` calls; nothing to replace. - **Existing `degrees12/radians12` workaround** at
    `Starfield.tsx:142-143,162-166` handles `solidAngle` precision
    (the actual jitter source the ROADMAP attributed to position
    uploads) — independent fix, stays in place. - SUBAGENT VERIFY (fresh Explore, no parent context) confirmed
    bottom line: "no port is needed on the grounds of mathematical
    equivalence". DIFF GATE PASS (no code change to diff).
  - **T4.1-β-wire-β ✅ CLOSED-AS-MOOT (2026-05-04, doc-only)** for
    Planet meshes. R1 source-read of `assets/shader/pbr.vertex.glsl`
    confirmed: - Lines 93-94: `uniform mat4 u_projViewTrans;` /
    `uniform mat4 u_worldTrans;` — standard libGDX matrix uniforms. - Line 327: `vec4 pos = u_worldTrans * g_position;` - Lines 349-350: `vec4 gpos = u_projViewTrans * pos; gl_Position
= gpos;` — pure `(P × V) × W × position` MVP chain. - Grep for `u_camPos` in `pbr.vertex.glsl`: NO matches. Gaia's
    planet shader does NOT use the explicit camera-relative
    subtract that `star.group.quad.vertex.glsl` uses; it relies on
    the libGDX matrix pipeline. - Atlas's planet rendering (`Planet.tsx:776`
    `groupRef.current.position.copy(pos)` + Three.js
    `MeshStandardMaterial` defaults) goes through Three.js's
    standard `modelViewMatrix * vec4(a_position, 1.0)` chain —
    direct equivalent to Gaia's libGDX MVP. - Predecessor sweep: `Planet.tsx:865`'s `.sub()` call computes
    `velDir = posLater.sub(pos).normalize()` for velocity-arrow
    direction; not a camera-relative position upload, not a port
    target.
  - **T4.1-β-wire-γ ✅ CLOSED-AS-MOOT (2026-05-04, doc-only)** for
    Overlays. `OverlayPositionTracker.tsx:144` uses
    `worldPos.project(camera)` — Three.js's standard NDC projection
    (internally `projectionMatrix × matrixWorldInverse`). Grep for
    `\.sub\(` / `subVectors` in the file: zero matches. No ad-hoc
    camera-relative subtract anywhere; Three.js MVP path is at
    float32 parity with Gaia's matrix-multiply pipeline.
  - **T4.1-β-wire wave CLOSED IN FULL.** All three sites (α + β + γ)
    are float32 matrix-multiply pipelines — atlas's Three.js
    modelViewMatrix ≡ Gaia's libGDX `u_projViewTrans * u_worldTrans`
    in precision behavior. SUBAGENT VERIFY PASS for both Planet and
    Overlay audits (fresh Explore, no parent context). Documented
    architectural divergence: Gaia uses libGDX naming
    (`u_projViewTrans`, `u_worldTrans`); atlas uses Three.js naming
    (`modelViewMatrix`); same MVP math, different uniform names.
  - **T4.1-γ** (~1-1.5 w) — broader adoption + perf pass: any
    remaining upload site using raw `THREE.Vector3` for large
    world positions; measure frame-time impact of the QD math
    on hot paths. Consider per-frame `posInv` cache hook
    (`useCameraPosInv()`) if call-site density makes per-call
    QD recomputation a measurable cost.
- **Dependencies**: none but invasive. T4.1-α + T4.1-β-bridge have
  zero runtime footprint so they're safe to land independently;
  T4.1-β-wire / γ are the invasive pieces.

### T4.2 — Camera cinematics (damping + surface mode + inertial zoom) — sub-wave plan ready, decision 2026-04-23

- **Gaia**:
  - `NaturalCamera.java:987-1000` — proximity-aware friction
    (`counterAmount` curve scaling friction by `(distToCamera −
elevation) / elevation` in `FOCUS_MODE`; cinematic vs
    non-cinematic switch at line 994).
  - `NaturalCamera.java:524-548` — surface-mode flag activation
    (`surfaceModeFlag.set(focus.isPlanet() && distFromFocus <
focus.getRadius() * 2.5 / fovFactor)`). When true, rotation
    handler swaps from `directionToTarget` to `updateRotationFree` - the focus direction tracks pointer-cartesian instead of
    body-center.
  - `NaturalCamera.java:980-1010` — velocity / acceleration /
    friction zoom physics (per-frame `vel` integrates `force` —
    `friction` over `dt`, with the friction term bifurcating on
    `fullStop`).
  - `NaturalCamera.java:1395-1410` — `speedScaling()` returns the
    multiplier the position update multiplies through, derived
    from the smoothed min(closestStar, closestBody, focus)
    distance via `MathUtilsDouble.flint`.
- **Atlas**:
  - `CameraController.tsx` (375 LOC) — orchestrates
    `OrbitControls` from three-stdlib with fixed
    `dampingFactor=0.05` (Scene.tsx:399). No proximity awareness
    in the damping curve.
  - `Scene.tsx:138-192 NormalizedWheelZoom` — wheel events
    accumulate into integer step counts then dispatch
    `dollyIn`/`dollyOut`. Linear snappy feel; no inertia.
  - No surface mode — focus always rotates around the body's
    center regardless of camera distance.
- **Sub-wave ship plan** (pattern: T4.4a-e / T4.5a-δ):
  - **T4.2-α ✅ SHIPPED (2026-04-23, `dae3815`)** —
    proximity-aware damping. `src/lib/camera/proximityDamping.ts`
    ports Gaia's counterAmount curve from
    `NaturalCamera.java:993-997` via the algebraic identity
    `1/((dist-elev)/elev) = elev/(dist-elev)`, then saturates
    via `closeness = ratio/(1+ratio)` to fit OrbitControls'
    `dampingFactor ∈ (0,1]` domain. 9 pinned tests cover the
    constants (BASE=0.05, MAX=0.5), all boundary states
    (no-focus / at-surface / halfway / stellar), monotonicity,
    explicit Gaia-formula identity, and scale invariance.
    `CameraController.tsx` writes the per-frame value inside
    its existing focus useFrame; PRE-CHECK confirmed at
    `OrbitControls.js:191-235` that three-stdlib reads
    `scope.dampingFactor` per `update()` so live mutation
    works without re-init. Documented divergences (header
    comment): `lastFwdAmount` directional gate, `cinematic`
    toggle, `fullStop` precondition (gate not needed because
    OrbitControls' single damping mode is naturally swamped
    by active user-input deltas), and unbounded → bounded
    saturation. SUBAGENT VERIFY caught a missing `fullStop`
    documentation note; fixed pre-commit. Independent.
  - **T4.2-β ✅ SHIPPED (2026-04-23, `06e7f5e`)** — surface-mode
    flag (predicate half). `src/lib/camera/surfaceMode.ts` ports
    `NaturalCamera.java:526-527` `surfaceModeFlag.set(...)` predicate
    exactly: `!gamepadInput && !vr && !isTracking && focusIsPlanet
&& distFromFocus < focusRadius × 2.5 / fovFactor`. Constants
    pinned: `SURFACE_MODE_RADII_MULTIPLIER=2.5` (NaturalCamera.java
    literal — comment says "1.8 radii" but L27 says trust source);
    `SURFACE_MODE_REFERENCE_FOV_DEG=40` (AbstractCamera.java:42
    `TAN_REF_FOV`). `computeFovFactor(fovDegrees)` is exact port of
    `AbstractCamera.java:148` `tan(fov/2) / tan(40/2)` — sub-linear
    in FOV (tan curve, not linear ratio). 13 pinned tests (1151
    total) cover constants, fovFactor identity at 40°, atlas's 45°
    default matches tan-ratio formula, monotonicity, predicate
    boundaries (positive case + at-threshold + not-a-planet + each
    suppressor + radius<=0 defensive + 45° threshold widening +
    narrow-FOV growth + wide-FOV shrink). Store gains
    `surfaceModeActive: boolean` field (default false) +
    `setSurfaceModeActive` setter (dedups so React only re-renders
    on flag flips, not per frame). `CameraController` reads
    `cameraInstance.fov` inside the existing focus useFrame, calls
    `isSurfaceModeActive`, writes via setter; no-focus branch
    explicitly clears the flag. Same try/catch defense as T4.2-α.
    DIFF GATE PASS. SUBAGENT VERIFY: PASS — all 6 divergence
    categories documented (numeric constants, FOV formula,
    suppressors, `diverted` flag, rotation handler, defensive
    radius guard) with file:line citations. **Architectural
    divergence** (documented inline): rotation-handler swap from
    `directionToTarget` → `updateRotationFree` is NOT yet wired —
    atlas's three-stdlib OrbitControls keeps focus-tracking in
    both modes; the surface-mode flag is observable via the store
    so a future T4.2-β-handler ship can swap to a free-look mode
    (likely by repointing `controls.target` at camera+offset OR
    swapping to `FlyControls`). This first ship lands the predicate - signal; the handler swap is the deferred half. Depends on
    T4.2-α (shipped).
  - **T4.2-β-handler (Bronze, SUPERSEDED) ✅ SHIPPED (2026-04-23, `4571e86`)** —
    free-look target swap. Wires the `surfaceModeActive` store flag
    into a real rotation-behavior change. `src/lib/camera/surfaceLookTarget.ts`
    pinned `SURFACE_LOOK_OFFSET_WORLD_UNITS=1.0` + `computeSurfaceLookTarget`
    helper (pure geometry, 7 pinned tests). `CameraController`'s
    focus useFrame gained a branch: when `surfaceModeActive &&
!isFlying`, read `camera.getWorldDirection`, compute
    `controls.target = camera.position + forward × 1.0`, zero the
    focus-tracking `cameraDelta`. Approximation of Gaia's
    `updateRotationFree` (`NaturalCamera.java:1111-1127`) —
    OrbitControls has no free-look mode, so the near-target trick
    collapsed the orbit sphere onto camera-local yaw/pitch.
    **SUPERSEDED by T4.2-β-handler Silver (`e0f7ae1`, 2026-04-23)** —
    predecessor sweep (L29 / `feedback_no_effect_stacking.md`)
    removed `surfaceLookTarget.ts` + test + the CameraController
    branch in the same commit that shipped Silver's pointer-lock
    path.

  - **T4.2-β-handler (Silver) ✅ SHIPPED (2026-04-23, `e0f7ae1`)** —
    pointer-lock first-person look. Replaces Bronze's near-target
    orbit approximation with a genuine Pointer Lock API control
    path that takes over from OrbitControls while `surfaceModeActive`
    is true. Closes all 4 prior surface-mode divergences
    (orbit-around-near-target wobble, mode-boundary target snap,
    polar-angle clamp, no roll). Three new modules:
    `src/lib/camera/surfaceLook.ts` (+21 pinned tests; 3 constants
    — `SURFACE_LOOK_MOUSE_SENSITIVITY_RAD_PER_PX=0.002`,
    `SURFACE_LOOK_ROLL_RAD_PER_SEC=π/2`,
    `SURFACE_LOOK_MAX_PITCH_RAD=π/2-0.01`; 3 pure functions —
    `computeMouseLookDelta` / `clampPitch` / `computeRollDelta`).
    `src/lib/camera/useSurfaceModePointerLock.ts` — hook managing
    the Pointer Lock API lifecycle; attaches mousemove + Q/E
    keydown listeners only while locked; cleans up on unlock.
    `src/components/canvas/SurfaceModeFirstPerson.tsx` — R3F
    component that requests lock on `surfaceModeActive` flip,
    disables OrbitControls during the lock, and applies
    accumulated yaw/pitch/roll via `camera.rotateY/rotateX/rotateZ`
    in useFrame. Ports `NaturalCamera.java:1111-1137`
    (updateRotationFree + updateRoll) + `GameMouseKbdListener.java:
74-80, 152-172` (Q/E roll binding + mouse-move input) at 1:1
    user-visible intent (mouse right → look right, mouse down →
    look down, Q → roll left CCW, E → roll right CW). Documented
    divergences: no acceleration/velocity integrator (Pointer Lock
    already integrates `movementX/Y` since last event); no
    low-pass smoothing (browser/OS RawInput already filters); flat
    sensitivity constant vs Gaia's `1/(dt × 2e2) × rotateSpeed ×
fovFactor × movementMultiplier` chain (constant works at 60+
    FPS); pitch clamp at ±(π/2 − 0.01) for gimbal-lock safety
    (Gaia has no clamp). DIFF GATE + SUBAGENT VERIFY (fresh
    Explore) both PASS with zero undocumented divergences.
    Runtime smoke deferred to user's local browser — preview-MCP
    env reproduces the pre-existing HMR + GPU-watchdog white-
    canvas issue from earlier this session; no new error
    signatures from this ship in console. **T4.2 wave closed at
    full Gaia parity.**

                                                                                                                                **UX refinement candidates** (AAA proposal per
                                                                                                                                `feedback_divergence_aaa_ux.md`, 2026-04-23). All 4 documented
                                                                                                                                divergences are user-perceivable in normal use; listing three
                                                                                                                                tiers so the user can pick the depth of the follow-up:

                                                                                                                                - **Bronze — snap smoothing + clamp lift** (~0.5 d, cosmetic).
                                                                                                                                  Solves #2 (mode-boundary target snap) + #3 (polar clamp in
                                                                                                                                  surface mode). Leaves #1 (wobble) + #4 (no roll) untouched.
                                                                                                                                  Implementation: (a) lerp `controls.target` over ~200 ms
                                                                                                                                  (cubic-out easing) between the focus worldpos and the
                                                                                                                                  `camera.position + forward × 1.0` endpoint when
                                                                                                                                  `surfaceModeActive` flips; add a `targetLerpRef` in
                                                                                                                                  `CameraController` + a tiny `lerpTarget.ts` helper so the
                                                                                                                                  behavior is unit-testable. (b) In the same useFrame branch,
                                                                                                                                  temporarily relax `controls.minPolarAngle` / `maxPolarAngle`
                                                                                                                                  to 0 / π (full sphere) when `surfaceModeActive`, restoring
                                                                                                                                  atlas defaults on exit. No architectural churn; ships in
                                                                                                                                  one commit. Bronze is a band-aid — the wobble remains
                                                                                                                                  because OrbitControls is still the rotation authority.

                                                                                                                                - **Silver — pointer-lock first-person look** (~1-2 d,
                                                                                                                                  recommended default). Solves #1 + #2 + #3 + #4 completely.
                                                                                                                                  Replaces the near-target approximation with a genuine
                                                                                                                                  first-person control path that takes over from OrbitControls
                                                                                                                                  while `surfaceModeActive` is true. Architecture: new
                                                                                                                                  `src/components/canvas/SurfaceModeFirstPerson.tsx` + hook
                                                                                                                                  `useSurfaceModePointerLock.ts`. On entry, call
                                                                                                                                  `canvas.requestPointerLock()`; subscribe `mousemove`; apply
                                                                                                                                  yaw (`camera.rotateY(-dx × sensitivity)`) + pitch
                                                                                                                                  (`camera.rotateX(-dy × sensitivity)`) directly, no target.
                                                                                                                                  Add Q/E keybind for roll (`camera.rotateZ`), matches the
                                                                                                                                  Gaia-equivalent `updateRoll` path at
                                                                                                                                  `NaturalCamera.java:1131-1137`. On exit (`surfaceModeActive`
                                                                                                                                  flips false OR user hits Esc), `document.exitPointerLock()`
                                                                                                                                  + restore `controls.enabled = true`. Full AAA surface-walk
                                                                                                                                  feel (Half-Life / No Man's Sky parity). Closes the T4.2
                                                                                                                                  wave at real Gaia parity instead of approximation.

                                                                                                                                - **Gold — Silver + bespoke surface-mode HUD** (~3-5 d,
                                                                                                                                  atlas polish). Adds on top of Silver: (a) a minimal HUD
                                                                                                                                  that appears during surface mode — crosshair, altitude
                                                                                                                                  readout (camera → focus surface in km), roll-angle
                                                                                                                                  indicator (subtle horizon line), body-relative compass.
                                                                                                                                  (b) Haptic-style rumble via the GamepadAPI when a gamepad
                                                                                                                                  is attached (noop for mouse-only users). (c) An A11y
                                                                                                                                  reduced-motion alternative: disable pointer-lock, fall
                                                                                                                                  back to Bronze's lerp+clamp-lift when `prefers-reduced-
                                                                                                                                  motion` is set OR the user has enabled the reduced-motion
                                                                                                                                  accessibility toggle. Reserve for when surface mode is
                                                                                                                                  promoted to a core feature (probably alongside T4.3
                                                                                                                                  particle system or a planetary-surface texture wave).

                                                                                                                                **Recommended default**: Silver. Bronze is a band-aid that
                                                                                                                                leaves the user-perceivable wobble intact; Gold is over-scope
                                                                                                                                without a concrete user need yet. Silver closes the
                                                                                                                                Gaia-parity gap cleanly and fits atlas's current architecture
                                                                                                                                without a large refactor. User can pick Bronze if they want
                                                                                                                                the quickest path to closing the known issues, or Gold if
                                                                                                                                surface mode becomes central to the atlas product.

  - **T4.2-γ ✅ SHIPPED (2026-04-23, `032cba9`)** —
    inertial zoom physics. `src/lib/camera/zoomPhysics.ts`
    pins three constants + three pure functions for a 1D
    velocity/friction integrator: `ZOOM_IMPULSE_PER_STEP=4.0`
    (logical-steps/sec injection per detent),
    `ZOOM_FRICTION_PER_SECOND=8.0` (closed-form
    `velocity × exp(-friction × dt)`; ~87 ms half-life), and
    `ZOOM_VELOCITY_DEADZONE=0.1` (snap-to-zero floor that
    replaces Gaia's `fullStop` flag). 13 pinned tests (1138
    total) cover constants, accumulation + sign + fractional
    impulses, decay (zero-dt identity, sign preservation,
    long-dt non-overshoot via closed form), and a multi-frame
    convergence integral that confirms a single impulse
    dispatches ≈0.5 logical-steps total (= ∫₀^∞ 4·e^(-8t) dt).
    `Scene.tsx:NormalizedWheelZoom` refactored: wheel handler
    pushes impulses into a `zoomVelocityRef` + dispatches
    "start" only on first impulse after rest; new useFrame
    integrator runs each frame, decays via
    `consumeZoomVelocity`, dispatches fractional
    `OrbitControls.dollyIn`/`dollyOut` via
    `Math.pow(getZoomScale(), |frameSteps|)`, and fires "end"
    when velocity decays below deadzone. PRE-CHECK confirmed
    at `OrbitControls.js:843-852` that public
    `dollyIn`/`dollyOut` mutate internal `scale` then call
    `update()` cleanly (composable across multiple per-frame
    calls). DIFF GATE PASS. SUBAGENT VERIFY (fresh Explore,
    no parent context): PASS w/ caveats — only flagged item
    was the sign convention vs Gaia (`addForwardForce`'s
    positive = forward vs atlas's positive = zoom out per
    DOM `WheelEvent.deltaY > 0`); fix was a header
    clarification confirming the chain is self-consistent
    (`accumulateWheelZoomSteps → addZoomImpulse → dollyOut`
    for positive everywhere). Documented divergences (header):
    1D scalar vs Gaia 3D vector, single global friction (proximity-
    aware coupling deferred to a `T4.2-γ-tighten` pass), deadzone
    replaces fullStop, force-accumulator step collapsed (impulses
    are already discrete), per-body speed scaling preserved through
    `DynamicZoom + getZoomScale()`. Independent of α/β.

- **Effort**: T4.2 total ≈ 8-11 d across α/β/γ; **all three
  shipped** in ~1 d combined actual vs ~8-11 d estimate. Pure-TS
  lib ports with thin wiring landed cleanly — α (damping curve
  setter), γ (velocity buffer + per-frame integrator), β
  (surface-mode predicate + signal). The β rotation-handler
  swap remains as a future T4.2-β-handler refinement (atlas's
  OrbitControls vs Gaia's free-look architecture is a real
  divergence; the flag is observable today).
- **Dependencies**: none. T4.1 (camera-relative rendering)
  remains a separate concern; T4.2 ports input behavior on top
  of atlas's current absolute-world frame.
- **Open decisions**:
  - **Cinematic toggle parity** — Gaia exposes `cinematic` as a
    per-frame boolean (`config.yaml` + GUI). Atlas can either
    expose it as a store flag (mirrors Gaia UX) or hardcode
    cinematic=true (simpler, matches the typical "smooth
    cinematic" feel users want from a solar-system viewer).
    Decision deferred until α ships and we feel the
    non-cinematic damping curve.
  - **NaturalCamera friction term sign** — Gaia uses a "negative
    velocity scaled by counterAmount" friction in
    `NaturalCamera.java:1000`. Atlas's port should mirror that
    exact sign convention; the unit tests pin sample inputs to
    catch a sign flip.

### T4.3 — Particle system pipeline

- **Gaia**: 7+ `particle.*.glsl` shaders, `ParticleSet` component
  (`core/src/gaiasky/scene/component/ParticleSet.java:48`).
  First-class rendering for Asteroids, Clusters.
- **Atlas**: **ZERO particle systems**. No asteroid belt, Kuiper belt,
  dust lanes, star clusters. Only 3 individual asteroids (Ceres, Vesta,
  Pallas) as `Planet` meshes (`src/lib/orbital/analytical/asteroids.ts:53-81`).
- **Visual impact**: entire categories of scene content missing.
- **Effort**: 2-3 weeks (new subsystem).
- **Dependencies**: data loading for particle catalogs.

### T4.4 — Recursive grid port (orientation toggle: Equatorial / Ecliptic / Galactic) ✅ **FULLY SHIPPED** across 6 sub-waves (T4.4a 49fdaf0 → T4.4e-β ae13866)

- **Step 3 PRE-CHECK re-correction (2026-04-22)**: ROADMAP text
  previously said "3 coordinate grids". Gaia R1 shows that's
  misleading — there is **ONE** `GridRecursive` entity
  (`core/src/gaiasky/scene/system/initialize/GridRecInitializer.java`
  creates a single entity per `families.gridRecs` Family). The
  user-facing toggle is an **orientation mode switch** driven by
  `GridRecursiveRadio.java:34-44` on `TOGGLE_VISIBILITY_CMD`:
  changes `transform.setTransformName` between `null`
  (Equatorial), `"eclipticToEquatorial"` (Ecliptic), and
  `"galacticToEquatorial"` (Galactic). The mesh is the same
  recursive grid either way.
- **Step 3 PRE-CHECK (2026-04-23, during T4.4a ship)**: ROADMAP
  said "`gridrec.fragment.glsl` + `gridrec.vertex.glsl`" but only
  the fragment exists. `RenderAssets.java:211` pairs the fragment
  with the shared `shader/default.vertex.glsl`. The `simple_noise.glsl`
  include in the fragment is defensive only — `main()` never calls
  any noise function. Gaia's default `recursiveGrid.style` is
  `CIRCULAR` per `config.yaml:384` (NOT SQUARE), so the port target
  for the default render path is the `circle()` branch.
- **Gaia source**:
  - `assets/shader/gridrec.fragment.glsl` (133 LOC) — circular vs
    square mode via `u_elevationMultiplier`; `dFdx`-based
    screen-space line-width adaptation; 2-level subdivision
    fade via `u_heightScale`; camera-distance encoded in
    `u_tessQuality`. Paired with shared `shader/default.vertex.glsl`.
  - `assets/conf/config.yaml:377-384` recursive grid config:
    origin `[FOCUS|REFSYS]` (default REFSYS), style
    `[CIRCULAR|SQUARE]` (default CIRCULAR).
- **Atlas (pre-port)**: `EclipticGrid.tsx` — custom shader, single-pass,
  radial fade `smoothstep(uFadeStart, uFadeEnd, dist)`. Fixed
  plane, no camera-distance adaptation, no orientation toggle.
- **Sub-wave ship plan** (pattern: θ.5a-d):
  - **T4.4a ✅ SHIPPED (2026-04-23, `49fdaf0`)** — pure-TS math
    mirror. `src/components/canvas/shaders/gridRecMath.ts` exports
    15 constants + 9 helpers covering every GLSL expression in the
    fragment's building blocks; `gridRecMath.test.ts` pins 59
    hand-derived sample values. No runtime surface; the upcoming
    shader port imports these so GLSL literals and TS mirrors stay
    in lockstep. DIFF GATE + SUBAGENT VERIFY 15/15 + 9/9 PASS.
  - **T4.4b ✅ SHIPPED (2026-04-23, `94af1b8`)** — fragment shader
    port + quad mount + predecessor sweep. `circle()`, `square()`,
    `circle_rec()`, `square_rec()`, `main()` composites ported to
    `src/components/canvas/shaders/gridRecShader.ts` (verbatim, with
    numeric literals template-interpolated from T4.4a so TS ↔ GLSL
    stay in lockstep). `GridRecursive.tsx` mounts on a 40k×40k
    horizontal quad via `buildGridRecShaderMaterial()`.
    `gridRecursiveConfig.ts` hosts layout constants so the component
    passes `react-refresh/only-export-components`. 28 new jsdom
    tests. `EclipticGrid.tsx` (341 LOC) + test + helper module
    deleted under `feedback_no_effect_stacking.md`. AU tick labels
    regress pending T4.5 MSDF label path. DIFF GATE + SUBAGENT
    VERIFY both PASS uniform-by-uniform + helper-by-helper. 6
    documented divergences (WebGL1 GLSL 1.00 not 330 core,
    log-depth skipped, `simple_noise` dropped, layout→gl*FragColor,
    opacity-via-uniform, `gridrec*`/`GRIDREC\_` namespace prefixes).
  - **T4.4c ✅ SHIPPED (2026-04-23, `2e42b8c`)** — `getGridScaling`
    runtime driver. `src/components/canvas/shaders/gridRecScaling.ts`
    ports `GridRecUpdater.java:148-160`'s decade-walk + `gridRecLint`
    mirror of `MathUtilsDouble.lint`. `GridRecursive.tsx`'s
    `useFrame` pushes `camera.position.length()` →
    `getGridRecScaling` → `u_tessQuality` + `u_heightScale` per
    frame. 18 new tests covering decade brackets, scale-invariance,
    and the >10^25 fallback. 1 documented divergence: no AU
    conversion (algorithm is scale-invariant, same normalized
    output regardless of unit choice). DIFF GATE + SUBAGENT VERIFY
    6/6 PASS; runtime smoke confirms recursive-ring behavior at
    close camera distances that static-uniform T4.4b ship produced
    a flat pattern at.
  - **T4.4d ✅ SHIPPED (2026-04-23, `379fd2e`)** — orientation
    toggle (Equatorial / Ecliptic / Galactic). `src/lib/gridOrientation.ts`
    ports `Coordinates.getRotationMatrix(α, β, γ) = Ry(γ)·Rz(β)·Ry(α)`
    - the three orientation matrices (OBLIQUITY 23.4392808°,
      galactic Euler R=32.93192 / Q=27.12825 / P=192.85948) + the
      per-orientation color callouts (ccEq=gRed=[219,68,55],
      ccEcl=gGreen=[15,157,88], ccGal=gBlue=[66,133,244]).
      `GridRecursive.tsx` wraps the mesh in a `<group>` with the
      orientation quaternion + mutates `u_diffuseColor` /
      `u_emissiveColor` on flip. Store slice (`gridOrientation`) +
      3-way ChoiceButton radio in `LayersPanel.tsx`. 23 new pinned
      tests. DIFF GATE + SUBAGENT VERIFY 8/8 PASS. Documented
      axis-convention divergence: atlas's "ecliptic" dispatcher
      returns identity (atlas's world frame is ecliptic-aligned
      via planet orbits); Gaia's frame is equatorial so
      null-transform = equatorial inverts the mapping. Inner ring
      uses `outerRGB × α=0.3` instead of Gaia's complementary
      color (atlas-opinion).
  - **T4.4e-α ✅ SHIPPED (2026-04-23, `521ae82`)** — projection-
    lines MATH extraction (camera ↔ focus L-polyline endpoint
    helpers). `src/lib/gridProjection.ts` ports
    `GridRecUpdater.java:171-200`'s `getCFPos` + `getZXLine` +
    `getYLine` + inline driver block. 15 pinned tests covering
    identity, rotations around all three axes, L-corner
    continuity, and two geometric invariants under arbitrary
    rotations (`yB_world === focus − cam`; `zxA_world === −cam`).
    1 documented divergence: float32 vs Gaia's double (render-
    space ≤140k units fits comfortably). DIFF GATE + SUBAGENT
    VERIFY PASS; building-block only, no runtime surface.
  - **T4.4e-β ✅ SHIPPED (2026-04-23, `ae13866`)** — mount + UI +
    store slice. `GridProjectionLines.tsx` renders a 3-point
    continuous L-polyline via drei `<Line>` + `useGaiaSdfLinePatch`
    (T4.6). Store `gridProjectionLines: boolean` (default `true`
    per `config.yaml:381`) + `toggleGridProjectionLines` +
    `LayersPanel` toggle inside the Coordinate Grid sub-section.
    Gated on `showEclipticGrid && gridProjectionLines && focusId
!== "sun"`. **Atlas-world divergence** (documented in JSDoc):
    Gaia's `GridRecUpdater.java:171-200` math operates in
    camera-relative frame (grid mesh itself translated by -cam);
    atlas uses absolute-world so β computes endpoints directly
    from world positions (Sun origin → focus's XZ projection →
    focus). α's Gaia-faithful helpers stay pinned for future
    T4.1 camera-relative rendering port.
- **Effort**: T4.4a/b/c/d all done (~3 d); T4.4e-α + β done
  (~0.5 d). **T4.4 fully closed 1:1 with Gaia.**
- **Dependencies**: none.

### T4.5 — MSDF / 3D text labels + constellations ✅ **FULLY SHIPPED** (α `ed22f53` + β `49a44f9` + δ `7abbc78`; γ retired)

- **Gaia**: SDF font rendering in `font.fragment.glsl:26-28` with
  `smoothstep(0.6 - smoothing, 0.6 + smoothing, dist)`, `u_scale`
  uniform for adaptive AA. Constellation boundaries toggleable.
- **Atlas (pre-T4.5)**: HTML/CSS tooltips only
  (`PlanetOverlay.tsx:54-68`). No 3D text mounted. No
  constellations. `@react-three/drei` is in deps but `<Text>` not
  used.
- **Sub-wave ship plan** (pattern: T4.4a-e):
  - **T4.5-α ✅ SHIPPED (2026-04-23, `ed22f53`)** — pure-TS
    mirror of `font.fragment.glsl`. `src/lib/msdfFontMath.ts`
    exports 3 constants (MSDF_SMOOTHING_DIVISOR=16,
    MSDF_SDF_THRESHOLD=0.6, MSDF_MIN_OPACITY_DISCARD=0.001) +
    6 helpers (smoothing, smoothstep, alpha, discard-opacity,
    discard-alpha, premultiply) + 25 pinned tests. DIFF GATE +
    SUBAGENT VERIFY PASS. No runtime surface.
  - **T4.5-β ✅ SHIPPED (2026-04-23, `49a44f9`)** — drei `<Text>`
    integration for body name labels as an additive opt-in via
    `labelMode: "html" | "sdf"` store slice (default `"html"`,
    a11y-safe). `PlanetLabels3D.tsx` renders one drei `<Text>`
    per body with per-frame mesh lookup cached by id, group
    billboarded toward camera, and screen-stable scaling via
    `(distance/1000)×9`. Self-gates on `labelMode === "sdf" &&
showLabels`; per-body visibility driven by
    `OverlayPositionTracker`'s `showLabel` flag (same collision
    arbitration as HTML mode). `PlanetOverlay.tsx` HTML label
    `<button>` gated additionally on `labelMode === "html"`;
    icon `<button>` stays unconditional (a11y surface in both
    modes). Smoothing uses troika's default `fwidth(distance)`
    vs Gaia's `1/(16 × u_scale)` — documented divergence;
    `MSDF_SMOOTHING_DIVISOR` kept pinned for a future override
    onda. Visibility ramp also a documented divergence: uses
    the boolean `showLabel` flag instead of Gaia's per-body
    solid-angle fade-in from `font.vertex.glsl:21-28` (T4.5-β-ramp
    follow-up if needed).
  - **T4.5-γ — ❌ NOT PORTING** (decision 2026-04-23). Atlas is
    solar-system-first; constellation line-segments are pure
    backdrop-style ornament with no orbital-mechanics value.
    Header kept for traceability against the Gaia source
    (`ConstellationInitializer.java`); no further work scheduled.
  - **T4.5-δ ✅ SHIPPED (2026-04-23, `7abbc78`)** — AU tick
    label re-mount via drei `<Text>`. `GridAuLabels.tsx` renders
    14 SDF text instances (7 AU × 2 axes: X at `(au*1000, planeY,
+250)` and Z at `(+250, planeY, au*1000)`) colored by active
    grid orientation (ccEq/ccEcl/ccGal). Black outline at 0.7α
    for starfield legibility. Used troika-three-text's default
    `fwidth()` smoothing (not Gaia's fixed-scale `1/(16×u_scale)`
    from T4.5-α — troika's formula is device-pixel-ratio-aware
    and adapts to zoom automatically; α's constants remain
    pinned for a future override onda if needed). Gated on
    `showEclipticGrid && showLabels`. Closes T4.4b predecessor-
    sweep regression. Known caveat: label positions align with
    planets only in `realistic` scale mode (didactic mode
    compresses planets via `mapDidacticHeliocentricDistance` but
    labels stay at linear AU — tracked as pre-existing scale-
    mode architectural issue, out of scope for δ).
- **Effort**: all sub-waves shipped or retired. T4.5-α + T4.5-β +
  T4.5-δ ✅ SHIPPED; T4.5-γ retired. No remaining work.
- **Dependencies**: none.

### T4.6 — Quad-SDF line rendering ✅ **SHIPPED (`a6a3644`)**

- **Gaia**: `/tmp/gaiasky/assets/shader/line.quad.cpu.fragment.glsl:20-33`
  SDF feathering — `core = min(cos(PI*x/2), 1-|x|)`;
  `alpha = pow(core, 1.8)`; `cplus = pow(core, 10)` added to
  `rgb` for a bright-core stripe. Wired via
  `config.yaml:243 mode: POLYLINE_QUADSTRIP` (Gaia default);
  `RenderAssets.java:146-155` loads the full
  `line.quad.cpu.{vertex,geometry,fragment}.glsl` set into the
  active render pipeline.
- **Atlas (before)**: `@react-three/drei` `<Line>` (Line2 +
  LineMaterial) with no SDF feathering or bright-core; uses
  `useOrbitalSalience.ts:39-77` for opacity modulation only.
- **Fix shipped** (`a6a3644`):
  1. New `src/components/canvas/shaders/lineSdfMath.ts` —
     pure-TS mirror. Exports
     `LINE_SDF_ALPHA_EXPONENT = 1.8`,
     `LINE_SDF_BRIGHT_CORE_EXPONENT = 10.0` + helpers
     (`lineSdfCore`, `lineSdfAlpha`, `lineSdfBrightCore`).
  2. New `src/components/canvas/shaders/lineSdfMath.test.ts` —
     14 pinned tests.
  3. New `src/components/canvas/planet/useGaiaSdfLinePatch.ts` —
     hook that installs the shader patch via `onBeforeCompile`
     on drei's LineMaterial while preserving LineMaterial's
     own `onBeforeCompile` (which sets `USE_LINE_COLOR_ALPHA`
     based on the transparent flag). Bound to material
     explicitly; forces `needsUpdate = true` to recompile.
  4. `PlanetOrbitLine.tsx` — declares a `localRef` for the hook
     alongside the forwarded `ref`; callback-ref splits the
     Line2 instance into both. `LineLike = Line2 | LineSegments2`
     union reflects drei's runtime type.
- **Documented divergences** (L22):
  - `(v_uv.y - 0.5) * 2.0` skipped — drei's LineMaterial emits
    `vUv.y ∈ [-1, 1]` directly.
  - `layerBuffer` → `gl_FragColor` (single-buffer).
  - `logarithmicDepth()` skipped (Three's `#include <logdepthbuf_fragment>`
    - renderer-level `logarithmicDepthBuffer: true` handles it).
  - Shader-side premultiply → standard GPU alpha blend;
    algebraically equivalent.
- **Verification**: Step 3 PRE-CHECK PASS + R1 source-read +
  DIFF GATE + SUBAGENT VERIFY 10/10 + Gates (930/930 tests,
  lint/build clean) + Runtime smoke (56 FPS, no console errors).
- **Status**: done — commit `a6a3644`.

### T4.7 — Milky Way backdrop ❌ **NOT PORTING as described — folds into T4.3**

- **ROADMAP claim re-checked (2026-04-22)**: "Gaia: panoramic cubemap
  with dust" is inaccurate. L31 check against `/tmp/gaiasky/`:
  - `grep -rn "MilkyWay\|milkyway" /tmp/gaiasky/assets/conf/config.yaml`:
    zero hits for a Milky-Way backdrop; the only skybox reference
    (`reflectionSkyboxLocation: $data/default-data/tex/skybox/gaiasky/`)
    is for **cubemap reflections**, not a visual backdrop.
  - `grep -rn "MilkyWay\|galaxy" /tmp/gaiasky/core/src/gaiasky/scene`
    shows Gaia's MW is a `BillboardDataset` (procedural particle
    set) rendered via `BillboardSetExtractor`, and a
    `GalaxyGenerator` for procedural spiral-galaxy particles. No
    panoramic cubemap anywhere.
  - `/tmp/gaiasky/assets/scripts/showcases/milkyway-affine-transform.py`
    header: "the Milky Way object, which is of type 'billboard set'".
- **Implication under Gaia-fidelity rule**: the ESO panorama path
  was an atlas-opinion shortcut, not a Gaia port. Under
  `feedback_default_gaia_fidelity.md` atlas should render the
  Milky Way via the same billboard-particle mechanism Gaia uses —
  **that port lives inside T4.3 (Particle system pipeline)**.
- **Decision**: T4.7 as originally scoped is **demoted to non-port**
  (atlas-opinion vs Gaia-fidelity). The Milky Way backdrop gap is
  captured inside T4.3's scope expansion (which already enumerates
  "MW particles" alongside asteroid belt + Kuiper belt + clusters).
  A standalone ESO panorama ship would be possible as a future
  atlas-native cinematic preset but is no longer on the
  Gaia-fidelity roadmap.
- **Status**: confirmed non-port 2026-04-22. See T4.3.

### T4.8 — Transparency sorting / OIT ✅ **AUDIT CLOSED — atlas hierarchy sufficient for current scope**

- **Gaia**: explicit per-layer render ordering in Java render system
  (see `core/src/gaiasky/render/RenderGroup.java` +
  `ComponentTypes.java`).
- **Atlas**: `renderOrder` map + painter's algorithm (Three.js
  standard).
- **Audit (2026-04-22)** — refreshed inventory:

  | Layer                           | renderOrder   | File                                         |
  | ------------------------------- | ------------- | -------------------------------------------- |
  | EclipticGrid plane              | -100          | `EclipticGrid.tsx:203`                       |
  | EclipticGrid labels             | -97           | `EclipticGrid.tsx:254` (missed in pre-audit) |
  | Starfield (HYG + NASA variants) | -2            | `Starfield.tsx:535`, `NASAStarfield.tsx:148` |
  | ProceduralSun core              | 0             | `ProceduralSun3D.tsx:599`                    |
  | ProceduralSun glow sprites      | 1-3           | `ProceduralSun3D.tsx:608-622`                |
  | Ring                            | 1000          | `Planet.tsx:443`                             |
  | Arrows / PlanetMotionOverlays   | 2000          | `PlanetMotionOverlays.tsx:20`                |
  | ~~SunScreenFlare~~              | ~~5000-5003~~ | **GONE post-T2.0 (`cd626dc`)**               |

- **Known-risk verification**:
  1. **Cloud + atmosphere edge flicker** — ROADMAP claimed both
     layers were `depthWrite: false` + `AdditiveBlending` and might
     compete in edge-on views. **Resolved**: T3.6 (`785c925`)
     switched clouds from `AdditiveBlending` to `CustomBlending(OneFactor,
OneMinusSrcColorFactor)` = `BlendMode.COLOR`, so clouds no
     longer stack additively with the atmosphere's
     `AdditiveBlending`. Additionally T3.4 (`9c06c16`) resolved
     self-shadow flicker (15-unit maxDelta caught by L26 multi-
     frame smoke) by setting `receiveShadow={false}` on the cloud
     mesh.
  2. **Ring vs planet overlays** — ROADMAP flagged composition
     depends on traverse order. **Not a risk**: ring at 1000,
     overlays at 2000 gives overlays correct on-top rendering
     every frame regardless of scene-graph traversal.

- **Decision**: atlas's current renderOrder hierarchy is
  sufficient for the rendered feature set. No OIT implementation
  needed — the advertised "1-2 weeks OIT" would be justified only
  if atlas adds overlapping translucent volumes (multi-planet
  atmospheres in view, nebulae, etc.) which aren't currently on
  the roadmap.
- **Status**: audit closed 2026-04-22 (doc-only ship). Re-open if
  new transparent-layer categories ship (e.g. T4.3 particle
  system's dust clouds + MW nebulae could reintroduce the
  multi-additive stack).

### T4.9 — Sun rendering audit (procedural-substitute review, 2026-04-23)

**⚠ Original framing was wrong.** The initial audit subagent
fabricated citations (`SunComponent.java:50-70`, `$GS_DATA/tex/base/sun-{surface,glow,corona}`
— neither exists). R1 re-verify (2026-04-23, this-session) traced
Gaia's actual Sun-render path instead of trusting the hallucinated
plan. Findings below.

#### R1 Gaia Sun-render path

- **Star-distance rendering**: the Sun, like every catalog star,
  goes through the shared star-billboard pipeline. Four renderers
  consume `GaiaSky.settings().scene.star.getStarTexture()`:
  - `BillboardRenderer.java:182`
  - `SingleStarQuadRenderer.java:50,230`
  - `StarSetInstancedRenderer.java:49,266`
  - `VariableSetInstancedRenderer.java:65,389`
  - plus the LightGlow post-process (`LightGlowRenderPass.java:43,113,114`).
    All five read `config.yaml:169 textureIndex: 4` → `star-tex-04-*.png`
    (vs `textureIndexLens: 3` → `star-tex-03-*.png`, which atlas already
    vendored in `a9f9bd5` for the LightGlow path).
- **Close-Sun rendering**: when the camera gets close the Sun
  switches from billboard to a body-mesh pipeline. The mesh +
  texture asset for the Sun lives in `$GS_DATA/default-data/data/sol/*`
  (empirically; the source repo does NOT contain the dataset —
  `find /tmp/gaiasky -name "*sun*" -type f` only finds icon PNGs +
  scripting utilities + `NslSun.java` orbital-element code). The
  descriptor that wires the mesh is a JSON/gsc file in the
  dataset pack, not in `/tmp/gaiasky`.
- **No Sun-specific flare sprite in source**. `LensFlaresComponent.java`
  also does not exist. Gaia renders flares via the general
  post-process pipeline (θ.4 PSEUDO / T2.1 COMPLEX, both already
  ported), not via a per-body sprite.

#### Implication for atlas

Atlas's `ProceduralSun3D.tsx` is NOT a "substitute for a specific
Gaia asset". It's an atlas-invention close-up Sun renderer that
uses a procedural Perlin cubemap + hand-authored ray/flare
geometry, rendering INSTEAD of Gaia's body-pipeline + billboard
path. Under Gaia-fidelity the correct framing is:

- **Far-Sun (stellar distances)**: Gaia renders as star billboard
  with `star-tex-04-*.png`. Atlas currently still uses the
  procedural 3D Sun at all distances. **Real divergence**.
- **Close-Sun (body-pipeline)**: Gaia renders from the `$GS_DATA`
  sun-dataset mesh + textures. Atlas uses the Perlin cubemap.
  **Unknowable divergence** (atlas would need the dataset to
  port accurately).

#### Sub-waves (re-scoped, ship-ready)

- **T4.9a' — Sun billboard fallback at stellar distances**
  (noticeable visual impact, 0.5-1 d).
  - **Gaia**: Sun renders as `star-tex-04`-textured billboard via
    `SingleStarQuadRenderer` / `BillboardRenderer` at distances
    beyond the body-pipeline threshold.
  - **Atlas**: always renders `ProceduralSun3D.tsx` regardless of
    distance. Beyond the LightGlow's ~10 AU falloff the 3D sphere
    - rays become visually inconsistent with how atlas renders
      other stars (HYG catalog billboards with `star-tex-03` per
      LightGlow + `star-tex-04`-equivalent Starfield kernel).
  - **Fix shape**: vendor `star-tex-04-low.jpg` to
    `public/textures/stars/` (same workflow as T2.3a / `a9f9bd5`;
    gitignored placeholder pending CC-BY-4.0 replacement). Add a
    distance-gated switch in `Planet.tsx` / `ProceduralSun3D.tsx`
    so the Sun uses the star-billboard at `cameraDistance >
threshold` and keeps the 3D sphere at close range.
  - **Dependencies**: none. Same vendoring pattern as `a9f9bd5`.
- **T4.9b' — Close-Sun dataset port** ❌ **NOT SCHEDULED**
  (decision 2026-04-23, option B). Requires downloading the
  `default-data` pack from gaiasky.space + extracting the Sun
  body descriptor + its texture(s). Atlas's `ProceduralSun3D.tsx`
  (Perlin cubemap + hand-authored ray geometry) covers the
  close-Sun render path acceptably; the gap is documented atlas-
  opinion, NOT a visible regression. Re-open only if a user
  flags close-up Sun fidelity as a noticeable issue. Until then
  no asset acquisition or porting is scheduled.
- **T4.9c — Procedural dwarf-planet surfaces** (cosmetic, NOT a fix).
  - `proceduralSurface.ts` canvas-renders 512×256 per-body
    textures for asteroids + Kuiper bodies when no real survey
    data exists. Gaia does the same fallback (`BodyComponent` at
    runtime falls back to procedural when the descriptor is
    missing texture paths). Atlas matches Gaia's own behavior —
    NOT a divergence, NOT scheduled.
- **Dependencies**: T4.9a' is independent and ship-ready.
- **Effort**: T4.9a' ~0.5-1 d; T4.9b' blocked; T4.9c not scheduled.

---

## Tier 5 — Codex audit 2026-04-23 intake

Fresh-context Codex pass against the current atlas HEAD surfaced 7
divergences + 4 hygiene items. Each finding verified against atlas
source + Gaia source before being accepted (per
`feedback_codex_findings_toward_1to1.md` — Codex can be wrong about
direction). Divergences are classified by loudness per
`feedback_divergence_aaa_ux.md`: **LOUD** = user-perceivable, needs
three-tier AAA proposal; **QUIET** = doc-only or perf-only.

### Tier 5.W — White-canvas remediation wave (2026-04-24, ✅ SHIPPED)

Separate from the Tier 5 port items above. User reported the canvas
going white after the 2026-04-23 session; a 2nd Codex pass (2026-04-24)

- 4 parallel Sonnet subagents (bisect / listener-audit / Zustand-
  cascade / WebGL-research) identified the root cause as a multi-commit
  cumulative physics problem: vertex coordinates at ~1e10 world-unit
  scale during a 100ms race window in `InitialCameraAnimation` triggered
  ANGLE/D3D11 rasterization stalls → Chrome GPU watchdog → WebGL context
  loss. Four fixes landed 2026-04-24:

* **`720f60f` (Phase 1)** — removed `main.tsx` error-listener leak
  (originally added in `b5df427` as a diagnostic but itself leaked
  across Vite HMR) + added 3-strike backoff to `SurfaceModeFirstPerson`
  pointer-lock retry loop.
* **`34f1dde` (Phase 2+3)** — closed the intro race window by flipping
  `setIsIntroAnimating(true)` atomically with the camera position
  write + added defensive try/catch to `InitialCameraAnimation`
  useFrame (only session-era useFrame missing the wrapper). Capped
  `PlanetLabels3D` SDF-mode scale at 1e6 world units (matching
  `SunBillboard`'s `a9fc1bf` cap) + suppressed the component during
  `isIntroAnimating`.
* **`9e84638` (Phase 4)** — added `import.meta.hot.dispose()` handlers
  to `Scene.tsx:handleCanvasCreated` (webglcontextlost/restored
  listeners) + `useSurfaceModePointerLock.ts` (force-exit pointer lock
  on module hot-replace).
* **Doc + lesson update** — lessons.md M5 gained a bullet on
  per-commit gates missing cross-commit cumulative regressions;
  HANDOFF.md updated from 2026-04-18 Wave α to current Phase θ
  position; STATUS.md §NO ACTIVE DRIFTS qualified with the
  2026-04-24 audit context.

Codex's secondary "Descartar" items (assets gitignored, texture
budget heuristic, sRGB inconsistency, env cubemap intensity zero,
first-boot above Gaia default, etc. — 11 items) are real tech debt
but not white-canvas contributors; fileed for a future hygiene wave.

### T5.1 ✅ SHIPPED (2026-04-23, `1612f07`) — Atmosphere dynamic uniforms (P1, LOUD)

**Silver tier** per `feedback_divergence_aaa_ux.md`: all four uniforms
(`fKrESun`, `fKmESun`, `fAlpha`, `nSamples`) now written per frame
unconditionally, matching Gaia's `updateAtmosphericScatteringParams`
write schedule 1:1. `m_ESun` boost (`+= atmFactor * 100f` when camera
inside atmosphere shell) ported exactly. 10 pinned tests cover the
boundary cases + Mars-like config generalization. DIFF GATE PASS.
SUBAGENT VERIFY PASS (zero harmful divergences; only the documented
`!ground` guard omission, which collapses to no-op in atlas's
single-atmosphere-material architecture).

**Original scope (pre-ship, retained for traceability)**:

- **Gaia**: `AtmosphereComponent.java:230-288` recalculates
  `KrESun`/`KmESun` per frame when the camera is inside the
  atmosphere (`camHeightGr < m_fAtmosphereHeight` → `m_ESun +=
atmFactor * 100f`, writes both via `AtmosphereAttribute`); `Alpha`
  and `nSamples` are also written unconditionally per frame via
  `mat.get(AtmosphereAttribute.Alpha).value = alpha` and
  `mat.get(AtmosphereAttribute.nSamples).value = samples`
  (`AtmosphereComponent.java:285-288`).
- **Atlas**: `Planet.tsx:317-330` only updates `v3CameraPos`,
  `v3LightPos`, `fCameraHeight` per frame; `fKrESun`, `fKmESun`,
  `fAlpha`, `nSamples` are set once at material creation
  (`atmosphereShader.ts:188-197`). Descending into the atmosphere
  does NOT boost scattering, so the characteristic "atmosphere
  brightens as you enter it" look is missing.
- **Loudness verdict**: LOUD. User-perceivable every time the
  camera crosses the atmosphere boundary — currently the shell
  looks flat instead of gaining the expected brightness wash.
- **UX refinement candidates** (3-tier):
  - **Bronze** (~0.5 d, partial). Port only the
    `camHeightGr < atmosphereHeight` conditional + per-frame
    `fKrESun`/`fKmESun` write. Leave `fAlpha`/`nSamples` static
    (their per-frame write in Gaia is unconditional with constant
    values, so static is byte-identical for atlas). Closes the
    "atmosphere doesn't brighten on descent" symptom. Docs
    cite the Gaia conditional + justify leaving alpha/nSamples
    static.
  - **Silver** (~1 d, recommended). Bronze + write all four
    uniforms (`fKrESun`, `fKmESun`, `fAlpha`, `nSamples`) per
    frame unconditionally to match Gaia 1:1 (cheap uniform
    writes, no GPU cost; keeps atlas behaviourally identical to
    Gaia if the Gaia code ever changes to condition alpha/nSamples
    on something dynamic). Full fidelity, minimal extra scope.
  - **Gold** (~2 d, atlas polish). Silver + expose atmosphere
    density / scattering-strength sliders in DisplayPanel for
    user tuning (not a Gaia feature; atlas-opinion polish).
    Reserve for when atmosphere tuning becomes part of the
    product story.
- **Recommended default**: Silver. Costs nothing extra on top of
  Bronze and locks atlas to the Gaia write schedule.
- **Dependencies**: none. θ.5b+c already ported the shader; this
  is just wiring more uniform writes into the existing
  `Planet.tsx` useFrame.

### T5.2 ✅ SHIPPED (2026-04-23, `dd02e1a`) — Atmosphere blend mode (P2, LOUD)

**Silver tier** per `feedback_divergence_aaa_ux.md`: one-line swap
`THREE.AdditiveBlending` → `THREE.NormalBlending` at
`usePlanetMaterials.ts:305`, plus inline block documenting the
Three.js → WebGL mapping (`NormalBlending` with non-premultiplied
alpha → `glBlendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA, ONE,
ONE_MINUS_SRC_ALPHA)` per `three/renderers/webgl/WebGLState.js:685`),
the alpha-channel divergence vs Gaia's `SRC_ALPHA` source (visually
invisible — atmosphere never composites against transparent content
in atlas), and the pre-T5.2 AdditiveBlending failure mode (bright
atmospheres over-exposed). DIFF GATE PASS. SUBAGENT VERIFY PASS.

**L32 baseline-review pending**: this change re-bakes any
`e2e/**/*-snapshots/*.png` with an atmospheric shell visible
(Earth, Jupiter, Saturn, Uranus, Neptune). User reviews the PNG
deltas before accepting the re-bake. Typical expected delta: less-
saturated atmosphere rim, darker at the limb, matching Gaia's
reference look.

**Original scope (pre-ship, retained for traceability)**:

- **Gaia**: `AtmosphereComponent.java:88-89` —
  `mat.set(new BlendingAttribute(GL20.GL_SRC_ALPHA,
GL20.GL_ONE_MINUS_SRC_ALPHA))`, standard alpha blend. Atmosphere
  shell alpha composites against the sky color; brighter
  atmospheres don't over-saturate.
- **Atlas**: `usePlanetMaterials.ts:285` — `blending:
THREE.AdditiveBlending`. Atmosphere RGB sums into the
  framebuffer unconditionally; bright atmospheres (Jupiter,
  Saturn cloud bands showing through) can over-expose.
- **Loudness verdict**: LOUD. Visible brightness delta on every
  body with an atmospheric shell. Affects Earth + all gas
  giants.
- **UX refinement candidates** (3-tier):
  - **Bronze** (~0.1 d). One-line swap `AdditiveBlending` →
    `NormalBlending` (maps to `GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA`
    in Three.js). Locks blend to Gaia.
  - **Silver** (~0.3 d, recommended). Bronze + visual regression
    check against atlas's e2e baseline PNGs — the blend change
    will re-bake the visual-diff target, so run baseline review
    (L32 human-gate rule) to confirm the delta is expected.
  - **Gold** (~0.5 d, atlas polish). Silver + Display-panel
    toggle "Atmosphere blend: Realistic (Gaia, alpha) /
    Cinematic (atlas-legacy, additive)" so power users can
    keep the old look if they prefer it.
- **Recommended default**: Silver. Captures the full Gaia
  semantic + L32 baseline review; Gold over-scopes for a single
  blend flag.
- **Dependencies**: none.

### T5.3 — Performance gates (Bloom + LightGlow) (P2, QUIET)

Not LOUD — visual output unchanged. Pure perf opportunities. No
three-tier; straightforward ship.

- **T5.3a ✅ SHIPPED (2026-04-24, `16079aa`)** — Bloom skip at zero
  intensity. The pre-check against Gaia source corrected the ROADMAP's
  original framing: Gaia DOES instantiate the Bloom effect
  unconditionally in `MainPostProcessor.java:329-336`; the gate it
  applies is `bloom.setEnabled(intensity > 0)` on line 335, which
  keeps the program compiled but skips the pass. Atlas can't cheaply
  reproduce the "compiled-but-skipped" state through pmndrs
  `<Bloom>` (no stdlib-exposed `enabled` prop), so the port
  implements the architecturally equivalent outcome by conditionally
  MOUNTING the effect — pass skipped AND shader uncompiled when
  intensity is 0. Tradeoff: one-frame shader compile when the user
  first drags the Bloom slider above 0 (vs Gaia's always-compiled
  startup cost). `src/lib/graphics/bloomGate.ts` exports
  `shouldMountBloom(bloomEnabled, effectiveBloomIntensity)` with
  the exact Gaia truth table pinned by 7 tests. `Scene.tsx:583`
  computes the composite gate; `PostProcessingPipeline.tsx` renames
  `bloomEnabled` → `bloomMounted` to reflect the semantic.
  All 5 `VISUAL_PRESETS` ship `bloomIntensity: 0.0` → out-of-box
  atlas no longer runs the 5-mip downsample + upsample + blend pass.
  DIFF GATE + fresh-Explore SUBAGENT VERIFY both PASS. Test count
  1189/1189 (+7). No visual change.
- **T5.3b ✅ SHIPPED (2026-04-24, `aa31a15`)** — LightGlow v_lums
  in vertex stage. The pre-check found pmndrs postprocessing DOES
  expose per-Effect custom vertex shaders via `mainSupport(uv)`
  (see `postprocessing/build/postprocessing.js:15354-15456
integrateEffect`) — the pre-T5.3b atlas rationale was obsolete.
  `LightGlowEffect.ts` vertex shader now declares `uniform
sampler2D inputBuffer` and `varying vec4 v_lumsA; varying vec4
v_lumsB;`, executes Gaia's Archimedean spiral sampling in
  `mainSupport`, and writes packed per-light lums (8 lights → 2
  vec4 varyings). Fragment shader loses the spiral loop (~400M
  texture samples/sec at 1080p per active light) and gains a
  `getLum(li)` branch-selector that unpacks from the varyings.
  Halo rendering math byte-identical. vec4 packing chosen over
  scalar array varyings for bulletproof cross-GPU compatibility.
  MAX_LIGHTS=8 invariant pinned by new test. Zero visual change.
  DIFF GATE + SUBAGENT VERIFY both PASS. Test count 1190/1190.

### T5.4 ✅ SHIPPED (2026-04-24, `89a4475`) — SDF line patch HMR restore (P2, DEV-ONLY)

- **Gaia**: applies `line.quad.cpu.fragment.glsl:22-33` once via
  `RenderAssets.java` shader binding. No re-patch cycle.
- **Pre-T5.4 atlas bug**: `useGaiaSdfLinePatch.ts:66-97` wrapped
  `LineMaterial.onBeforeCompile` without cleanup. Under React
  StrictMode double-invoke / Vite HMR / component remount, the
  already-patched handler became the new "original" → second
  wrap stacked another SDF block → shader source had the block
  N times per N re-entries. Prod builds (no HMR, no double-mount)
  never hit it; dev-session regression.
- **Fix shipped**: sentinel-tag + cleanup. `ATLAS_SDF_PATCH_TAG`
  - `ATLAS_SDF_PATCH_ORIGINAL` properties on the patched fn make
    re-entry idempotent: if the tag is detected on re-entry, skip
    the wrap (existing patch already does the right thing) + pull
    the real original from the patch's own property so cleanup
    still restores correctly. `useLayoutEffect` now returns a
    cleanup that restores the true original + bumps
    `Material.version` (forces recompile on next render). Strict
    `===` identity check on cleanup prevents clobbering a handler
    something else installed between mount and unmount. Fallback
    `NOOP_ON_BEFORE_COMPILE` satisfies the non-optional three.js
    type contract when the real original was never a function.
- **Tests**: 7 new HMR-scenario pinned tests in a new
  `useGaiaSdfLinePatch.test.tsx` (renamed from `.test.ts` for
  JSX + React Testing Library) — StrictMode double-invoke,
  ten-round remount loop (Codex's N-stacking scenario), cleanup
  restore, version bump, null-ref early-return, no console
  noise. 3 pre-existing shader-contract tests retained.
- **Loudness**: QUIET (dev-only; no production-path visual
  delta). Shipped without three-tier.
- **Gates**: 1197/1197 tests (+7), lint + build clean. DIFF
  GATE + fresh-Explore SUBAGENT VERIFY both PASS across 8
  contract points.

### T5.5 ✅ SHIPPED (2026-04-24, `817aeb4`) — Hygiene cleanup (sub-P2 sweeps)

Codex surfaced 4 low-priority hygiene items. Shipped grouped:

- **T5.5a ✅ AUTO-RESOLVED by T5.3b** (`aa31a15`). Pre-T5.3b the
  LightGlow fragment shader declared `#define N 8` inline while
  pmndrs's `defines` map ALSO set it; with T5.3b's vertex-stage
  refactor, both stages now share the `defines` map as the single
  source (pmndrs prefix-renames to `e0N` at composition time).
- **T5.5b ✅ SHIPPED** — dropped the dead `shader.uniforms.uShadowIntensity`
  write from the cloud material in `usePlanetMaterials.ts:109`
  (uniform was never declared or sampled in the cloud fragment
  shader → WebGLUniforms never allocated a slot → CPU write was a
  no-op with tiny compile overhead). Also removed the vestigial
  `ringShadowIntensity` from the cloud material's useMemo deps
  (prevents unnecessary material rebuilds when ring-intensity
  changes — the dep's only consumer was the deleted write). Ring
  material at lines 645/655 left untouched — it's the valid
  consumer via `planetShadowShader.ts:37,54`.
- **T5.5c ✅ SHIPPED** — deleted `src/components/canvas/shaders/earthDayNightShader.ts`
  - `cloudShader.ts`. Both were pre-Gaia (θ.5-pre) atlas-native
    shader templates superseded by the T3.5/T3.6 Gaia ports that
    now live inside `usePlanetMaterials.ts`. Zero live imports
    confirmed via grep across `src/`. L29 predecessor-sweep rule
    applied.
- **T5.5d ⚠ JUDGMENT CALL — NO MASS EDITS**: Codex flagged "1:1"
  language in Sun billboard / LightGlow / PseudoLensFlare
  historical ship summaries. On re-read, those trechos are
  **factually accurate at ship time** (they describe the state
  of the port at its respective commit SHA). Later waves (T5.3b
  moved LightGlow to vertex stage, etc.) describe their own
  additional divergences in their own §Shipped blocks, which is
  the atlas convention. Mass-editing archival text would rewrite
  history; current-state authority lives in STATUS.md §Shipped
  and ROADMAP.md per-wave blocks, both of which already reflect
  the ships' documented divergences. **Resolution**: no edits;
  the "stale" flag was itself stale.

**Gates**: 1197/1197 tests (no regressions — pure removal). Lint

- build clean. DIFF GATE + fresh-Explore SUBAGENT VERIFY both PASS
  across 5 contract points (cloud dead write, ring material still
  works, useMemo dep correctness, zero stale references to deleted
  shaders, no test references).

### T5.6 — Boot visual-snapshot baseline triage (P2, TEST-GATE) — PARTIAL SHIP (2026-04-24, `d78ddf9`)

- **Symptom** (confirmed): `e2e/boot.spec.ts` visual-identity test
  fails with 806,860 pixel diffs, ratio 0.88. Triage found TWO
  independent issues:
  1. **Baseline is stale**: committed PNG was baked at `a722bba`
     (2026-04-23 pre-remediation-wave) and captured a mid-intro
     grey-canvas frame, NOT a post-boot scene. 50+ commits of
     visual-touching ships landed since.
  2. **Spec was fragile**: `waitForTimeout(3500)` flat wait
     captured the loader at 79 % on current HEAD because the
     Playwright prod-preview env takes ~30 s to reach
     `isSceneReady + displayProgress >= 99.5` (vs ~6 s in dev).
- **Shipped (`d78ddf9`)** — spec hardening:
  - `Loader.tsx` `motion.div` tagged with
    `data-testid="atlas-loader"`.
  - `e2e/boot.spec.ts` waits for the testid to have count 0 with
    a 45 s timeout, then 1 s post-settle.
  - `test.setTimeout(90_000)` to fit the new budget.
  - Runtime verification: new spec captures a clean post-boot
    frame (starfield + SUN label + nav chrome) at
    `test-results/.../boot-frozen-actual.png`.
- **PENDING (L32 human gate)** — PNG baseline re-bake:
  - User reviews the new candidate PNG.
  - If approved: run
    `npx playwright test e2e/boot.spec.ts --workers=1 -g "visual identity" --update-snapshots`
    and commit the updated `boot-frozen-chromium-win32.png`.
  - L32 requires explicit human sign-off before any committed
    visual baseline flips; auto-mode ran the analysis + spec
    fix but stopped here.
- **Loudness**: N/A (test-gate concern, not a runtime UX
  divergence).

### T5.7 ✅ SHIPPED (2026-04-24, `c1685bd`) — Loader displayProgress stall at ready stage (P3)

**Surfaced during T5.6 triage** as "Playwright prod-preview loader-
exit perf" (~30 s vs ~6 s in dev). Root cause identified via a
dense-timeline Playwright diag (500 ms DOM polling, framer-motion
fill-width probe):

- **Root cause**: `Loader.tsx`'s 16 ms `setInterval` that lerps
  `displayProgress` toward the current stage's `progressTarget`
  was **starved** by main-thread work after `isSceneReady` flipped
  true. `getNextLoaderDisplayProgress(prev, 100, "ready")` returns
  100 unconditionally, but the interval callback never fired for
  ~18 seconds. `canExitLoader` (gated on `displayProgress >= 99.5`)
  couldn't advance. Observed: DOM showed "Finalizing scene
  handoff 73 %" for ~20 s with `isSceneReady` already true.
- **Who was starving the interval**: R3F's post-scene-ready work —
  shader-program link for T5.1 atmosphere + T5.3b LightGlow vertex
  - T4.4 grid-rec + atlas's intro camera animation + first paint.
    The main thread was single-digit percent idle for ~18 s.
- **Fix shipped**: derive `effectiveDisplayProgress` in render
  instead of relying on the setInterval to update the state:
  `stageId === "ready" ? 100 : displayProgress`. All consumers
  (`canExitLoader` check, pct text, fill-bar animate target,
  `isFinalizingHandoff`) read the derived value. The interval
  useEffect early-returns at ready-stage so no orphan timer runs.
  Pure derived-state (no setState in effect body; react-hooks/
  set-state-in-effect compliant).
- **Measured impact** (Playwright prod-preview env):
  - Pre-T5.7: `pct === "100%"` first observed at ~31.7 s after visit
  - Post-T5.7: `pct === "100%"` first observed at ~13.8 s after visit
  - Delta: ~18 s improvement in the canExitLoader gate timing.
- **What T5.7 does NOT fix**: the tail between canExitLoader=true
  and AnimatePresence onExitComplete is ~27 s, dominated by
  rAF-throttled framer-motion fade and setTimeout-queued 900 ms
  delay. These are both victims of the same main-thread
  congestion; fixing them requires reducing the post-scene-ready
  shader-compile + first-paint cost. Tracked informally as an
  "aspirational perf" follow-up (not filed as T5.x; not
  blocking).
- **Gates**: 1197/1197 unit tests, lint + build clean. DIFF GATE
  - fresh-Explore SUBAGENT VERIFY (7/7 checks) both PASS.
- **`e2e/boot.spec.ts`** toHaveCount timeout bumped 45 s → 55 s to
  absorb residual variance on the post-T5.7 tail.

### T5.8 ⛔ REGRESSED + REVERTED (2026-05-04) — Preemptive shader compilation (P3)

**Originally shipped** at `9b81b81` (2026-04-24); reverted in working
tree on 2026-05-04 after user opened the dev server in a real browser
and hit `Uncaught TypeError: Cannot read properties of undefined
(reading 'isReady')` from Three.js's internal `checkMaterialsReady`
rAF poller. The Promise `.catch` doesn't intercept that error because
it fires inside Three's polling callback, not the Promise chain. The
unhandled exception killed the GL context, leaving the user with a
white viewport.

**Why my gates missed it**: the original ship's runtime smoke was
"Playwright prod-preview headless env: neutral" — but headless
Playwright runs different code paths than a real browser. I never
called `preview_start` + read browser console errors. Memory rule
`feedback_browser_console_per_ship.md` + lessons.md M5 fourth bullet
codify the new per-ship requirement: every commit's runtime smoke
must read browser-console errors after a real-browser boot.

**Re-enable gating**: T5.8 stays demoted until either (a) Three.js's
`compileAsync` Promise contract correctly intercepts the
`checkMaterialsReady` polling errors (track upstream), or (b) atlas
adds an explicit pre-call validation (filter `scene.children` for
fully-mounted materials with non-undefined `isReady` properties
before passing to `compileAsync`). The 18-second post-scene-ready
main-thread stall remains a real regression — T5.7 closed the
loader-stall consequence; the underlying compile-time concentration
is still unaddressed.

**Original analysis preserved below** for future re-attempts.

---

Aspirational perf follow-up from T5.7. The 18-second main-thread
stall measured after `isSceneReady` flipped was consumed by
**lazy WebGL program link / uniform-location lookup** — Three.js
compiles shaders on first render use, concentrating the cost
into the post-scene-ready frames.

**Fix**: added two `gl.compileAsync(scene, camera)` call sites
to `SceneReadyChecker`:

1. **At `criticalAssetsReady` flip** (useEffect): starts compile
   warm-up the moment starfield provider goes ready, gives the
   GPU driver the 6-frame counter + potential 8 s safety-hatch
   wait to compile programs in parallel.
2. **At scene-ready edge** (useFrame, right before
   `setSceneReady(true)`): catches Suspense-lazy materials that
   mounted after call #1 (atlas's `ProceduralSun3D`,
   `SolarSystem`, post-processing pipeline are all inside
   Suspense boundaries).

Both calls are fire-and-forget (`.catch((err: unknown) => ...)`)
and `typeof gl.compileAsync === "function"` guarded.

**Measurement** (Playwright prod-preview headless): neutral. The
test env uses software rasterization without
`KHR_parallel_shader_compile`, so `compileAsync` degrades to the
synchronous `gl.compile` call + a 10 ms poll loop — main-thread
cost shifts from "lazy during post-ready" to "concentrated at
the two call sites", total work unchanged.

**Expected production impact**: real GPUs have the extension
(modern Chrome on NVIDIA / AMD / Intel / Apple Silicon) →
compile runs on the driver thread → reduces the lazy-compile
main-thread busy time T5.7 diag measured. Not verifiable in CI
without a real-GPU harness.

**Risk**: low. Fire-and-forget, feature-detected, error-caught.
Worst case in the fallback env: compile cost concentrates
differently, no new cost created.

**Gates**: 1197/1197 tests, lint + build clean. DIFF GATE +
fresh-Explore SUBAGENT VERIFY (8/8 checks) both PASS.

### Codex audit — verification trail

- Each finding above was verified against atlas source + Gaia
  source before being accepted. P1 atmosphere: `Planet.tsx:
317-330` + `atmosphereShader.ts:180-197` read and cross-
  referenced with `AtmosphereComponent.java:230-288` (spot-
  checked 2026-04-23). P2 blend: `usePlanetMaterials.ts:285` +
  `AtmosphereComponent.java:88-89` read and cross-referenced.
  Other findings accepted at lower confidence (0.8–0.95);
  triaged + incorporated in their owning sub-items above.
- Codex's "not-a-divergence" findings (no orphan uniform writes
  on main materials, no clear material/geometry leak in
  `ProceduralSun3D`, singleton texture caches deliberate but
  HMR-risk-worthy) are consistent with prior audit passes;
  fold into the existing T4.4 / T4.9 hygiene notes if any
  specific case surfaces later.

---

## Tier 6 — Stellar-zoom procedural rendering (forward-looking)

Atlas can render the Sun procedurally via `ProceduralSun3D` but
HYG-catalog stars are point sprites — zooming into a non-Sun star
shows a distant point, not a procedural surface. This wave adds
"stellar zoom" by generalizing `ProceduralSun3D` to render any
HYG star given physical parameters derived from spectral
classification (with B-V/Ballesteros as fallback).

**Two-pass research** (2026-05-04). **Pass 1 — Sonnet Explore**
proposed a 3-sub-onda plan (T6.1 component refactor + T6.2
stellar-physics helpers + T6.3 camera-distance mesh swap)
estimated at 3-4 days MVP. **Pass 2 — Codex review** (read-only
against working tree + `/tmp/gaiasky/`, run 2026-05-04 — prompt

- output preserved in commit `1d0fb89` history; one-shot
  artifact deleted post-integration per AGENTS.md cleanup
  principle 12) verdict: **SHIP WITH MODIFICATIONS** — Pass-1
  plan held core direction but under-scoped 5 P1/P2 items.
  Sonnet findings spot-checked + 12/12 Codex claims independently
  verified against atlas + Gaia source before integration (per
  `feedback_codex_findings_toward_1to1.md` /
  `feedback_codex_verified_claims_can_still_drift.md`). Revised
  plan below incorporates the verified must-fixes.

**Codex P1 must-fix items (verified, integrated below)**:

1. **HYG focus target missing** (P1, T6.0 added). atlas's
   `CameraController.tsx:127-128,309-310` rejects focus IDs not
   in `BODIES_BY_ID` (verified by direct read). HYG hover writes
   only `hoveredStar` (`StarHoverPicker.tsx:5-9` doc) — no path
   to focus a HYG star today. T6.3's mesh swap is meaningless
   without a focus target; T6.0 must extend the focus system
   first.
2. **HYG binary drops `spect` field** (P1, T6.2 expanded).
   `scripts/build-hyg-binary.js:101` requires only `mag, ci, x,
y, z, pmra, pmdec` (verified). Raw HYG cache has `spect` and
   `lum` columns; ~24.7% of HYG entries are giants per Codex's
   query — Stefan-Boltzmann main-sequence assumption mis-renders
   them by ~10×. T6.2 must add `spect` to the binary AND parse
   luminosity class as primary path; B-V/Ballesteros becomes
   fallback.
3. **Solid-angle threshold (not parsecs)** (P1, T6.3 pivoted).
   Gaia gates close-range star spheres by projected angular size,
   not raw distance — see
   `BillboardEntityRenderSystem.java:122-128` + `config.yaml:150
renderStarSpheres: false` (default OFF). atlas's "10 pc"
   distance threshold mis-handles giants vs. dwarfs (six orders
   of magnitude difference in apparent size at fixed distance).
4. **ProceduralSun3D is origin-locked** (P2, T6.1 expanded).
   `ProceduralSun3D.tsx:558-560` self-gates visibility via
   `state.camera.position.length()` (assumes Sun at origin) and
   line 613 returns `<group position={[0,0,0]}>` (verified by
   direct read). Generalizing to arbitrary HYG positions
   requires removing both, accepting `position` as a prop, and
   moving the visibility gate to the caller.
5. **Sonnet missed ~9 hardcoded uniforms** (P2, T6.1 expanded).
   Verified missing from Pass 1: `uFresnelPower`,
   `uFresnelInfluence`, `uFalloffColor`, `uNoiseFrequency` ×2
   (rays + flares), `uNoiseAmplitude` ×2, `uAmp`, `uHueSpread`
   ×2, plus shader-side literals (`OCTAVES 5`, world-offset
   `+= 12.45`, alpha ramps in `proceduralSunShaders.ts`).

**Full hardcoded-uniform list for T6.1** (verified against
`ProceduralSun3D.tsx`, 2026-05-04):

- Surface noise material (lines 397-405):
  `uFresnelPower=1`, `uFresnelInfluence=0.8`, `uTint=0.2`,
  `uBase=4`, `uBrightnessOffset=1`, `uBrightness=0.6`,
  `uLightView` (light direction).
- Perlin cube noise material (lines 370-375):
  `uSpatialFrequency=6`, `uTemporalFrequency=0.1`, `uH=1`,
  `uContrast=0.25`, `uFlatten=0.72`.
- Glow material (lines 424-431): `uRadius=0.4`, `uTint=0.4`,
  `uBrightness=1.06`, `uFalloffColor=0.5`, `uLightView`.
- Rays material (lines 454-461): `uWidth=0.03/0.05` (quality),
  `uLength=0.45`, `uOpacity=0.03/0.05`, `uNoiseFrequency=8`,
  `uNoiseAmplitude=0.4`, `uAlphaBlended=0.3`, `uHueSpread=0.2`,
  `uHue=0.2`, `uLightView`.
- Flares material (lines 484-491): `uWidth=0.005/0.01`,
  `uAmp=0.5`, `uOpacity=0.2/3`, `uAlphaBlended=0.65`,
  `uHueSpread=0.16`, `uHue=0`, `uNoiseFrequency=4`,
  `uNoiseAmplitude=0.2`, `uLightView`.
- Origin assumptions (architectural):
  `state.camera.position.length()` gate at line 558,
  `position={[0,0,0]}` at line 613.

HYG catalog stores per-star: position (parsecs), apparent
magnitude, **B-V index**, proper-motion RA/Dec
(`hygBinary.ts:20-33`). Raw CSV has `spect` and `lum` columns
that the binary builder drops (Codex finding, verified at
`scripts/build-hyg-binary.js:101`). Gaia's stellar-sphere path
exists but is opt-in (`config.yaml:150 renderStarSpheres:
false`); when enabled it uses
`assets/shader/starsurface.fragment.glsl` (hardcoded
`frequency=80`, `viewport=1500x750` per Codex spot-check). atlas
generalizing T6 to all HYG goes BEYOND Gaia's curated default,
which is acceptable — atlas has no `default-data`-style
per-star body curation, so generalization is the right call.

### T6.0 — HYG focus extension + skip-attribute infrastructure ✅ SHIPPED (`e52561f`, atlas-native)

> **Scope tag**: atlas-native. atlas's R3F focus system + HYG
> instanced-billboard architecture have no Gaia analog (Gaia
> uses libGDX + ECS + scene-graph manipulation directly). DIFF
> GATE applies only to per-decision rationale documentation
> (e.g. "why one resolver vs extending BODIES_BY_ID"); no
> mechanical Gaia-vs-atlas line diff applies.

**Shipped at**: `e52561f`. Two atomic sub-features (predecessor sweep clean — zero pre-existing hits across `src/`):

- **Sub-feature A — HYG focus resolver** (`src/lib/focus/hygFocusResolver.ts` + `.test.ts`, 21 pinned tests). Exports `HYG_FOCUS_PREFIX="hyg:"`, `formatHygFocusId(K)`, `parseHygFocusId(id)` (returns null for curated bodies, malformed prefix, non-numeric / negative / case-mismatched suffix), `resolveHygWorldPosition(K, catalog, out?)` mirroring StarHoverPicker.tsx:88-95's `DISTANCE_SCALE × R_x(obliquity)` rotation chain byte-identical. `HYG_FOCUS_DEFAULT_RADIUS_WORLD = 1.0` placeholder until T6.2's `radiusFromSpect`. **Decision**: parallel resolver, not `BODIES_BY_ID` extension — bloating the curated map with 109k entries violates SRP (`AGENTS.md` §17), HYG positions need different resolution (binary catalog vs orbital propagation), and a separate module gives a clean seam for T4.1-γ camera-relative adoption when stellar zoom crosses the float32 jitter floor (~1e15).

- **Sub-feature B — Starfield skipMask attribute** (`src/components/canvas/starfieldSkipMask.ts` + `.test.ts`, 7 pinned tests). New 1-component InstancedBufferAttribute `a_skipMask` registered on the Starfield instanced geometry (mirrors `a_size` shape). Vertex shader gains `attribute float a_skipMask;` + `|| a_skipMask > 0.5` in the existing alpha/solidAngle zero-out conditional (`> 0.5` matches the `<= 1e-3` floating-tolerance idiom in the same `if`). Default-zero invariant (`new Float32Array(count)`) means every star renders as today; T6.3 will mutate `arr[K]=1` + `attribute.needsUpdate=true` when a procedural mesh spawns for star K.

- **CameraController wiring**: fallback branch in the proximity-damping useEffect (`:309-330`) resolves to `targetRadius = HYG_FOCUS_DEFAULT_RADIUS_WORLD` when `BODIES_BY_ID.get(focusId)` misses but `parseHygFocusId(focusId)` returns valid. `controlsInstance.minDistance` + `cameraInstance.near` get sane values when focused on a HYG star. The other two BODIES_BY_ID gates (focus-setup useEffect at `:127-128` and useFrame at `:375`) early-return cleanly today via `scene.getObjectByName(focusId) ?? null` returning null for HYG stars — full fly-to wires in T6.3.

**Verification trail**: PREDECESSOR SWEEP (zero hits for `hygFocus|HYG_FOCUS|skipMask|a_skipMask|"hyg:"` in `src/`); 1295/1295 tests (+28: 21 hygFocusResolver, 7 starfieldSkipMask); lint clean; build clean (`built in 8.72s`); SUBAGENT VERIFY PASS (cold-read fresh Explore subagent — zero flagged divergences); runtime smoke via Claude Preview MCP (scene renders cleanly, `level:error` console clean, `gl.isContextLost()===false`, multi-frame readPixels invariant pinned across 30 frames at canvas center with zero RGB variance). Steps 3 (PRE-CHECK) + 4 (R1 source-read) explicitly N/A — atlas-native scope tag, no Gaia render path / Java filter / borrowed sub-component to verify.

- **Effort actual**: ~0.5 day (matched estimate).
- **Dependencies**: none. T6.0 is now the **closed** pre-req for T6.3.

### T6.1 — Generalize `ProceduralSun3D` ✅ SHIPPED (`003002c`, atlas-native with Sun-preservation invariant)

**Shipped at**: `003002c`. Externalized 28 visual-identity uniforms + `lightDirection` tuple into a new `StellarVisualProfile` interface; refactored `ProceduralSun3D` to consume the profile via three new optional props (`position`, `visualProfile`, `renderRange`); preserved byte-identical Sun appearance via `SUN_DEFAULT_VISUAL_PROFILE` defaults so the Scene.tsx mount didn't need to change.

- **New module** `src/lib/stellarVisualProfile.ts` (+ test, 32 pinned regression tests). Interface: 28 numeric fields organized by material (granulation 5 / surface 6 / glow 4 / rays 6 / flares 6) + `lightDirection: readonly [number, number, number]`. Constant `SUN_DEFAULT_VISUAL_PROFILE` pins every pre-T6.1 hardcoded uniform value with file:line citations to the original `ProceduralSun3D.tsx` line.
- **`ProceduralSun3D` refactor**: every hardcoded uniform replaced with `visualProfile.<field>`; `lightDirWorld` useMemo now reads `visualProfile.lightDirection`; `<group position={[0,0,0]}>` becomes `<group position={position}>`; visibility gate at the formerly-hardcoded `camera.position.length()` becomes a fallback when `renderRange` prop is undefined (preserves T4.9a' compositing contract for the Sun mount). All useMemo dependency arrays expanded to include the visualProfile fields they consume — verified by SUBAGENT VERIFY.
- **lowRes-conditional uniforms** (rays/flares `uWidth` + `uOpacity`, 4 fields) stay inside `SUN_FX_PROFILES` — they're session-global quality-tier choices, not stellar-class choices, so they have no place in a per-star profile. Same value applies to every star in the scene at a given quality.
- **Scene.tsx mount unchanged**: defaults preserve byte-identical Sun zero-touch. T6.3 will pass explicit values for HYG procedural mounts.

**Verification trail**: PREDECESSOR SWEEP (zero hits for `StellarVisualProfile|SUN_DEFAULT_VISUAL_PROFILE|stellarPhysics|stellarVisualProfile`); 1327/1327 tests (+32 regression); lint clean; build clean (10.22s); SUBAGENT VERIFY PASS (cold-read fresh Explore, byte-identical Sun preservation confirmed via dual-source pinning, all useMemo deps complete, zero blockers); runtime smoke (Claude Preview MCP): scene renders cleanly, `gl.isContextLost()===false`, `level:error` console clean, multi-frame pixel sampling — static regions zero RGB variance (no flicker introduced), Sun core shows expected procedural animation variance (uTime-driven; same shape as pre-T6.1).

- **Effort actual**: ~0.5 day (under-ran the ~1d estimate; pure refactor with strong test pinning).
- **Dependencies closed**: T6.1 unblocked T6.3 alongside T6.0. T6.2 still pending; T6.3 needs all three.

---

### T6.1 — Generalize `ProceduralSun3D` — original spec (preserved for traceability) (~1 d, EXPANDED per Codex, **atlas-native with Sun-preservation invariant**)

> **Scope tag**: atlas-native. `ProceduralSun3D` is an
> atlas-original component — Gaia's stellar surface shader at
> `assets/shader/starsurface.fragment.glsl` is a different
> codebase entirely with hardcoded `frequency=80` /
> `viewport=1500x750`. T6.1 is NOT a port; it's an atlas
> internal refactor. DIFF GATE applies to: (a) the Sun-default
> regression test (every uniform pinned to its current value),
> (b) per-divergence rationale comments where the new prop
> interface intentionally diverges from a previously-hardcoded
> value. No Gaia line-by-line diff is meaningful here.

- **Atlas now**: `ProceduralSun3D.tsx:308-311` accepts only
  `qualityProfileName` + `sunVisualRadiusWorld`. ~17 hardcoded
  uniforms baked for Sun (full list above) PLUS origin-locked
  visibility gate (line 558) PLUS origin-locked group position
  (line 613).
- **Goal**: externalize the full uniform set + delete origin
  assumptions.
  - **New props**: `position: THREE.Vector3` (replaces hardcoded
    origin), `visualProfile: StellarVisualProfile` (full ~17
    uniform set + light direction), `renderRange: "close" |
"far"` (replaces internal `resolveSunRenderRange` call —
    caller now decides visibility).
  - **Internal changes**: line 558 `camera.position.length()`
    deleted; visibility comes from the `renderRange` prop
    (caller decides via solid-angle gate per T6.3). Line 613
    becomes `<group position={position}>`.
  - **Default profile**: `SUN_DEFAULT_VISUAL_PROFILE` constant
    (with all current Sun values) preserves byte-identical
    appearance for the existing Sun mount; regression test pins
    every uniform.
  - **Light direction**: `uLightView` becomes a prop because
    proceduralSunShaders.ts:230-232 use it for alpha modulation
    (Codex finding — verified necessary, not just decorative).
- **Effort**: 1 day actual refactor (more than Sonnet's
  estimate due to expanded scope). Includes regression test
  pinning every uniform's pre-T6.1 value.
- **Dependencies**: none for refactor; T6.0's per-instance
  position resolver feeds the `position` prop downstream.

### T6.2 — Stellar-physics + spect-augmented binary (~1 d, EXPANDED per Codex, **Gaia-informed (Ballesteros) + atlas-native (binary pipeline)**) — **T6.2-α SHIPPED** (`b1f7dc1`); **T6.2-β PENDING** (binary format v2 + re-bake)

**T6.2-α shipped at**: `b1f7dc1`. Atomic ship of the stellar-physics module + visual-profile aggregator. **Module is dormant** until T6.2-β lands the binary format v2 + T6.3 wires the spawn lifecycle. B-V fallback path is fully functional today (every HYG star has B-V); spect-primary path waits on T6.2-β.

- `src/lib/stellarPhysics.ts` (+ test, 62 pinned tests). Exports: `parseSpectralClass(spect)` (handles main-sequence "G2V" / fractional "M5.5V" / supergiant "M2Ia" / binary "M1Ib + B2.5V" → primary only / white-dwarf "DA2" or "WD" / unparseable → null); `temperatureFromSpect(class, subclass)` (linear interp across MK anchors O0=40k → Y0=500K + WD scale DA1=50k → DA9=5.5k); `temperatureFromBV(bv)` (Ballesteros TS port — 1:1 byte-identical to `gaiasky/util/color/BVToTeffBallesteros.java:32-34` with constants `T0=4600, a=0.92, b=1.7, c=0.62`); `radiusFromSpect(spect, absmag?)` (class-aware: MS via table interp + optional Stefan-Boltzmann blend, giants via luminosity-class lookup `Ia=1000 / Ib=500 / I=700 / II=100 / III=30 / IV=3 R_sun`, WD = 0.01 R_sun, fallback 1.0); `stellarVisualProfileFrom({bv, spect?, absmag?})` (aggregator → spreads `SUN_DEFAULT_VISUAL_PROFILE` and overrides `surfaceBrightness × brightnessScaleFromTemperature(tEff)` + `raysHue/flaresHue + hueOffsetFromTemperature(tEff)`).
- **Test surface** pins Sun (G2V), Sirius A (A1V), Vega (A0V), Proxima (M5.5V), Betelgeuse (M2Ia), Antares binary (M1Ib + B2.5V → primary), Arcturus (K0III), Procyon (F5IV), Sirius B (DA2), plus edge cases (empty / garbage / NaN / null / case-mismatched / fractional subclass).
- **DIFF GATE on Ballesteros (Gaia-borrowed)**: every constant value, operation order, and parenthesization byte-identical to source. Cold-read SUBAGENT VERIFY independently confirmed via direct comparison against `/tmp/gaiasky/core/src/gaiasky/util/color/BVToTeffBallesteros.java`.
- **Atlas-native parts** (parser, MK lookup, radius factors, visual profile aggregator) carry per-decision rationale comments + are pinned by test against named-star ground truths. Documented as atlas-opinion approximations, not Gaia behavior.
- Gates: 1389/1389 tests (+62), lint clean, build clean (9.88s). Runtime smoke: scene renders cleanly, `gl.isContextLost()===false`, `level:error` console clean. Module ships dormant (no UI consumer) so byte-identical Sun preserved by definition.

**T6.2-β-α shipped at**: `8c1f37d`. Atlas's HYG binary catalog format upgraded from v1 (16-byte header + 18-byte records) to v2 (20-byte header + variable-length string table + 23-byte records adding `spectIdx: uint8` + `absmag: float32`). **Parser is version-tolerant** — accepts both v1 (existing on-disk files) and v2 (encoder output going forward). v1 buffers populate v2 fields with defaults (`spectStrings=[""]`, zero-filled `spectIndices`, NaN-filled `absmag`) so all consumers see a uniform `HygCatalogData` shape. **Encoder always emits v2**, builds packed string table from unique non-empty `spect` strings (Map-based dedup), sets `HYG_FLAG_HAS_SPECT_AND_ABSMAG` only when input actually carries spect or finite absmag. Magic stays `"HYG1"` (identifies family; version field discriminates structure). `HygCatalogData` extended with `spectStrings: string[]` + `spectIndices: Uint8Array` + `absmag: Float32Array`; `HygCatalogHeader` gains `hasSpectAndAbsmag: boolean`. `encodeHygStar` signature gains optional `spectIdx` + `absmag` parameters. 25 pinned tests cover format-identity, v2 round-trip (with edge cases: dedup, null-spect, NaN-absmag, spectIdx clamp, overflow), v1 backcompat (manual buffer construction), and error paths. T6.0's `hygFocusResolver.test.ts` mock buffer extended with v2 default fields. Gates: 1402/1402 tests, lint clean, build clean (9.17s). SUBAGENT VERIFY: PASS (cold-read fresh Explore — version-tolerance correct, type safety enforced, format-spec doc matches code byte-for-byte). Runtime smoke: scene renders with thousands of stars (existing on-disk `hyg-v1-*.bin` v1 files load through new parser without regression), `gl.isContextLost()===false`, `level:error` console clean.

**T6.2-β-β remaining**: extend `scripts/build-hyg-binary.js` to read `spect` + `absmag` columns from the source CSV and pass them to `encodeHygCatalog`. Re-bake `public/data/hyg-stars/hyg-v1-{low,medium,high,full}.bin{,.gz}` (one-time `npm run build:hyg` run; the parser already supports both versions so the on-disk format flips from v1 → v2 with no code change in consumers). Pure data ship — no parser/encoder change. Lifts the spect-primary path from "B-V fallback only" to "spect on ~80% of HYG catalog, B-V fallback on the rest".

---

### T6.2 — Stellar-physics + spect-augmented binary — original spec (preserved for traceability) (~1 d, EXPANDED per Codex, **Gaia-informed (Ballesteros) + atlas-native (binary pipeline)**)

> **Scope tag**: hybrid. The Ballesteros formula is
> Gaia-borrowed (already mirrored in
> `starfieldShaderMath.ts:74` GLSL) — DIFF GATE applies
> line-by-line for the TS port. The HYG binary pipeline
> (`build-hyg-binary.js`, `hygBinary.ts`) and the spectral
> classification helpers (`parseSpectralClass`, MK lookup,
> `radiusFromSpect`) are atlas-native — no Gaia equivalent
> (Gaia uses libGDX + its own catalog format). DIFF GATE
> applies to the Ballesteros math only; for the rest, document
> rationale + pin tests against known stars.

- **Atlas now**: `scripts/build-hyg-binary.js:101` reads only
  `mag, ci, x, y, z, pmra, pmdec`. Raw HYG cache has `spect` +
  `lum` columns dropped at build. `starPhysics.ts` deals with
  Gaia-style pseudo-size only (NOT physical radius — see file
  header comment at `:19-26`).
- **Goal**: spectral data path as primary; B-V as fallback.
  - **Build script**: extend `build-hyg-binary.js` to also read
    - emit `spect` (string) and `absmag` (number). Spect entries
      quantized as a small string-table index (~50 unique class
      strings cover the whole catalog) to keep the binary compact.
  - **Binary parser**: `hygBinary.ts` reads the new fields back
    into `HygCatalogData`. Re-bake the binary cache (one-time
    script run); existing baked artifacts at
    `public/data/hyg-*.bin` get regenerated.
  - **Stellar physics lib**: new `src/lib/stellarPhysics.ts`
    (+ `.test.ts`) exporting: - `parseSpectralClass(spect: string) → { class, subclass,
luminosityClass } | null` — primary path; handles "G2V",
    "M2Ib", "M1Ib + B2.5V" (binary syntax), "WD", "DA" (white
    dwarf), etc. - `temperatureFromSpect(class, subclass) → number` — MK
    lookup table (or interpolation along subclass within
    class); covers O0-M9 + dwarfs/giants/white dwarfs. - `temperatureFromBV(bv: number) → number` — Ballesteros
    formula (TS port of `starfieldShaderMath.ts:74`); used as
    fallback when `spect` is absent or unparseable. - `radiusFromSpect(spect, absmag?) → number` (solar radii) —
    class-aware: main-sequence dwarfs use Stefan-Boltzmann +
    mass-luminosity, giants use class-specific lookup
    (`I/II/III/IV/V` luminosity-class → radius factor),
    white dwarfs return ~0.01 R_sun. - `stellarVisualProfileFrom(starData) → StellarVisualProfile` —
    aggregator. Tries spect first; falls back to B-V if needed.
    Returns the profile T6.1's component consumes.
  - **Test pinning** (Codex-suggested set + atlas extension):
    Sun (G2V), Sirius A (A1V), Vega (A0V), Proxima (M5.5V),
    Betelgeuse (M2Ib — giant), Antares (M1Ib + B2.5V —
    binary/giant), one white dwarf if `spect` parsing supports
    it (Sirius B "DA2" likely target). 7+ pinned values per
    helper.
- **Effort**: 1 day (was 0.5 d Sonnet; expanded for spect path
  - binary re-bake + extra tests).
- **Dependencies**: T6.0 (skip attribute) is independent;
  T6.2's binary re-bake doesn't affect it. T6.2 + T6.0 can ship
  in parallel.

### T6.3 — Solid-angle-gated star mesh swap (~1-2 d, PIVOTED per Codex, **Gaia-informed (solid-angle gate pattern)**)

> **Scope tag**: Gaia-informed. The solid-angle threshold
> pattern mirrors `BillboardEntityRenderSystem.java:122-128`
> (Codex-verified) and the single-mesh proximity policy
> mirrors `ModelEntityRenderSystem.java:429-443`. DIFF GATE
> applies line-by-line for the threshold formula + the
> single-mesh gating logic against those Gaia files. The
> hysteresis (Codex Rec 5) is an atlas-added refinement —
> document the divergence rationale (Gaia's static-camera
> assumption doesn't suffer from threshold oscillation atlas's
> dampened-camera does). The procedural-mesh lifecycle (R3F
> useEffect cleanup, ShaderMaterial dispose) is atlas-native
> R3F idiom — no Gaia diff applies.

- **Atlas now**: HYG stars are sprite-only. T6.0 adds focus
  - skip infra; T6.1 adds general procedural component;
    T6.2 adds physics. T6.3 wires them together.
- **Goal**: when a HYG star is FOCUSED _and_ its projected
  angular radius exceeds a threshold, spawn a procedural mesh
  via T6.1 + T6.2. Match Gaia's pattern (per
  `BillboardEntityRenderSystem.java:122-128`).
  - **Threshold gate with hysteresis** (per Codex Rec 5,
    integrated 2026-05-04): two thresholds with a 2× cushion
    to prevent spawn/dispose oscillation when camera sits near
    the boundary. `STELLAR_MESH_ENTER_RAD = 1e-3 rad` (~0.057°,
    spawn-mesh threshold) + `STELLAR_MESH_EXIT_RAD = 5e-4 rad`
    (~0.029°, despawn threshold). Gate formula: when no mesh,
    spawn iff `solidAngle > ENTER_RAD`; when mesh active,
    despawn iff `solidAngle < EXIT_RAD`. Where `solidAngle =
starRadiusWorld / distanceToCamera` and `starRadiusWorld =
T6.2's radiusFromSpect(spect) × R_SUN_WORLD_UNITS`.
    Both values tunable via runtime smoke. **Comparison with
    T4.9a'**: `SUN_BILLBOARD_THRESHOLD_AU = 100` is a single
    threshold without hysteresis — that worked because
    sprite/billboard swap is cheap (zero allocation, just a
    visibility flip). T6.3's procedural mesh has higher cost
    (per-spawn `ShaderMaterial` allocation + cubemap render-
    target + dispose lifecycle), so jitter at the boundary is
    expensive. Hysteresis is cheap insurance against the
    expensive case.
  - **Single-mesh policy**: only the FOCUSED HYG star gets a
    mesh. Hovered/nearby stars stay sprites. Mirrors Gaia's
    "render proximity star model" pattern at
    `ModelEntityRenderSystem.java:429-443`.
  - **Lifecycle**: spawn on focus + threshold-crossed; despawn
    on focus-changed OR threshold-uncrossed. Material disposal
    handled in `useEffect` cleanup return. T6.0's skip-mask
    write/clear synchronizes sprite suppression with the
    mesh's life.
  - **LOD**: lower-quality `qualityProfileName` for non-Sun
    stars (the Sun keeps full quality due to its atlas-level
    importance). Tunable per atlas's quality-profile system.
- **Effort**: 1-2 days. Includes Playwright e2e zoom-in/out
  smoke (per Codex finding — vitest+jsdom can't exercise R3F
  mount + WebGL cubemap-target lifecycle).
- **Acceptance criteria** (per Codex Rec 6, integrated
  2026-05-04 — concrete and falsifiable):
  1. **Named-star zoom cycle**: focus on each of Sirius A,
     Vega, Proxima, Betelgeuse in sequence; per star, zoom-in
     past `STELLAR_MESH_ENTER_RAD` then zoom-out past
     `STELLAR_MESH_EXIT_RAD`, twice (= 2 cycles per star ×
     4 stars = 8 transitions total).
  2. **Single-mesh invariant**: at any frame, exactly ONE
     procedural stellar mesh is active in the scene (or zero
     if no HYG star is focused at sufficient angular size).
     Asserted via scene-graph traversal in the e2e harness.
  3. **Single-sprite-suppressed invariant**: when a mesh is
     active for star K, Starfield's skip-mask attribute has
     `skipMask[K] === 1` and only that one slot. All other
     109k+ stars render normally.
  4. **No flicker**: `readPixels` sample at the focused-star
     screen center across ≥30 frames during steady-state hold
     (post-transition, pre-zoom-out) shows ≤1-step variance.
     Mid-transition variance is allowed; flicker during steady
     state is a fail.
  5. **No shader compile errors**: `gl.getProgramInfoLog` is
     empty for every spawned material; `gl.isContextLost() ===
false` throughout.
  6. **No accumulating console.error**: per
     `feedback_browser_console_per_ship.md`, console error
     count is stable across the full 8-transition smoke run.
     Re-read between cycles to detect leak signatures.
- **Dependencies**: T6.0 + T6.1 + T6.2.

### T6.4 — Class-tuned granulation + corona density (optional, ~3-5 d)

- **Atlas now (post-T6.3)**: granulation Perlin noise frequency
  is generalized via `StellarVisualProfile.granulationSpatialFreq`
  but defaulted to a single value. Corona density is similarly
  flat.
- **Goal**: scale Perlin frequency by stellar radius / spectral
  class. Hot O-stars: thin convection zones, low-frequency
  granulation. Cool M-dwarfs: deep convection, high-frequency
  granulation. Corona density scales with luminosity class
  (giants: extended; dwarfs: compact). Class-specific lookup
  tables (or smooth interpolation along T_eff) implemented in
  `stellarPhysics.ts`.
- **Effort**: 3-5 days, mostly visual tuning + per-class
  reference comparisons.
- **Dependencies**: T6.1 + T6.2 + T6.3 (needs end-to-end zoom
  path working before tuning makes sense).

### T6.5 — Limb darkening + magnetic features (optional, ~1-2 w)

- **Goal**: class-dependent limb-darkening coefficients
  (Kurucz-table-style); class-specific magnetic-feature density
  (O/B: few visible spots; M dwarfs: dense spot fields,
  potentially flare-dominated). Production-quality polish.
- **Effort**: 1-2 weeks.
- **Dependencies**: T6.4 shipped; user judgment that polish is
  worth the tax.

### T6 wave summary (post-Codex revision)

- **MVP (first stellar-zoom ship)**: T6.0 + T6.1 + T6.2 + T6.3 ≈
  **3.5-4.5 days** (was 3-4 d Sonnet, +0.5-1 d for HYG focus
  extension + spect-augmented binary). Lets users zoom into any
  HYG star and see a procedural surface that color-shifts with
  spectral classification (giants don't mis-render) and respects
  Gaia's solid-angle gating pattern.
- **Polish path**: T6.4 + T6.5 add ~5-15 days for class-specific
  granulation, corona, limb darkening, magnetic features.
- **Codex P3 nice-to-haves (deferred, capture for tracking)**:
  Morgan-Keenan interpolation (more accurate than discrete
  thresholds), class-tuned shader constants beyond uniforms
  (e.g. `OCTAVES`, world-offset `+= 12.45` shader literals
  flagged at `proceduralSunShaders.ts:22-24`), optional
  Gaia-style "render-star-spheres" toggle (atlas's T6.3 is
  default-on; Gaia's is opt-in via `config.yaml:150`).
- **Dependency on T4.1-γ**: T6.3's mesh-spawn path puts the
  camera at distances where world-units cross 1e15 (HYG stars
  at parsec × DISTANCE_SCALE × close-zoom scale). Float32 jitter
  becomes user-visible at that scale → T4.1-γ camera-relative
  adoption fires as a follow-up. The T4.1 wave's QD math
  (`vector3Q.ts`) + bridge helper (`cameraRelative.ts`) are the
  pre-staged infrastructure for that adoption.
- **Verification trail**: 12/12 Codex claims (4 per section ×
  3 sections + cross-cutting) independently verified against
  atlas + Gaia source before integration. Original prompt + raw
  Codex output preserved in commit `1d0fb89` history (one-shot
  artifacts deleted post-integration per AGENTS.md cleanup
  principle 12); synthesized findings inline via P1/P2 must-fix
  annotations above. Per
  `feedback_codex_findings_toward_1to1.md`: every Codex finding
  pulls T6 toward Gaia parity (solid-angle gate from
  `BillboardEntityRenderSystem.java:122-128`; spect-driven class
  detection matches Gaia's `MODEL_VERT_STAR` pipeline at
  `ParticleSetExtractor.java:73`).

---

## T-Closeout — Pre-release asset-licensing audit (final wave)

Single-onda final cleanup before public release. Runs AFTER all
other waves complete (or whenever the user calls it). The user
defers this consciously during development (placeholders are fine
while in dev — no legal problem yet, decision 2026-05-04);
T-Closeout fires when atlas approaches public-release readiness.

### T-Closeout.1 — Asset-licensing report (~0.5 d, doc-only)

- **Goal**: compile every asset under `public/textures/` and
  `references/gaia-sky-source/` into a single licensing report
  at `docs/ASSET-LICENSING-REPORT.md`. Per asset:
  - File path
  - Original source (Gaia / Solar System Scope / NASA / USGS /
    atlas-procedural / ESO / other)
  - License status (CC-BY-4.0 / public-domain / MPL-2.0 /
    unspecified / blocked)
  - Vendoring authorization (yes / pending / blocked)
  - Replacement strategy (CC-BY-4.0 AI-gen / ESO panorama vendor /
    keep / regenerate procedurally / contact rightsholder)
- **Output**: single `docs/ASSET-LICENSING-REPORT.md` file.
- **Effort**: 4-8 hours.
- **Dependencies**: all asset-using waves shipped (T6 included if
  it ships before closeout — stellar-zoom may add procedural
  textures or none, depending on T6.4/T6.5 scope).
- **User action after report**: review items flagged "blocked" /
  "unspecified"; supply CC-BY-4.0 replacements or approve
  alternative strategies (procedural / different source / drop
  the feature).

### T-Closeout.2 — Per-asset swap (asset-by-asset, deferred)

- Runs only after T-Closeout.1 surfaces user decisions.
- Each blocked asset gets its own swap commit per the strategy
  the user picks.
- Effort: 2-4 hours per asset (includes hash-delta / mtime
  verification + `.gitignore` rule cleanup + README/CREDITS
  update).
- Dependencies: T-Closeout.1's report + user-supplied
  replacements.

**Currently DEFERRED-TO-CLOSEOUT** (per user decision 2026-05-04):

- **T2.3b** — CC-BY-4.0 lens sprite replacement
  (`public/textures/lens/{lenscolor.png, lensdirt-low.jpg,
lensstarburst.jpg}`). Originally targeted post-T2.1; deferred
  per user direction — placeholders stay through development.
- **T4.9a' real-asset swap** — `star-tex-04-low.jpg` for the Sun
  billboard at stellar distances. Currently byte-identical to
  `star-tex-03-low.jpg` placeholder. Deferred per user
  direction.
- Any future asset-blocked items added between this commit and
  T-Closeout firing should also be queued under this section
  (see also T6.4/T6.5 if they introduce per-class textures).

---

## Out of scope (documented, not pending)

- Anaglyph / VR / dome projection shaders (`cubemapprojections.frag.glsl`,
  `geometrywarp.frag.glsl`, `anaglyph.frag.glsl`, `reprojection.frag.glsl`).
- Gravity distortion (`gravitydistortion.frag.glsl`) — novelty
  black-hole effect.
- Volume raymarching (`raymarching/torus.frag.glsl`,
  `raymarching/volumeclouds.frag.glsl`) — no atlas use case.
- SVT sparse virtual texturing (`svt.detection.fragment.glsl`) —
  infrastructure scope too large.
- Spacecraft TLE tracking, binary stars, variable-star light curves,
  nebulae procedural morphology — scene-graph breadth beyond current
  scope.
- SSR (screen-space reflections) — disabled in Gaia default; deferred.
- Motion trails / proper motion animation — user preference (deprioritized
  in favor of lens effects).

---

## Decisions (resolved 2026-04-22 under Gaia-fidelity rule)

Durable rule: **when a decision has a "match Gaia" branch and an
"atlas opinion / procedural / stay as-is" branch, pick Gaia**. See
memory `feedback_default_gaia_fidelity.md`. The D2-D5 resolutions
below follow mechanically from that rule — no further user input
required.

| Key    | Question                                                 | Resolution                                                                                                                                                    |
| ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Which starfield source was in the reference screenshots? | **Moot** — θ.1/θ.1b shipped 1:1 Gaia per P10 diff; reference-screenshot attribution no longer blocks anything.                                                |
| **D2** | COMPLEX vs PSEUDO lens flare?                            | **(a) Port COMPLEX** — Gaia `config.yaml` ships `lensFlare.type: COMPLEX` (`MainPostProcessor.java:280-312`). PSEUDO kept as secondary variant until tuning.  |
| **D3** | Lens sprites strategy?                                   | **(a) Native CC-BY-4.0** — reconstruct `lensstarburst`, `lensdirt`, `lenscolor`, `star-tex-03-*` to match Gaia's visual output. Not "stay procedural".        |
| **D4** | Tier order?                                              | **Prioritize by fidelity-gap size.** Within unblocked set, biggest ⭐ gap first. Current winner: **T3.1** (Rayleigh+Mie, labelled #1 cinematic gap).          |
| **D5** | Tone map + bloom defaults?                               | **Gaia parity.** Match `config.yaml` exactly: `toneMapping.type: NONE`, `bloom.intensity: 0.0`. Atlas-opinion values move behind a user setting, not default. |

---

## Asset licensing summary

| Asset                                                                                | License                              | Vendor OK?                      |
| ------------------------------------------------------------------------------------ | ------------------------------------ | ------------------------------- |
| Planet textures (2K / 8K for Earth, Mars, Moon, Jupiter, Saturn)                     | Solar System Scope + NASA + USGS mix | Already vendored in `public/`   |
| Milky Way panorama (ESO fulldome)                                                    | CC-BY-4.0                            | Yes — T4.7                      |
| Lens sprites (`lensstarburst.jpg`, `lensdirt.jpg`, `lenscolor.png`, `star-tex-03-*`) | None stated in `ACKNOWLEDGEMENTS.md` | **No** — must create or request |
| Gaia Sky code                                                                        | Mozilla Public License 2.0           | Yes for porting                 |

---

## Gaia Sky source index

Cloned at `/tmp/gaiasky/`.

### Shaders

- `assets/shader/postprocess/*.frag.glsl` — 40+ post-process shaders
  (bloom, lens flares, light glow, CA, vignette, film grain, motion blur,
  light scattering, SSR, FXAA, NFAA, levels, mosaic, tone mapping, etc.).
- `assets/shader/*.glsl` — scene shaders (`billboard.*`, `pbr.*`,
  `atm.*`, `cloud.*`, `star.*`, `starsurface.*`, `particle.*`, `line.*`,
  `grid.*`, `font.*`, `dust.*`, `skybox.*`).
- `assets/shader/lib/` + `assets/shader/snippet/` — shader includes:
  `logdepthbuff.glsl` (34 shaders use it), `colors.glsl` (RGB↔HSV),
  `math.glsl` (47 uses), `pbr.glsl` (GGX + Schlick), `eclipses.glsl`,
  `atmscattering.frag/vert`, `luma.glsl`, `specular.glsl`,
  `parallaxmapping.glsl`, `iridescence.glsl`.

### Configuration

- `assets/conf/config.yaml` — all graphics / scene / postprocess /
  camera defaults.
- `assets/archetypes/attributemap.json` — scene-graph entity attribute
  definitions.

### Java code

- `core/src/gaiasky/render/MainPostProcessor.java` — post-process
  orchestrator, wiring of all effects.
- `core/src/gaiasky/render/system/` — scene rendering systems (line,
  particle, star, shadow passes).
- `core/src/gaiasky/scene/camera/` — camera modes (Focus, Free,
  Spacecraft, Game) with damping / friction / surface mode logic.
- `core/src/gaiasky/util/math/Vector3Q.java` — quad-double precision
  class used to avoid jitter at astronomical distances.
- `core/src/gaiasky/scene/component/` — ECS components (ParticleSet,
  Billboard, Model, Atmosphere, Cloud, Ring).

### Documentation

- `LICENSE.md` — MPL 2.0.
- `ACKNOWLEDGEMENTS.md` — texture provenance (Solar System Scope,
  Tom Patterson, Phil Stooke, USGS). **Note**: lens sprites not
  individually attributed — licensing unclear.
