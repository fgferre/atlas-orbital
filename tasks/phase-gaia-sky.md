# Phase θ — Gaia Sky-inspired visual upgrade

Created: 2026-04-19 · Updated: 2026-04-20 (θ-audit: 6 rounds of source-verification against `/tmp/gaiasky`; §2/§4.1/§5.1/§5/§8/§8.6/§9/§10 all revised; θ.1b added; θ.1c added (motion trails — Round 5); θ.2 merged into θ.4; θ.13 moved to §9; Round 5 fixes: `lint` is smoothstep / `pow()` wrapped in `degrees12`/`radians12` / `u_brightnessPower` range [0.9, 1.1]; Round 6 fixes: StarSettings defaults + true-LensFlare vs Pseudo split + BillboardSet load-vs-procedural divergence) · Status: planning · Owner: fgferre

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
- ~~**Do not** change the log-compressed transfer curve
  `brightness = 2·log(1 + flux·250)` calibrated against NASA Eyes
  (L16, L17).~~ **REVOKED 2026-04-20 in the θ-audit** (see §8.6). The
  audit showed the NASA-Eyes log curve + `[5, 50]` / `[0.05, 1]` hard
  floors are fundamentally incompatible with Gaia Sky's solid-angle →
  opacity fade that the ported fragment shaders (θ.1 kernel, θ.14
  variability, θ.7 approach) all assume. Keeping the pin would force
  every downstream onda to either stack two brightness philosophies
  (violating "replace, don't stack") or ship a half-port. θ.1b ports
  the Gaia Sky vertex structure (`solidAngle = a_size / dist`,
  `opacity = lint(solidAngle, u_solidAngleMap, u_opacityLimits)`) and
  replaces the NASA-Eyes vertex math wholesale. L16 and L17 become
  historical (calibration work that belonged to Wave α's starting
  point, not the Gaia-Sky target). `NASAStarfield.tsx` +
  `shaders/nasaStarShaders.ts` also drop in θ.1b (they were the NASA-
  Eyes reference renderer for Wave α A/B; they have no role in a
  Gaia-Sky-only starfield).
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
    AgX last, `vfxHdrGain` uniform live on the legacy NASA starfield,
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

| Onda | constrained    | balanced           | high                | ultra               | Notes                                                                |
| ---- | -------------- | ------------------ | ------------------- | ------------------- | -------------------------------------------------------------------- |
| θ.1  | off            | on (hardcore)      | on (hardcore+halo)  | on (full)           | Sprite fragment (shipped 2026-04-20, `2662f08`+`13e501e`)            |
| θ.1b | on (solid-ang) | on (full)          | on (full)           | on (full)           | Vertex solid-angle port; replaces NASA-Eyes floor on ALL tiers       |
| θ.1c | off            | on                 | on                  | on                  | Billboard motion trails (stretch snippet). A11y RM hard-off.         |
| θ.3  | off            | off                | on (Subtle)         | on (Pronounced)     | LightGlow post-process (u_lightPositions + Archimedean spiral)       |
| θ.4  | off            | off                | on (Subtle)         | on (Full)           | Pseudo lens flare + lensdirt starburst (incl. diffraction spikes)    |
| θ.5  | off            | off                | off                 | on (Subtle)         | Camera motion blur                                                   |
| θ.6  | off            | on (vignette only) | on (CA+vignette)    | on (all three)      | Grading split into 3 toggles (direct port of Gaia Sky shaders)       |
| θ.7a | off            | off                | on (Ultra-only)     | on (Ultra-only)     | Hero-star corona billboard                                           |
| θ.7b | off            | off                | off                 | on (Ultra-only)     | Procedural surface                                                   |
| θ.8  | on (basic)     | on                 | on                  | on (cinematic)      | Camera feel — affects all tiers                                      |
| θ.9  | off            | on (Soft)          | on (Full)           | on (Full)           | Orbit-line glow shader                                               |
| θ.10 | off            | off                | on (Lines+Labels)   | on (Full)           | Constellations                                                       |
| θ.11 | off            | on (Cubemap)       | on (Cubemap+Dust)   | on (Cubemap+Dust)   | Milky Way backdrop                                                   |
| θ.12 | off            | on (Named bright)  | on (All named)      | on (Full)           | MSDF labels via troika (approximation of Gaia Sky SDF, §12 explains) |
| θ.14 | off            | off                | on (Subtle)         | on (Pronounced)     | Alive-sky twinkle (depends on θ.1b solid-angle vertex)               |
| θ.15 | off            | on (NFAA)          | on (FXAA+LumaSharp) | on (FXAA+LumaSharp) | Gaia Sky AA suite (NFAA + FXAA NVIDIA 3.11 + LumaSharpen — NO SMAA)  |

**Removed rows (§8.6 audit):** θ.2 (merged into θ.4 — diffraction
spikes are Gaia Sky's lensdirt starburst, not a per-star billboard;
see θ.4); θ.13 (Gaia Sky does not ship output dithering at the
composer; moved to §9 as atlas-only anti-banding follow-up).

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
`MainPostProcessor.java` ACTUAL `ppb.add()` sequence — verified in the
2026-04-20 θ-audit against lines 204–522 of the source). The earlier
revision of this section was wrong on multiple ordering points
(bloom-vs-flare, AA position, CA position) and has been corrected.

```
<Scene renders into linear HDR HalfFloat buffer>
     ↓
 θ.3 LightGlow                 (Scene linear HDR, runs FIRST per Gaia Sky)
     ↓
 (SSR — out of scope, §9)
     ↓
 θ.5 Camera motion blur        (Still in linear HDR at this stage)
     ↓
 θ.4 Pseudo lens flare + lensdirt (2 passes; lensdirt carries the starburst spikes)
     ↓
 θ.15 UnsharpMask (LumaSharpen) (Display-referred after AgX — contrast-aware sharpen)
     ↓
 Bloom                         (Gaia Sky does Bloom AFTER lens flare + unsharp — verified)
     ↓
 AgX ToneMapping               (atlas-only adaptation — Gaia Sky has Levels/Curvature here; we keep AgX)
     ↓
 (Curvature / Reprojection — out of scope, §9)
     ↓
 θ.6 NoiseEffect (film grain) → ChromaticAberration (Display-referred SDR, per Gaia Sky order)
     ↓
 θ.6 Vignette                  (Gaia Sky puts this in Levels / grading stage; we keep it adjacent to CA)
     ↓
 HueSat → BrightnessContrast   (Gaia Sky "Levels" — existing)
     ↓
 θ.15 Antialiasing (FXAA or NFAA) (LAST before framebuffer — verified in Gaia Sky)
     ↓
 Framebuffer
```

**Where we still diverge from Gaia Sky's literal order** — and why
(pipeline/render-space mismatches, classified R1 step-5 #2):

- We collapse Gaia Sky's `Blend3(UI)` pass (UI compositor) into
  `OverlayHTML` / React DOM overlays — not a shader, so no chain slot.
- Gaia Sky's `Curvature` / `Reprojection` / `WarpingMesh` / `XBRZ`
  are dome/projection-specific passes we do not port (§9 defers).
- AgX replaces Gaia Sky's `Levels` for tone-mapping purposes; we
  keep HueSat / BrightnessContrast as small post-adjust knobs.
- Vignette is placed adjacent to CA / filmgrain in our chain for
  surface coherence even though Gaia Sky lumps it into the Levels
  stage — zero-perf-cost reorder, visually identical because all
  three passes are display-referred SDR at that point.

**θ.13 output dithering is NOT part of this chain** — Gaia Sky does
not ship output dithering at the composer. See §9.

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
texture + razor-thin additive white core) to our instanced billboard
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
  billboard quad UV:
  ```glsl
  vec2 uv = vUv;
  float profile = texture2D(u_starTex, uv).r;
  if (profile <= 0.0) discard;
  float r = length(uv - vec2(0.5)) * 2.0;
  float core = clamp(1.0 - smoothstep(0.0, 0.04, r), 0.0, 1.0);
  float alpha = vBrightness * profile;
  gl_FragColor = clamp(alpha * vec4(vColor + vec3(core * 2.0), 1.0),
                       0.0, 1.0);
  ```
- `u_starTex`: 64×64 R8 radial-gaussian generated via a process-wide
  `Uint8Array` cache uploaded into a `THREE.DataTexture` on first
  material construction (no build script, zero bundle growth — plan's
  earlier option B path, realised via `DataTexture` instead of an
  `OffscreenCanvas` since the data is numeric, not a drawn bitmap).
  Wrap `ClampToEdgeWrapping`, filter `LinearFilter/LinearFilter`.
  Shape `exp(-r² / (2σ²))` (standard statistics Gaussian in texture-
  pixel space) with σ chosen so the profile reaches ≈ 0 at the corners.
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

**DisplayPanel.** No new slider. θ.1 only changes the fragment kernel;
θ.1b owns the Gaia-style size scalar through `u_sizeFactor`.

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

- L17 literal — Gaia Sky's core smoothstep triggers when
  `distance(vec2(0.5), uv) * 2.0 <= 0.04`, i.e. at UV radius ≤ 0.02.
  Against the post-θ.1b billboard sizes that maps to:
  - at 50 px sprite: core diameter ≈ 2 px, full halo diameter 50 px
    (core is 4 % of sprite width — a razor-thin pinpoint that the
    halo gaussian carries the rest of the sprite around);
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
- L17 DPR — the fragment shader does not introduce pixel math; size
  scaling lives in the vertex-stage billboard projection and
  `u_minQuadSolidAngle` is fed from the renderer backbuffer height.

---

### θ.1b — Vertex solid-angle port (replaces NASA-Eyes floor)

**Goal.** Port Gaia Sky's vertex-stage brightness / sprite-size
mathematics from `star.group.quad.vertex.glsl` so the fragment kernel
shipped in θ.1 is driven by the Gaia Sky vertex it was designed for.
This onda replaces the NASA-Eyes `brightness = 2·log(1 + flux·250)`
transfer curve + `clamp([5, 50])` / `clamp([0.05, 1.0])` hard floors
with Gaia Sky's solid-angle → opacity mapping, letting faint-distant
stars fade to invisibility like Gaia Sky does, instead of painting
every HYG star with the 5 px / 0.05 alpha floor the θ-audit surfaced
as a foundational descompasso.

**Gaia Sky reference.** `assets/shader/star.group.quad.vertex.glsl`
(read in full 2026-04-20). Key math:

```glsl
solidAngle = a_size / dist;
opacity = lint(solidAngle, u_solidAngleMap.x, u_solidAngleMap.y,
                          u_opacityLimits.x, u_opacityLimits.y);
solidAngle = clamp(radians12(pow(degrees12(solidAngle), u_brightnessPower)),
                   u_minQuadSolidAngle, 3.0e-8);
quadSize = solidAngle * dist * u_alphaSizeBr.y;
// ... boundary fade for close stars ...
float alpha = clamp(opacity * u_alphaSizeBr.x * boundaryFade, 0.0, 1.0);
```

Host defaults from `StarSetQuadComponent.java:46`:

- `u_solidAngleMap = vec2(1.0e-10, 2.0e-9)`
- `u_thAnglePoint = vec2(1.0e-10, 1.5e-8)`
- `opacityLimits` from `Settings.settings.scene.star.opacity[]`
  (user-adjustable; default values in `Settings.java` `StarSettings`).

**Port plan.**

- `src/components/canvas/Starfield.tsx` vertex shader: replace the
  NASA-Eyes brightness block with:
  ```glsl
  float solidAngle = a_size / dist;
  // `lint` in Gaia Sky `lib/math.glsl` is SMOOTHSTEP-based, not
  // linear — endpoints get a smoothstep curve, not a sharp ramp.
  // Port as (verified Round 5):
  //   float lint(float x, float x0, float x1, float y0, float y1) {
  //       if (x <= x0) return y0;
  //       if (x >= x1) return y1;
  //       return y0 + (y1 - y0) * smoothstep(x0, x1, x);
  //   }
  float opacity = lint(solidAngle,
                       u_solidAngleMap.x, u_solidAngleMap.y,
                       u_opacityLimits.x, u_opacityLimits.y);
  // `degrees12` / `radians12` scale by 1e12 around `pow()` so we do
  // not lose fp32 precision when raising a solid angle on the order
  // of 1e-10 rad to a fractional power. `lib/angles.glsl`:
  //   TO_DEG12 = 180.0e12 / PI; TO_RAD12 = PI / 180.0e12.
  // Without the 12-suffix wrappers, pow(1e-10, 1.0) in fp32 collapses
  // to zero. Port both macros alongside the vertex code.
  solidAngle = clamp(radians12(pow(degrees12(solidAngle),
                                   u_brightnessPower)),
                     u_minQuadSolidAngle, 3.0e-8);
  float quadSize = solidAngle * dist * u_alphaSizeBr_y;
  float boundaryFade = smoothstep(LEN0, LEN0 * 1e3, dist);
  float alpha = clamp(opacity * u_alphaSizeBr_x * boundaryFade,
                      0.0, 1.0);
  // Performance trick from source (star.group.quad.vertex.glsl:121):
  // if alpha collapses below 1e-3 OR the star is within LEN0 (θ.7
  // billboard takeover zone), null the quad so rasterisation emits
  // just one fragment which the fragment shader discards.
  if (alpha <= 1.0e-3 || dist < LEN0) {
      quadSize = 0.0;
      alpha = 0.0;
  }
  vBrightness = alpha; // fragment already consumes this
  viewPosition.xy += position.xy * quadSize;
  gl_Position = projectionMatrix * viewPosition;
  ```
- `a_size` (per-star attribute) — **source-verified pseudo-size, NOT
  physical radius.** Opus audit (2026-04-21) + `AstroUtils.java:463-475`
  JavaDoc: "The pseudo-size... has no physical meaning and has no
  relation to the actual physical size of the star."
  Full formula (1:1 port from `AstroUtils.absoluteMagnitudeToPseudoSize`):
  ```
  pseudoL = 10^(-0.4 · absMag)
  size    = min(sqrt(pseudoL) × 0.15, 1e10)  // parsecs (pre-STAR_SIZE_FACTOR)
  ```
  HYG v4.2 ships apparent magnitude + parallax-derived distance, so
  we compute `absMag = apparentMag − 5·log10(distPc / 10)` per star
  and pipe it through the formula (`src/lib/starPhysics.ts`).
  Crucially, `sqrt(L)` without a `/T²` correction means cool red
  supergiants (Betelgeuse) do NOT outsize bright hot dwarfs (Sirius),
  matching Gaia Sky's visible behaviour. The earlier θ.1b ship
  (2026-04-20) used Stefan-Boltzmann physical radii and produced
  Betelgeuse ≈ 350 R_sun sprites — on-screen bigger than the Sun —
  which the user flagged and the Opus audit diagnosed as a semantic
  drift, not a pipeline gap.
  Render-side multipliers match Gaia Sky exactly:
  `a_size_final = sizePc × STAR_SIZE_FACTOR × appSizeFactor`
  where `STAR_SIZE_FACTOR = 1.31526e-6` (`Constants.java:51`).
- Host defaults (verified Round 5 2026-04-20):
  - `u_solidAngleMap` = `vec2(1.0e-10, 2.0e-9)` (literal in
    `StarSetQuadComponent.java:46`).
  - `u_opacityLimits` = `vec2(opacity[0], opacity[1])` from
    `Settings.java StarSettings.opacity[]`. The `opacityLimitsHlShowAll`
    branch in `StarSetQuadComponent.java:35` uses `{0.95f, opacity[1]}`,
    so `opacity[1] ≈ 0.95` is consistent with the Gaia Sky defaults;
    `opacity[0]` confirmed in Round 6 deep-read of StarSettings.
  - `u_brightnessPower` = `1.0` default, valid range **`[0.9, 1.1]`**
    (`Constants.java:110–112`). The earlier draft's `0.6` was outside
    the Gaia Sky allowed range.
  - `u_minQuadSolidAngle` = `1.0e-10`.
  - `u_alphaSizeBr` = `vec3(alpha, size, brightness)` per source.
    Atlas binds `.x` to a global alpha scale (default `1.0`), `.y`
    to `u_sizeFactor` / billboard-size scaling, `.z` to a brightness
    multiplier for the final per-star colour. Gaia Sky brightness
    range: `[0.4, 8.0]` (`Constants.java:91,100`), default `1.0`.
  - `saturate = 0.16f` (default colour saturation, StarSettings).
    Not in the vertex; used later in B-V→RGB. Document for θ.14.
  - `glowFactor = 0.06` (default, StarSettings). Used by θ.3's
    LightGlow texture scale — documented there.
  - Star texture asset: `textureIndex = 4` default → Gaia Sky loads
    `tex/base/star-tex-04.{jpg,png}`. Atlas θ.1 currently ships a
    procedural 64×64 gaussian (σ=10) as a stack/API adaptation
    (asset bundle not distributed with the Gaia Sky source repo);
    for stricter parity, a future polish could download the actual
    asset and ship it under `public/textures/`. Note in θ.1b
    commit message.
  - LightGlow texture asset: `textureIndexLens = 1` →
    `tex/base/star-tex-01.{jpg,png}`. θ.3 references this
    separately.
- Boundary fade `LEN0 = 20000 / DISTANCE_SCALE` (scale to our units)
  fades stars out when camera gets within that distance (θ.7 hero-
  star approach takes over).
- Per-star `a_size` attribute added to the buffer geometry in
  `buildVelocityAttribute`'s sibling function
  (`buildStarSizeAttribute`), derived from the chosen option above.
- **Scope-cut (R7 — 2026-04-20 ship time):** `NASAStarfield.tsx` +
  `shaders/nasaStarShaders.ts` deletion DEFERRED to a follow-up commit.
  The cleanup touches ~13 files (`store.ts`, `StarfieldManager.tsx`,
  `LayersPanel.tsx`, `loaderStages.ts`, `Loader.tsx`, `lib/starfield.ts`,
  `nasaStarParser.ts` + test, etc.) — refactoring all of them in the
  same commit as the vertex port would inflate the diff past "one
  feature per onda". The vertex-port core ships alone; NASA cleanup
  lands as a separate `chore(starfield): delete NASA reference
renderer` commit. NASAStarfield remains accessible via the existing
  LayersPanel "Source" toggle until that cleanup.
- Delete the `brightness = 2·log(1 + flux·250)` math in
  `starfieldPointMetrics` + its 23 unit tests; replace with
  `starfieldSolidAngleMetrics` mirroring the new vertex math.
- **Known visual side-effect, documented not fixed:** post-θ.1b the
  background-star billboard size is governed by apparent magnitude
  after the pseudo-size path: in the canonical 1080×1.5-DPR / 60° view,
  Sirius projects to ~50.5 px, Capella to ~31.7 px, and Betelgeuse to
  ~26.4 px. LightGlow (θ.3) still adds the Gaia Sky default halo layer
  for named lights, but it is not responsible for fixing this base
  magnitude ordering.

**Parameters (ultra defaults).** Above — `u_solidAngleMap`,
`u_opacityLimits`, `u_brightnessPower`, `u_minQuadSolidAngle`. Per-
star `a_size` derived via `AstroUtils.absoluteMagnitudeToPseudoSize`
(1:1 port in `src/lib/starPhysics.ts`).

**DisplayPanel.** No new panel row in this diff. The source-equivalent
size scalar is `u_sizeFactor`; `u_alphaFactor` remains the global alpha
scale.

**Verification.**

- Unit: new `starfieldSolidAngleMath.test.ts` pins the mapping at
  sample distances + sizes. Specifically:
  - `solidAngle = size / dist`;
  - `opacity = lint(...)` at the two map endpoints;
  - boundary fade at `dist = LEN0` (zero) and `dist = LEN0 · 1e3`
    (one).
- Unit: ordering test — for fixed size, opacity is monotonically
  non-increasing with distance (no ringing).
- Playwright: `e2e/starfield-solidangle.spec.ts` — pan camera away
  from the HYG cluster, assert faint-star pixel count decreases
  (evidence of the fade).
- Manual preview: Orion at default zoom vs. 10× zoom out — the
  faint tail should visibly thin. At default HYG density we expect
  ~50 % of stars to opacity-zero at the widest zoom, matching
  Gaia Sky's typical looking.

**Feasibility.** Medium. Vertex port is ~30 lines of GLSL; `a_size`
attribute synthesis is the substantive work (~80 LOC in
`hygBinary.ts` extension or a sibling loader).

**Risks.**

- L14 (historical) literal — perceptual lifts stay anchored to the
  raw physical axis. We're swapping the curve from log-compressed to
  solid-angle; the new axis is `solidAngle`, not `brightness`.
  `faintLift` window math lives in the retired NASA path and is
  removed together.
- L15 literal — the existing `useMemo`'d ShaderMaterial is extended
  with new uniforms; no JSX `<shaderMaterial>` slip.
- L17 DPR — `u_minQuadSolidAngle` needs the renderer backbuffer height,
  i.e. CSS height × `gl.getPixelRatio()` (same source scalar Gaia Sky
  uses through `backBufferSize[1]`).
- Visual regression risk on the Wave α baselines. All current
  starfield Playwright specs + pixel-diff fixtures drop and get
  rebuilt against the post-θ.1b baseline. This is a one-time
  rebuild, flagged here so no one treats the invalidation as a bug.
- Migration hazard: any downstream component that reads the HYG
  magnitude floor (`vBrightness ≥ 0.05`) loses that invariant.
  Audit `Planet.tsx`, `Starfield.test.ts`, and the overlay tracker
  before ship.

---

### θ.1c — Star billboard motion trails (Round 5 addition)

**Goal.** Port Gaia Sky's motion-trail billboard stretching from
`assets/shader/snippet/billboard.stretch.glsl`. Every star in Gaia
Sky goes through this snippet via the `star.group.quad.vertex.glsl`
`#include`. When the camera moves fast, the billboard quad ELONGATES
in the direction of `u_camVel`, producing the subtle streaking that
makes a Gaia Sky fly-through feel cinematic. The atlas currently
ships flat (non-stretched) billboards; θ.1b inherits that flatness.
θ.1c adds the stretching as a separate onda so θ.1b's solid-angle
port stays small.

**Gaia Sky reference.** `assets/shader/snippet/billboard.stretch.glsl`
(115 lines, verified Round 5 2026-04-20). Key shape:

- Compute billboard axes (`s_right`, `s_up`, `s_obj`).
- Branch on `dot(u_camVel, u_camVel) == 0.0`:
  - If zero velocity: plain rotation (same as `billboard.fast.glsl`).
  - Else: quaternion-based rotation + screen-space velocity estimate
    via `ndc_now - ndc_next`, stretch factor
    `stretch = (screenVel * 300)^1.5` clamped at 6.0, distance
    fade-out `smoothstep(50 Mpc, 30 Mpc, distance)`, brightness
    compensation `v_col.rgb *= min(2.0 / (1.0 + stretch), 1.0)`.
- `obj_next = s_obj_pos - u_camVel * u_dt` — predicts next-frame
  object position for the screen-velocity calc.

**Port plan.**

- Add two new uniforms to the Starfield vertex shader:
  - `u_camVel` (vec3) — camera velocity in world units per second.
  - `u_dt` (float) — delta time in seconds (reused from the
    Gaia Sky signature).
- CPU-side infrastructure (`useFrame` in `Starfield.tsx`):
  - Track camera world-position between frames in a `useRef`.
  - `camVel = (worldPos - prevWorldPos) / dt` (world-units / s).
  - Upload `u_camVel` + `u_dt` to the material each frame.
  - Zero `u_camVel` when paused or when `a11y.reducedMotion === true`
    (the stretch implies apparent motion — Reduced Motion must
    suppress it).
- Port `billboard.stretch.glsl` as a new GLSL include
  `src/components/canvas/shaders/billboardStretch.glsl` (string
  template imported by the vertex). Requires the quaternion helpers
  `q_look_at`, `qrot`, `qmul`, `q_conj` from Gaia Sky
  `lib/geometry.glsl` — port those to
  `src/components/canvas/shaders/geometryHelpers.glsl`.
- Swap the Starfield vertex's current `gl_Position` calculation for
  the ported snippet's output. Quad geometry (the 4-vertex attribute
  `a_position`) stays as-is — the snippet rotates in-place.
- `DISTANCE_SCALE` from `Starfield.tsx` is our `u_uToMpc` substitute:
  the snippet uses `u_uToMpc` to convert internal units to Mpc for
  the distance fade-out at 50 Mpc / 30 Mpc. Atlas HYG positions are
  parsecs × `DISTANCE_SCALE`; `u_uToMpc = 1 / (DISTANCE_SCALE * 1e6)`
  (parsec-to-Mpc is 1e-6).

**Parameters (ultra defaults — from Gaia Sky source).**

- `stretch = (screenVel * 300)^1.5`, clamped at `6.0`.
- Distance fadeout: `smoothstep(50 Mpc, 30 Mpc, dist)` — streaking
  only visible within ~50 Mpc (essentially always for our local
  stars).
- Brightness compensation: `v_col.rgb *= min(2.0 / (1.0 + stretch), 1.0)`
  — keeps peak luminance when sprite elongates.
- Reduced Motion: `u_camVel` held at `vec3(0.0)`, snippet drops into
  the no-trail fast path.

**DisplayPanel.** Row **"Motion Trails"** — `Off / On`.
Default: `On` for balanced / high / ultra; `Off` for constrained.
A11yPanel Reduced Motion force-overrides to `Off`.

**Verification.**

- Unit: `billboardStretchMath.test.ts` — pins the stretch formula
  at three sample screen-velocities (slow, medium, fast — all
  below and at the 6.0 clamp), the brightness-compensation ratio,
  and the 50→30 Mpc fade curve.
- Playwright: `e2e/motion-trails.spec.ts` — scripted pan at known
  angular velocity; assert bright-star cluster pixel footprint
  elongates along the velocity direction by `> 1.5×` its rest
  footprint, and brightness per pixel drops by the compensated
  factor.
- Manual: pan across Canis Major at ultra tier; Sirius should
  streak visibly in the pan direction, stop streaking when the pan
  stops.

**Feasibility.** Medium. Main complexity is the quaternion math +
CPU-side camera-velocity tracking. All of it is port, no invention.

**Risks.**

- L18 / L19 literal — `u_camVel` / `u_dt` are per-frame uniform
  writes on the memoised ShaderMaterial; same pattern as θ.1b's
  time/min-solid-angle uniforms. Do NOT subscribe the vertex to React
  store state.
- The atlas's logarithmic depth buffer interacts with
  `obj_next = s_obj_pos - u_camVel * u_dt`. If the predicted
  next-frame position projects past the log-depth far plane, the
  NDC delta is garbage. Clamp `u_camVel` magnitude to keep
  `obj_next` within the current frame's near/far band, or project
  through a linear-depth matrix for the velocity calc only.
- Reduced Motion gate — if the `useFrame` forgets to zero `u_camVel`
  in reduced-motion mode, vestibular-sensitive users see streaking.
  Hard mount-time check, not just a uniform guard.

**Dependency.** Must ship AFTER θ.1b (the stretching math assumes
`quadSize` from θ.1b's solid-angle vertex output). Sequenced in §8.

---

### θ.2 — MERGED into θ.4 by the 2026-04-20 θ-audit

θ.2 as originally scoped ("per-star additive billboard diffraction
spike") was an invented simplification. Gaia Sky's diffraction spikes
actually live in the `lensdirt.frag.glsl` pass of the pseudo-lens-
flare pipeline, sampled from a shared 1D starburst texture
(`u_texture2` in the source). The spikes are screen-centric (radial
from viewport center), not per-star. Porting a per-star billboard
cross would deliver an effect that does NOT match Gaia Sky's
appearance, violating the 1:1 rule.

**Scope consolidation:** the diffraction-spike feature now ships
inside θ.4's 2-pass lens-flare onda, where `lensdirt.frag.glsl`
delivers the starburst modulation naturally. See §5 θ.4 for the
combined port plan.

**§4.1 table row for θ.2 removed.** The `graphicsOverrides.diffractionSpikes`
DisplayPanel key from the original plan now lives on θ.4's "Lens
Flare" row as a sub-option ("with / without starburst spikes").

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

**Port plan.** (Rewritten 2026-04-20 per θ-audit — the previous plan's
"skip the Archimedean spiral" simplification was invented; Gaia Sky's
LightGlow fundamentally needs per-light NDC positions, not bright-
pass buffer, to work at all.)

- Port **both** shaders verbatim: `lightglow.vert.glsl` (Archimedean
  spiral luma sampler — 77 lines, no simplification) and
  `lightglow.frag.glsl` (time-animated polar-mask glow — 99 lines).
  The vertex samples the scene texture at `fx(t, a) = a·t·cos(t)` /
  `fy(t, a) = a·t·sin(t)` spiral points around each `u_lightPositions[li]`
  (NDC, `vec2`) to produce per-light `v_lums[li]`; the fragment uses
  that lum + a time-animated `polarMask(uv, time)` to paint the glow.
- **New infrastructure (CPU-side light registry).** Gaia Sky feeds
  `u_lightPositions[MAX_LIGHTS]` (default `MAX_LIGHTS = 8`),
  `u_lightColors[]`, `u_lightViewAngles[]`. Verified in
  `core/src/gaiasky/render/postprocess/effects/LightGlow.java`:
  `setLightPositions(nLights, float[] vec)`,
  `setLightSolidAngles(float[])`, `setLightColors(float[])`.
  Atlas needs an equivalent light registry:
  - Sun (always present).
  - Active hero-stars from θ.7a's detector (reuse the mutable-ref
    cached nearest-bright-star list).
  - Maximum 8 lights; if more qualify, pick the brightest by
    solid-angle.
  - Per-frame in `useFrame`: project each world position through
    the camera, emit NDC `vec2` into a packed `Float32Array` that
    gets uniformly uploaded (L19 — store-quiet guard: only upload
    when the array's pixel-quantized fingerprint changes).
- Custom `Effect` subclass in
  `src/components/canvas/scene/effects/LightGlowEffect.ts`, wrapping
  pmndrs `Effect`. The Effect owns the spiral-sampler vertex shader
  - polar-mask fragment shader + glow-sprite texture
    (`u_texture1` = the "starImage" that the fragment samples at the
    glow uv; Gaia Sky loads this as a PNG, we generate via
    `OffscreenCanvas` or ship the same baked asset).
- Insert position per §5.1 (LightGlow runs FIRST in the Gaia Sky
  chain, before bloom). ShaderMaterial constructed via `useMemo` (L15
  literal).
- Pass `u_time` uniform from `simulationClock.getNow()` (L18 literal).
  When `a11y.reducedMotion === true`, **do not mount the effect at
  all** (§4.2). Freezing `u_time` pays fragment cost for zero visible
  change — forbidden.
- `u_orientation` — Gaia Sky can rotate the glow texture per-frame
  for a drifting star-spike look; keep off by default (`0.0`) since
  the polar mask already animates.
- **LightGlow v3.7.2 alignment (§8.6).** Gaia Sky v3.7.2 kept the
  Archimedean spiral but made the polar mask time-animated
  independently — exactly what our fragment port does above.

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

### θ.4 — Pseudo lens flare + lensdirt starburst (Chapman ghosts + halo + diffraction spikes)

**Goal.** Full Gaia Sky lens-flare pipeline: Chapman ghost march down
the optical axis + wide halo ring + chromatic RGB separation +
**lensdirt composite with diffraction-spike starburst**. This is
where the "diffraction spikes" feature lives — originally mis-scoped
as θ.2, now merged here per the 2026-04-20 θ-audit because Gaia Sky's
spikes are sampled from a shared 1D starburst texture radially from
screen center (`radial = centerVec.x / d`), not from per-star
billboards.

**Gaia Sky reference (verified 2026-04-20).**

- `assets/shader/postprocess/pseudolensflare.frag.glsl` (68 lines) —
  John Chapman's pseudo-lens-flare (MPL2). Ghost march + halo sample.
- `assets/shader/postprocess/lensdirt.frag.glsl` (37 lines) — the
  composite pass. Reads scene (`u_texture0`) + dirt (`u_texture1`) +
  1D starburst (`u_texture2`) + `u_starburstOffset`. Samples
  starburst twice (rotated by `u_starburstOffset`, once as
  `abs(radial - offset)`, once as `abs(-radial + offset)`) and
  multiplies. Final: `fragColor = base * (dirt * 3.0 + starburst)`.
- `core/src/gaiasky/render/MainPostProcessor.java:279` — `PseudoLensFlare`
  construction takes `lensColor`, `lensDirt`, `lensStarBurst` as 3
  distinct texture assets at a half-res FBO (`lensFlareSettings.fboScale`).

**Partial parity disclosure.** Gaia Sky ships **two** lens-flare
pipelines (confirmed Round 6, `MainPostProcessor.java:279/301`):

1. **PseudoLensFlare** (this onda): screen-space Chapman-style, reads
   HDR bright-pass. Good for general bright-source flaring.
2. **True LensFlare** (`lensflare.frag.glsl`, `LensFlareFilter.java`):
   per-known-light flares using `u_lightPositions[]` + intensities,
   with `#define simpleLensFlare` / `complexLensFlare` / `useLensDirt`
   variants. Visually distinct from pseudo — specific-light oriented,
   not screen-centric. **Deferred to §9** because the complex variant
   is ~3× the implementation cost of pseudo and the user settings
   default to pseudo.

θ.4 ships **pseudo only** — matches Gaia Sky's default
`settings.postprocess.lensFlare.type = pseudo`.

**Port plan.** Two composer passes (not one merged pass):

1. **PseudoLensFlareEffect** (`src/components/canvas/scene/effects/PseudoLensFlareEffect.ts`):
   direct GLSL port of `pseudolensflare.frag.glsl`. Input = HDR scene
   sampled at `u_texture0`. Generates ghost march + halo. Output is
   the flare layer, not composited yet.
2. **LensDirtEffect** (`src/components/canvas/scene/effects/LensDirtEffect.ts`):
   direct GLSL port of `lensdirt.frag.glsl`. Takes the scene +
   dirt texture + starburst texture. Renders the final composite with
   diffraction spikes.

Assets, in `public/textures/lens/`:

- `lensColor.png` — gradient for chromatic aberration lookup (port
  Gaia Sky's asset if licence permits; otherwise generate a neutral
  RGB gradient at build time).
- `lensDirt.png` — low-contrast dirt mask, 512×512. Generated via
  `scripts/build-lens-assets.mjs` (AGENTS.md §11 preflight: grep
  `scripts/` before creating; no existing equivalent).
- `lensStarBurst.png` — 1D strip (e.g. 256×1) with the starburst
  profile. Generated alongside dirt. The specific profile controls
  the spike count and angular distribution.
- `u_starburstOffset` — rotates with camera look direction so spikes
  drift naturally when the user pans. Animated per-frame.

Per §5.1 chain: both effects run BEFORE bloom (Gaia Sky's order —
lensFlare at position 311, bloom at position 336). HDR signal gives
the ghost weighting its filmic character; post-bloom would wash it
out.

**Parameters (ultra defaults).**

- `u_ghosts = 8`, `u_ghostDispersal = 0.4`, `u_haloWidth = 0.45`,
  `u_aberrationAmount = 3.5` texels. Values verified in source.
- Lensdirt: `dirt * 3.0 + starburst` (hardcoded coefficients in the
  source — port verbatim).
- `u_starburstOffset`: derived from camera yaw × 0.1 per frame (gives
  slow spike drift without visible flicker).
- FBO scale: 0.5 (half-res for ghost pass, same as Gaia Sky default).

**DisplayPanel.** One row **"Lens Flare"** with
`Off / Pseudo Flare / Pseudo Flare + Spikes`. The spike setting
toggles the LensDirt pass's `u_texture2` sampling (null → no
spikes; asset bound → spikes). Default on `ultra`, off on `high`
and below; `balanced` gets "Pseudo Flare + Spikes" at half-intensity
as of the audit (originally deferred to ultra-only — the audit
lowered the tier floor since the perf cost is ~0.3 ms on Iris Xe
once FBO scale is 0.5).

**§4.1 row merger.** This onda now covers the θ.2 effect the
previous plan scoped separately. `graphicsOverrides.diffractionSpikes`
becomes a sub-key of `graphicsOverrides.lensFlare`.

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

- **Direct port of the three Gaia Sky shaders** (rewrite 2026-04-20 per
  θ-audit). The previous plan used pmndrs library defaults, which
  approximate but do not reproduce Gaia Sky's specific math:
  - `chromaticaberration.frag.glsl` (17 lines) — `aberrated =
u_aberrationAmount · pow(length(vec_center_pixel), 3) · sign(...)`.
    **Cubic radial profile**, not pmndrs's linear offset.
  - `vignetting.frag.glsl` (99 lines) — `factor = smoothstep(VignetteX,
VignetteY, distance(uv, center))`. Has optional CONTROL_SATURATION - ENABLE_GRADIENT_MAPPING flags (we port only the base vignette;
    the LUT path is out of scope).
  - `filmgrain.frag.glsl` (24 lines) — three independent RGB channel
    grains (`rand(uv + t)`, `rand(uv*0.8 + t)`, `rand(uv*1.2 + t)`),
    NOT monochrome noise. `grain = rgb_noise * intensity - intensity/2`
    then `saturate(color + grain)`.
- Port each into a custom `Effect` subclass:
  - `src/components/canvas/scene/effects/ChromaticAberrationEffect.ts`
    (~5 lines of GLSL body).
  - `src/components/canvas/scene/effects/VignetteEffect.ts` (~10 LOC
    GLSL body — base only, no saturation / LUT).
  - `src/components/canvas/scene/effects/FilmGrainEffect.ts`
    (~10 LOC GLSL body — uses `simple_noise` port of
    `lib/simple_noise.glsl`).
- Wire into `PostProcessingPipeline.tsx` per §5.1 (corrected post-
  audit): `FilmGrain → ChromaticAberration → Vignette → Levels
(HueSat + BrightnessContrast) → Antialiasing`.
- Gated by three new keys on `graphicsOverrides`:
  `chromaticAberrationEnabled`, `vignetteEnabled`, `filmGrainEnabled`,
  each with their own intensity slider.

**Parameters (ultra defaults, from Gaia Sky source).**

- Chromatic aberration: `u_aberrationAmount = 0.05` (default in
  the source; tunable per Gaia Sky Settings).
- Vignette: `VignetteIntensity = 0.5`, `VignetteX = 0.35`,
  `VignetteY = 0.7`, `CenterX = CenterY = 0.5`.
- Film grain: `u_intensity = 0.03`, `u_time` from simulation clock.

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

**Parameters (ultra defaults).** Literal values from
`starsurface.fragment.glsl` (read 2026-04-20 θ-audit):

- **FBM opts** (`gln_tFBMOpts` struct):
  - seed = `0.3245`
  - amplitude = `0.1`
  - persistence = `1.4`
  - frequency = `80.0`
  - lacunarity = `2.0`
  - scale = `vec3(4.0, 4.0, 4.0)`
  - power = `1.0`
  - octaves = `1` (ultra), `1` (high — Gaia Sky does NOT scale this
    up; plan's earlier "high=1, ultra=2" was invention)
  - redistribution = `false`, terbulance = `false`
- **Surface-sphere mapping** — viewport hardcoded as
  `vec2(1500.0, 750.0)`, `phiStep = PI / (viewport.y - 1)`,
  `thetaStep = 2·PI / viewport.x`. `r = triangle_wave(time) * 0.2 +
1.0` modulates noise seed over time.
- **Sunspot curl**: `s = 0.47`, `un_radius = 2.3`, `frequency = 1.6`,
  `ss = max(f1 - s, 0) * max(f2 - s, 0) * 4`, `ss2 = pow(ss * 1.5,
5.0)`.
- **Final composite**: `color = n * (1 - ss) - ss2`, then
  `fragColor = min(vec3(0.9), color * 6.0 * v_lightDiffuse * percolor)`
  with `percolor = v_lightDiffuse * min(1, perimeter + 0.5)` and
  `perimeter = dot(normalize(v_normal), v_viewVec) * 0.6`.
- **Approach threshold**: `10 AU` (heliocentric radius equivalent
  scaled by star's physical radius; atlas-specific, not from Gaia
  Sky — their threshold is `radius × 2.5 / fovFactor` for the
  billboard→surface swap only).
- Billboard→surface swap: `dist < radius × 2.5 / fovFactor` (direct
  port from Gaia Sky `NaturalCamera.java` line 527 surface-mode flag).
- Cross-fade duration: `500 ms` (atlas-specific UX choice).
- Sunspot scale adjusted per spectral class via
  `src/lib/starPhysics.ts` (new file).

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

**Post-2026-04-20 θ-audit revision.** Fourteen ondas in phase θ
(θ.7 split em θ.7a/θ.7b; θ.1 itself split into θ.1/θ.1b per the
audit; θ.2 merged into θ.4; θ.13 moved to §9). Ordem revista pra
respeitar a dependência θ.1b → θ.14, o casamento de composer
passes na ordem do Gaia Sky real (§5.1), e agrupamento de
context-switches por subsistema.

| #   | Onda | Effort | Subsystem       | Ship order rationale                                                                                                    |
| --- | ---- | ------ | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| —   | θ.1  | S      | Star shader     | **SHIPPED 2026-04-20** (`2662f08`, `13e501e`). Sprite fragment port.                                                    |
| 1   | θ.1b | M      | Star vertex     | **MUST ship before θ.14 and θ.1c.** Vertex solid-angle port + NASAStarfield cleanup. Rebaselines all starfield specs.   |
| 2   | θ.1c | M      | Star vertex     | Billboard motion-trail stretch + quaternion helpers + CPU cam-velocity tracking. Ships after θ.1b's quadSize is stable. |
| 3   | θ.6  | S      | Composer        | Grading finishes (direct-port CA/vignette/grain). Small, display-referred, easy to baseline.                            |
| 4   | θ.9  | M      | Scene-graph     | Orbit-lines quad-strip + core-glow shader. Base for θ.10 constellation reuse.                                           |
| 5   | θ.10 | M      | Scene-graph     | Constellations lines + first troika-MSDF labels. Shader reuse from θ.9.                                                 |
| 6   | θ.12 | S      | Scene-graph     | Named star labels via troika (MSDF approx of Gaia Sky SDF — §12 notes).                                                 |
| 7   | θ.8  | M      | Camera          | Camera feel (cinematic damping + FoV easing + surfaceMode). No shaders — ships before composer passes to isolate blame. |
| 8   | θ.3  | M      | Composer        | LightGlow (u_lightPositions + Archimedean spiral). First "big" composer pass; validates infra for θ.4/θ.5.              |
| 9   | θ.5  | M      | Composer+Depth  | Camera motion blur. Depth/velocity buffer; slot before lens-flare per §5.1 order.                                       |
| 10  | θ.4  | M-L    | Composer        | Pseudo lens flare + lensdirt starburst (diffraction spikes). 2 passes; reuses effect-wrapper of θ.3.                    |
| 11  | θ.15 | M      | Composer        | NFAA + FXAA + LumaSharpen (direct ports, no SMAA). Slot near end so re-baseline happens once.                           |
| 12  | θ.14 | S      | Star vertex     | Variability twinkle. **Hard dep on θ.1b** (solid-angle axis). Size-multiplier per-star.                                 |
| 13  | θ.11 | M-H    | Backdrop/assets | Milky Way cubemap + dust. Asset pipeline + 2-layer blend; highest bloom-regression risk.                                |
| 14  | θ.7a | M      | Hero-LOD        | Detector de aproximação + corona billboard (hero-star).                                                                 |
| 15  | θ.7b | L      | Hero-LOD        | Procedural surface (with literal FBM opts from θ-audit) + cross-fade. Largest item; slot last.                          |

Notas:

- **θ.1b antes de tudo composer-level:** revoking the NASA-Eyes curve
  invalidates all pre-phase-θ starfield Playwright baselines. Slot
  first so the post-θ.1b baseline becomes the pinned reference for
  every later onda.
- **θ.1b antes de θ.14:** Gaia Sky's variability shader perturbs the
  size axis (solid-angle). θ.14 is architecturally incoherent until
  θ.1b lands.
- **θ.6 antes dos composer-grandes (θ.3/θ.4/θ.5):** CA/vignette/grain
  são display-referred no final da chain; shippar cedo significa que
  a baseline dos composer-grandes já inclui o "look" final e não
  precisa rebaselines duplos quando θ.6 entrar depois.
- **θ.8 antes de θ.5 (motion blur):** cinematic damping muda
  simulação de velocidade da câmera; shippar antes do motion blur
  garante que o tuning do `u_blurScale` é feito contra o damping
  final, não o pre-cinematic.
- **θ.3 antes de θ.4:** Lens-flare reusa o custom-Effect wrapper
  estabelecido por θ.3, E lens-flare assume que a composer chain já
  tem LightGlow operativa (confirmar no matched-shot da θ.4 que a
  cadeia lightglow → flare produz o "look" Gaia Sky).
- **θ.5 entre θ.3 e θ.4** na §5.1 real (verified audit): motion blur
  slot é antes de lens flare. Sequenced accordingly.
- **θ.11 antes de θ.7:** backdrop Milky Way muda luminância de fundo;
  θ.7 cross-fade billboard→surface calibra contra o background
  final, não o preto pré-θ.11.
- **θ.15 (AA) LAST composer slot:** Gaia Sky's AA runs last in
  `ppb.add` sequence; slot at end so all prior passes baseline
  without AA, then AA lands as a once-pixel-shift commit.

**Phase estimate:** 14 ondas + θ.1b = 15 ondas in phase θ, approx.
22–26 commits (one per onda + Codex follow-up + occasional split).
θ-audit revision is itself a separate commit (doc-only).

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
- **Adaptation classification (R1 step-5 #1, stack/API mismatch).**
  Gaia Sky's `BillboardSet` component (confirmed Round 6) defaults
  to LOADED particle data files (`BillboardSet.procedural = false`);
  procedural generation via `GalaxyGenerator` / `GalaxyMorphology`
  - seed is a FALLBACK when the loaded file is absent. Atlas ships
    procedural-only for license-cleanliness — we do not bundle Gaia
    Sky's particle data. Document the divergence in the onda commit.
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

- **Adaptation classification (R1 step-5 #1, stack/API mismatch).**
  Gaia Sky `font.fragment.glsl` is a **single-channel SDF** (reads
  `.a` from a distance-field atlas, thresholds at 0.6 with a
  scale-adaptive `smoothing = 1/(16·u_scale)`). troika-three-text —
  the atlas-side binding via `@react-three/drei` `<Text>` — is **MSDF
  (multi-channel SDF)**. MSDF preserves sharp corners better than
  SDF on small glyphs but the sample math is different. Porting a
  full custom SDF renderer (atlas build + rasteriser + GLSL) is ~300
  LOC of net-new infrastructure, outside θ scope. troika gives us
  equivalent functionality with a different sampler — acceptable
  adaptation, flagged as non-1:1 (labels will NOT be pixel-identical
  to Gaia Sky's labels).
- Trocar por `@react-three/drei` `<Text>` (troika-three-text). Atlas
  MSDF pré-empacotado no troika — zero asset build.
- Componente `src/components/canvas/StarLabels.tsx`: consome o sidecar
  `hyg-v1.names.json` (já carregado em θ-prerreq), filtra estrelas com
  `mag < LABEL_MAG_THRESHOLD` (default `2.0` → ~45 labels).
- Solid-angle fade: `opacity = smoothstep(THRESHOLD_MIN, THRESHOLD_MAX,
starSolidAngleInViewport)`. (Matches Gaia Sky's
  `font.vertex.glsl:22` formula `v_opacity = u_opacity *
  clamp((pow(u_viewAngle, u_viewAnglePow) - u_thLabel) / u_thLabel,
  0, 0.95) * u_componentAlpha`.)
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

### θ.13 — REMOVED from phase θ by the 2026-04-20 θ-audit

**Why removed.** The audit revealed that Gaia Sky does not ship
output dithering at the composer: `MainPostProcessor.java`'s
`ppb.add(...)` sequence does not include a Dither effect, and the
cited `assets/shader/lib/dither4x4.glsl` is a utility function for
**alpha-threshold binarisation** (`alpha < limit ? 0 : 1`) used
internally by other shaders — NOT an output anti-banding pass. The
plan's earlier "addition-based Bayer dither at composer terminal"
was an atlas-specific anti-banding idea that happened to re-use the
Bayer matrix, not a port of Gaia Sky behavior.

**Where it went.** Kept as an atlas-only Wave β candidate in §9
("Out-of-scope follow-ups"). If output banding becomes a visible
regression after θ ships, the 20-line Bayer addition pass stays
available as a single-commit fix outside phase θ. Removing it here
keeps phase θ honest about "what Gaia Sky ships" vs. "what atlas
would benefit from".

**§4.1 row removed.** `graphicsOverrides.dithering` retired.

---

### θ.14 — Alive-sky twinkle (variable-star LUT generalizada)

**Goal.** Aplicar um efeito sutil de "twinkle" (amplitude ±0.08
magnitude, período 3–7 s randomizado por estrela) em um subset
aleatório de ~5 % das estrelas do starfield — técnica generalizada da
LUT de phase-folded variable-stars do Gaia Sky.

**Gaia Sky reference.**

- `assets/shader/variable.group.quad.vertex.glsl` — LUT lookup
  phase-folded com linear interp entre sample points.

**Hard dependency on θ.1b.** This onda depends on the solid-angle
vertex port from θ.1b. Gaia Sky's `variable.group.quad.vertex.glsl`
applies the variability perturbation to the star's **size** input
feeding `solidAngle = size / dist` — NOT to any brightness /
magnitude intermediate. Under the atlas pre-θ.1b NASA-Eyes vertex
the perturbation axis doesn't exist; shipping θ.14 before θ.1b
would graft the wrong kind of perturbation onto the wrong axis.
θ.14 is sequenced AFTER θ.1b in §8.

**Port plan.** (Rewritten 2026-04-20 per θ-audit — was tied to the
retired log-compressed curve; now aligns with θ.1b solid-angle axis.)

- Generate per-star variability LUT following Gaia Sky's packing:
  `variable.group.quad.vertex.glsl` samples a `u_variabilityTex` of
  texels `(mag, time, packedColor, 1)` per entry, with
  `a_nVari` + `a_varIndex` selecting the star's slice. Atlas can
  simplify to a single-profile LUT 128×1 RGBA (shape `cos(2π·t) +
0.3·cos(6π·t)` clamped) since HYG does not ship per-star light-
  curves. Document as a stack/API mismatch (R1 step-5 #1).
- Per-star attributes: `a_twinkleEnabled` (0/1, set for a seeded
  ~5 % subset) + `a_twinklePhase` (hash of HIP id).
- **Apply in the size-axis (θ.1b's physical axis)**, verbatim from
  the Gaia Sky source:
  ```glsl
  float sizeDelta = 1.0 + 0.08 * sampleLUT(a_twinklePhase, u_time) * a_twinkleEnabled;
  float solidAngle = (a_size * sizeDelta) / dist;
  // remainder of the vertex follows θ.1b
  ```
  The perturbation multiplies `a_size` (a positive physical radius),
  so `solidAngle` stays non-negative and magnitude ordering is
  preserved (L14 literal: perturb the physical axis, not a derived
  one).
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

**Gaia Sky reference (verified 2026-04-20 θ-audit — previous plan
had multiple source-fidelity errors).**

- `assets/shader/postprocess/fxaa.frag.glsl` — NVIDIA FXAA 3.11
  whitepaper port, 302 lines, 5 presets (1–5) controlling
  `FXAA_EDGE_THRESHOLD`, `FXAA_SEARCH_STEPS` etc. **Plan's earlier
  pmndrs-library reference is an approximation, not a port.**
- `assets/shader/postprocess/nfaa.frag.glsl` — Normal-Filtered AA,
  42 lines, sibling alternative (cheaper than FXAA). Samples 5 points
  along a normal map computed from the input. **Gaia Sky picks FXAA
  or NFAA at runtime; there is no SMAA in the source.** Plan's
  earlier "SMAA on high tier" is a pure invention.
- `assets/shader/postprocess/unsharpmask.frag.glsl` — **"LumaSharpen
  1.4.1"** by Christian Cann Schuldt Jensen (GLSL port by Anon), 45
  lines, contrast-aware blur-then-subtract with min/max clamping per
  channel. **NOT a plain Gaussian blur + subtract** as the previous
  plan described. The algorithm checks local min/max to avoid
  introducing halos.

**Port plan.**

- Direct port of all three shaders (no pmndrs library substitution):
  - `src/components/canvas/scene/effects/FxaaEffect.ts` — ~300 LOC
    direct port of `fxaa.frag.glsl` with `FXAA_PRESET = 5`
    (ultra/high).
  - `src/components/canvas/scene/effects/NfaaEffect.ts` — ~45 LOC
    direct port of `nfaa.frag.glsl` + port of `lib/normal.glsl` and
    `lib/luma.glsl` it depends on.
  - `src/components/canvas/scene/effects/LumaSharpenEffect.ts` — ~50
    LOC direct port of `unsharpmask.frag.glsl` ("LumaSharpen 1.4.1").
- Tier table (authoritative in §4.1):
  - `constrained` → off (no composer);
  - `balanced` → NFAA (cheaper, mobile-friendly);
  - `high` → FXAA + LumaSharpen;
  - `ultra` → FXAA + LumaSharpen (same as high — there is no
    higher-fidelity AA in Gaia Sky; previous plan's SMAA tier was
    invented).
- Chain position per §5.1 (corrected post-audit): Antialiasing runs
  LAST in the composer, after Levels. LumaSharpen runs before Bloom,
  in the display-referred stage (Gaia Sky position 320 — between
  lens-flare composite and bloom). This is the opposite of the
  previous plan's ordering.
- L15 literal for all three ShaderMaterials. L7 preflight passes:
  none of these filenames exist in `src/components/canvas/scene/effects/`
  at time of writing.

**Parameters (ultra).**

- FXAA: `FXAA_PRESET = 5` — `FXAA_EDGE_THRESHOLD = 1/8`,
  `FXAA_EDGE_THRESHOLD_MIN = 1/24`, `FXAA_SEARCH_STEPS = 32`,
  `FXAA_SUBPIX_CAP = 4/5`, `FXAA_SUBPIX_TRIM = 1/4`. Literal from
  source.
- NFAA: library defaults, 5-sample blur along computed normals.
- LumaSharpen: `u_sharpenFactor = 0.25` (default), `CONTR = 0.08`,
  `DETAILS = 1.0` — literal from source.

**DisplayPanel.** Row **"Anti-aliasing"** — `Off / NFAA / FXAA`.
Secondary row **"Sharpen"** — `Off / On` (slider `0.0–0.5`).
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

## 8.6 Correções pós-audit — source-verified (2026-04-20)

**REWRITTEN 2026-04-20 after the θ-audit.** The previous version of
this section contained inherited claims from the swarm + early Codex
review that the audit found to be inaccurate. Current content below
is cross-checked against `MainPostProcessor.java` line-by-line and
against the shader files read in full (see §5 per-onda bodies for
source-grounded rewrites).

**Pipeline chain order (actual, from `ppb.add(...)` call sequence in
`MainPostProcessor.java`).**

```
blendFullHalfRes → lightGlow → ssrEffect → cameraMotionBlur
    → pseudoLensFlare → lensFlare → blend(UI Blend3)
    → unsharp (LumaSharpen) → bloom → curvature → reprojection
    → grain (FilmGrain) → aberration (ChromaticAberration)
    → warpingMesh → upscaleFilter (XBRZ)
    → levels → antialiasing (FXAA or NFAA)
```

- **Bloom runs AFTER unsharp + lens-flare**, NOT before. The previous
  plan had this wrong.
- **Antialiasing runs LAST**, after levels. The previous plan put AA
  mid-chain.
- **ChromaticAberration is mid-chain** (pos 365 in source), not
  last. The previous plan had this wrong.
- The atlas chain in §5.1 is adapted to this ordering; divergences
  we keep are documented inline as pipeline/render-space mismatches
  (R1 step-5 #2).

**LightGlow architecture (verified lightglow.vert + lightglow.frag +
LightGlow.java).**

- Vertex samples the scene texture via an Archimedean spiral around
  each `u_lightPositions[li]` to produce per-light `v_lums[li]` — a
  luma detector PER KNOWN LIGHT, not a bright-pass buffer read.
- Fragment renders a per-light glow sprite modulated by a time-
  animated `polarMask(uv, time)` (polar frequencies 12, 37, 59 with
  phase offsets; plan quotes these correctly).
- The "v3.7.2 simplification" claim in the previous plan ("skip the
  spiral, use bloom threshold") is **reversed by the audit**: the
  spiral is still there in the current source, and the port requires
  it because the bright-pass buffer does not know which lights are
  "named" (Sun, hero stars) vs. which are just bright pixels.

**Blending modes (verified `core/src/gaiasky/render/BlendMode.java`).**

- `ADDITIVE` = `GL_ONE, GL_ONE` (pure premultiplied).
- `ALPHA` = `GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA`.
- Atlas θ.1 post-audit switched to `THREE.CustomBlending` with
  `OneFactor, OneFactor` + premultiplied fragment output to match
  exactly (see commit `13e501e`).

**Diffraction spikes location (verified `lensdirt.frag.glsl`).**

- Spikes are sampled from a 1D `u_texture2` starburst texture at
  `radial = centerVec.x / d`, rotated by `u_starburstOffset`, and
  multiplied into the scene via `base * (dirt * 3.0 + starburst)`.
- **Screen-centric radial pattern**, NOT per-star billboard. The
  previous plan's θ.2 "per-star cross billboard" was invention.
- Merged into θ.4 under the 2-pass lens-flare pipeline.

**Anti-aliasing options (verified `postprocess/fxaa.frag.glsl` and
`nfaa.frag.glsl`, `MainPostProcessor.java:514-522`).**

- Gaia Sky ships `FXAA` (NVIDIA 3.11 whitepaper, 302 LOC, 5 presets)
  and `NFAA` (Normal-Filtered, 42 LOC). **No SMAA.** Plan's earlier
  SMAA-on-high was invention.
- `unsharpmask.frag.glsl` is **"LumaSharpen 1.4.1"** (contrast-aware
  blur-subtract with min/max channel clamping), NOT a plain Gaussian
  blur + subtract as the previous plan described.

**Star uniforms (verified `StarSetQuadComponent.java:46`).**

- `u_solidAngleMap = vec2(1.0e-10, 2.0e-9)` (defaults, literal).
- `u_thAnglePoint = vec2(1.0e-10, 1.5e-8)` (billboard switch).
- θ.1b uses these values as the default port target.

**θ.13 dither file mischaracterisation.** `lib/dither4x4.glsl` is a
lib utility for alpha-threshold binarisation (`alpha < limit ? 0 :
1`), NOT an output-composer anti-banding dither. Gaia Sky's
`MainPostProcessor` does not instantiate any Dither effect. θ.13 as
"port Gaia Sky dither" was a wrong-reference invention — moved to §9
as atlas-only.

**θ.2 deleted.** Diffraction spikes merged into θ.4.

**Claims from the earlier §8.6 revision that still hold.**

- LightGlow v3.7.2 polar-mask time animation is real — θ.3 adopts it
  (the frequencies 12, 37, 59 with phase offsets are quoted
  correctly in the plan).
- `model_const = 172.4643429` is the billboard-corona transition
  parameter, paired with `dist < radius × 2.5 / fovFactor` for the
  surface-mode swap (θ.7 uses both correctly).

**Claims retired / resolved.**

- "B-V → RGB via CIE xyY / Ballesteros" — resolved in the 2026-04-21
  drift audit: HYG now computes Gaia `ColorUtils.BVtoRGB` CPU-side and
  applies default `scene.star.saturate = 0.16`.
- "Phong / spherical billboard shading mode for θ.1" — documented
  in §9 but out of scope; we ship emissive only.

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

Added after θ-audit (2026-04-20):

- **Output anti-banding Bayer dither** (was θ.13 — moved here).
  Atlas-specific enhancement, NOT a Gaia Sky port
  (`MainPostProcessor.java` does not instantiate an output dither
  effect; the `lib/dither4x4.glsl` cited in the old plan is a
  threshold-binarise utility for alpha-testing shaders, not the
  composer). Bayer-addition approach is ~20 lines and addresses real
  dark-gradient banding on 8-bit output, but it belongs to a Wave β
  bundle of atlas-only polish, not phase θ. Ship if and when HDR→8-bit
  banding becomes visible in production.
- **"True" LensFlare (`lensflare.frag.glsl` — distinct from
  `pseudolensflare.frag.glsl` already ported in θ.4).** Gaia Sky
  ships both; the true one is a per-element billboard chain (much
  more complex). θ.4 gives 80–90 % of the visual for 20 % of the
  complexity. Upgrade path if the user ever asks for the full effect.
- **NFAA + FXAA + LumaSharpen tiering** as a user-configurable combo
  matrix. Audit ships a simple `balanced=NFAA, high/ultra=FXAA+Sharpen`
  — richer combinations (NFAA+Sharpen, FXAA without Sharpen, etc.)
  stay for post-phase if anyone asks.
- **Ray-marching effects** (`postprocess/raymarching/*.glsl`,
  particularly `volumeclouds.frag.glsl` and `torus.frag.glsl`) — Gaia
  Sky uses these for accretion-disk visuals around black holes. Out
  of scope for phase θ's star-focus.
- **Reprojection effect** (`reprojection.frag.glsl`) — Gaia Sky's
  warp-free rebaselining for VR dome projections. No current atlas
  use case.
- **Curvature effect** (`geometrywarp.frag.glsl`) — dome / VR
  spherical projection. Out of scope.
- **XBRZ upscale** (`xbrz-freescale.glsl`) — pixel-art upscaler for
  the dome preview screen; irrelevant to desktop / web.
- **Occlusion texture for LightGlow** (`setOcclusionTexture` API on
  `LightGlow.java`). Deferred per θ.3's optional fold-in clause;
  atlas hero-star + planet layout rarely triggers the occlusion case
  at our typical camera distances. Ship only if the user notices the
  "star glows through a planet" artifact.
- **Gaia Sky `raymarching.frag.glsl` for procedural atmosphere
  visuals** — separate from H-II volumetrics above; this is the
  atmospheric-fog pass around planets.

---

## 10. Exit criteria for phase θ

**Updated 2026-04-20 for the θ-audit revision** (14 ondas in phase
θ, plus θ.1b split from θ.1, plus θ.7 split into θ.7a/θ.7b; θ.2
merged into θ.4; θ.13 deferred to §9).

Phase ships when:

1. All **fifteen ondas** (θ.1 + θ.1b + θ.3 + θ.4 + θ.5 + θ.6 + θ.7a
   - θ.7b + θ.8 + θ.9 + θ.10 + θ.11 + θ.12 + θ.14 + θ.15 = 15
     commits minimum, ~22–26 with Codex follow-ups) committed, cada
     uma com a coluna correspondente em §7 passando verde. "Unit n/a"
     passes §10.1 only if the corresponding config/math guard is
     green; §7's verification-rule paragraph is the authoritative
     reading.
2. `DisplayPanel` contém as novas linhas, todas funcionais, **com os
   nomes exatos abaixo** (não "Lens" standalone, que conflita com
   "Grading" do θ.6):
   - **Star shader / vertex:** "Star Twinkle" (θ.14). θ.1b is
     invisible — it replaces the old NASA `particleSize` path with
     Gaia-style `u_sizeFactor` billboard sizing.
   - **Composer/HDR:** "Star Halo" (θ.3), "Lens Flare" (θ.4 — with
     sub-option "Pseudo Flare / Pseudo Flare + Spikes" covering the
     merged-in diffraction-spike feature), "Motion Blur" (θ.5),
     "Grading" → {Chromatic Aberration, Vignette, Film Grain}
     sub-rows (θ.6), "Anti-aliasing" → `Off / NFAA / FXAA` (θ.15),
     "Sharpen" → `Off / On` with LumaSharpen slider (θ.15).
   - **Scene-graph/backdrop:** "Orbit Line Glow" (θ.9),
     "Constellations" (θ.10), "Galactic Backdrop" + "HD Backdrop
     Asset" (θ.11), "Star Labels" (θ.12).
   - **Hero-star:** "Hero Star LOD" (θ.7a/b).
   - **NOT present at exit** (retired by audit): "Diffraction
     Spikes" standalone (folded into Lens Flare), "Output Dithering"
     (moved to §9), "SMAA" (never existed in Gaia Sky).
3. `A11yPanel` Reduced-Motion force-disables **θ.3, θ.5, e θ.14**
   per §4.2 (single source of truth). `todo.md` hard-constraints
   list matches verbatim.
4. Side-by-side reference screenshot (pre-θ.1 vs post-θ.15) commitado
   em `tasks/design/refs/phase-theta-before-after.png` e revisto
   contra equivalentes Gaia Sky no mesmo camera pose. Sub-screens
   por subsistema: star-shader (θ.1/θ.1b/θ.14), composer (θ.3/θ.4/
   θ.5/θ.6/θ.15), scene-graph (θ.9/θ.10/θ.12), backdrop (θ.11),
   hero-LOD (θ.7a/b).
5. Frame budget no Intel Iris Xe reference device dentro de 20 %
   do pre-phase no tier ultra (audit raised from 15 % to 20 %
   because θ.1b's solid-angle vertex math is marginally more
   expensive than NASA-Eyes; expected net frame-time delta
   compensates when faint stars stop rendering); constrained tier
   byte-identical ao pre-phase. Backdrop θ.11 aceita até 25 % no
   ultra (asset heavy).
6. `HANDOFF.md` atualizado com "Phase θ shipped — Gaia Sky 1:1
   visual port (star subsystem + composer + scene-graph + hero-
   approach)" status block, citando as 15 ondas.
7. Codex critical review da fase completado. Every onda has its own
   Codex `fix(vfx): θ.N Codex follow-up` commit on file per
   `feedback_codex_auto_review` memory rule. Each follow-up aligns
   with `feedback_codex_findings_toward_1to1` (tighten parity, not
   soften language).
8. §8.6 audit-verified corrections applied or registered as follow-up
   in §9. No claim in the body of §5 ondas diverges from what the
   audit verified against Gaia Sky source.
9. Licensing/provenance notes presentes em `AboutPanel.tsx` para os
   assets third-party usados em θ.10 (IAU/Delporte) e θ.11 (ESO
   Milky Way) e em θ.4 (lens dirt / starburst assets if Gaia Sky's
   own are used; procedural generation if not).
10. `NASAStarfield.tsx` + `shaders/nasaStarShaders.ts` deleted in
    θ.1b (no longer needed after log-compressed curve revocation).

### 10.1 Non-goals guard at exit

The following must remain true at exit (regression protection):

- HYG binary format unchanged (`public/data/hyg-stars/*.bin.gz`
  byte-identical to pre-phase). Adding NEW attributes (e.g.
  `a_size` for θ.1b) lives in a sibling sidecar or a separate
  derived array, not in the frozen binary.
- ~~Log-compressed transfer curve `brightness = 2·log(1 + flux·250)`
  unchanged.~~ **Revoked by the θ-audit (§2).** θ.1b replaces it
  with Gaia Sky's solid-angle → opacity math. L16/L17 become
  historical.
- AgX is still the tone mapper.
- `@react-three/postprocessing` is still the composer library
  (custom `Effect` subclasses compose with pmndrs `EffectComposer`,
  which is what the θ.3/θ.4/θ.5/θ.6/θ.15 ports do).
- No `<shaderMaterial>` used as a JSX child in any file touched by
  phase θ (automated grep in CI).
- `NASAStarfield.tsx` and `shaders/nasaStarShaders.ts` are deleted
  (θ.1b invariant); automated grep guards against re-introduction.
