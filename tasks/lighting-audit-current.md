# Atlas Orbital — Lighting & VFX Current-State Audit

**Status:** Snapshot as of commit `191408a` (Phase 3 tail closed). Ondas 0–10
executed 2026-04-18. Research-only artifact produced by the Lighting & VFX AAA
research session; **zero production code changed** during this audit.

**Purpose:** Exhaustive file:line inventory of every light, material, post-
processing pass, starfield shader, orbit / atmosphere / cloud path, quality-
profile gate, and asset slot that participates in the render chain. Serves as
the factual foundation for `lighting-aaa-benchmark.md` and
`lighting-backlog.md`. No recommendations here — that is the backlog's job.

**Reading convention:** every claim is tagged `path/to/file.ts:line`. If a
claim is not file:line-citable, it is flagged `[derived]` (inferred by
reading surrounding code rather than a single identifiable line).

---

## 1. Lights inventory

### 1.1 Scene-level lights

Three primary sources, all composed inside
`src/components/canvas/scene/SceneLighting.tsx`.

| Light                          | File:line                                                                                             | Type                 | Intensity                                                 | castShadow | Shadow config                                                                                                                                                  | Dynamic behavior                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ambient fill                   | `src/components/canvas/scene/SceneLighting.tsx:20`                                                    | `<ambientLight>`     | Dynamic (`ambientIntensity` from `useSceneDebugControls`) | No         | —                                                                                                                                                              | Intensity lerped via `useVisualPresetLerp` per preset change                                                                                              |
| Central pointLight (at origin) | `src/components/canvas/scene/SceneLighting.tsx:27`                                                    | `<pointLight>`       | Dynamic (`sunIntensity`)                                  | No         | —                                                                                                                                                              | decay = 0 (no attenuation); position (0,0,0); intensity lerped per preset                                                                                 |
| SmartSunLight (directional)    | `src/components/canvas/scene/SceneLighting.tsx:33` → `src/components/canvas/SmartSunLight.tsx:16-111` | `<directionalLight>` | 1.5 default (prop)                                        | **Yes**    | Orthographic camera bounds `[-20, 20, 20, -20, 0.1, 500]`; `shadow-mapSize` pulled from `qualityProfile.shadowMapSize` (1024 → 4096); `shadow-bias = -0.00005` | Per-frame (`useFrame`) refit of position + target + shadow-camera bounds against the focused body and its siblings via `AstroPhysics.resolveShadowExtent` |

Notes on SmartSunLight dynamic behavior (`src/components/canvas/SmartSunLight.tsx:34-83`):

- Resolves the tracked body from `focusId`; defaults to `"earth"` when sun/none
  is focused so shadow resolution stays useful during the idle tour.
- Recomputes the orthographic shadow frustum each frame only when values
  actually change (conditional update of `left/right/top/bottom/near/far`),
  avoiding a matrix rebuild every tick.
- Cost: `O(n)` over sibling bodies for `resolveShadowExtent`; does not run
  when the refs are missing.

No `<hemisphereLight>`, `<spotLight>`, or `<rectAreaLight>` were found
anywhere in the scene graph `[derived]` — the whole scene is ambient + one
positional plus one directional.

### 1.2 Per-frame cost summary (lights)

- Ambient / pointLight: O(0) per frame — uniforms only change on preset lerp.
- SmartSunLight: O(n) over siblings + 1 matrix update per frame **only when
  bounds change**. Cost scales with focused-body-sibling-count; at 28-body
  regression scale this is a bounded constant.
- No shadow cascades; single directional shadow map per frame.

---

## 2. Materials inventory

All planet / moon / sun / ring / cloud / atmosphere materials are factored
through `src/components/canvas/planet/usePlanetMaterials.ts`. Seven custom
`onBeforeCompile` shader injections live in this file; three standalone
shader modules live under `src/components/canvas/shaders/`.

### 2.1 Planet surface — MeshStandardMaterial with `onBeforeCompile`

`src/components/canvas/planet/usePlanetMaterials.ts:204-287`

- Base: `<meshStandardMaterial>` with `map / normalMap / roughnessMap`
  channels; `color` falls back to `body.color` when no `surfaceMap`.
- Roughness / metalness: driven by `useSceneDebugControls` (live tuning).
- **Color space:** `[derived]` uses three.js default sRGB texture decode for
  JPG/PNG loads. No explicit `SRGBColorSpace` override in audit scope.
- **toneMapped:** default `true` — participates in the tone mapping curve.
- **Earth day/night injection** (`usePlanetMaterials.ts:229-288`, shader
  module `src/components/canvas/shaders/earthDayNightShader.ts`): adds world-
  space varyings (`vWorldPos`, `vWorldNormal`, `vUv`), samples a `tNight`
  texture, blends it into the emissive channel based on
  `dot(vWorldNormal, lightDir)`.
- **Ringed-planet shadow injection** (`usePlanetMaterials.ts:290-361`): a
  ray-sphere analytical test lets rings shadow the planet's surface without a
  real shadow pass.

### 2.2 Sun — MeshBasicMaterial

`src/components/canvas/planet/usePlanetMaterials.ts:178-201`

- `<meshBasicMaterial>`, `color = baseColor × sunEmissive`.
- **`toneMapped: false`** — HDR pass-through candidate (see backlog
  Rendering Invariants §3.1-#3).
- `opacity: 0`, `depthWrite: false` when `sunRenderMode === "procedural"`;
  opaque otherwise.
- Optional `surfaceMap` for photographic sun rendering.

### 2.3 Earth fresnel atmosphere — ShaderMaterial

`src/components/canvas/planet/usePlanetMaterials.ts:155-168`, shader module
`src/components/canvas/shaders/atmosphereShader.ts`.

- Uniforms: `color (0x00aaff)`, `viewVector`.
- Blending: `THREE.AdditiveBlending`.
- `side: THREE.BackSide` (renders from inside a slightly larger sphere).
- `depthWrite: false`.
- Fragment effect: `pow(max(0, 0.6 - dot(normal, viewDir)), 4.0)` — pure
  fresnel glow, **no Rayleigh/Mie scattering**. Stylistic, not physical.

### 2.4 Earth cloud layer — MeshStandardMaterial + shadow-caster

`src/components/canvas/planet/usePlanetMaterials.ts:51-106`

- Base: MeshStandardMaterial with `map: textureClouds`.
- Blending: `THREE.AdditiveBlending`; `depthWrite: false`; `transparent: true`.
- `roughness / metalness`: 1.0 / 0.0.
- `castShadow: true` (drives a separate MeshDepthMaterial).
- Shader injection: world-space day/night modulation — clouds darken on the
  night side via `1.0 - smoothstep(-0.2, 0.2, dot(vCloudWorldNormal, cloudLightDir))`.
- Super-rotation (`src/components/canvas/Planet.tsx:236-239`):
  `cloudRotation = solidBodyRotation × 1.03` (eastward drift).

Cloud shadow caster (`usePlanetMaterials.ts:111-140`): MeshDepthMaterial
with `map: textureClouds`, `alphaTest: 0.2`, `depthPacking: RGBADepthPacking`,
and an injection that uses `luminance = dot(texColor.rgb, vec3(0.299, 0.587,
0.114))` as alpha so bright cloud pixels cast shadow.

### 2.5 Rings — MeshStandardMaterial with planet-shadow injection

`src/components/canvas/planet/usePlanetMaterials.ts:390-427`, shader module
`src/components/canvas/shaders/ringShadowShader.ts`.

- `map: textureRing`, `emissive: 0xffffff`, `emissiveMap: textureRing`,
  `emissiveIntensity: ringEmissive` (live control).
- `roughness / metalness`: 0.8 / 0.0; `DoubleSide`, `depthWrite: false`.
- Shader injection: analytical ray-sphere test reduces diffuse **and**
  emissive inside the planet's shadow cone.

### 2.6 Procedural sun — four ShaderMaterial layers

`src/components/canvas/ProceduralSun3D.tsx:1-215` + shader pairs in the same
file.

| Layer  | Shader pair                                | Purpose                                   |
| ------ | ------------------------------------------ | ----------------------------------------- |
| Sphere | `proceduralSunSphereVertex/FragmentShader` | Perlin-noise convection pattern on sphere |
| Glow   | `proceduralSunGlowVertex/FragmentShader`   | Fresnel-based outer glow ring             |
| Rays   | `proceduralSunRaysVertex/FragmentShader`   | Per-line random turbulence + dispersion   |
| Flares | `proceduralSunFlaresVertex/FragmentShader` | Light-scatter highlights                  |

Quality tiers (`ProceduralSun3D.tsx:34-75`):

| Tier        | Cubemap | Sphere segs | Rays | Flares | Update          | lowRes |
| ----------- | ------- | ----------- | ---- | ------ | --------------- | ------ |
| ultra       | 512²    | 64          | 4095 | 2047   | every frame     | no     |
| high        | 512²    | 64          | 4095 | 2047   | every frame     | no     |
| balanced    | 192²    | 56          | 1024 | 640    | every 2nd frame | yes    |
| constrained | 128²    | 48          | 512  | 320    | every 3rd frame | yes    |

### 2.7 Sun screen flare — three SpriteMaterial portals

`src/components/canvas/planet/SunScreenFlare.tsx:97-275`

- Three billboard sprites in a **React-portaled scene**, rendered above the
  main pipeline with `renderOrder 5000+`.
- Core + halo + rays; all `SpriteMaterial` with:
  - Blending: `THREE.AdditiveBlending`
  - `depthTest: false`
  - `depthWrite: false`
  - `toneMapped: false`
  - Textures: `createRadialGradientTexture(512)` (core, halo),
    `createStarburstTexture(512, 14)` (rays)
- Screen-space projection (`SunScreenFlare.tsx:136-189`): projects world sun
  position to NDC, culls off-screen.
- Fade logic (`:178-186`): starts fading when sun drops below 12 px visual
  radius; full opacity at ≤ 3 px.
- Per-frame updates (`:194-229`): sprite scale by world-per-pixel, color lerp
  toward warm `#FFD88A`, rays rotate at 0.04 rad/frame.
- CanvasTexture color-space: explicitly set to `SRGBColorSpace`
  (`SunScreenFlare.tsx:38, 92`).

### 2.8 Material type × count summary

| Type                 | Count (known) | Primary use                                   |
| -------------------- | ------------- | --------------------------------------------- |
| MeshStandardMaterial | 5+            | Planets, rings, clouds                        |
| MeshBasicMaterial    | 2             | Sun, env fallback                             |
| ShaderMaterial       | 4+            | Earth atmosphere + four procedural-sun layers |
| MeshDepthMaterial    | 1             | Cloud shadow casting                          |
| SpriteMaterial       | 3             | Sun screen flare                              |

Total custom shader touchpoints: seven (planetShadowShader,
atmosphereShader, nasaStarShaders, proceduralSunShaders ×4, cloudShader,
earthDayNightShader, ringShadowShader — counted as file-level modules, some
bundled).

---

## 3. Post-processing pipeline

`src/components/canvas/scene/PostProcessingPipeline.tsx:1-75` — full
contents for reference:

```tsx
<EffectComposer>
  {bloomEnabled ? <Bloom ref={assignBloomRef} mipmapBlur /> : <></>}
  <ToneMapping />
  <HueSaturation ref={assignHueSatRef} hue={0} />
  <BrightnessContrast ref={assignBrightnessRef} />
</EffectComposer>
```

Effects present:

1. **Bloom** — `@react-three/postprocessing` `<Bloom mipmapBlur>`; intensity
   and luminance threshold are written into a ref by the parent and tweened
   in `useSceneDebugControls`. `radius` was removed to prevent serialization
   issues `[comment at :63]`. **No `luminanceThreshold` prop is set** —
   effect currently uses the default (~0.9).
2. **ToneMapping** — `<ToneMapping />` with no props. Important: this
   **runs in addition to** the renderer-level `ReinhardToneMapping` set in
   `src/components/canvas/Scene.tsx:267`
   (`gl.toneMapping = THREE.ReinhardToneMapping`). That is a **double
   tone-map** — first pass linearizes→Reinhard at the end of the main
   render, then `<ToneMapping />` runs again in the composer. Surface-level
   impact is compressed highlights and a narrower usable HDR range before
   the bloom pass even sees it.
3. **HueSaturation** — `hue = 0`, saturation ref-controlled.
4. **BrightnessContrast** — ref-controlled brightness + contrast.

### 3.1 Quality-tier gating

`src/components/canvas/Scene.tsx:335-339` [derived from audit agent's
report]: when `qualityProfile.name === "constrained"`, the entire
`<EffectComposer>` subtree is replaced with `<></>`; an HTML data attribute
`data-postprocessing="active|inactive"` is set for e2e test detection (this
was formalized by onda 0.2, per audit agent).

### 3.2 Renderer-level settings

`src/components/canvas/Scene.tsx:256-268`:

- `glConfig.antialias`: driven by `qualityProfile.antialias` (false on
  `balanced`, `constrained`).
- `glConfig.logarithmicDepthBuffer: true` — enables far ~1e15 without
  z-fighting at solar-system scale.
- `canvasDpr: [1, qualityProfile.dprMax]` (adaptive pixel ratio per tier).
- `gl.toneMapping = THREE.ReinhardToneMapping` — **the second tone-map
  source**; conflicts with `<ToneMapping />` in the composer.

---

## 4. Starfield shaders

Two implementations coexist, selected by `starfieldSource` store slice
(HYG by default; NASA Eyes catalog for the alternate visualization).

### 4.1 HYG starfield — `src/components/canvas/Starfield.tsx:28-314`

Vertex shader (lines 57–122):

- Attributes: `position`, `velocity` (proper motion in pc/yr), `mag`
  (apparent magnitude), `ci` (B–V color index).
- Uniforms: `particleSize` (viewport-scaled), `yearsSinceJ2000`.
- Transfer curve: `brightness = 2.0 * log(1.0 + flux * 250.0)` where
  `flux ≡ 10^(-mag/2.5)`. The log-compression shape emulates NASA Eyes
  (see L16 / L17). The constant `C = 250` is the HYG-path calibration
  determined in L17.
- Sprite size: `clamp(brightness * 4.0 * particleSize, 5.0, 50.0)`.
- Sprite alpha: `clamp(brightness * particleSize, 0.05, 1.0)`.
- Proper motion: `animatedPos = position + velocity * yearsSinceJ2000`.
- B–V → RGB: piecewise linear blackbody locus
  (blue → white → yellow → red).

Fragment shader (lines 124–139):

- Radial falloff: `pow(d, 5.0)`.
- Blending: `THREE.AdditiveBlending`; `depthWrite: false`.

Rendering params:

- `THREE.Points` primitive; `renderOrder = -2`; `raycast = () => null`.
- Ecliptic rotation: `(23.4°, 0, 0)` — J2000 obliquity.
- DPR handling: `particleSize = sqrt(max(w,h) * effectiveDpr) / 60` via
  `useStarfieldParticleSize`; effective DPR sourced from `gl.getPixelRatio()`
  per L17#7 to avoid DPR double-dip.

### 4.2 NASA Eyes starfield — `src/components/canvas/NASAStarfield.tsx:32-138`

Shader module: `src/components/canvas/shaders/nasaStarShaders.ts:13-64`.

- Attributes: `starColor (vec4 RGB + absMag)`.
- Uniforms: `particleSize`.
- Distance-to-flux: `absoluteMagnitudeToFlux(absMag, distance) =
1.35e18 * pow(10, absMag/-2.5) / (4π * distance²)`.
- Transfer curve: `brightness = 2.0 * log(1.0 + flux * 1e4)` — **C = 1e4**,
  the NASA-exact constant (L16).
- Size / alpha clamps: identical form to HYG (L17 parity).
- Near-fade:
  `clamp((distance - 6.684e6) / 6.016e7, 0, 1)` — scene-unit equivalent of
  NASA's `(d - 1e12) / 9e12` km fade.
- Fragment falloff: `pow(d, 5.0)`, additive, `depthWrite: false`.
- Coordinate pipeline (`NASAStarfield.tsx:55-79`): NASA km → parsec via
  `KM_TO_PARSEC = 1/3.086e13`, scene-unit scale `DISTANCE_SCALE = 206,265,000`
  (matches HYG legacy scale).

### 4.3 Shared math module

`src/lib/starfieldShaderMath.ts` — 15 unit tests pinning both curves (per
L16/L17). **Any HDR-pipeline retune of star brightness must update this
module + its tests atomically.**

### 4.4 Material stability pattern (L15)

Both starfield components keep a `useMemo`'d `ShaderMaterial` reference and
pass it as an instance prop (`<points material={material}>`) — not as a JSX
child — to avoid the R3F reconciliation bug where
`<shaderMaterial uniforms={{…}}>` as child silently breaks per-frame
uniform writes.

---

## 5. Orbit lines, halos, cloud layers, screen flares

### 5.1 Orbit lines

`src/components/canvas/planet/PlanetOrbitLine.tsx:13-29` — drei `<Line>`
wrapping `three-stdlib` `Line2`:

- `lineWidth`: 2.5 focused / 1.5 unfocused.
- `opacity`: `0.3 * orbitSalience`.
- `transparent: true`, `depthTest: true`, `depthWrite: false` (reads depth
  so planets occlude lines; doesn't write so lines don't occlude one another).
- `raycast: () => null`.
- Adaptive fade logic in `src/components/canvas/Planet.tsx:595-656`
  (distance + salience).
- `orbitPoints` memo invalidation gated by `orbitDateBucket` (not raw
  datetime) — recomputes at ~4 Hz, not 60 Hz (per L18 decoupling pattern).

### 5.2 Atmospheric halos

Only Earth has a fresnel atmosphere today (see §2.3). No other body shows
an atmospheric shell; Venus, Mars, Titan, the gas giants are rendered as
surface-only spheres. `src/data/celestialBodies.ts` declares `atmosphere`
**as a free-form English description string** (e.g. `"96% carbon dioxide,
clouds of sulfuric acid"` for Venus at line 123) — no structured fields
for `present / tint / density / falloff / rayleigh / mie`.

### 5.3 Cloud layer

See §2.4. Single layer on Earth only; sphere geometry `[1, 64, 64]` scaled
1.01× above planet radius; casts its own shadow via MeshDepthMaterial.

### 5.4 Sun screen flare

See §2.7. Portal'd sprite trio; screen-space only; toneMap-bypassed.

---

## 6. Quality profile

`src/lib/qualityProfile.ts:69-106` — tier matrix (audit agent–resolved):

| Tier        | Antialias | DPR max | Shadow map | Env map | Bloom   | Bloom multiplier |
| ----------- | --------- | ------- | ---------- | ------- | ------- | ---------------- |
| ultra       | true      | 2.0     | 4096       | 256     | on      | 1.0              |
| high        | true      | 1.75    | 4096       | 256     | on      | 1.0              |
| balanced    | false     | 1.5     | 2048       | 128     | on      | 0.75             |
| constrained | false     | 1.0     | 1024       | 64      | **off** | 0                |

`QualityMode` union (`qualityProfile.ts` header): `"auto" | "ultra" | "high"
| "balanced" | "constrained"`. Auto-detection scoring (`:143-180`) combines
`deviceMemory`, `hardwareConcurrency`, `effectiveType`, viewport, DPR into a
score; thresholds ≥4 ultra, ≥2 high, ≥-1 balanced, else constrained.

### 6.1 Existing user surface for quality / style

`src/components/ui/LayersPanel.tsx` is the panel the project already ships —
codex review correctly flagged that there is **not** a green-field surface
gap. Relevant rows:

- `Starfield Source` subsection at `LayersPanel.tsx:185`.
- `Quality` subsection at `LayersPanel.tsx:239` — four buttons mapped to
  `setQualityMode`.
- `Sun Render` subsection at `LayersPanel.tsx:269` — auto / procedural /
  photographic options.

No `Graphics`, `VFX`, `Post-Processing` subsection exists. Any new feature
toggles land **inside this panel** (schema extension), not in a new one.

---

## 7. Asset manifest

`src/data/assetManifest.ts:31-347` — declared non-code assets, statuses
(`active / fallback / candidate / rejected`):

Representative rows (full table in the manifest):

- `vesta` / model / glb / 5.07 MB / active (NASA Science 3D).
- `pallas` / model / obj / 88 KB / active (DAMIT #101, CC BY 4.0).
- `hygiea` / texture / png / 163 KB / candidate (VLT 2017-18, held out of
  diffuse per provenance note).
- `jupiter` / texture / jpg / 7.97 MB / active (repo-local, provenance
  unclear).
- `titan` / texture / jpg / 1.65 MB / active (USGS Cassini ISS mosaic, CC).
- `europa` / texture / jpg / 2.01 MB / active (USGS Voyager/Galileo, CC).

### 7.1 What the manifest does **not** declare today

- No HDRI / environment map slot (`.hdr`, `.exr`).
- No equirectangular star-sky or Milky Way layer.
- No lens-dirt / bloom-dirt overlay texture.
- No anamorphic lens-flare textures.
- No volumetric noise 3D textures.

This empty surface is an input to backlog items #3 (Milky Way) and
#6 / #8 (lens flare), which will each need to declare their own assets.

Color-space handling: CanvasTexture instances are explicitly set to
`THREE.SRGBColorSpace` (see §2.7); texture-loader JPG/PNG loads rely on
three.js defaults `[derived]`.

---

## 8. Package deps relevant to rendering

`package.json:31-42`:

```json
"@react-three/drei": "^10.7.7",
"@react-three/fiber": "^9.4.0",
"@react-three/postprocessing": "^3.0.4",
"@types/three": "^0.181.0",
"three": "^0.181.2",
```

Plus supporting libs: `astronomia@4.2.0` (orbital mechanics), `zustand` (store).

**Notable transitive check** (`package-lock.json`): `n8ao@1.10.1` is already
present in the lockfile (resolved at `^1.9.4`). It is a **transitive**
dependency — no source file currently imports it; promoting it to a direct
dep for pinning is a near-zero-cost step if backlog item #10 lands. No other
lighting libraries (`@takram/three-atmosphere`, `realism-effects`,
`three-volumetric-pass`, anything `ektogamat`) were found in the lockfile.

---

## 9. Per-section performance notes

### 9.1 Canvas construction

- Logarithmic depth buffer: on (essential for scene scale).
- Antialias fixed at construction time `[comment at Scene.tsx:258-260]`
  to avoid WebGL context loss on live profile switch.
- DPR clamped by quality profile; re-read from `gl.getPixelRatio()` per L17
  so sprite calibrations stay consistent after a quality switch.

### 9.2 Hot-path references (audit agent + HANDOFF.md cross-check)

- **Planet.tsx useFrame**: calls `resolveOrbitalDisplayPosition` every frame;
  the engine cache (`engine.ts:30`, ~0.864 s bucket, 1 s TTL) is
  under-exploited per HANDOFF — onda 1 is the scheduled upstream fix. Any
  lighting work that adds further per-body per-frame computation should be
  validated against this hot path.
- **SmartSunLight**: per-frame shadow-frustum refit (see §1.1).
- **Starfield**: two float uniform writes per frame (O(1)); material ref
  stable per L15.
- **SunScreenFlare**: world-to-NDC + scale update per frame (O(1)).
- **OverlayPositionTracker** (per L19): scene-graph lookups cached, scratch
  `Vector3` at module scope, pixel-quantized emit fingerprint. Any lighting
  work touching overlays must preserve these patterns.

### 9.3 Render-order map (partial)

| Target                    | renderOrder | Notes                               |
| ------------------------- | ----------- | ----------------------------------- |
| Starfield (HYG + NASA)    | -2          | First, behind everything            |
| Orbit lines (unfocused)   | default     | Between stars and planets           |
| Planets / moons / rings   | default     | Depth-sorted by three.js            |
| Sun screen flare (portal) | 5000+       | Always on top, depth-test disabled  |
| Post-processing           | N/A         | Applied per-frame after main render |

---

## 10. Architectural observations (pure description, not recommendation)

1. Sun at world origin — simplifies world-space shader uniforms
   (`uSunPositionWorld = (0,0,0)` read directly, no CPU transform).
2. Analytical shadow shaders (ring-on-planet, planet-on-ring) rather than
   shadow-map cascades — bounded GPU cost, no filtering artifacts.
3. Proper-motion displacement in vertex shader — avoids per-frame CPU
   position-buffer rewrites.
4. Adaptive DPR read per-frame (not cached at mount) — keeps sprite sizing
   stable across quality switches.
5. Post-stack completely unmounts on constrained tier — zero fallback shim.
6. `Line2` via drei `<Line>` — a small dependency surface but the correct
   call (raycast-free lines with depth-read).
7. React-portaled sprite scene for the sun flare — an aesthetic compromise
   that dodges postprocessing-integration complexity.
8. L15 pattern (materialRef via useMemo) is applied consistently in both
   starfields — any new shader-heavy VFX item needs to follow it.

---

## 11. Gap surface (inputs the backlog will act on)

Facts observable from this audit that matter for the backlog (each restated
without recommendation):

- The renderer and the composer both own tone mapping today
  (Scene.tsx:267 + PostProcessingPipeline.tsx:68).
- `<Bloom>` has no `luminanceThreshold` prop set; default threshold applies.
- `celestialBodies.ts.atmosphere` is a prose string, not a typed record.
- No HDRI / Milky Way / lens-flare / volumetric-noise assets are declared.
- No user-facing surface exists for SSAO / lens-flare / god-rays / volumetric
  toggles (LayersPanel has no VFX subsection).
- `n8ao@1.10.1` is transitively present in `package-lock.json` already.
- The starfield transfer-curve constants (`C = 250` / `C = 1e4`) are pinned
  by 15 unit tests — any HDR recalibration lands here first.

These eleven facts are the audit's handoff to `lighting-backlog.md`.

---

_End of audit._
