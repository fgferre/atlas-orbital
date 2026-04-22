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

### T2.1 — Port COMPLEX lens flare (**D2 resolved → option (a)**)

- **Finding**: Gaia's default ships `lensFlare.type: COMPLEX`
  (`MainPostProcessor.java:280-312`), which uses
  `assets/shader/postprocess/lensflare.frag.glsl` — a different shader
  from the PSEUDO variant (`pseudolensflare.frag.glsl`) that θ.4 ported.
- **Evidence**: user's Gaia screenshot shows rainbow dispersive spikes
  spanning the screen — this is COMPLEX output, not PSEUDO. Atlas
  never had this.
- **Resolution** (Gaia-fidelity rule, 2026-04-22): **port COMPLEX**.
  Add `LensFlareEffect.ts` based on `lensflare.frag.glsl`. Keep
  PSEUDO registered as secondary variant (user-selectable) until
  visual tuning is complete; do not rip θ.4 out yet.
- **Effort**: 3-5 days (port + calibration + DIFF GATE per L22 +
  runtime smoke).
- **Dependencies**: none.

### T2.2 — PseudoLensFlare 35-pass blur

- **Gaia**: `PseudoLensFlare.java` (Gaia Java wrapper) applies 35
  successive gaussian blur passes before the combine step. See
  `PseudoLensFlareFilter` or equivalent in Gaia's postprocess filters.
- **Atlas**: blur chain omitted (pmndrs Effect architectural limits
  noted in `PseudoLensFlareEffect.ts:49-53`). Intensity reduced
  0.15 → 0.03 (5×) to hide hard-edged artifacts at periphery.
- **Options**:
  - Port the blur chain (non-trivial in pmndrs; may need a multi-pass
    wrapper Effect).
  - Keep current, document intensity tuning as atlas-native.
- **Effort**: 2-3 days to port blur; hours to document.
- **Dependencies**: T2.1 decision. If COMPLEX is ported, PSEUDO's blur
  matters less.

### T2.3 — Native CC-BY-4.0 lens sprite assets (**D3 resolved → option (a)**)

- **Finding**: `lensstarburst.jpg`, `lensdirt.jpg`, `lenscolor.png`,
  `star-tex-03-*` are in Gaia's `$GS_DATA` bundle. No public license
  stated in `/tmp/gaiasky/ACKNOWLEDGEMENTS.md`.
- **Resolution** (Gaia-fidelity rule, 2026-04-22): **option (a)**.
  Reconstruct each sprite natively under CC-BY-4.0 to reproduce
  Gaia's visual output (not "stay procedural with a disclaimer" —
  that is the opposite of max fidelity). The permission-request
  path (c) was rejected for latency; no reconstruction blocker
  justifies it.
- **Effort**: 1-2 days (one session per sprite: study Gaia's visual,
  recreate procedurally or by hand-painting, smoke-test against
  the shader that samples it).
- **Dependencies**: none.
- **Note**: Milky Way panorama separately available from ESO under
  CC-BY-4.0 — can be vendored for T4.7.

### T2.4 — Tone map + bloom default alignment (**D5 resolved → Gaia parity**)

- **Gaia defaults**: `postprocess.toneMapping.type: NONE`,
  `postprocess.bloom.intensity: 0.0` (`config.yaml`).
- **Atlas defaults (pre-T2.4)**: AgX tone mapping forced in composer
  (`resolver.ts:117,134,151,168`), bloom 0.75-1.1 via visual presets.
- **Resolution** (Gaia-fidelity rule, 2026-04-22): **match Gaia
  `config.yaml` exactly** — default composer builds with
  tone-map `NONE` and bloom `0.0`. Current AgX + high-bloom values
  move behind a user-togglable "Cinematic" setting (not default),
  so fidelity is the out-of-box experience and atlas-opinion stays
  available on opt-in.
- **Effort**: 1 day.
- **Dependencies**: none.

---

## Tier 3 — Scene cinematic (2-3 weeks)

Transforms the scene's "cinematic feel" — lighting, shading, eclipses.

### T3.1 — Rayleigh + Mie atmospheric scattering ⭐ HIGHEST VISUAL IMPACT (in progress)

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
    Static-default uniforms produced saturated output that flickered
    against the cloud layer's transparent-sort. Lesson L26 captured;
    re-planned as combined θ.5b+c.
  - 🟡 **θ.5b+c** (next, combined) — rewrite `atmosphereShader.ts`
    AND wire per-frame uniforms (`v3CameraPos`, `v3LightPos`,
    `fCameraHeight`) from real scene state in a single ship. Mirrors
    T1.2 ring-shadow inverse-matrix pattern at `Planet.tsx:247-284`.
    Earth-default scattering coefficients hard-wired.
  - 🔲 **θ.5d** — per-body Rayleigh/Mie/scale-height config from body
    record; Mars + candidates get their own params; final gates; ship.
- **Dependencies**: port `atmscattering.frag.glsl` snippet first as
  shared include.

### T3.2 — PBR metallic/roughness texture reads

- **Gaia**: reads R=metallic, G=roughness, B=AO from packed OMR
  textures. Energy-conservative Fresnel-Schlick with F0 blending.
- **Atlas**: `MeshStandardMaterial` with scalar
  `metalness` / `roughness` only — does not read per-pixel textures.
- **Visual impact**: water specular on Earth oceans, metallic surfaces,
  dielectric variation all rendered identically dull.
- **Effort**: 2-3 days per body that has PBR textures.
- **Dependencies**: none.
- **Note**: this is the work that `pbr-*` docs (now deleted) researched
  in April and never shipped. Re-research not needed — just implement.

### T3.3 — Eclipse geometry (umbra / penumbra / diffraction)

- **Gaia**: `assets/shader/lib/eclipses.glsl` (~80 LOC) — umbra
  0.0 soft edge, penumbra ~1.7× radius, diffraction spectrum between.
- **Atlas**: no eclipse shading. Syzygies invisible.
- **Effort**: 3-5 days.
- **Dependencies**: none.

### T3.4 — Cloud / ring shadow casting cleanup

- **Atlas issue**: `Planet.tsx:332` uses `customDepthMaterial` with an
  invisible `meshBasicMaterial` for cloud shadow caster → silhouette
  can diverge from visual cloud material.
- **Gaia**: proper depth rendering with the visible cloud material.
- **Effort**: 1-2 days.
- **Dependencies**: none.

### T3.5 — Earth night-lights terminator tightening

- **Atlas**: `usePlanetMaterials.ts:268-285` computes
  `nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity)`. Band is too
  wide — night lights bleed into day side.
- **Gaia**: hard gate `sunDot < threshold`.
- **Effort**: 2 h.
- **Dependencies**: none.

### T3.6 — Cloud additive blending terminator gate

- **Atlas**: `usePlanetMaterials.ts:56` — unconditional
  `THREE.AdditiveBlending` ("Reverted to Additive for visual look"
  comment flags this was iterated on). Over-brightens terminator on
  night side.
- **Gaia**: normal blending over day side, selective additive where
  clouds scatter light.
- **Effort**: 2-4 h.
- **Dependencies**: none.

### T3.7 — Atmosphere exponent parameterization

- **Atlas**: `atmosphereShader.ts:21` hardcodes `pow(max(...), 4.0)`.
  Not tunable per planet.
- **Fix**: expose `u_atmosphereExponent` uniform; default 4.0; per-body
  override in planet config.
- **Effort**: 1 h.
- **Dependencies**: none.

### T3.8 — Roughness-map color space audit

- **Atlas**: `usePlanetAssets.ts:152` forces `colorSpace: THREE.NoColorSpace`
  for roughness textures.
- **Verify**: are the source roughness textures gamma-encoded (sRGB)
  or linear? If gamma, current code is wrong (underestimates roughness).
- **Effort**: 2 h (audit + fix).
- **Dependencies**: none.

### T3.9 — Lightscattering god rays (new — not in original plan)

- **Gaia**: `assets/shader/postprocess/lightscattering.frag.glsl` —
  volumetric crepuscular rays from up to 10 light sources. 60-sample
  raymarch, decay 0.95, density 0.5.
- **Atlas**: zero volumetric presence. Sun currently has no
  god-ray signature.
- **Visual impact**: high. "Splendor" gap contributor.
- **Effort**: 3-5 days.
- **Dependencies**: none.

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

### T4.4 — Additional grids (equatorial, galactic, recursive)

- **Gaia**: 3 coordinate grids via `gridrec.fragment.glsl` with
  multi-resolution LOD using `dFdx` screen derivatives
  (`/tmp/gaiasky/core/src/gaiasky/scene/entity/GridRecursiveRadio.java:34-44`).
- **Atlas**: `EclipticGrid.tsx` only. Custom shader, single-pass,
  fade radial `smoothstep(uFadeStart, uFadeEnd, dist)`.
- **Effort**: 1 week.
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

### T4.6 — Quad-SDF line rendering

- **Gaia**: geometry shader expansion + SDF-feathered edges via
  `cos(PI*x/2)^1.8` (`line.quad.cpu.fragment.glsl:26-28`). Lines stay
  crisp at any zoom.
- **Atlas**: `@react-three/drei` `Line2` + `LineMaterial` hardware line
  (`PlanetOrbitLine.tsx:16-26`). Uses salience opacity
  (`useOrbitalSalience.ts:39-77`) but no distance fade.
- **Effort**: 1 week.
- **Dependencies**: none.

### T4.7 — Milky Way backdrop (ESO CC-BY-4.0 asset)

- **Gaia**: panoramic cubemap with dust.
- **Atlas**: black void.
- **Asset**: ESO fulldome Milky Way panorama available under CC-BY-4.0
  — can be vendored.
- **Effort**: 3-5 days.
- **Dependencies**: vendor asset.

### T4.8 — Transparency sorting / OIT

- **Gaia**: explicit per-layer render ordering in Java render system.
- **Atlas**: uses `renderOrder` map + painter's algorithm. Known risks:
  - Cloud (scale 1.01) + atmosphere (scale 1.025) both `depthWrite: false`
    additive — edge-on views may flicker.
  - Ring (renderOrder=1000) vs planet overlays (renderOrder=0) —
    composition depends on traverse order.
- **Atlas renderOrder inventory**: Starfield=-2, EclipticGrid=-100,
  ProceduralSun=0-3, Ring=1000, Arrows=2000, SunScreenFlare=5000-5003.
- **Effort**: 2-3 days to audit + tune; 1-2 weeks to implement OIT.
- **Dependencies**: none.

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
