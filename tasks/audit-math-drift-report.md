# Math drift audit — atlas-orbital vs Gaia Sky (2026-04-21)

## Summary

The three shipped ondas (θ.1 star-sprite kernel, θ.1b vertex solid-angle port, θ.3 LightGlow post-process) were audited formula-by-formula against the Gaia Sky reference implementation in `/tmp/gaiasky`. **One P1 drift was found** (LEN0 boundary-fade distance is scaled ~6.7× too small because atlas applies the literal `20000.0` in scene units instead of Gaia internal units). All other audited formulas, constants, operation orderings, and uniform semantics match 1:1 within fp32 quantization tolerance. No P0 formula-level errors were identified.

## Scope checked

### Gaia Sky reference files read

| File                                                                                   | Lines read                    |
| -------------------------------------------------------------------------------------- | ----------------------------- |
| `/tmp/gaiasky/assets/shader/star.group.quad.fragment.glsl`                             | 1–56                          |
| `/tmp/gaiasky/assets/shader/star.group.quad.vertex.glsl`                               | 1–136                         |
| `/tmp/gaiasky/assets/shader/lib/math.glsl`                                             | 1–62                          |
| `/tmp/gaiasky/assets/shader/lib/angles.glsl`                                           | 1–28                          |
| `/tmp/gaiasky/assets/shader/postprocess/lightglow.frag.glsl`                           | 1–99                          |
| `/tmp/gaiasky/assets/shader/postprocess/lightglow.vert.glsl`                           | 1–78                          |
| `/tmp/gaiasky/assets/shader/snippet/billboard.stretch.glsl`                            | 1–30 (skim; θ.1c not shipped) |
| `/tmp/gaiasky/core/src/gaiasky/util/coord/AstroUtils.java`                             | 430–489                       |
| `/tmp/gaiasky/core/src/gaiasky/util/Constants.java`                                    | 40–119                        |
| `/tmp/gaiasky/core/src/gaiasky/data/group/BinaryPointDataProvider.java`                | 250–279                       |
| `/tmp/gaiasky/core/src/gaiasky/scene/system/render/draw/StarSetInstancedRenderer.java` | 130–159                       |
| `/tmp/gaiasky/core/src/gaiasky/scene/system/render/draw/StarSetQuadComponent.java`     | 55–108                        |
| `/tmp/gaiasky/core/src/gaiasky/scene/system/update/GraphUpdater.java`                  | 170–194                       |
| `/tmp/gaiasky/core/src/gaiasky/util/color/ColorUtils.java`                             | 400–489                       |
| `/tmp/gaiasky/core/src/gaiasky/scene/entity/ParticleUtils.java`                        | 85–124                        |
| `/tmp/gaiasky/core/src/gaiasky/util/Settings.java`                                     | 1640–1749, 650–691            |
| `/tmp/gaiasky/core/src/gaiasky/scene/camera/AbstractCamera.java`                       | 30–159                        |
| `/tmp/gaiasky/core/src/gaiasky/render/MainPostProcessor.java`                          | 200–239, 450–478, 530–569     |
| `/tmp/gaiasky/core/src/gaiasky/render/system/LightPositionUpdater.java`                | 75–134                        |
| `/tmp/gaiasky/core/src/gaiasky/render/postprocess/filters/GlowFilter.java`             | 1–182                         |
| `/tmp/gaiasky/core/src/gaiasky/render/postprocess/effects/LightGlow.java`              | 1–142                         |
| `/tmp/gaiasky/assets/conf/config.yaml`                                                 | 140–179                       |

### Atlas implementation files read

| File                                                        | Lines read |
| ----------------------------------------------------------- | ---------- |
| `src/components/canvas/Starfield.tsx`                       | 1–538      |
| `src/lib/starPhysics.ts`                                    | 1–150      |
| `src/lib/starfieldShaderMath.ts`                            | 1–430      |
| `src/lib/starfieldShaderMath.test.ts`                       | 1–544      |
| `src/components/canvas/scene/effects/LightGlowEffect.ts`    | 1–310      |
| `src/components/canvas/scene/effects/lightGlowMath.ts`      | 1–106      |
| `src/components/canvas/scene/effects/lightGlowMath.test.ts` | 1–180      |
| `src/components/canvas/scene/effects/lightGlowSprite.ts`    | 1–105      |
| `src/lib/lightRegistry.ts`                                  | 1–367      |
| `src/lib/lightRegistry.test.ts`                             | 1–283      |
| `src/components/canvas/scene/LightGlowInjector.tsx`         | 1–196      |
| `src/components/canvas/scene/PostProcessingPipeline.tsx`    | 1–133      |
| `src/components/canvas/StarHoverPicker.tsx`                 | 1–325      |

### Orientation / context files read

| File                                                       | Lines read                      |
| ---------------------------------------------------------- | ------------------------------- |
| `tasks/STATUS.md`                                          | 1–154                           |
| `tasks/phase-gaia-sky.md`                                  | 1–993 (partial, capped at 50KB) |
| `tasks/lessons.md`                                         | 1–646                           |
| `tasks/codex-review-theta-1-output.md`                     | 1–34                            |
| `tasks/codex-review-theta-1b-output.md`                    | 1–43                            |
| `tasks/codex-review-theta-1b-pseudosize-output.md`         | 1–298                           |
| `tasks/codex-review-theta-3-output.md`                     | 1–366                           |
| `memory/feedback_codex_verified_claims_can_still_drift.md` | 1–109                           |
| `memory/feedback_pseudo_size_not_physical_radius.md`       | 1–98                            |
| `memory/feedback_gaia_sky_source_first.md`                 | 1–25                            |
| `memory/feedback_no_effect_stacking.md`                    | 1–17                            |
| `memory/feedback_pmndrs_effect_signature.md`               | 1–77                            |

---

## Verified 1:1

### θ.1 — Star sprite kernel (fragment)

- **Core-kernel smoothstep edges**: Atlas `CORE_SMOOTHSTEP_EDGE_LOW = 0.0`, `CORE_SMOOTHSTEP_EDGE_HIGH = 0.04` match Gaia `smoothstep(0.0, 0.04, …)` exactly (`star.group.quad.fragment.glsl:42` ↔ `src/lib/starfieldShaderMath.ts:39–40`).
- **Core RGB boost**: Atlas fragment adds `core * 2.0` to RGB (`Starfield.tsx:221`), matching Gaia `v_col.rgb + core * 2.0` (`star.group.quad.fragment.glsl:44`).
- **Alpha composition**: Atlas `alpha = vBrightness * profile`, then `alpha * vec4(rgb + core*2, 1)`. Gaia `alpha = v_col.a * profile`, then `alpha * vec4(v_col.rgb + core*2, 1)`. The semantic is identical because atlas’s `vBrightness` carries the same per-star alpha value Gaia puts in `v_col.a`.
- **Discard predicates**: Atlas discards when `vBrightness <= 0.0` and when `profile <= 0.0` (`Starfield.tsx:211,215`). Gaia discards when `v_col.a <= 0.0` and when `profile <= 0.0` (`star.group.quad.fragment.glsl:29,36`). Equivalent.
- **Blend pairing**: Atlas uses `blendSrc/blendDst = OneFactor/OneFactor` for both RGB and alpha (`Starfield.tsx:416–421`). Gaia uses `GL_ONE/GL_ONE` (`phase-gaia-sky.md §5 θ.1`). The fragment premultiplies RGB by alpha, so the pair is consistent.
- **Off-midpoint kernel samples**: Unit test pins `r=0.01 → 0.84375` and `r=0.03 → 0.15625` (`starfieldShaderMath.test.ts:58–63`), matching the Hermite curve of `smoothstep(0, 0.04, r)` exactly.

### θ.1b — Vertex solid-angle port

- **`absMag` formula**: Atlas `apparentMag - 5 * Math.log10(distPc / 10)` (`starPhysics.ts:89`) matches Gaia `appMag - 5.0 * FastMath.log10(distPc <= 0.0 ? 10.0 : distPc) + 5.0` (`AstroUtils.java:444–446`). Edge-case `distPc <= 0` also matches (both return `apparentMag`).
- **`pseudoL` / `sizePc` formula**: Atlas `Math.sqrt(Math.pow(10, -0.4 * absMag)) * 0.15` (`starPhysics.ts:130`) matches Gaia `Math.pow(pseudoL, 0.5) * sizeFactor` with `sizeFactor` factored out to parsecs. Ceiling `GAIA_PSEUDO_SIZE_CEILING_PC = 324.08` pc matches Gaia’s `1e10` internal-unit cap (`starPhysics.ts:73–74`, `AstroUtils.java:474`).
- **`a_size` buffer write**: Atlas `pseudoSizePc * DISTANCE_SCALE * STAR_SIZE_FACTOR` (`Starfield.tsx:342`) matches Gaia `particle.size() * Constants.STAR_SIZE_FACTOR * sizeFactor` (`StarSetInstancedRenderer.java:143`) when `sizeFactor = 1.0` (atlas default, folded into `u_sizeFactor` shader-side).
- **Vertex `solidAngle = a_size / dist`**: Atlas shader line 153 (`solidAngle = a_size / max(dist, 1e-20)`) matches Gaia `star.group.quad.vertex.glsl:102` exactly.
- **`lint` smoothstep**: Atlas `lint_ss` uses `y0 + (y1 - y0) * smoothstep(x0, x1, x)` (`Starfield.tsx:138`), matching Gaia `lib/math.glsl:13–17` exactly.
- **`degrees12` / `radians12`**: Atlas `TO_DEG12 = 180.0e12 / PI`, `TO_RAD12 = PI / 180.0e12` (`starfieldShaderMath.ts:290–293`) match Gaia `lib/angles.glsl:11–12` exactly.
- **Clamp range `[minQuadSolidAngle, 3.0e-8]`**: Atlas shader line 162–166 uses the literal `3.0e-8` (not a uniform), matching Gaia `star.group.quad.vertex.glsl:105`.
- **`u_opacityLimits` default `[0.0, 1.0]`**: Atlas constant matches `config.yaml:173` (`starfieldShaderMath.ts:223`).
- **`u_brightnessPower` default 1.0, range [0.9, 1.1]**: Atlas matches Gaia `Constants.java:110–112` (`starfieldShaderMath.ts:224–225`).
- **`u_sizeFactor` default 1.2e6**: Atlas matches Gaia derivation `starPointSize(=1.2) × 1e6 × pointScale(=1.0)` (`Starfield.tsx:403`, `StarSetQuadComponent.java:96`).
- **`u_starBrightness` default**: Atlas `((2.22 - 0.4) / (8.0 - 0.4)) * 4.0 ≈ 0.9579` matches Gaia `StarSetQuadComponent.java:73` (`starfieldShaderMath.ts:229`).
- **Boundary fade**: Atlas `smoothstep(u_LEN0, u_LEN0 * 1000.0, dist)` (`Starfield.tsx:170`) matches Gaia `smoothstep(l0, l1, dist)` with `l1 = l0 * 1e3` (`star.group.quad.vertex.glsl:114`).
- **Quad nulling**: Atlas `if (alpha <= 1e-3 || dist < u_LEN0)` (`Starfield.tsx:175`) matches Gaia `if (v_col.a <= 1.0e-3 || dist < l0)` (`star.group.quad.vertex.glsl:121`).
- **`gaiaBvToRgb`**: All coefficients, branch boundaries (1667–4000, 4000–25000 for x; 1667–2222, 2222–4000, 4000–25000 for y), xyY→XYZ→sRGB matrix, gamma `a = 0.5`, and `max(1, maxChannel)` normalization match Gaia `ColorUtils.java:416–458` exactly (`starfieldShaderMath.ts:73–117`).
- **`saturateStarRgb`**: Atlas HSV path adds 0.16 to S and clamps to [0,1], matching Gaia `ParticleUtils.java:98–110` exactly (`starfieldShaderMath.ts:133–139`).
- **Billboard geometry**: Atlas 4-vert positions `[-0.5, -0.5, 0.0, 0.5, -0.5, 0.0, -0.5, 0.5, 0.0, 0.5, 0.5, 0.0]`, UVs `[0,0, 1,0, 0,1, 1,1]`, indices `[0,1,2, 2,1,3]` match Gaia (`Starfield.tsx:464–477`).
- **Vertex billboard math**: Atlas `viewPosition.xy += position.xy * quadSize` (`Starfield.tsx:185`) matches Gaia billboard displacement via `billboard.stretch.glsl` (when stretch velocity is zero, the snippet falls back to plain rotation equivalent to atlas’s screen-aligned quad).
- **`frustumCulled = false`**: Atlas sets this on the mesh (`Starfield.tsx:532`), matching Gaia’s implicit no-cull for instanced billboard stars.

### θ.3 — LightGlow post-process

- **Polar mask formula**: Atlas `0.5 + 0.25·sin(dx·12 + t·2.0) + 0.20·cos(dy·37 − t·1.3) + 0.10·sin((dx+dy)·59 + t·1.6)` matches Gaia `lightglow.frag.glsl:53–56` exactly (`LightGlowEffect.ts:123–127`).
- **`minVal = 0.55`**: Atlas matches Gaia `lightglow.frag.glsl:61` (`LightGlowEffect.ts:130`).
- **Centre smoothstep**: Atlas `smoothstep(0.85, 1.0, 1.0 - r)` matches Gaia `lightglow.frag.glsl:65` (`LightGlowEffect.ts:133`).
- **Spiral sampler**: Atlas `dt = 3π / nSamples`, `fx(t,a) = a·t·cos(t)`, `fy(t,a) = a·t·sin(t)`, luma threshold `0.95` via `step`, bonus post-loop sample with `fy(t,a) * ar` (NOT `/ar`, NOT clamped), and `lum /= nSamples` all match Gaia `lightglow.vert.glsl:55–72` exactly (`LightGlowEffect.ts:151–173`).
- **Halo-size formula**: Atlas `u_textureScale * min(1.6, viewAngle * 5.0e5) * lum` matches Gaia `lightglow.frag.glsl:82` (`LightGlowEffect.ts:185`).
- **`viewAngle = min(0.0001, u_lightViewAngles[li])`**: Atlas matches Gaia `lightglow.frag.glsl:81` (`LightGlowEffect.ts:184`).
- **`u_nSamples` default 1**: Atlas `LIGHT_GLOW_DEFAULT_SAMPLES = 1` matches Gaia runtime override `MainPostProcessor.updateGlow():474` (`lightGlowMath.test.ts:19–23`).
- **`u_textureScale` default**: Atlas `2.22 * (0.055 / 0.06) * 0.2 ≈ 0.407` matches Gaia `MainPostProcessor.java:552–559` non-cubemap path (`LightGlowEffect.ts:54`).
- **`u_spiralScale` default**: Atlas `2.22 * 3.0 * 0.5e-4 = 3.33e-4` matches Gaia `MainPostProcessor.java:562–563` at `fovFactor = 1` (`LightGlowEffect.ts:55`).
- **FOV-factor plumbing**: Atlas divides `solidAngleApparent` by `fovFactor` in `lightRegistry.ts:244` and divides `spiralScale` by `fovFactor` in `LightGlowInjector.tsx:185`, matching Gaia `GraphUpdater.java:182` and `MainPostProcessor.java:223` exactly.
- **`solidAngleApparent` uses PRE-clamp raw value**: Atlas `rawSolidAngle * STAR_BRIGHTNESS_DEFAULT / fovFactor` (`lightRegistry.ts:243–244`) matches Gaia `body.solidAngleApparent = body.solidAngle * star.brightness / camera.getFovFactor()` (`GraphUpdater.java:182`). The raw value is NOT post-shader-clamped.
- **`MAX_LIGHTS = 8`**: Atlas matches Gaia `#define N 8` in both shaders (`lightRegistry.ts:47`, `lightGlowMath.test.ts:93`).
- **Tier nLights**: Atlas 4/5/6/8 for low/normal/high/ultra matches Gaia `Settings.java:672–683` (`lightRegistry.test.ts:97–100`).
- **NDC projection**: Atlas rescales Three.js `[-1,1]` to `[0,1]` via `(x+1)*0.5`, matching Gaia `auxV.x / w` convention (`lightRegistry.ts:128–145`).
- **Composer insertion**: `LightGlowSlot` is the FIRST child of `<EffectComposer>` (`PostProcessingPipeline.tsx:115`), matching Gaia `MainPostProcessor.java:227`.
- **Sun NOT in registry**: Atlas’s light registry walks only HYG billboard stars, matching Gaia’s `Mapper.hip`/`Mapper.starSet` filter that excludes planet/model entities (documented in `phase-gaia-sky.md §5 θ.3`).
- **Reduced-motion gate**: `LightGlowSlot` returns `null` when `reducedMotion === true` (`LightGlowInjector.tsx:114–116`), and the `useFrame` callback early-outs (`LightGlowInjector.tsx:141`), matching the §4.2 contract.

---

## Drifts found

### D1 — LEN0 boundary-fade distance scaled ~6.7× too small

- **Priority:** P1
- **Onda:** θ.1b
- **Atlas location:** `src/components/canvas/Starfield.tsx:125`, `src/lib/starfieldShaderMath.ts:269`
- **Gaia Sky reference:** `/tmp/gaiasky/assets/shader/star.group.quad.vertex.glsl:59`, `star.group.quad.vertex.glsl:114–121`
- **What atlas computes:** `u_LEN0 = 20000.0` (scene units). Since atlas’s scene unit is `DISTANCE_SCALE = 206_265_000` per parsec, this is `20000 / 206265000 ≈ 9.7e-5` pc.
- **What Gaia computes:** `LEN0 = 20000.0` (internal units). Gaia’s internal unit conversion is `1 pc = PC_TO_M × ORIGINAL_M_TO_U = 3.0857e16 × 1e-9 = 3.0857e7` internal units. So Gaia’s `LEN0 = 20000 / 3.0857e7 ≈ 6.48e-4` pc.
- **Numerical delta:** Atlas boundary fade kicks in at ~9.7e-5 pc; Gaia at ~6.48e-4 pc. Ratio ≈ 0.15 (atlas is ~6.7× closer).
- **Fix direction:** Convert Gaia’s internal-unit `LEN0` to atlas scene units by dividing by `DISTANCE_SCALE` and multiplying by Gaia’s pc-to-internal factor: `LEN0_ATLAS = (20000.0 / 3.0857e7) * DISTANCE_SCALE ≈ 6.48e-4 * 206_265_000 ≈ 133_740` scene units. Equivalently: `LEN0_ATLAS = 20000.0 * (DISTANCE_SCALE / 3.0857e7) ≈ 20000.0 * 6.687 ≈ 133_740` scene units.

---

## Non-drifts (confirmed intentional)

1. **θ.1 / θ.1b screen-aligned billboard vs Gaia camera-velocity stretch**: Atlas uses a flat screen-aligned quad. Gaia’s `billboard.stretch.glsl` adds motion-trail stretching; this is θ.1c (pending), not a drift in the shipped code. Documented in `phase-gaia-sky.md §5 θ.1c` and `STATUS.md`.
2. **LightGlow HDR ADD vs Gaia `saturate(effectColor + scene)`**: Atlas emits `clamp(effectColor, 0, 1)` with `BlendFunction.ADD` to preserve HDR for downstream Bloom. Gaia clamps the combined sum. This is a documented HDR-preservation divergence; the additive math is consistent with the atlas pipeline. Documented in `LightGlowEffect.ts:34–37` and `phase-gaia-sky.md §5 θ.3`.
3. **LightGlow procedural gaussian vs Gaia `star-tex-03-*`**: Atlas ships a conservative pure-radial gaussian (equivalent to Gaia `textureIndex: 4`). The real `star-tex-03-*` asset lives in `$GS_DATA` and is not vendored. Documented in `lightGlowSprite.ts:4–33` and `phase-gaia-sky.md §5 θ.3`.
4. **Fragment-stage spiral vs Gaia vertex-stage spiral**: The Archimedean spiral computation is uniform-constant per frame; moving it from vertex to fragment is a correctness-preserving re-arrangement. Documented in `LightGlowEffect.ts:12–20`.
5. **Sun not in LightGlow registry**: Gaia’s `LightPositionUpdater` filters for `Mapper.hip` or `Mapper.starSet`; the Sun is a planet/model entity and is excluded. Atlas mirrors this. Documented in `phase-gaia-sky.md §5 θ.3`.
6. **`@react-three/postprocessing` vs Gaia’s own composer**: Library choice; only the effect ordering matters, and that matches. Documented in `PostProcessingPipeline.tsx:104–112`.

---

## Questions raised by the audit (not drifts)

1. **`bvToRGB` out-of-range B-V values**: The atlas `gaiaBvToRgb` port handles `t < 1667` and `t > 25000` by leaving x/y at 0, which produces black. Gaia’s source does not document behavior outside the valid temperature range. This is not a current drift but could produce unexpected black stars for exotic catalog entries.
2. **`fovFactor` at non-default camera FOV**: Atlas’s default camera FOV is 45° (yielding `fovFactor ≈ 1.138`), while Gaia’s reference FOV is 40° (`fovFactor = 1.0`). The atlas code correctly applies `fovFactor` to both `solidAngleApparent` and `spiralScale`, so the math is self-consistent. However, the visual baseline at default startup will differ slightly from Gaia’s default because of the different reference FOV. This is a stack difference, not a formula drift.
3. **Float32Array quantization of `u_lightViewAngles`**: The pre-clamp raw solid angles (often on the order of 1e-8) are stored in a `Float32Array` before upload. FP32 has ~7 decimal digits of precision, so values like `3.0e-8` may quantize by ~1e-15 relative. This is within the tolerance specified in the audit prompt and does not affect visual output.

---

## Unanswerable without missing source

1. **Actual `star-tex-03-*` bitmap**: The Gaia Sky asset that `textureIndexLens: 3` references lives in `$GS_DATA/tex/base/` and is not present in the source repo. Atlas’s procedural gaussian substitute is conservative, but the exact radial profile of the real asset cannot be verified symbolically.
2. **Gaia `DISTANCE_SCALE_FACTOR` exact value**: `AstroUtils.absoluteMagnitudeToPseudoSize` multiplies by `Constants.DISTANCE_SCALE_FACTOR` at the end. The atlas port factors this out, but the exact numeric value was not read from `Constants.java` in this session. The pseudo-size ceiling (`324.08` pc) was cross-checked via the known `PC_TO_M × ORIGINAL_M_TO_U` product and is consistent.
3. **Runtime `sizeFactor` default in `StarSetInstancedRenderer.java`**: The local `sizeFactor` variable at line 143 could not be traced to its default in this session. Atlas assumes `sizeFactor = 1.0` (folded into `u_sizeFactor`), which aligns with the observed Gaia default behavior and the `1.2e6` calibration.
