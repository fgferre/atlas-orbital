# Phase θ — Gaia Sky-inspired visual upgrade

Created: 2026-04-19 · Updated: 2026-04-20 (swarm findings + Codex review integrated, 15-onda sequencing finalizada) · Status: planning · Owner: fgferre

Single-phase spec for porting the highest-impact visual techniques from
[Gaia Sky](https://github.com/langurmonkey/gaiasky) (Java/LibGDX) to our
Three.js + R3F stack. Scope is strictly visual — the HYG binary catalog,
orbital mechanics, and quality-tier system are **not** touched.

---

## 1. Goal

Bring our starfield and star-approach visuals up to the reference that
Gaia Sky and similar modern space renderers (NASA Eyes, Celestia) set
for:

- **Bright stars** — diffraction spikes, hero halos, lens character.
- **Dense fields** — clean bloom that preserves magnitude order instead
  of smearing into a haze.
- **Star approach** — smooth billboard → corona → surface transition
  when the camera dollies toward a bright nearby star.
- **Camera** — cinematic damping and auto-framing that match what Gaia
  Sky users experience.
- **Lens** — optional chromatic aberration, vignette, film grain, motion
  blur — all gated by tier / a11y reduced-motion preferences.

---

## 2. Non-goals (explicit, do not drift)

- **Do not** touch the HYG binary format, the tier layout
  (`low/medium/high/full` with strict prefix indexing), or the names
  sidecar. `src/utils/hygBinary.ts` and `public/data/hyg-stars/*.bin.gz`
  are frozen.
- **Do not** change the log-compressed transfer curve
  `brightness = 2·log(1 + flux·250)` calibrated against NASA Eyes
  (L16, L17). All new brightness lifts go into the _emissive_ side of
  the HDR pipeline (via `vfxHdrGain` or post-process halos), not the
  transfer curve.
- **Do not** replace AgX. Other tone mappers stay deferred per Wave α.
- **Do not** re-platform to WebGPU. All shaders stay GLSL 3.00 ES via
  `THREE.ShaderMaterial` with the `useMemo(() => new THREE.ShaderMaterial(...))`
  pattern (L15 literal).
- **Do not** migrate away from `@react-three/postprocessing`
  (pmndrs). New effects compose as additional `<Effect>` or custom
  `Effect` subclasses inside the existing `EffectComposer`.
- **Do not** add a new `scripts/build-*.mjs` asset pipeline without a
  preflight search for an existing equivalent (AGENTS.md §11, L7
  literal). Every onda that names a new script MUST reference the
  grep/glob that proved nothing equivalent exists; otherwise extend
  an existing pipeline.
- **Do not** bundle third-party datasets or panorama textures into
  the repo without (a) a provenance/licensing note in the onda body,
  (b) a schema/non-finite sanitizer per L1, and (c) a runtime
  fallback when the asset is missing or corrupt (black background,
  dust off, constellations off).

---

## 3. Prerequisites (must ship before θ.1 starts)

- **Wave α committed** — the three-commit spine in `tasks/todo.md`
  under "Wave α — HDR foundation + Graphics panel". Specifically:
  - Commit 2 (R1 #1A/#1B/#2): renderer `NoToneMapping`, composer runs
    AgX last, `vfxHdrGain` uniform live on both starfields,
    `luminanceThreshold=1.0` + `luminanceSmoothing=0.1` on the Bloom
    effect.
  - Commit 3 (R2 Wave 1): `graphicsSlice`, `DisplayPanel`,
    `A11yPanel`, persist-migration v0→v1.
- **Baseline Playwright PNGs captured** post-Wave α so pixel-diffs in
  this phase can distinguish intentional visual change from regressions.

If any of the above is missing when θ.1 opens, land Wave α first — this
phase layers on top of that contract.

---

## 4. Tier-aware strategy (contract for every onda)

This section is the **single source of truth** for per-tier activation
and for Reduced-Motion gating across all 15 ondas. Any contradicting
language inside an individual onda body defers to this table;
`tasks/todo.md` mirrors the Reduced-Motion list verbatim.

### 4.1 Per-onda activation by tier

| Onda | constrained | balanced           | high               | ultra             | Notes                                    |
| ---- | ----------- | ------------------ | ------------------ | ----------------- | ---------------------------------------- |
| θ.1  | off         | on (hardcore)      | on (hardcore+halo) | on (full)         | Sprite baseline for all others           |
| θ.2  | off         | off                | on                 | on                | Diffraction spikes, per-star billboard   |
| θ.3  | off         | off                | on (Subtle)        | on (Pronounced)   | LightGlow post-process                   |
| θ.4  | off         | off                | off                | on (Full)         | Pseudo lens flare                        |
| θ.5  | off         | off                | off                | on (Subtle)       | Camera motion blur                       |
| θ.6  | off         | on (vignette only) | on (CA+vignette)   | on (all three)    | Grading split into 3 independent toggles |
| θ.7a | off         | off                | on (Ultra-only)    | on (Ultra-only)   | Hero-star corona billboard               |
| θ.7b | off         | off                | off                | on (Ultra-only)   | Procedural surface                       |
| θ.8  | on (basic)  | on                 | on                 | on (cinematic)    | Camera feel — affects all tiers          |
| θ.9  | off         | on (Soft)          | on (Full)          | on (Full)         | Orbit-line glow shader                   |
| θ.10 | off         | off                | on (Lines+Labels)  | on (Full)         | Constellations                           |
| θ.11 | off         | on (Cubemap)       | on (Cubemap+Dust)  | on (Cubemap+Dust) | Milky Way backdrop                       |
| θ.12 | off         | on (Named bright)  | on (All named)     | on (Full)         | SDF star labels                          |
| θ.13 | off         | on (Bayer 4×4)     | on (Bayer 4×4)     | on (Bayer 8×8)    | Output dithering                         |
| θ.14 | off         | off                | on (Subtle)        | on (Pronounced)   | Alive-sky twinkle                        |
| θ.15 | off         | on (FXAA)          | on (SMAA)          | on (SMAA+Unsharp) | Anti-aliasing + unsharp mask             |

Constrained tier is byte-identical to pre-phase: EffectComposer is not
mounted, no new scene-graph objects spawn, no new script runs in
`useFrame`. Every onda MUST include an early-return gate that honors
this rule.

### 4.2 Reduced-Motion contract (A11yPanel `a11y.reducedMotion === true`)

Reduced-Motion is a **hard disable** for every time-animated effect,
applied as an early-return in the component's mount gate AND in the
shader-uniform upload path. "Freeze u_time" is forbidden — the same
per-pixel shader still pays cost even at a frozen t; pay nothing
instead.

Effects force-disabled when Reduced-Motion is on:

- **θ.3** LightGlow — polar mask is animated; disable the pass entirely.
- **θ.5** Camera motion blur — always motion-coupled.
- **θ.14** Alive-sky twinkle — per-star time-driven brightness.

Effects that stay on but freeze secondary animation:

- **θ.8** Camera feel — static damping still active, cinematic auto-rotate disabled.
- **θ.11** Milky Way — cubemap static; dust-billboard drift disabled.

All other ondas are static by construction and unaffected.

---

## 5. Ondas

Each onda lists: **goal**, **files**, **Gaia Sky reference**, **port plan**,
**parameters**, **DisplayPanel surface**, **verification**, **feasibility**,
**risks** (with L-lesson cross-refs).

All ondas follow the autonomy convention from Wave α: one commit per
onda unless split is noted. Commit messages use the
`feat(vfx): θ.N — <slug>` prefix.

---

## 5.1 Rendering invariants (color-management contract)

Every onda that inserts a composer pass or reads/writes the
EffectComposer's internal buffer MUST declare which render-space it
operates in. The four allowed spaces, in pipeline order:

1. **Scene linear HDR** — before any pass runs. Values are unbounded
   floats in linear sRGB primaries. Only passes that need HDR energy
   (bright-pass detection, lens flare ghost weighting, star halo
   luma sampling) read from here.
2. **Post-effect linear HDR** — still linear, still unbounded, but
   cumulative effects (LightGlow, Bloom, flare ghosts) have already
   modified luminance. Passes here must still account for
   out-of-range values and cannot assume `<= 1.0`.
3. **Display-referred SDR** — after AgX tone-mapping. Values are now
   in the display gamut, `[0,1]` range (modulo tiny overshoot). Color
   tweaks (CA, vignette, film grain, curvature) go here; they must
   NOT be re-fed into a new bloom or HDR effect.
4. **Encoded 8-bit output** — the composer's final write. Bayer
   dithering is the last composer step and applies at this boundary.

**Composer chain for phase θ** (canonical order, derived from Gaia Sky
`MainPostProcessor.java` + adapted to pmndrs constraints):

```
<Scene renders into linear HDR HalfFloat buffer>
     ↓
 θ.3 LightGlow                 (Scene linear HDR → Post-effect linear HDR)
     ↓
 Bloom                         (Post-effect linear HDR → Post-effect linear HDR)
     ↓
 θ.4 Pseudo lens flare         (Post-effect linear HDR → Post-effect linear HDR)
     ↓
 AgX ToneMapping               (→ Display-referred SDR)
     ↓
 θ.5 Camera motion blur        (Display-referred SDR — blurs the filmic look)
     ↓
 θ.15 AA pass (SMAA/FXAA)      (Display-referred SDR)
     ↓
 θ.6 ChromaticAberration → Vignette → NoiseEffect (film grain)
     ↓
 θ.15 UnsharpMask              (Display-referred SDR — applies to final look)
     ↓
 HueSat → BrightnessContrast   (existing grading)
     ↓
 θ.13 DitherEffect             (Encoded 8-bit output boundary — LAST)
     ↓
 Framebuffer
```

**Hard invariants** (any violation is a blocker for the onda):

- **RT format:** `EffectComposer` MUST be configured with
  `frameBufferType: THREE.HalfFloatType` in `PostProcessingPipeline.tsx`.
  A unit test reads back `composer.inputBuffer.texture.type` and
  asserts `HalfFloatType`. (Without this, θ.3 and θ.4 silently
  collapse to `UnsignedByteType` where every ghost is clipped to
  white.)
- **Output encoding:** `gl.outputColorSpace === THREE.SRGBColorSpace`
  (set in Wave α Commit 2). Not modified by any phase-θ onda.
- **AgX position:** AgX tone-mapping runs **exactly once**, right
  after the HDR-space effects (Bloom → flare) and before any
  display-space effect. If a new onda needs HDR input, it slots
  BEFORE AgX; if it needs the filmic look, it slots AFTER.
- **Dither position:** θ.13 is the terminal composer pass, always.
  Moving it earlier defeats the purpose (banding comes from 8-bit
  quantization at output).
- **No second bloom:** do not re-bloom after AgX. Additional glow
  must be expressed as pre-AgX additive energy or as display-space
  halo texturing, not as a second Bloom pass.

Ondas reference this section as `§5.1 invariant #N` instead of
restating the rules.

---

### θ.1 — Star sprite kernel refinement

**Goal.** Port Gaia Sky's per-star sprite kernel (sampled radial halo
texture + razor-thin additive white core) to our `THREE.Points`
starfield. Our current fragment is `pow(d, 5)` — a soft isotropic ball.
Gaia Sky's `star.group.quad.fragment.glsl` (3.7.x) multiplies a
baked radial-gaussian texture into the alpha AND stacks a
`smoothstep(0.0, 0.04)` pinpoint core that is **added to the RGB**
(not to the alpha). That gives a crisp center-pop at any sprite size
without changing the global halo footprint.

**Gaia Sky reference (source-authoritative — 2026-04-20 source study).**

- `assets/shader/star.group.quad.fragment.glsl` (57 lines) — the
  entire θ.1 reference. Fragment body, verbatim:
  ```glsl
  float profile = texture(u_starTex, uv).r;
  if (profile <= 0.0) discard;
  float alpha = v_col.a * profile;
  float core = saturate(1.0 - smoothstep(0.0, 0.04, distance(vec2(0.5), uv) * 2.0));
  fragColor = saturate(alpha * vec4(v_col.rgb + core * 2.0, 1.0));
  ```
- `assets/shader/star.group.quad.vertex.glsl` — host math (proper
  motion, solid-angle quad sizing). Not ported; atlas already has its
  own NASA-Eyes-calibrated log-compressed vertex transfer (L16/L17).
- Host Java: `StarSetQuadComponent.setStarTexture()` loads
  `tex/base/star-tex-NN.{jpg,png}` with `LINEAR/LINEAR` filter.
- Blending: Gaia Sky `BlendMode.ADDITIVE = GL_ONE, GL_ONE` (pure
  premultiplied additive).

**Correction log (plan prose vs. source, pre-port).** The previous plan
body cited three items that do not hold against the actual source:

1. Old: core smoothstep edges `(0.45, 0.50)` on `1 - 2·length(…)`.
   Source: `(0.0, 0.04)` on `distance(vec2(0.5), uv) * 2.0`. The two
   expressions map to sprite regions an order of magnitude apart
   (UV radius ~0.25 vs. ~0.02). **Fix below uses source values.**
2. Old: final composite `(halo + core) × vBrightness × alpha`, core
   added to alpha. Source adds core to **RGB** (`v_col.rgb + core * 2`)
   and computes alpha as `profile × v_col.a` only. **Fix below mirrors
   the source.**
3. Old cited `billboard.fragment.glsl` as a θ.1 reference. That file
   is the hero-star close-approach corona shader (three-tier
   `closeUp/mix/farAway` blend keyed on `(u_distance - u_radius) /
((u_radius * model_const) - u_radius)`). It belongs to θ.7, not
   θ.1. **Removed from the θ.1 reference list.**

These were the θ.1 failures that cost the 2026-04-20 rollback — the
shipped commit had a `smoothstep(0.0, 0.5)` pixel-space core that
never matched Gaia Sky's intent. Recording the delta here keeps the
plan and the implementation agreeing in the same working tree
(kickoff per-onda protocol step 3, `feedback_fix_plan_divergences`
memory).

**Port plan.**

- `src/components/canvas/Starfield.tsx` fragment shader, using the
  existing `gl_PointCoord` UV:
  ```glsl
  vec2 uv = gl_PointCoord;
  float profile = texture2D(u_starTex, uv).r;
  if (profile <= 0.0) discard;
  float r = length(uv - vec2(0.5)) * 2.0;
  float core = clamp(1.0 - smoothstep(0.0, 0.04, r), 0.0, 1.0);
  float alpha = vBrightness * profile;
  // Let three.js AdditiveBlending (SrcAlpha/One) multiply src.rgb by
  // src.a at blend time, which recovers Gaia Sky's One/One
  // `alpha * (rgb + core*2)` effect exactly. Do NOT saturate: post-
  // Wave-α HDR wants values > 1 to trigger Bloom (luminanceThreshold=1).
  gl_FragColor = vec4(vColor + vec3(core * 2.0), alpha);
  ```
- `u_starTex`: 64×64 R8 radial-gaussian generated via `OffscreenCanvas`
  at first material construction (no build script, zero bundle growth
  — plan's earlier option B path). Wrap `ClampToEdgeWrapping`, filter
  `LinearFilter/LinearFilter`. Shape `exp(-(r/σ)²)` with σ chosen so
  the profile reaches ≈ 0 at the corners.
- `src/lib/starfieldShaderMath.ts`: add a pure-TS `starfieldCoreKernel(r)`
  that mirrors `clamp(1 - smoothstep(0, 0.04, r), 0, 1)` so the unit
  test can pin the edges.
- `NASAStarfield.tsx` / `shaders/nasaStarShaders.ts`: **not touched in
  this onda**. That reference renderer stays the NASA Eyes baseline;
  mirroring the Gaia Sky kernel there would collapse the side-by-side
  comparison tool we used in Wave α.

**Parameters (ultra defaults).**

- Core smoothstep: `(0.0, 0.04)` on `distance(vec2(0.5), uv) * 2.0` —
  verbatim from source. Exported as constants in
  `starfieldShaderMath.ts` so the unit test pins them.
- Core RGB boost: `core * 2.0` — verbatim.
- Halo texture: 64×64 R8, radial gaussian, `LinearFilter` min/mag,
  `ClampToEdgeWrapping`. Σ tunable in the generator.

**DisplayPanel.** No new slider. "Star size" slider in Wave α still
drives the existing `particleSize` uniform.

**Verification.**

- Unit: `starfieldShaderMath.test.ts` new cases — `starfieldCoreKernel(r)`
  returns `1.0` at `r = 0.0` (pinpoint center), `≈ 0.5` at `r = 0.02`
  (smoothstep midpoint), `0.0` at `r = 0.04` (smoothstep upper edge),
  `0.0` for all `r ≥ 0.04` through `r = 1.0` (sprite corner). A
  separate monotonicity test confirms the kernel only decreases as
  `r` increases.
- Playwright: `e2e/starfield-sprite.spec.ts` — captures post-Wave α
  baseline, confirms pixel shift `> 0.4 %` after this onda and that
  bright-star centers have ≥ 1 pixel with per-channel RGB above the
  pre-port peak (evidence of the `core * 2.0` white boost). Allowed
  to land as a fast-follow commit per R7 if the ship-commit budget
  runs tight.
- Manual preview: boot, compare named bright stars (Sirius, Vega,
  Betelgeuse) against a Gaia Sky reference screenshot when available
  (user-provided or gaiasky.space gallery if restored). Absent a
  reference, matched-shot falls back to "pre-port atlas vs. post-port
  atlas, expect razor-thin center pop that the pre-port pow(d,5) ball
  cannot produce". Explicit acknowledgment of the partial-reference
  fallback in the ship commit message per kickoff R2.

**Feasibility.** Easy.

**Risks.**

- L17 literal — Gaia Sky's core occupies UV radius `[0.0, 0.04]`,
  which at our existing NASA-calibrated `[5, 50]` `gl_PointSize`
  clamp is:
  - at 50 px sprite: core diameter ≈ 4 px, full halo diameter 50 px
    (core is 8 % of sprite width, matches Gaia Sky's look);
  - at 5 px sprite (floor for telescopic tail): core is sub-pixel;
    the smoothstep effectively collapses to a single bright pixel
    at sprite center, which IS the expected behavior — the halo
    gaussian carries the star at that magnitude.
    Regression guard: the unit test pins the kernel math at `r = 0.0,
0.02, 0.04` (in UV space, independent of sprite size), and a
    post-ship screenshot verifies a mag-4 star has a visibly brighter
    center pixel than the ring 1–2 px out. Do NOT re-introduce
    pixel-space clamps or global brightness floors here — L13/L14 show
    those destroy magnitude ordering.
- L15 literal — the new `u_starTex` uniform is added to the existing
  `useMemo`'d `THREE.ShaderMaterial` constructor, never as a JSX
  `<shaderMaterial uniforms={{...}}>` child. The generated
  `THREE.DataTexture` is stored in a ref / module-scope cache so
  React remounts don't rebuild the gaussian every mount.
- L17 DPR — the shader does not introduce new pixel math; all size
  scaling continues to live in the vertex stage via `particleSize`
  (which already derives from `gl.getPixelRatio()`).

---

### θ.2 — Diffraction spike layer for bright stars

**Goal.** A 4- or 6-point spike ("starburst") on stars above a
brightness threshold — the iconic Hubble / telescope lens look. On
Gaia Sky this comes from the `lensdirt` starburst texture inside the
pseudo-lens-flare chain, but we can get 80 % of the look far cheaper as
a **per-star additive billboard** stacked on top of the sprite for
stars above a magnitude threshold.

**Gaia Sky reference.**

- `assets/shader/postprocess/lensdirt.frag.glsl` — starburst texture
  modulation (for context on the full-pipe approach).
- `Lensflare` from `@react-three/drei` (for the per-object approach
  we're actually taking).

**Port plan — Option A (recommended, cheap, ships in θ.2).**

- Draw a **second Points primitive** filtered to stars with
  `mag < THRESHOLD` (default `3.5`, ~170 stars on ultra, ~80 on
  high). Uses the same geometry indices as the main starfield — a
  separate `Float32Array` of source indices, no catalog duplication.
- Custom shader: the fragment draws a 4-point star-shape via
  `pow(max(|x|, |y|) - min(|x|, |y|), k)` profile — classic GLSL
  starburst kernel.
- Renders at a larger `gl_PointSize` than the main sprite
  (×2.5 default) with alpha modulated by the same `vBrightness` so
  it fades as the star's log-compressed brightness drops.
- `blending: AdditiveBlending`, depth-write off, renderOrder one above
  the main starfield.

**Port plan — Option B (deferred to post-phase, for fidelity).**

- Screen-space pass reading the HDR buffer post-Bloom, thresholding,
  sampling the starburst texture at each bright-luma pixel. This is
  what Gaia Sky does and what `PseudoLensFlare` wraps — lands in θ.4,
  not here.

**Parameters (ultra defaults).**

- Magnitude cutoff: `3.5`.
- Spike size multiplier vs core sprite: `2.5`.
- Spike kernel exponent: `k = 2.5` (2-point cross is too sharp; 3+ is
  too blobby).
- Spike rotation: fixed for cross look; optional `+0.25 rad` offset
  for a 6-point hex look if we want Hubble-adjacent on ultra only.
- Fade range: stars with `mag > 3.0` fade linearly to zero by
  `mag = 4.0`.

**DisplayPanel.** Add row **"Diffraction spikes"** with a 3-state
selector: `Off / Cross (4-point) / Hex (6-point)` and a
`Spike Intensity ×` slider (0.5–2.0). Persisted in
`graphicsOverrides.diffractionSpikes`.

**Verification.**

- Unit: the shader-math test suite pins the kernel's values at
  `(x,y) = (0.5, 0)`, `(0.5, 0.5)`, `(0.1, 0.1)` so a tuning change
  without intent fails CI.
- Playwright: `e2e/diffraction-spikes.spec.ts` — screenshot the Canis
  Major region, assert Sirius pixel cluster has a cross footprint
  (non-zero alpha along `y=center ± 30px` and `x=center ± 30px`,
  near-zero alpha on the 45° diagonals).

**Feasibility.** Easy (Option A).

**Risks.**

- L14 literal — perceptual spike size must be anchored to raw `mag`,
  not to any compressed or HDR-lifted intermediate. Do not feed the
  already-lifted `vColor * vfxHdrGain` back into the spike alpha.
- Adding a second Points primitive doubles the draw-call cost for
  ~150 stars on ultra. Budget check: on the reference Intel Iris Xe
  test device, measure frame time before/after and reject the commit
  if frame budget grows by > 0.5 ms.

---

### θ.3 — LightGlow post-process (animated halos on bright pixels)

**Goal.** A soft, slow-shimmering halo around any sufficiently bright
pixel cluster — what gives Gaia Sky's bright stars their "alive" feel.
Different from bloom: bloom is radially symmetric and static; LightGlow
animates via three out-of-phase sinusoidal polar-noise terms so the
halo breathes.

**Gaia Sky reference.**

- `assets/shader/postprocess/lightglow.frag.glsl` — polar-noise halo.
- `assets/shader/postprocess/lightglow.vert.glsl` — Archimedean-spiral
  luma sampling (identifies bright-pixel clusters in the vertex
  stage).

**Port plan.**

- Add a new custom `Effect` subclass in
  `src/components/canvas/scene/effects/LightGlowEffect.ts`, wrapping
  the pmndrs `Effect` API (extends `Effect` from `postprocessing`).
- **Simplification vs Gaia Sky:** skip the Archimedean-spiral
  luma-detector and instead re-use the Bloom pass's downsampled
  threshold buffer as the bright-pixel source. The animated
  `polarMask` math ports verbatim; we just feed it from the
  already-computed bright-pass texture instead of running a second
  detection sweep.
- Insert in the composer chain right before Bloom, per §5.1 chain.
  Runs in Scene-linear HDR space (invariant #1 → #2). The ShaderMaterial
  is constructed via `useMemo(() => new THREE.ShaderMaterial(...))`
  (L15 literal) — never as a JSX `<shaderMaterial>` child.
- Pass a `u_time` uniform from the simulation clock (NOT the store —
  L18 literal) driven once per frame in `useFrame`. When
  `a11y.reducedMotion === true`, **do not mount the effect at all**
  (§4.2 hard-disable). Freezing `u_time` pays fragment cost for zero
  visible change — forbidden.
- **LightGlow v3.7.2 alignment (§8.6).** Gaia Sky v3.7.2 removed the
  bloom-threshold dependency and adopted a time-animated polar mask
  directly. Our port follows v3.7.2: the bright-pixel source is the
  bloom bright-pass buffer, BUT the animated polar mask is evaluated
  independently (not threshold-gated).

**Parameters (ultra defaults).**

- Polar mask frequencies: `12.0, 37.0, 59.0` (port direct from
  `lightglow.frag.glsl`).
- Halo intensity: `0.25`.
- Time scale: `0.15` (slow breathing, ~6 s period).
- Max halo radius: `1.6 × view-angle_approx` (the Gaia Sky
  formula).

**DisplayPanel.** Add row **"Star Halo"** with `Off / Subtle /
Pronounced` selector mapping to `u_intensity = 0 / 0.15 / 0.25`.
Reduced-Motion gating lives in §4.2 (hard disable), not here.

**Verification.**

- Unit: not feasible (post-process pixel test). Covered by Playwright.
- Playwright: `e2e/lightglow.spec.ts` — two screenshots 3 s apart,
  assert > 0.01 % pixel diff in the bright-star halo region (proof
  animation is running) and < 0.001 % diff in the dark background
  (proof the effect is spatially localized, not a full-screen noise
  tint).

**Feasibility.** Medium.

**Risks.**

- Over-bloom compounding: LightGlow feeding into Bloom can double
  the effective glow radius. Default `u_intensity` is conservative
  (`0.25`); verify on Polaris + Vega that the combined bloom + halo
  doesn't "soap-bubble" into neighboring stars.
- Reduced-Motion gate — if missed, users with vestibular disorders
  see constant shimmer. This is a hard requirement (§4.2), not a
  nice-to-have.
- **Bloom-buffer coupling** (shared with θ.4): pmndrs `Bloom` does
  not officially expose its internal downsampled bright-pass buffer.
  Spike this before committing θ.3 — if access is not stable, budget
  a dedicated luminance prepass (one extra render target at half
  res). See §6 risk register row "Bloom bright-pass buffer access".

**Optional fold-in (deferred unless trivial on porting):**
Occlusion-aware star glow. Gaia Sky separates ordinary glow from
"star glow over objects" — a second pass that masks the halo when a
planet sprite occludes the star. For our current scene it's rarely
triggered (stars are usually background to planets at our camera
distances); treat as a fast-follow if the patch is < 30 LOC, else
defer to §9.

---

### θ.4 — Pseudo lens flare (Chapman ghosts + halo + starburst)

**Goal.** The screen-space lens-flare effect that gives bright stars
ghost reflections down the optical axis (toward screen center), a wide
halo ring, and chromatic RGB separation — the "pointing the telescope
at the Sun" look.

**Gaia Sky reference.**

- `assets/shader/postprocess/pseudolensflare.frag.glsl` — John
  Chapman's screen-space pseudo-lens-flare (MIT-compatible).
- `assets/shader/postprocess/lensdirt.frag.glsl` — starburst + dirt
  composite.

**Port plan.**

- Port `pseudolensflare.frag.glsl` as a custom `Effect` in
  `src/components/canvas/scene/effects/LensFlareEffect.ts` — direct
  GLSL port, ~60 lines. Reads the Bloom pass's bright-threshold
  buffer as input.
- `lensdirt.frag.glsl` ports as a second `Effect` (or, cheaper, a
  single combined pass: ghosts + halo + starburst + dirt in one
  shader, mergeable since Chapman's output is small).
- Dirt texture: generate at build time —
  `scripts/build-lens-dirt.mjs` produces a 512×512 low-contrast
  noise PNG; ship it lazy-loaded so the main bundle doesn't grow.
- Insert in composer **after** Bloom but **before** AgX — the flare
  needs the HDR signal to look right, and AgX still tone-maps the
  composite.

**Parameters (ultra defaults).**

- `u_ghosts = 8`
- `u_ghostDispersal = 0.4`
- `u_haloWidth = 0.45`
- `u_aberrationAmount = 3.5` (texels; not the chromatic-aberration
  effect — that's θ.6 and runs later in the chain)
- Composite max clamp: `0.4` (prevents over-bright flare — port direct
  from `lensdirt.frag.glsl`)

**DisplayPanel.** Add row **"Lens Flare"** with `Off / Subtle / Full`.
Off = effect disabled. Subtle = intensity × 0.4, 4 ghosts. Full = ship
defaults. Default on `ultra`, off on `high` and below.

**Verification.**

- Unit: not feasible.
- Playwright: `e2e/lens-flare.spec.ts` — orient camera so Sirius sits
  at `(0.8, 0.2)` in NDC; assert non-zero red-channel pixels appear
  along the line from Sirius to screen center at `(0.4, 0.4)` and
  `(0.2, 0.3)`. Assert aberration present: red and blue channel
  deltas differ by > 3 texels at those sample points.

**Feasibility.** Medium.

**Risks.**

- Screen-center-referenced ghosts break cinematically when the camera
  pans and the bright source crosses center — ghosts momentarily
  collapse to a single bright spot. Not a bug; Gaia Sky behaves the
  same. Call out in commit message so it's not re-flagged in review.
- HDR buffer precision: if fp16 isn't negotiated for the
  `EffectComposer`'s internal RT (pmndrs default is `UnsignedByteType`
  when possible), Chapman's ghost weighting collapses — every ghost
  looks white because the bright-pass already clipped to 1.0.
  Explicitly configure the composer with `frameBufferType:
THREE.HalfFloatType` in `PostProcessingPipeline.tsx`; add a unit
  test that reads back the composer's `inputBuffer.texture.type` and
  asserts `HalfFloatType`.

---

### θ.5 — Camera motion blur (velocity-based reprojection)

**Goal.** GPU Gems 3 Ch. 27 velocity-based motion blur — when the
camera dollies or pans fast, the scene blurs along the velocity
vector. Transforms fly-throughs from "sterile" to "cinematic". Locked
off by default; toggled via DisplayPanel and force-disabled when
`a11y.reducedMotion` is on.

**Gaia Sky reference.**

- `assets/shader/postprocess/camerablur.frag.glsl`.

**Port plan.**

- Port `camerablur.frag.glsl` as a custom `Effect` in
  `effects/CameraMotionBlurEffect.ts`.
- Requires the scene's depth buffer as an input (to reconstruct world
  position per pixel). `@react-three/postprocessing`'s `DepthPass`
  utility covers this — ensure it's scheduled once per frame before
  the composer runs.
- Stores the previous-frame `projection × view` matrix in a `useRef`
  updated in `useFrame` **after** the composer's `render()` call.
  Velocity = `currentClipPos − prevClipPos`; sample count along
  velocity = `u_blurSamplesMax = 35` (ultra) / `12` (high).
- Insert in the composer chain immediately after AgX
  tone-mapping — blurring pre-tone-map HDR samples gives haloed
  blur streaks; post-tone-map gives the filmic look we want.

**Parameters (ultra defaults).**

- `u_blurSamplesMax = 35`
- `u_blurScale = 0.5`
- Velocity magnitude clamp: `0.1` NDC (prevents blur from going
  full-screen on camera teleports like focus changes).

**DisplayPanel.** Row **"Motion Blur"** — `Off / Subtle / Full`.
A11yPanel's Reduced Motion forces `Off` regardless of DisplayPanel
setting, with a tooltip explaining the override.

**Verification.**

- Unit: not feasible.
- Playwright: `e2e/motion-blur.spec.ts` — two back-to-back frames
  during a scripted `focusOnBody('mars')` transition. Pixel diff
  > 2 % during the transition (blur is active), < 0.1 % when the
  > camera is still (blur is off at rest).

**Feasibility.** Medium.

**Risks.**

- Log-depth buffer + motion blur: our `Scene.tsx:L310` has
  `logarithmicDepthBuffer: true`. Reconstructing world position from
  log-depth requires Three.js's `logdepthbuf_pars_fragment` chunk
  spliced into the effect's fragment shader. Missing this chunk
  silently produces garbage blur at astronomical scales (every pixel
  reads depth ≈ 1.0).
- Focus-change transitions already animate camera position via
  `CameraTransition` — those would produce full-screen blur bursts.
  Mitigation: clamp velocity magnitude (parameter above) or gate
  motion blur off while `isFlyingToFocus === true`.

---

### θ.6 — Grading finishes (chromatic aberration, vignette, film grain)

**Goal.** Cheap lens-character additions that are the difference
between "tech demo" and "film". All three are single-shader passes
with trivial parameter surfaces.

**Gaia Sky reference.**

- `assets/shader/postprocess/chromaticaberration.frag.glsl`
- `assets/shader/postprocess/vignetting.frag.glsl`
- `assets/shader/postprocess/filmgrain.frag.glsl`

**Port plan.**

- All three are already available as effects in the `postprocessing`
  (pmndrs) library — no custom shader code needed:
  - `ChromaticAberrationEffect` (pmndrs)
  - `VignetteEffect` (pmndrs)
  - `NoiseEffect` (pmndrs, grain substitute)
- Wire them into `PostProcessingPipeline.tsx` in the order:
  `... Bloom → AgX → ChromaticAberration → Vignette → NoiseEffect →
HueSat → BrightnessContrast`.
- Gated by three new keys on `graphicsOverrides`:
  `chromaticAberrationEnabled`, `vignetteEnabled`, `filmGrainEnabled`,
  each with their own intensity slider.

**Parameters (ultra defaults).**

- Chromatic aberration offset: `THREE.Vector2(0.0005, 0.0005)`.
- Vignette offset: `0.35`, darkness `0.5`.
- Film grain intensity: `0.03`, blend mode `SOFT_LIGHT`.

**DisplayPanel.** Three toggle + slider pairs under a new
**"Grading"** section (NOT "Lens" — reserved for θ.4 "Lens Flare"
row). Each of the three effects is independently toggleable and
stores its state on `graphicsOverrides`.

**Verification.**

- Playwright: `e2e/grading.spec.ts` — THREE independent sub-tests,
  one per effect. Each sub-test flips one toggle in isolation, keeps
  the other two at their default, and asserts:
  - pixel diff > 0.1 % when enabled vs disabled;
  - < 0.01 % when the effect is toggled off (confirms clean unmount);
  - no cross-contamination (toggling CA does not alter vignette-only
    pixels).
- Capture three baseline PNGs — one per effect toggled ON alone —
  so future regressions can bisect.

**Feasibility.** Easy.

**Acceptance note (L12).** Even though one commit bundles three
effects, the commit's PR description MUST list the three baselines
and their sources. If one effect is rejected in review, the commit
drops it via a config-only follow-up (single-boolean kill switch),
not a revert — this is why the three toggles ship independently.

**Risks.**

- None material. These are library-provided effects with well-known
  behavior. Keep parameters conservative; run the composer chain order
  past Codex review before shipping.

---

### θ.7 — Hero-star approach LOD (billboard → corona → procedural surface)

**Goal.** When the camera dollies within ~10 AU of any star (Sirius,
Alpha Centauri, Sun), upgrade the visualization from a flat sprite
to a volumetric corona billboard, then to a full procedural surface
sphere with FBM curl noise. This is the single most impactful
"wow" effect in Gaia Sky — you approach a star and it becomes a star.

Today we have this for the Sun only (`ProceduralSun3D.tsx`). θ.7
generalizes it to any HYG star within approach range.

**Gaia Sky reference.**

- `assets/shader/billboard.fragment.glsl` — three-tier blend
  (`level` uniform selecting `closeUp()` / `mix()` / `farAway()`).
- `assets/shader/starsurface.fragment.glsl` — FBM curl noise
  granulation + sunspots.

**Port plan.**

- **Stage 1 — reuse existing Sun work.** Refactor `ProceduralSun3D` to
  accept a `starSpectralColor` and `starRadius` prop, so the shader
  is no longer Sun-hardcoded. Move the FBM curl-noise library to
  `src/components/canvas/shaders/starSurfaceNoise.ts` as a shared
  GLSL string.
- **Stage 2 — approach detection.** Add
  `src/components/canvas/HeroStarDetector.tsx`: every 250 ms (throttled),
  scan the named-stars sidecar subset, find the closest star to the
  camera, and if within `10 AU × radiusMultiplier`, flip a
  `activeHeroStarId` in a small Zustand slice.
- **Hot-path hygiene (L18 + L19 literal).** The detector math runs
  **outside** React:
  - All scanning is imperative — no `useFrame` subscribes to
    Zustand, no `useStore` hook inside the scan loop.
  - The sorted-by-camera-distance named-star list is **cached**
    (mutable ref) and only recomputed when camera has moved > 1 %
    of the scan radius. L19 "cached lookups" guard.
  - Zustand writes for `(heroStarId, lodStage)` happen **only** when
    the tuple actually changes since the last scan (shallow equality
    check before the `setState` call). L19 "store-quiet" guard.
  - On constrained tier the scan loop does not mount at all; the
    slice defaults to `{ heroStarId: null, lodStage: 'sprite' }`
    and no `useFrame` tick registers.
- **Stage 3 — corona billboard.** When `activeHeroStarId` is set but
  the camera is still far (beyond `radius × 2.5 / fovFactor`),
  render a new `<HeroStarBillboard>` component: a 2D quad with the
  corona shader from `billboard.fragment.glsl` (close/far blend with
  optional `detailedCorona` define that enables `ringRayNoise`).
- **Stage 4 — procedural surface.** When the camera passes the
  `radius × 2.5 / fovFactor` threshold, swap to the generalized
  `ProceduralSun3D` (renamed `ProceduralStarSurface3D`) with the
  target star's color and radius. The sprite and corona billboard
  fade over 500 ms during the swap (additive to zero) to avoid the
  double-draw pop.
- **Stage 5 — cleanup.** When the camera leaves the hero-star zone,
  reverse the stages back to the standard starfield sprite.

**Parameters (ultra defaults).**

- Approach threshold: `10 AU` (heliocentric radius equivalent scaled
  by star's physical radius).
- Billboard→surface swap: `dist < radius × 2.5 / fovFactor` (direct
  port from Gaia Sky).
- Cross-fade duration: `500 ms`.
- FBM curl noise octaves on high tier: 1; on ultra: 2.
- Sunspot scale adjusted per star class (cooler stars get more
  contrast from a spectral-type lookup in `src/lib/starPhysics.ts` —
  new file).

**DisplayPanel.** Row **"Hero Star LOD"** with `Off / High-tier /
Ultra-only` selector. Defaults: `Off` on balanced, `Ultra-only` on
high, `Ultra-only` on ultra.

**Verification.**

- Unit: `HeroStarDetector.test.ts` — fixture with camera at known
  position near Sirius verifies the right star is selected and
  distance thresholds trigger the right stage.
- Playwright: `e2e/hero-star.spec.ts` — scripted camera dolly toward
  Sirius across 4 distance sample points covering the engagement
  zone (`1000 AU, 100 AU, 10 AU, 1 AU` — first point is outside
  range baseline, last three span the 3 stages: sprite → corona →
  surface). Capture a screenshot at each; assert pixel diff between
  consecutive samples > 2 %. (Parsecs would overshoot — at 0.3 pc
  Sirius is still ~62 000 AU away, well outside the `10 AU` hero
  zone.)
- Manual: boot app, use search to focus Sirius, let the privileged-
  position framing bring the camera close. Expect: sprite, then
  halo bloom, then the corona billboard appearing, then the
  procedural surface sphere replacing it.

**Feasibility.** Hard. Largest onda in the phase.

**Risks.**

- Log-depth + procedural surface: same chunk issue as θ.5 — the
  `starsurface.fragment.glsl` port must include
  `logdepthbuf_pars_fragment` + `logdepthbuf_fragment` chunks or the
  surface sphere z-fights with the background.
- Performance: FBM curl noise at 60 FPS on Intel Iris Xe is tight.
  Pre-bake the surface to a 1024×512 texture updated at 4 Hz on
  balanced/high; full per-pixel procedural only on ultra. Pattern
  matches what Gaia Sky does on low-power GPU targets.
- Spectral color mapping — mapping B-V color index to a convincing
  star surface tint needs a physics-based look-up, not just the
  ci→RGB curve we use for sprites. Add a small 16-entry color ramp
  indexed by spectral class letter in `starPhysics.ts` (same table
  Stellarium uses).
- Hero-star detector polling at 250 ms is a subtle perf drag; profile
  it on constrained — it should gate to `activeHeroStarId = null`
  unconditionally on constrained and skip the polling entirely.

**Split recommendation.** This onda is large enough to split into
θ.7a (stages 1–3: reuse + detector + corona billboard) and θ.7b
(stages 4–5: procedural surface + cross-fade + cleanup), shipped as
two commits.

---

### θ.8 — Camera feel (Gaia Sky-style damping + auto-frame + cinematic FoV)

**Goal.** Bring the camera ergonomics closer to Gaia Sky's "Natural
Camera" defaults: the slightly softer damping on mouse drag, the 10×
slower cinematic turn rate, and optional FoV easing on focus. Our
current `OrbitControls` + `PrivilegedPosition` + `CameraTransition`
stack is architecturally close; this onda is mostly parameter tuning

- a few small additions.

**Gaia Sky reference.**

- `core/src/gaiasky/scene/camera/NaturalCamera.java` — cinematic
  divisor `1e3f` (vs `1e2f` normal), surface-mode flag at
  `dist < radius × 2.5 / fovFactor`.

**Port plan.**

- Add a **Cinematic Mode** toggle to the view controls rail (not
  DisplayPanel — this is a camera behavior, not a graphics setting).
  Persisted in a new `cameraSlice`:
  - Normal: current damping values (`0.05`), current zoom speed
    (`2.0`).
  - Cinematic: `dampingFactor = 0.025`, `rotateSpeed × 0.4`,
    `zoomSpeed × 0.6`.
  - **Slice contract (L18/L19 literal):** `cameraSlice` stores
    **intent only** — `cinematic: boolean`, `fovPreset: 30/45/60`,
    `surfaceMode: boolean`. It never stores per-frame camera state
    (position, quaternion, current FoV mid-tween). Frame state lives
    on the three.js camera object itself or a `useRef`, read via
    imperative access. Any component that `useStore(s => s.camera.*)`
    must only read the low-rate intent keys, never per-frame fields.
- Add **FoV easing on focus**. In `CameraTransition.ts`, when the
  user focuses a body, animate FoV from current to `45°` over the
  transition duration (we already animate position; FoV animation
  piggybacks on the same tween). For cinematic mode, animate FoV
  to `35°` instead — tighter framing.
- Port Gaia Sky's `surfaceModeFlag`: when
  `dist < radius × 2.5 / fovFactor` on the focused body, halve the
  zoom speed and quarter the rotation speed — prevents wild
  surface-level camera flies. We already have `calculateAdaptiveZoomSpeed`
  — extend its formula with this case.

**Parameters (ultra defaults).**

- All cinematic deltas above.
- FoV range: `30°` to `60°` (current is fixed 45°; make adjustable
  in cinematic mode).

**ControlPanelConfig.** Add toggle **"Cinematic Camera"** to the view
controls rail. Icon: camera-with-film-strip glyph.

**Verification.**

- Unit: `camera/calculateAdaptiveZoomSpeed.test.ts` extended to
  cover the surface-mode case.
- Playwright: `e2e/camera-feel.spec.ts` — scripted drag of 100 px
  over 500 ms, measure angular rotation with and without cinematic
  mode, assert cinematic rotation is ≈ 0.4× normal.
- Manual: focus Saturn, verify the zoom into ring-level detail feels
  damped in cinematic; verify it feels snappy in normal.

**Feasibility.** Medium.

**Risks.**

- FoV animation interacting with the privileged-position framing —
  the framing distance depends on the camera's FoV. Recompute the
  framing target distance with the **final** FoV, not the current,
  so the body stays in the same viewport fraction throughout the
  tween.

---

## 6. Risk register — rolled up

| Risk                                                              | Ondas affected                 | Mitigation                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| HDR composer RT not fp16                                          | θ.3, θ.4                       | Unit test reading back `composer.inputBuffer.texture.type === HalfFloatType`. Fix in Wave α if missing.                                |
| Log-depth chunk missing in ported shaders                         | θ.5, θ.7                       | Include chunk in every new ShaderMaterial; unit test asserting chunk present in shader source.                                         |
| L15 — `<shaderMaterial>` JSX child breaks per-frame uniforms      | θ.1, θ.2, θ.7, θ.9, θ.13, θ.14 | ESLint rule banning `<shaderMaterial>` as JSX child once Wave α lands (followup ticket). Review-gate on each onda touching shaders.    |
| L17 — DPR mismatch between `window.dPR` and clamped renderer DPR  | θ.1, θ.2                       | All pixel-size math reads `gl.getPixelRatio()` inside `useFrame`.                                                                      |
| Reduced-Motion not honored                                        | θ.3, θ.5, θ.14                 | §4.2 authoritative; all three effects' mount gate reads `a11y.reducedMotion`; Playwright test forces the flag and asserts off.         |
| Double-bloom from stacking LightGlow + Bloom                      | θ.3                            | Default intensity conservative; manual Vega/Polaris reference screenshot compared post-commit.                                         |
| Bloom bright-pass buffer access                                   | θ.3, θ.4                       | Spike before committing: if pmndrs `Bloom` does not expose its downsampled buffer stably, budget a dedicated half-res luma prepass.    |
| Perf budget on Intel Iris Xe / M1                                 | θ.7, θ.11                      | Pre-bake surface texture on high; procedural only on ultra. θ.11 default 1024/face. Reject commit if frame budget grows > 3 ms.        |
| Lens flare ghosts at screen edge look broken                      | θ.4                            | Clamp ghost intensity via `pow(1 - dist_to_center, 2)` — standard Chapman weighting; document in commit.                               |
| Hero-star detector polling overhead on constrained                | θ.7                            | Skip polling entirely on constrained; gate `activeHeroStarId = null`.                                                                  |
| L18/L19 — hot-path React churn from detector state                | θ.7, θ.12                      | Detector math imperative (not via store); cached sorted lookup; Zustand write only on tuple change. See θ.7 port-plan clause.          |
| L14 — magnitude-domain perturbation drifts into brightness-domain | θ.14                           | Apply twinkle to apparent magnitude BEFORE the log transfer curve; unit ordering test blocks the regression.                           |
| Third-party asset or dataset missing / corrupt                    | θ.10, θ.11                     | L1 + AGENTS.md §14: schema sanitizer, runtime fallback (black bg / constellations off), SHA-256-pinned download, license pinned.       |
| Playwright screenshot fragility on animated R3F canvas            | θ.3, θ.5, θ.14, θ.15           | L11 literal: no `animations: "disabled"`, explicit settle waits, `gl.readPixels` fallback for animation-present assertions.            |
| AA coverage vs Bloom edge smoothing                               | θ.15                           | SMAA runs after Bloom+AgX in §5.1 chain; validate halos on Sirius; tune SMAA thresholds if bloom edges look muddied.                   |
| `scripts/build-*.mjs` script sprawl                               | θ.1, θ.4, θ.10, θ.11           | AGENTS.md §11 preflight: grep existing `scripts/` before adding a new file; extend `download-textures.js` / `download-hyg.js` instead. |
| Licensing/attribution drift on ESO + IAU assets                   | θ.10, θ.11                     | Provenance notes in the build-script header; attribution in `AboutPanel.tsx` before merge; SHA-256 fail-build on upstream change.      |
| `cameraSlice` state pollution from per-frame writes               | θ.8                            | §4/θ.8: slice stores intent only (`cinematic`, `fovPreset`, `surfaceMode`) — never position/quaternion/frame-state (L18 literal).      |

---

## 7. Verification matrix

**Verification rule (applies to every onda).** Unit coverage where
feasible; otherwise, an **explicit config/math guard** (type
assertion, shader-source grep test, frame-counter invariant) paired
with a Playwright pixel-diff or animation assertion. "n/a" never
means "no coverage" — it means unit-level is unsuited to the
behavior and the Playwright gate is the authoritative check.

| Onda | Unit coverage                                                          | Config/math guard                                                 | Playwright spec                 | Manual check                            |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| θ.1  | extend `starfieldShaderMath.test.ts`                                   | `gl.getPixelRatio()` usage grep                                   | `starfield-sprite.spec.ts`      | Sirius/Vega/Betelgeuse vs ref image     |
| θ.2  | new kernel test                                                        | sprite-size L17 math test                                         | `diffraction-spikes.spec.ts`    | Sirius cross footprint                  |
| θ.3  | `lightglow.shader.test.ts` — polar-mask math sampled at 4 t values     | composer RT `HalfFloatType` assert                                | `lightglow.spec.ts`             | Halo breathing on bright stars          |
| θ.4  | composer RT fp16 assert + Chapman ghost-weighting unit                 | §5.1 chain-order shape assert                                     | `lens-flare.spec.ts`            | Sirius at NDC (0.8, 0.2)                |
| θ.5  | velocity-vector math unit                                              | Reduced-Motion mount-gate grep test                               | `motion-blur.spec.ts`           | Fly-through to Mars                     |
| θ.6  | per-effect intensity-uniform math                                      | 3 independent toggle baselines                                    | `grading.spec.ts` (3 sub-tests) | Each toggle individually                |
| θ.7a | `HeroStarDetector.test.ts` — selection + threshold                     | hot-path invariant: Zustand write-count ≤ 1 per camera move (L19) | `hero-star-corona.spec.ts`      | Focus Sirius → corona visible           |
| θ.7b | `starPhysics.test.ts` — B-V → surface tint lookup                      | log-depth chunk presence grep                                     | `hero-star-surface.spec.ts`     | Dolly to 1 AU → procedural surface      |
| θ.8  | extend `calculateAdaptiveZoomSpeed.test.ts`                            | `cameraSlice` schema — intent keys only                           | `camera-feel.spec.ts`           | Cinematic toggle on Saturn approach     |
| θ.9  | `orbitLineMath.test.ts` — cosine-AA + glow formula at 5 samples        | L15 grep — no `<shaderMaterial>` children                         | `orbit-glow.spec.ts`            | Earth orbit trail gradient visible      |
| θ.10 | `constellationsData.test.ts` — HIP existence + schema + empty-fallback | SHA-256 of IAU dataset asserted at build                          | `constellations.spec.ts`        | Orion lines visible on toggle           |
| θ.11 | `milkyWayAsset.test.ts` — missing-asset renders `Off` without throw    | cubemap size gate (< 5 MB default, < 15 MB HD)                    | `milky-way.spec.ts`             | Galactic plane luminance lift confirmed |
| θ.12 | `StarLabels.test.tsx` — threshold filter produces expected count       | solid-angle fade math unit                                        | `star-labels.spec.ts`           | Sirius label at expected offset         |
| θ.13 | `ditherMath.test.ts` — matrix lookup reproduces Gaia Sky table         | composer-tail position assert (last pass)                         | `dithering.spec.ts`             | Dark gradient histogram smoother        |
| θ.14 | `twinkleMath.test.ts` — amplitude + **magnitude ordering test**        | L14 grep — twinkle applied pre-transfer                           | `twinkle.spec.ts`               | Subtle blink on ~5 % of stars           |
| θ.15 | AA config-switch test (FXAA/SMAA mount matches tier)                   | unsharp-mask `amount ≤ 0.35` clamp test                           | `aa.spec.ts`                    | Orbit line + Orion labels anti-aliased  |

All Playwright specs include `data-postprocessing="active"` guard to
skip on constrained tier — the effects aren't mounted there.

### 7.1 Phase-wide Playwright harness rules (L11 literal)

- **Never** pass `animations: "disabled"` to `toHaveScreenshot` for
  specs that assert animation presence (θ.3, θ.5, θ.14, θ.15). It
  silently freezes R3F clocks.
- For animation-present specs, use explicit settle waits: after
  interacting, `await page.waitForTimeout(simulationTickMs)` for the
  shortest time the animation should elapse, then capture.
- For canvas checks that need exact pixel reads (not pixel-diff),
  drop to `gl.readPixels` via `page.evaluate()` — `page.screenshot`
  goes through an image codec that nondeterministically shifts
  near-zero-alpha pixels.
- HMR-accumulation caveat (L11): if a Playwright run touches source
  files mid-session via the Preview MCP, cycle
  `preview_stop` + `preview_start` before the next spec to clear
  R3F canvas state. Applies to local-dev debugging only; CI runs a
  fresh build per spec and is unaffected.

---

## 8. Sequencing and estimated weight

Fifteen ondas (θ.7 split em θ.7a/θ.7b). Ordem revista após a validação
em enxame (§8.5) e o review Codex (2026-04-20) para colocar primeiro o
que destrava verificação visual, agrupar context-switches por subsistema,
e empilhar os passes do composer numa ordem de re-baseline única.

| #   | Onda | Effort | Subsystem       | Ship order rationale                                                                                    |
| --- | ---- | ------ | --------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | θ.1  | S      | Star shader     | Foundation — sprite shape feeds θ.2/θ.3/θ.4/θ.14. First because it's small e barato de reverter.        |
| 2   | θ.13 | S      | Composer        | Bayer dithering entra cedo: elimina banding que mascararia regressões dos próximos passes.              |
| 3   | θ.6  | S      | Composer        | Grading finishes (CA/vignette/grain) — pequenos, parale-izáveis, mesmo context do θ.13.                 |
| 4   | θ.2  | S      | Star shader     | Spikes aditivos sobre θ.1; visual payoff alto, nenhum novo pass.                                        |
| 5   | θ.9  | M      | Scene-graph     | Orbit lines com glow — base do shader que θ.10 reusa; independente dos composer passes.                 |
| 6   | θ.10 | M      | Scene-graph     | Constelações — linhas (θ.9) + primeiros SDF labels; prepara o caminho para θ.12 e θ.15.                 |
| 7   | θ.12 | S      | Scene-graph     | Labels nomeadas de estrelas; reusa troika-three-text do θ.10.                                           |
| 8   | θ.8  | M      | Camera          | Camera feel — não toca shaders; slot antes de motion-blur para isolar regressões de easing.             |
| 9   | θ.3  | M      | Composer        | LightGlow — primeiro pass "grande" do composer; valida infra para θ.4/θ.5.                              |
| 10  | θ.4  | M      | Composer        | Pseudo-lens-flare — reusa o effect-wrapper de θ.3.                                                      |
| 11  | θ.5  | M      | Composer+Depth  | Motion blur — exige depth/velocity buffer; slot após θ.4 pra um único context-switch no chain.          |
| 12  | θ.15 | M      | Composer        | AA + UnsharpMask — slot imediato após θ.5 pra re-baselinar uma única vez os specs com motion blur + AA. |
| 13  | θ.14 | S      | Star shader     | Twinkle via LUT — depende de `vfxHdrGain` ser estável e de θ.1 estar final.                             |
| 14  | θ.11 | M-H    | Backdrop/assets | Milky Way cubemap + dust — asset pipeline + 2-layer blend; maior risco de regressão de bloom.           |
| 15  | θ.7a | M      | Hero-LOD        | Detector de aproximação + corona billboard.                                                             |
| 16  | θ.7b | L      | Hero-LOD        | Procedural surface + cross-fade — o maior item; slot último pra beneficiar de todos os outros.          |

Notas:

- **θ.11 antes de θ.7:** o backdrop Milky Way muda a luminância de fundo
  de forma não-trivial; tem que estar no lugar antes de θ.7 ajustar o
  cross-fade billboard→surface (pra não re-calibrar duas vezes).
- **θ.13 cedo, θ.6 em seguida:** evita re-capturar baseline duas vezes
  — os dois são composer-level e fazem shift global de pixels.
- **θ.9/θ.10/θ.12 em bloco:** scene-graph é um subsystem; fazer tudo
  num go mantém o context-switch pequeno.
- **θ.15 logo após θ.5:** AA precisa rodar DEPOIS de motion-blur no
  chain §5.1; shippar junto evita rebaseline triplo (motion blur → sem
  AA → motion blur com AA).
- **Ordem reflete a chain da §5.1**, mas não é idêntica — as ondas de
  scene-graph (θ.9/θ.10/θ.12) são ortogonais ao composer e aparecem
  cedo pra desbloquear verificação visual das linhas.

**Phase estimate:** 20–24 commits over 8–10 sessões, Wave α excluded
(era 18–22 antes do θ.15; +2 commits pra AA + unsharp split).

---

## 8.5 Ondas adicionais descobertas pela validação em enxame (14 Haiku agents, 2026-04-19) + Codex review (2026-04-20)

A varredura paralela em enxame (2026-04-19) detectou features que o
relatório Sonnet original omitiu — resultaram em seis ondas novas
(θ.9–θ.14). O review Codex (2026-04-20) identificou uma sétima
necessidade (θ.15 AA + UnsharpMask) e endureceu contratos em §2,
§4, §5.1, §6, §7 e §10. Features ainda não incorporadas ficam
registradas em §9.

---

### θ.9 — Orbit / trajectory lines com glow shader (quad-strip + core aditivo)

**Goal.** Substituir os ~45 `THREE.Line` atuais (plano, 1 px, sem glow)
por um shader de linha quad-strip com thickness adaptativa à distância
e core aditivo brilhante — a mesma técnica que Gaia Sky usa para TODAS
as linhas (órbitas, trajetórias, linhas de constelação, grid de
referência).

**Gaia Sky reference.**

- `assets/shader/line.quad.gpu.vertex.glsl`
- `assets/shader/line.quad.gpu.geometry.glsl` — cross-product expansion
  para quad orientado, thickness `w = u_lineWidthTan × camDist`.
- `assets/shader/line.quad.gpu.fragment.glsl` — soft-AA + core glow:
  ```glsl
  float x = (v_uv.y - 0.5) * 2.0;
  float core = min(cos(PI*x/2.0), 1.0 - abs(x));
  float alpha = pow(core, 1.8);
  float cplus = pow(core, 10.0);   // additive core boost
  fragColor = vec4(color.rgb + cplus, alpha);
  ```
- `core/src/gaiasky/scene/component/Trajectory.java` — `orbitTrail`,
  `trailMap`, `trailMinOpacity` (fade de segmentos velhos).

**Port plan.**

- WebGL2 não tem geometry shaders → expandir em CPU: cada segmento vira
  um quad (4 vértices) com `THREE.BufferGeometry` + um atributo
  `a_side` (±1) e `a_coord` (posição no trajeto).
- Fragment shader porta verbatim (cosine-AA + `pow(core, 10)` glow
  core). Additive blending. **L15 literal:** ShaderMaterial
  construído via `useMemo(() => new THREE.ShaderMaterial(...))`,
  nunca como JSX child `<shaderMaterial>`.
- `trailMap`: uniforme que recebe a posição atual do corpo em [0,1]
  de volta no path; fragment dá fade linear para `v_coord < trailMap`.
- Aplicar uniformemente em `src/components/canvas/Orbit.tsx` (ou
  equivalente) e reusar em θ.10 para linhas de constelação.

**Parameters (ultra defaults).**

- Thickness base: `2.0 px` (CSS), escalada por `camDist × tan(fov/2)`.
- `trailMinOpacity = 0.25` (segmentos antigos mantêm 25 % de alpha).
- Glow core exponent: `pow(core, 10.0)` — direto do Gaia Sky.

**DisplayPanel.** Row **"Orbit Line Glow"** — `Off / Soft / Full`.
Default: `Soft` em balanced, `Full` em high/ultra.

**Verification.**

- Unit: `orbitLineMath.test.ts` — cosine-AA + glow formula em 5
  pontos-amostra.
- Playwright: `e2e/orbit-glow.spec.ts` — Earth orbit, assert pixel
  diff > 1 % vs. pre-θ.9; confere que segmentos anteriores ao corpo
  são ~25 % de alpha e posteriores são cheios.

**Feasibility.** Medium (CPU quad-strip expansion é a parte nova).

**Risks.** Draw-call cost: 45 órbitas × ~360 segmentos = 16 200 quads.
Bundle tudo num único `InstancedBufferGeometry` ou `MergedGeometry` por
órbita. Budget check no Intel Iris Xe.

---

### θ.10 — Camada de constelações (linhas com glow + SDF labels)

**Goal.** Adicionar a camada de constelações que hoje não existe no
projeto — linhas stick-figure IAU + boundaries + labels. Reusa o shader
de θ.9 para as linhas.

**Gaia Sky reference.**

- `Constel.java`, `Boundaries.java`, `LineEntityRenderSystem`.
- Dataset IAU stick-figure + boundary polygons (RA/Dec pairs).
- Color cyan-green `[0.5, 1, 0.5, 0.4]` para linhas; boundaries `α=0.3`.

**Port plan.**

- Baixar dataset IAU constellation lines (público, e.g.
  `stellarium-skycultures` ou `bsc5`) em `scripts/build-constellations.mjs`.
- Emit `public/data/constellations/lines.json` + `boundaries.json`
  com HIP→pos lookup resolvido offline contra nosso HYG.
- Novo componente `src/components/canvas/Constellations.tsx` —
  reusa o material de θ.9.
- SDF labels via `@react-three/drei` `<Text>` (troika-three-text sob
  o capô — equivalente direto ao BitmapFont SDF do Gaia Sky).
- Fade por solid-angle: label visível só quando o polígono da
  constelação ocupa > `0.02 sr` no viewport.

**Parameters.**

- Line color: `#80FF80`, alpha `0.4` (linhas) / `0.3` (boundaries).
- Label font: Inter ou similar, MSDF 512×512.
- Label tint: `#99FFCC`, glow `0.15` outline.

**DisplayPanel.** Row **"Constellations"** — `Off / Lines / Lines +
Labels / Full (Lines + Boundaries + Labels)`.

**Third-party data guard-rails (L1 literal, AGENTS.md §14).** The IAU
constellation dataset and any stellarium-derived files are
third-party; they MUST:

- Ship with a provenance/licensing note at the top of
  `scripts/build-constellations.mjs` — dataset URL, SHA-256 of the
  downloaded file, license (stellarium-skycultures is GPLv2;
  incompatible — use the PD-licensed IAU list instead: Delporte 1930
  boundaries + IAU 88 modern constellations).
- Pass a schema sanitizer before the HIP→pos resolution: every row
  must have finite RA/Dec, valid HIP integer, and a `constellation`
  tag in the IAU 88 whitelist. Non-conforming rows drop with a
  build-time warning (not a silent skip).
- Have a **runtime fallback**: if
  `public/data/constellations/lines.json` is missing, corrupt, or
  empty, the component mounts in `Off` mode with a one-line warning
  in the console (`console.warn('Constellations data unavailable')`)
  — no unmounted Suspense, no error boundary trigger.
- Preflight (L7, AGENTS.md §11): grep for any existing
  `scripts/download-*.js` that already fetches IAU data before
  creating `build-constellations.mjs`. Document the grep result in
  the commit message.

**Verification.**

- Unit: `constellationsData.test.ts` — (a) cada HIP referenciado
  existe no HYG catalog, (b) schema sanitizer rejects non-finite
  RA/Dec + non-whitelisted constellation tags, (c) empty-file
  fallback renders `Off` mode without throwing.
- Playwright: `e2e/constellations.spec.ts` — toggle on, assert
  cluster de pixels cyan-green detectável na região de Orion; also
  a secondary fixture with the JSON file replaced by `{}` asserts
  the console-warn path and no visible artifact.

**Feasibility.** Medium (reusa θ.9 para linhas; SDF labels são
plug-and-play via drei).

**Risks.** Clutter em zoom out: garantir fade por solid-angle.
License drift in upstream data — pin the SHA-256 in the build script
and fail the build if it changes.

---

### θ.11 — Milky Way backdrop (cubemap panorama + billboard dust particles)

**Goal.** Substituir o skybox preto por uma Via Láctea que o usuário
reconhece. Gaia Sky combina dois ingredientes: um cubemap
equirectangular do fundo galáctico + uma nuvem de billboards
procedurais para dust lanes com paralaxe sutil.

**Gaia Sky reference.**

- `assets/shader/skybox.{vertex,fragment}.glsl` — cubemap direto.
- `assets/shader/gal.{vertex,fragment}.glsl` — billboard da MW.
- `core/src/gaiasky/scene/component/BillboardSet.java` — morfologia
  procedural.

**Port plan.**

- Cubemap estático: baixar ESO Milky Way panorama equirectangular
  (**ESO/S. Brunier**, CC-BY-4.0 — requires credit line in
  HANDOFF.md and in-app attribution under `AboutPanel`), converter
  para 6-face cubemap via `scripts/build-milkyway-cubemap.mjs`. Ship
  em `public/textures/milkyway-cubemap/`. Preflight (L7, AGENTS.md
  §11): grep `scripts/download-textures.js` for existing panorama
  pipelines and extend that script if present instead of a new one.
- Camada dust-billboard: `InstancedMesh` com ~5k partículas, posições
  amostradas numa distribuição disk-+-bulge gerada offline em
  `scripts/generate-mw-dust.mjs` (log-normal radial distribution
  centrada no centro galáctico).
- Shader do billboard porta o `sin`-based glow do Gaia Sky:
  `1.0 - pow(sin(π·dist/2), 1.3)`.
- Cubemap como `<primitive object={scene.background}>` (3D sem
  rotação), dust-particles como `<points>` com obliquity + rotação
  galáctica aplicadas no mount.

**Parameters (all tiers).**

- **Cubemap resolution default: 6×1024 per face** (~4 MB total
  gzipped, ships with the build). High-fidelity 6×2048 (~12 MB) is
  an **opt-in HD asset** loaded behind a DisplayPanel toggle and
  fetched lazily, never blocking first paint.
- Dust particle count: 5000 ultra, 2000 high, 500 balanced, 0 constrained.
- Dust base alpha: `0.08`.

**DisplayPanel.** Row **"Galactic Backdrop"** — `Off / Cubemap /
Cubemap + Dust`. Secondary row **"HD Backdrop Asset"** —
`Use default (1024) / Download HD (2048)`. The HD toggle triggers a
lazy fetch + swap; failure falls back to default with a toast.

**Runtime fallback (AGENTS.md §14, L1).** If the cubemap fails to
load OR any face is corrupt (checked by WebGL texture upload error),
the component stays mounted in **"Off"** mode — pure black skybox —
with a single `console.warn`. No user-facing error UI; the rest of
the scene renders normally.

**Verification.**

- Asset gate: default cubemap `< 5 MB` gzipped total; HD cubemap
  `< 15 MB` gzipped total.
- Preflight (L7): grep `scripts/` for existing texture-download
  pipelines (`download-textures.js` exists — extend it, don't add a
  sibling script unless the extension is > 100 LOC).
- Playwright: `e2e/milky-way.spec.ts` — (a) default cubemap path:
  assert center-frame luminance increases vs. pre-θ.11 baseline
  along the galactic-plane band; (b) missing-asset path (stub the
  fetch to 404): assert black skybox renders and no console error
  (only the expected warn).

**Feasibility.** Medium-Hard (asset pipeline + two-layer composition

- obliquity rotation chain).

**Risks.**

- Asset size: covered by the 1024-default / 2048-optional split above.
- Dust particle performance: measure on Iris Xe.
- Bloom-threshold interaction: the cubemap is sRGB display-space, so
  it MUST be sampled outside the HDR → AgX chain (render as the
  `scene.background` with `texture.colorSpace = SRGBColorSpace`; the
  bloom pass's bright-pass threshold at 1.0 naturally rejects it).
- Licensing drift — ESO CC-BY-4.0 requires attribution. Ship the
  credit line in `src/components/ui/AboutPanel.tsx` or the tutorial
  final panel before the commit merges.

---

### θ.12 — SDF labels in-scene para estrelas nomeadas

**Goal.** Substituir nossa HTML-overlay tooltip por labels
in-scene SDF que respeitam o depth buffer, escalam com o FOV e
aparecem/desaparecem por solid-angle (mesma regra de Gaia Sky).
Resolve ao mesmo tempo a flickering/positioning típica de overlay-HTML
e adiciona labels permanentes para as estrelas IAU bright.

**Gaia Sky reference.**

- `assets/shader/font.{vertex,fragment}.glsl` — SDF sampling com
  smoothstep adaptativo a escala.
- `assets/skins/fonts/font-distance-field.{fnt,png}` — 610-glyph
  atlas (Latin + Greek + CJK).
- `TextRenderer.java` + `LabelEntityRenderSystem.java` — solid-angle
  LOD + 15 px bottom-right offset.

**Port plan.**

- Trocar `@react-three/drei` `<Text>` (troika-three-text). Atlas MSDF
  pré-empacotado no troika — zero asset build.
- Componente `src/components/canvas/StarLabels.tsx`: consome o sidecar
  `hyg-v1.names.json` (já carregado em θ-prerreq), filtra estrelas com
  `mag < LABEL_MAG_THRESHOLD` (default `2.0` → ~45 labels).
- Solid-angle fade: `opacity = smoothstep(THRESHOLD_MIN, THRESHOLD_MAX,
starSolidAngleInViewport)`.
- Hover-sustain do `StarHoverPicker.tsx` atual: mantido, mas só para
  estrelas `mag > 2.0` (as labeled já têm label permanente).

**Parameters.**

- MSDF atlas: troika default (Inter, ~1.2 MB gzipped, shared across
  all text in app).
- Solid-angle threshold: `labelThreshold = 0.0001 sr`.
- Color: per-star B-V tint × 0.8 (sutil), outline `rgba(0,0,0,0.5)`.
- Font size baseline: `0.02` world-units at 1 AU (FOV-scaled).

**DisplayPanel.** Row **"Star Labels"** — `Off / Named bright only /
All named / Full (+ constellations names)`. Respects `a11y.reducedMotion`
(no fade animation).

**Verification.**

- Unit: `StarLabels.test.tsx` — threshold filter produces the expected
  count at mag 2.0 / 3.0 / 4.0.
- Playwright: `e2e/star-labels.spec.ts` — Sirius label renders at
  expected screen-space offset; fades below threshold on zoom out.

**Feasibility.** Easy (troika-three-text does the heavy lifting).

**Risks.** Initial atlas load (~1.2 MB gzipped) adds to first-paint.
Lazy-load on first toggle to `Named bright only`.

---

### θ.13 — Bayer dithering no output composer

**Goal.** Eliminar banding visível no fundo do espaço (gradient
sub-1.0 alpha on 8-bit output). Bayer 4×4 é 20 linhas de GLSL, custo
zero, e Gaia Sky confirma ser a técnica padrão.

**Gaia Sky reference.**

- `assets/shader/lib/dither4x4.glsl` / `dither8x8.glsl`.

**Port plan.**

- Novo custom `Effect` em `effects/DitherEffect.ts` que roda **last**
  no composer (depois de BrightnessContrast), antes do output para
  framebuffer 8-bit. Vide §5.1 invariant "Dither position".
- Effect shader construído via `useMemo` pattern dentro do wrapper
  pmndrs `Effect` subclass (L15 literal — nenhum `<shaderMaterial>`
  JSX child, mesmo que seja custom-effect wrapper).
- Fragment:
  ```glsl
  const int matrix[16] = {0,8,2,10, 12,4,14,6, 3,11,1,9, 15,7,13,5};
  int x = int(mod(gl_FragCoord.x, 4.0));
  int y = int(mod(gl_FragCoord.y, 4.0));
  float t = float(matrix[x + y*4]) / 16.0 - 0.5;
  outputColor = inputColor + vec4(vec3(t / 255.0), 0.0);
  ```

**DisplayPanel.** Row **"Dithering"** — `Off / Bayer 4×4 / Bayer 8×8`.
Default on for balanced+, off on constrained.

**Verification.**

- Unit: none (pixel-level).
- Playwright: `e2e/dithering.spec.ts` — amostrar uma gradient region
  escura, confirmar que histograma de luminance pós-θ.13 tem
  distribuição mais contínua (less histogram spikes).

**Feasibility.** Easy.

**Risks.** Nenhum. Custo GPU negligenciável.

---

### θ.14 — Alive-sky twinkle (variable-star LUT generalizada)

**Goal.** Aplicar um efeito sutil de "twinkle" (amplitude ±0.08
magnitude, período 3–7 s randomizado por estrela) em um subset
aleatório de ~5 % das estrelas do starfield — técnica generalizada da
LUT de phase-folded variable-stars do Gaia Sky.

**Gaia Sky reference.**

- `assets/shader/variable.group.quad.vertex.glsl` — LUT lookup
  phase-folded com linear interp entre sample points.

**Port plan.**

- Gerar 1D LUT 128×1 RGBA no boot (offline seria overkill) com shape
  `cos(2π·t) + 0.3·cos(6π·t)` clampada.
- Novo atributo per-star `a_twinkleEnabled` (0/1) + `a_twinklePhase`
  (hash do HIP id).
- **L14 literal — apply in the raw physical axis, NOT in derived
  brightness.** The magnitude-domain perturbation is added to the
  star's _apparent magnitude_ **before** the log-compressed transfer
  curve `brightness = 2·log(1 + flux · 250)` in
  `starfieldShaderMath.ts`. Concretely in the vertex shader:
  ```glsl
  float magEffective = a_apparentMag - 0.08 * sampleLUT(a_twinklePhase, u_time);
  float flux = pow(10.0, -0.4 * magEffective);
  float brightness = 2.0 * log(1.0 + flux * 250.0); // unchanged curve
  ```
  Do NOT multiply the already-derived `brightness` — that would
  scramble ordering across magnitudes (L13/L14 failure mode).
- `u_time` uniform fed from the simulation clock (L18 literal —
  never from the React store).
- ShaderMaterial constructed via `useMemo` (L15 literal); the LUT
  texture is a regular `THREE.DataTexture`, not a JSX child.
- Hard-disabled when `a11y.reducedMotion === true` per §4.2; component
  does not mount and the per-star attribute falls back to a static
  `a_twinkleEnabled = 0.0` upload.

**Parameters.**

- Twinkle rate: `0.15 Hz` (~7 s period).
- Amplitude: `±0.08 mag` (applied pre-transfer; §5.1 magnitude domain).
- Population: 5 % randomly seeded stars (deterministic hash of HIP id
  so twinkling subset is stable across boots — no re-randomization
  per session).

**DisplayPanel.** Row **"Star Twinkle"** — `Off / Subtle / Pronounced`.
Reduced-Motion gating lives in §4.2, not here. Name is the same in
every location (§10 exit criteria, todo.md) — "Alive Sky" is the
internal onda nickname only, not a user-facing surface.

**Verification.**

- Unit: `twinkleMath.test.ts` —
  - peak-to-trough magnitude amplitude stays within `[0.07, 0.09]`
    across 128 LUT samples;
  - **ordering preservation:** for 10 magnitude pairs `(m_a, m_b)`
    with `m_a < m_b`, assert that at every `t ∈ [0,1]` the derived
    `brightness(m_a, t) > brightness(m_b, t)` — a peak-twinkling
    mid-faint star never outshines a quiet bright star.
- Playwright: `e2e/twinkle.spec.ts` — two frames 3 s apart, assert
  pixel diff > 0.1 % in the twinkling-star subset; < 0.001 % when
  reduced-motion is on.

**Feasibility.** Easy.

**Risks.**

- "Atmospheric twinkle is not physical in space" — true; gate via
  DisplayPanel default-off on "realistic" mode if we add one. Sell
  it as cinematic flavor on ultra.
- **L14 regression**: any future refactor that moves the twinkle
  multiplication back into the brightness-domain will silently
  scramble magnitude ordering under high-amplitude peaks. The unit
  ordering test (above) is the guard.

---

### θ.15 — Anti-aliasing + unsharp mask tiering

**Goal.** Close the most visible remaining artifact class after the
scene-graph additions: jagged orbit lines (θ.9), label edges (θ.10,
θ.12), and star-sprite shimmer on pan. Gaia Sky exposes AA and
unsharp-mask as first-class graphics controls; we bring both.

**Gaia Sky reference.**

- `assets/shader/postprocess/antialias.*.glsl` (FXAA / SMAA / TAA
  implementations — Gaia Sky ships all three and picks via
  graphics-settings preset).
- `assets/shader/postprocess/unsharpmask.*.glsl` — sharpens
  post-AA output; paired with SMAA in the preset stack.

**Port plan.**

- Use pmndrs `postprocessing` library's built-in `SMAAEffect` and
  `FXAAEffect` — no custom shader code. Chain position per §5.1:
  AA runs after θ.5 motion blur and before θ.6 grading (display-
  referred SDR). Unsharp mask via a custom wrapper around the
  pmndrs `BrightnessContrastEffect` is not sufficient — port
  Gaia Sky's `unsharpmask.frag.glsl` (~40 lines, single Gaussian
  blur + subtract) as `effects/UnsharpMaskEffect.ts`.
- Tier table (authoritative in §4):
  - `constrained` → off (no composer);
  - `balanced` → FXAA only (cheapest);
  - `high` → SMAA (better quality, still fast);
  - `ultra` → SMAA + UnsharpMask (`amount = 0.25`, single-pass).
- L15 literal for UnsharpMask ShaderMaterial. L7 preflight for the
  unsharp-mask effect file (grep `src/components/canvas/scene/effects`
  — nothing equivalent expected but check).

**Parameters (ultra).**

- FXAA: library defaults, `edgeDetectionMethod = LUMA`.
- SMAA: library defaults, `preset = SMAAPreset.HIGH`.
- UnsharpMask: `amount = 0.25`, `radius = 1.0` (single Gaussian tap
  per axis — cheap, Gaia Sky default).

**DisplayPanel.** Row **"Anti-aliasing"** — `Off / FXAA / SMAA`.
Secondary row **"Unsharp Mask"** — `Off / On` (slider `0.0–0.5`).
Both respect the tier defaults in §4.1 but users can downgrade/override.

**Verification.**

- Unit: not feasible (pixel-level AA behavior). Covered by Playwright
  per §7's "unit where feasible, else guard + Playwright" rule.
- Playwright: `e2e/aa.spec.ts` —
  - toggle AA off, capture a screenshot of an orbit-line at
    high zoom, assert edge-pixel stddev > `T_OFF`;
  - toggle FXAA on, same capture, assert edge stddev < `T_OFF`;
  - toggle SMAA on, assert further reduction vs FXAA.
- Manual: pan across Orion constellation, confirm label edges stay
  smooth without shimmer on SMAA.

**Feasibility.** Easy (pmndrs AA effects are library-provided).
Medium for the unsharp-mask port (~40 LOC shader + wrapper).

**Risks.**

- SMAA vs Bloom ordering: SMAA's internal edge-detection pass expects
  un-bloomed SDR input. Since it runs AFTER Bloom+AgX in our chain
  (§5.1), the bright halos already exist — SMAA may over-smooth
  bloom edges. Validate on Sirius at 1× zoom; if halos look muddied,
  tune `SMAAEdgeDetectionMaterial` thresholds.
- Unsharp mask re-introducing aliasing that SMAA just removed.
  Clamp `amount ≤ 0.35`; if Playwright catches re-aliasing at the
  edge-stddev test, drop unsharp to `high` tier only.

---

## 8.6 Correções ao relatório Sonnet original (confirmadas pelo enxame)

- **Pipeline chain order** (verified against `MainPostProcessor.java`):
  `BlendFullHalfRes → LightGlow → RayMarching → SSR → CameraMotionBlur
→ PseudoLensFlare/LensFlare → Blend3(UI) → UnsharpMask → AA → Bloom
→ Curvature → Reprojection → FilmGrain → ChromaticAberration →
Levels → WarpingMesh → XBRZ`. SSR roda cedo; Curvature roda DEPOIS
  do Bloom (não é o warp final). XBRZ e Curvature são passes separados.
- **LightGlow v3.7.2 (Apr 2026)** removeu o threshold interno do
  bloom e ganhou polar mask com dependência temporal dinâmica — θ.3
  deve adotar essa versão atualizada em vez da v3.6.
- **B-V → RGB** em Gaia Sky: CIE xyY polinomial (Ballesteros formula
  for Teff + polynomial Teff→(x,y) + xyY→sRGB + gamma). Nossa
  piecewise-linear em 3 segmentos (L14/L16-calibrada) é menos acurada
  em estrelas frias. Registro em §9 como follow-up opcional; não
  trocar sem Playwright-baseline comparison.
- **Star shaders v3.7.0+** ganharam três modos de shading de billboard
  (emissive / uniformly-lit / spherical Phong) — θ.1 pode opcionalmente
  absorver o Phong em `ultra` para halo anisotrópico mais realista
  (documentado mas não planejado para a fase).
- **Billboard corona.** O `model_const = 172.4643429` é parâmetro de
  transição (not the trigger) — Gaia Sky combina com `dist < radius
× 2.5 / fovFactor` (surface-mode flag) para o swap final bilboard→mesh.
  θ.7 está correto em usar os dois.

---

## 9. Out-of-scope follow-ups (file as spawned tasks, not phase θ)

Original deferrals:

- **Relativistic aberration** (`lib/relativity.glsl`) — only sensible
  in a "research mode" UI; no current product need.
- **True lens flare** (`LensFlare.java` — the complex variant with
  per-element billboard chain) — we get 90 % of the look from θ.4's
  Chapman port for 20 % of the complexity.
- **Eye adaptation** (`toneMappingAuto` — adaptive Reinhard with luma
  mip-chain) — deferred to Wave γ per existing Wave α
  tone-mapping-dropdown plan.
- **God rays** (`lightscattering.frag.glsl`) — requires a volumetric
  light-position source; no current product need and adds a pass.
- **Atmospheric star twinkle** — not in Gaia Sky either; would be
  fiction for a space visualizer. (θ.14's "alive sky" is explicitly
  cinematic-flavor-only.)

Added after Codex review (2026-04-20):

- **Phong/spherical billboard shading mode for θ.1** (Gaia Sky
  v3.7.0+ three-mode shader). We ship θ.1 with the emissive mode
  only; the Phong variant is documented in §8.6 but a future Phase
  ι could add it as a DisplayPanel "Realistic Halo" toggle on
  `ultra` only. Low priority — visual delta is small vs θ.3's
  LightGlow.
- **Occlusion-aware star glow over objects** (Gaia Sky's "glow over
  objects" pass). If θ.3's port doesn't already cover it in < 30 LOC
  (see θ.3's optional fold-in clause), defer here as Phase ι's
  first candidate. Useful when a planet sprite crosses a bright star.
- **Star motion trails** (distinct from camera motion blur) —
  per-star velocity trails when the camera pans fast. Low visual
  impact at our typical camera speeds; defer.
- **Shadow mapping / eclipse shadows** — Gaia Sky exposes this as
  a first-class graphics setting. Would require depth-map render
  targets per shadow-caster body and is orthogonal to the
  star-focused scope of phase θ. Phase ι candidate if we pursue
  planetary-surface fidelity.
- **Dynamic resolution / back-buffer supersampling** — Gaia Sky
  exposes both dynamic (auto-scale under frame-budget pressure) and
  static back-buffer scale. Our tier system is an off-the-shelf
  alternative; could integrate this into the Wave α
  tone-mapping-dropdown follow-up rather than phase θ.
- **Volumetric nebulae** (`raymarching.frag.glsl`) — volumetric
  ray-march for H-II regions, dark nebulae. Expensive; defer.
- **Atmospheric Rayleigh + Mie scattering** — only meaningful when
  the camera is on/near a planet surface. Paired with shadow
  mapping in a future planetary-fidelity Phase ι.
- **Screen-Space Reflections (SSR)** — Gaia Sky enables for ocean
  and ice surfaces; also planetary-scope.
- **Gravity lensing / black-hole disc** — novelty; defer unless a
  dedicated black-hole mode appears in the product roadmap.
- **Anaglyph 3D** — Gaia Sky has it; niche accessibility feature,
  not a priority.
- **B-V → RGB via CIE xyY + Ballesteros** (more accurate in the
  cool-star regime than our piecewise-linear). See §8.6. Swap only
  with a Playwright-baseline comparison; low urgency.

---

## 10. Exit criteria for phase θ

Phase ships when:

1. All **fifteen ondas** (θ.1–θ.15, com θ.7 split em θ.7a/θ.7b — 16
   commits total) committed, cada uma com a coluna correspondente
   em §7 (unit coverage onde possível + config/math guard +
   Playwright) passando verde. "Unit n/a" passes §10.1 only if the
   corresponding config/math guard is green; §7's verification-rule
   paragraph is the authoritative reading.
2. `DisplayPanel` contém as novas linhas, todas funcionais, **com os
   nomes exatos abaixo** (não "Lens" standalone, que conflita com
   "Grading" do θ.6):
   - **Star shader:** "Diffraction Spikes" (θ.2), "Star Twinkle"
     (θ.14).
   - **Composer/HDR:** "Star Halo" (θ.3), "Lens Flare" (θ.4),
     "Motion Blur" (θ.5), "Grading" → {Chromatic Aberration,
     Vignette, Film Grain} sub-rows (θ.6), "Anti-aliasing" (θ.15),
     "Unsharp Mask" (θ.15), "Output Dithering" (θ.13).
   - **Scene-graph/backdrop:** "Orbit Line Glow" (θ.9),
     "Constellations" (θ.10), "Galactic Backdrop" + "HD Backdrop
     Asset" (θ.11), "Star Labels" (θ.12).
   - **Hero-star:** "Hero Star LOD" (θ.7a/b).
3. `A11yPanel` Reduced-Motion force-disables **θ.3, θ.5, e θ.14**
   per §4.2 (single source of truth). `todo.md` hard-constraints
   list matches verbatim.
4. Side-by-side reference screenshot (pre-θ.1 vs post-θ.15) commitado
   em `tasks/design/refs/phase-theta-before-after.png` e revisto
   contra equivalentes Gaia Sky no mesmo camera pose. Sub-screens
   por subsistema: star-shader, composer, scene-graph, backdrop,
   hero-LOD.
5. Frame budget no Intel Iris Xe reference device dentro de 15 %
   do pre-phase no tier ultra; constrained tier byte-identical ao
   pre-phase (todos os novos efeitos pulam). Backdrop θ.11 aceita
   até 20 % no ultra (asset heavy).
6. `HANDOFF.md` atualizado com "Phase θ shipped — Gaia Sky-inspired
   visual upgrade" status block, citando as 15 ondas.
7. Codex critical review da fase completado — o review de
   2026-04-20 é o primeiro pass; um segundo pass post-θ.15 é
   opcional se nenhum high-severity finding surgir em commit-review.
   Todos os findings high-severity endereçados ou deferidos
   explicitamente com rationale.
8. §8.6 corrections (pipeline chain order, LightGlow v3.7.2 polar
   mask, CIE xyY color grade, star shader v3.7.0+ billboard modes)
   foram aplicadas ou registradas como follow-up em §9.
9. Licensing/provenance notes presentes em `AboutPanel.tsx` para os
   assets third-party usados em θ.10 (IAU/Delporte) e θ.11 (ESO
   Milky Way).

### 10.1 Non-goals guard at exit

The following must remain true at exit (regression protection):

- HYG binary format unchanged (`public/data/hyg-stars/*.bin.gz`
  byte-identical to pre-phase).
- Log-compressed transfer curve `brightness = 2·log(1 + flux·250)`
  unchanged.
- AgX is still the tone mapper.
- `@react-three/postprocessing` is still the composer library.
- No `<shaderMaterial>` used as a JSX child in any file touched by
  phase θ (automated grep in CI).
