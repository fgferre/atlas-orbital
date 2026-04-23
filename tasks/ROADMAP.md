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

  **T2.3b — CC-BY-4.0 asset swap** (blocks on user delivery).
  When the user drops AI-generated replacements into
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
  T2.3b additionally blocks on user delivery of CC-BY-4.0 assets.
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
- **Effort**: 2-3 weeks. High blast radius — touches every position
  upload path.
- **Dependencies**: none but invasive.

### T4.2 — Camera cinematics (damping + surface mode + inertial zoom)

- **Gaia**:
  - `NaturalCamera.java:987-1000` — proximity-aware friction
    (`counterAmount = focus.getDistToCamera() / elevation`).
  - `NaturalCamera.java:1429-1445` — surface mode proximity rotation
    slowdown.
  - Velocity + acceleration + friction zoom physics.
- **Atlas**:
  - `CameraController.tsx` — `OrbitControls` with fixed
    `dampingFactor=0.05`.
  - `NormalizedWheelZoom` — linear snappy zoom.
  - No surface mode.
- **Effort**: 1-2 weeks.
- **Dependencies**: none.

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

### T4.4 — Recursive grid port (orientation toggle: Equatorial / Ecliptic / Galactic)

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
  - **T4.4c** — per-frame drivers + orientation toggle. Implements
    `getGridScaling(body.distToCamera, ...)` to drive
    `u_tessQuality` + `u_heightScale`; UI toggle for
    Equatorial / Ecliptic / Galactic via transform matrix swap
    (`GridRecursiveRadio.java:34-44`); projection lines when
    origin=REFSYS + focus active. Effort: 2 d.
- **Effort**: T4.4a done (0.5 d), T4.4b done (1 d incl. refactor
  - predecessor sweep), T4.4c 2 d → remaining ~2 d.
- **Dependencies**: none.

### T4.5 — MSDF / 3D text labels + constellations

- **Gaia**: SDF font rendering in `font.fragment.glsl:26-28` with
  `smoothstep(0.6 - smoothing, 0.6 + smoothing, dist)`, `u_scale`
  uniform for adaptive AA. Constellation boundaries toggleable.
- **Atlas**: HTML/CSS tooltips only (`PlanetOverlay.tsx:54-68`). No 3D
  text mounted. No constellations. `@react-three/drei` is in deps but
  `<Text>` not used.
- **Effort**: 1-2 weeks.
- **Dependencies**: constellation line-segment data.

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
