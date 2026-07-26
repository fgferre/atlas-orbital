# Cross-AI triage — 2026-07-26

**Date:** 2026-07-26 · **HEAD at triage:** `5db5b59`
**Authority:** [`AGENTS.md`](../../../AGENTS.md) wins. This file is a **record of
what survived**, not an auto-backlog.
**Execution plan:** [`../../waves/fidelity-honesty-2026-07-26.md`](../../waves/fidelity-honesty-2026-07-26.md)
**Prior briefs:** [`cross-ai-validation-brief-2026-07-24.md`](./cross-ai-validation-brief-2026-07-24.md) ·
[`opportunity-hunt-2026-07-25.md`](./opportunity-hunt-2026-07-25.md)

### How to use

1. Read `AGENTS.md` → `tasks/STATUS.md` first.
2. Re-verify against **current HEAD** before implementing anything.
3. Do **not** re-open §3 without new evidence. The evidence that killed each
   claim is recorded there precisely so it does not have to be re-derived.

---

## 1. Method

Six external AI audits were pasted in. Twenty-one agents processed them in three
tiers:

| Tier         | Agents              | Job                                                                                                                 |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Verification | 8                   | Adversarially test each pasted claim: reachable at runtime? already guarded? does the proposed fix break something? |
| Workflow     | 12                  | Per-cluster implementation recon → three independent wave designs → judge → three adversarial critics               |
| Arbitration  | 1 (different model) | Rule on the seven decisions where critics disagreed with each other or with the judge                               |

The arbiter ran on a different model family on purpose. Everything upstream was
one family, and a tiebreak decided by the same model that produced both
conflicting readings confirms its own blind spot rather than exposing it. That
choice paid for itself — see §5.

**Verdict taxonomy:** CONFIRMED · UNREACHABLE (real in theory, no code path
reaches the bad state) · ALREADY-HANDLED · FALSE · TRIVIAL.

**Outcome:** roughly two thirds of the pasted claims did not survive, matching
the rate recorded in the two prior briefs. Four defects that no external audit
mentioned were found by agents reading the code with an implementation lens.

---

## 2. Confirmed

Origin `[ext]` = a pasted claim that survived. `[new]` = found by this hunt.

### 2.1 Bugs

| ID        | Finding                                                                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                            | Origin            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| **F-01**  | Earth's rotation is an artist knob at zero and the period is truncated. Sub-solar point ~280° wrong, drifting ~24°/yr. The terminator, the 8k night-lights map and the shipped eclipse shadow all land on the wrong geography while the app says LIVE                                                                                                                                                                        | `astrophysics.ts:985`; `artistCalibration.ts:25` (`EARTH_ROTATION_OFFSET_DEG = 0`), threaded via `Scene.tsx:766`; the overridden catalog value at `celestialBodies.ts:161-165` admits "Adjusted to 140 degrees to align Brazil with late afternoon sun"; zero `GMST`/`ERA`/`siderealTime` hits in `src/`                                                                                            | new               |
| **F-02**  | 20 moons carry `axialTilt: 0` and no pole. No synchronous lock, no libration. The five Uranian moons spin about an axis ~98° from their real pole; Pluto and Charon, a tidally locked binary, spin about different axes                                                                                                                                                                                                      | `moonSceneFrame.ts:67-70` falls back to `Euler(0,0,-axialTilt)`; `celestialBodies.ts:562` asserts the Moon always shows the same face; `grep -i libration` matches only "ca**libration**"                                                                                                                                                                                                           | new               |
| **F-03**  | Eclipse geometry is computed in didactically-compressed world units. `d_sun/d_moon` collapses 389 → 5.03; the Moon's angular radius is 10.1× too large; the penumbral spot covers ~87% of Earth's radius instead of the true ~53.6%; a shadow fires on ~86% of new moons against a real ~8.6%. Realistic mode is **scale-faithful, not exact** — see the correction below                                                    | `Planet.tsx:376`, `:384-387`; `astrophysics.ts:813-821`, `:668-669`. `AU_TO_3D_UNITS` and `KM_TO_3D_UNITS` share one linear factor (`astrophysics.ts:4-5`), so in realistic mode `dist / R_eclipser` — the only dimensionless quantity the shader branches on — equals its true value (verified 207.14 both ways). The **cone model** is still two tuned constants that never read `d_er` or `d_se` | ext               |
| **F-04**  | Quaoar's measured triaxial shape is collapsed by `Math.max()` and rendered as a sphere inflated 1.18×, while its own provenance block prints "Shape is approximated as an observation-based ellipsoid rather than a perfect sphere". **A live honesty violation**                                                                                                                                                            | `astrophysics.ts:672-674`; `celestialBodies.ts:1595` (`shapeScale: [1.18, 0.99, 0.86]`, Kiss et al. 2024) and `:1599`; `celestialBodies.test.ts:247` pins the value that never reaches geometry                                                                                                                                                                                                     | new               |
| **F-05**  | `luma(tonedAtmosphere.rbg)` pays green's Rec.709 weight to blue and vice versa. Atmosphere alpha runs ~59% high for a blue-dominant colour, and a faint limb that should be invisible renders                                                                                                                                                                                                                                | `atmscatteringSnippet.ts:269` — note `:267` two lines above uses `.rgb` correctly; `LUMA_GLSL` at `atmosphereShader.ts:105-107`                                                                                                                                                                                                                                                                     | ext               |
| **F-06**  | The focused star's mesh freezes proper motion in the focus memo while the sprite updates every frame. At ≥1 day/second of warp the mesh desynchronises                                                                                                                                                                                                                                                                       | `HygStellarMesh.tsx:267` (deps), `:243` (resolve); sprite at `Starfield.tsx:562-563`                                                                                                                                                                                                                                                                                                                | ext, reformulated |
| **F-07**  | Twenty moons print `yearLength: "Unknown"` while carrying `orbit.n` in the same record. All 20 derivations verified: Io `360/203.48 = 1.77 d`, a number the same record already prints nine lines later as `dayLength`                                                                                                                                                                                                       | `Sidebar.tsx:411`; 20 records in `celestialBodies.ts` (count confirmed)                                                                                                                                                                                                                                                                                                                             | new               |
| **F-08**  | `dayLength` is the sidereal rotation period in 46 of 47 records, with Earth the sole outlier quoting a solar day — under a label reading "Day Length". Mercury prints 58.6 d directly above a Fact stating a Mercurian day lasts 176 d                                                                                                                                                                                       | `celestialBodies.ts:78`, `:124`, `:171`, `:239`                                                                                                                                                                                                                                                                                                                                                     | new               |
| **F-09**  | Saturn's rings are built from the volumetric mean radius (58 232 km) while published ring ratios are quoted against the equatorial radius (60 268 km) — drawn ~3.4% undersized                                                                                                                                                                                                                                               | `usePlanetMaterials.ts:686-703`                                                                                                                                                                                                                                                                                                                                                                     | new               |
| **F-10**  | The tutorial teaches a "Project" rail tab that was demoted into the gear popover                                                                                                                                                                                                                                                                                                                                             | `TutorialOverlay.tsx:88` vs `controlPanelConfig.ts:38-44`                                                                                                                                                                                                                                                                                                                                           | new               |
| **F-11**  | The asteroid docblock claims a 1900-2050 validity window; the engine enforces 2000-2050. No third site disagrees — README, regression and engine tests all already say 2000-2050                                                                                                                                                                                                                                             | `asteroids.ts:5` vs `registry.ts:43-46`                                                                                                                                                                                                                                                                                                                                                             | ext               |
| **NEW-1** | `shapeScale` is applied twice. `resolveSemanticBodyRadius` already folds in `max(\|shapeScale\|)`, then the next site multiplies by `max(shapeScale)` again. Quaoar's camera-asset-interest radius is 1.39× its base, so its texture LOD tier promotes ~18% early                                                                                                                                                            | `Planet.tsx:794-802` (active) and `PlanetModel.tsx:251-259` (latent)                                                                                                                                                                                                                                                                                                                                | new               |
| **NEW-2** | Clouds **snap** once per rotation. `calculateRotationAngle` returns an angle already wrapped by `% 360`, and the 1.03 super-rotation factor multiplies that wrapped angle instead of the rate — a 10.7° instantaneous jump every simulated Earth day (~24 real seconds at 3600×)                                                                                                                                             | `Planet.tsx:250`; `astrophysics.ts:994`                                                                                                                                                                                                                                                                                                                                                             | new               |
| **NEW-5** | Atmosphere ESun has no lower clamp. `camHeightGr` goes negative once the camera is inside the body, so `atmFactor` reaches 1.025/0.025 = 41 and `eSun` reaches 4110 against a base of 10 — a **411x** overboost. Reachable today: `minDistance` bounds camera-to-TARGET, panning is enabled and its offset is preserved unbounded, so camera-to-body reaches zero. Found in round 2 by reversing this document own rejection | `atmosphereDynamics.ts:149-159`; `Scene.tsx:812` (`enablePan`); `controls.ts:114-118` (offset preserved); OrbitControls clamps `_spherical.radius`, not camera-to-body                                                                                                                                                                                                                              | new (round 2)     |

### 2.2 Perf

**P-01** — the Perlin cubemap is re-baked every frame at ultra **and** high
(`ProceduralSun3D.tsx:47/53/57/63`; 512², `cubeUpdateInterval: 1`; call site
`:735-737`). Per update that is 6 × 512² fragments each running 11 4D-simplex
evaluations ≈ 17 M per frame. The noise's fourth axis advances 0.01 units per
wall-clock second, so interval 4 is visually free. Balanced is already 192/2 and
constrained 128/3. No test pins it. XS.

### 2.3 Dead paths

| ID        | Finding                                                                                                                                                                                                                                                                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D-01**  | `atmosphereGround` is never `#define`d, so the ported Nishita ground integrator compiles to `vec3(0.0)` (`atmscatteringSnippet.ts:121-187`, stub at `:184-186`). Verified: only `#if defined(...)` guards exist in `src/`, never a `#define`                                                                                                                         | **Activate.** Recon correction: it does **not** depend on D-02 — the ground path's `fadeFactor` saturates to 1 above camera height 1.0125, so it is at full strength from every reachable position. It also complements rather than double-counts the shell, which is `BackSide` with depth test on and therefore a limb annulus only |
| **D-02**  | The descent-brightening branch is unreachable **through the dolly path**: `minDistance = radius × 1.1` (`src/components/canvas/cameraNearPlane.ts:43`) against a 1.025 shell, so `camHeightGr` is 0.1 against an `atmosphereHeight` of 0.025 and the T5.1 ESun boost never fires either. **But `minDistance` bounds camera-to-TARGET, not camera-to-body — see §6.** | **Fix the false comments; the unlock stays dropped** (a 7% band of camera travel whose destination is unshippable at current LOD). The pan path is a separate defect, **NEW-5**                                                                                                                                                       |
| **D-03**  | `useOsculatingElements` (`useOrbitalEngine.ts:101-115`) has zero importers; `analyticalProvider.ts:175-177` says so in prose                                                                                                                                                                                                                                         | **Delete the hook.** Recon correction: the panel does not need it — `resolveOrbitDistanceBoundsAU` (`astrophysics.ts:607-620`) already computes periapsis/apoapsis synchronously from the catalog record                                                                                                                              |
| **D-04**  | `computeEclipseShading` (`eclipseMath.ts:163`) has no runtime caller                                                                                                                                                                                                                                                                                                 | **Delete.** Recon correction: the proposed use (a UI badge) is **wrong** — it is a fragment-level function and a badge needs a body-level predicate. `eclipseMath.ts` itself survives: `eclipseShaderPatch.ts:1-13` imports its constants                                                                                             |
| **D-05**  | `msdfFontMath.ts` — 139 LOC plus a 163-LOC test, zero production importers. The header promises a T4.5-β decision that landed the other way in `a819566`; the same stale language repeats at `labelMode.ts:36` and `PlanetLabels3D.tsx:34`                                                                                                                           | **Delete all three sites**                                                                                                                                                                                                                                                                                                            |
| **D-06**  | The all-sky panorama ships in `public/textures` with zero consumers; there is no `scene.background`, cubemap or BackSide sphere anywhere in `src/`                                                                                                                                                                                                                   | **Gated proposal** — see the wave file's appendix                                                                                                                                                                                                                                                                                     |
| **D-07**  | `uDirection` is initialised to 1 in four materials and never reassigned                                                                                                                                                                                                                                                                                              | **Dropped.** All four fragment shaders consume it as `dot(n, uLightView) * uDirection`, so removal means editing GLSL on the Sun's boot path for zero behaviour change                                                                                                                                                                |
| **NEW-3** | `ringShadowMath.ts` (47 LOC) plus a 96-LOC test: the only importer in the whole repo is its own test, its docblock admits it "exists solely to pin shader behavior in tests", and the transform it provides is inlined separately at `Planet.tsx:270-271`/`:292-293`. A dead mirror twice over                                                                       | **Delete with the ring wave**                                                                                                                                                                                                                                                                                                         |
| **NEW-4** | `scene.getObjectByName(body.id)` is ambiguous — two objects carry the name (`Planet.tsx:1008` and `:426`). DFS returns the correct one by accident of traversal order                                                                                                                                                                                                | **Pin it** by caching the ref, inside the eclipse wave                                                                                                                                                                                                                                                                                |

### 2.4 Opportunities

**Visual** — giant-planet oblateness (`Planet.tsx:230` scales uniformly on all
three axes while the catalog states in prose that Jupiter and Earth are oblate
spheroids); Lommel-Seeliger photometry for airless bodies plus `metalness: 0.3`
on dielectric rock and ice (`artistCalibration.ts:41,44`; zero
`hapke|lommel|seeliger` hits); ring lit-vs-unlit face; activating D-01; Uranus's
rings; Enceladus plumes; populating the main belt.

**Product** — a catalog browser (39 of 45 bodies are reachable only by typing a
name you already know: `controlPanelConfig.ts:136`, `bodySearch.ts:85-88`);
orbital elements in the panel; stellar luminosity and the missing provenance
block on the HYG panel; elongation and phase; an eclipse badge; Earth-comparison
badges on mass and escape velocity; time hotkeys; the registry's validity notes.

**Physics** — one IAU orientation helper serving F-01 and F-02; J2 secular
precession for the analytical satellites (the disclosed envelope is Mimas 5.2°,
Phobos 3.6°); the Pluto-Charon barycentre (1.79 Pluto radii of visible motion
every 6.39 days, while Charon's own catalog text says the pair orbits a point
outside Pluto).

---

## 3. Rejected with evidence — do not re-open

### 3.1 Unreachable

| Claim                                                                                | What blocks it                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| NaN in the Sun's glow billboard at the camera pole                                   | Requires `centerView.x` **and** `.z` to be exactly 0.0f simultaneously — the Sun at 90° to the view axis, outside any FOV < 180°. NaN clip coords are culled anyway. The rays shader's guard exists for different geometry (a spike pointing at the camera), not for an oversight |
| NaN from `penumbraRadius = 0`                                                        | Triple-guarded: `dist` is a `distance()` so `dist < 0.0` is false for every finite value; `l2 = vrScale² ≥ 1`; and radius is only 0 when `uEclipsingActive` is 0, which the shader already gates                                                                                  |
| Dispose order sampling a deleted GL texture                                          | `Material.dispose()` does not touch textures at all, and the cleanup is one synchronous function body with no draw between the lines. The premise is wrong before reachability                                                                                                    |
| ~~BackSide atmosphere seen from below the surface~~ **REVERSED 2026-07-26 — see §6** | The original reason was a category error and this row is retained only so the mistake is not repeated                                                                                                                                                                             |
| Texture-cache eviction timer race                                                    | `refCount += 1` and `clearEntryEvictionTimer` are in the same synchronous function body; no macrotask can interleave. Also already rejected in the 2026-07-24 triage                                                                                                              |
| `vrScale` floor of 1 world unit                                                      | Bites only within 0.5 wu of the Sun; the nearest candidate receiver is ~220 wu away. Note the _real_ `vrScale` defect is different and is scheduled — see F-03                                                                                                                    |

### 3.2 False

| Claim                                          | The fact that kills it                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OBJ geometry re-merged on every texture tier   | Only `pallas` and `hygiea` use the OBJ path and both have `directTexture` permanently `null` (`shouldRenderDirectSurfaceMap` returns false for Hygiea, pinned by a test). The meshes are ~1 600 vertices, not 30 000                                                                                                                            |
| Dead branch in `textureVariants`               | The branches are in the **opposite** order to the claim; the balanced/boot case is checked first and shadows the overview guard, not the reverse                                                                                                                                                                                                |
| Baked lights in the shipped GLBs               | Both JSON chunks parsed directly: `extensionsUsed: []`, one mesh node each, zero cameras, zero `KHR_lights_punctual`                                                                                                                                                                                                                            |
| `alphaTest` on the rings                       | A **regression**. The geometry is a flat zero-thickness annulus so no pixel is blended twice; the Cassini Division sits at alpha ~33%, not 0; and 38% of the sampled row is below alpha 128, so any threshold clips the outer third and hard-edges a soft dithered falloff                                                                      |
| Pallas/Ceres/Vesta accuracy unanchored         | All three are in `MULTI_EPOCH_BODIES` with Horizons fixtures at +6 and +12 months. Absence from `MULTI_EPOCH_OVERRIDES` means "measured and passes the family default", the opposite of unmeasured                                                                                                                                              |
| Missing i18n coverage test                     | `name: { en: string; pt: string }` makes `pt` required — a body added without it is a compile error, not a silent undefined. The proposed test would assert what `tsc` already rejects                                                                                                                                                          |
| NASA starfield's 5-px `gl_PointSize` floor     | `NASAStarfield` is mounted and user-selectable via `LayersPanel`'s Starfield Source control; the floor is a cited NASA-EXACT port whose whole purpose is visual comparison. "Fixing" it destroys the feature                                                                                                                                    |
| Stefan-Boltzmann luminosity for the star panel | Evaluated against HEAD: gives Rigel 857 000 L☉ against a real ~120 000, because it inherits `radiusFromSpect`'s geometric-mean blend with the Ia table value of 1000 R☉, tuned for apparent disc size rather than luminosity accounting. Would have shipped a 7.1× error inside an honesty fix. Use the absolute-magnitude restatement (40 600) |

### 3.3 Trivial

M-dwarf blackbody colour (affects only the focused star's mesh, not the 109k
sprites, and is disclosed in JSDoc); a B−V→RGB LUT (109k is the ultra-only
ceiling, hidden behind a 3.2 MB fetch and decode); the OBJ loader cache
(bounded at ~400 KB for the whole session — only two OBJ files exist); constant
uniforms rewritten per frame (nanoseconds, immediately before a six-face cubemap
render); the `shadowMapSize` default prop; a penumbra on the ring shadow (the
physically correct width is 0.57 px).

### 3.4 Already handled

`isBinary` — the drop is documented four times in-code, and `spect` is
canonicalized at **build** time, so nothing at runtime could derive the flag. It
is a binary-format bump, not a small diff. Texture anisotropy, solar limb
darkening and HYG bulk colours from `spect` are **V2**, **V1** and **V7** of the
2026-07-25 hunt.

### 3.5 Dropped on our own analysis

Sphere tessellation LOD (0.12% silhouette error ≈ 1-2 px; ~1.1 M triangles is not
what limits the constrained tier); zodiacal light (ambient 0 + envMap 0 + a black
background means an honestly-scaled cone is invisible and a visible one is
invented); PCSS soft shadows (the only geometry where the Sun subtends enough
angle already has a purpose-built analytical penumbra, and stacking a second
soft-shadow path violates replace-don't-stack); comets (blocked by a missing tail
subsystem — and the earlier rejection's stated reason was **wrong**: Halley
e = 0.967 and Encke e = 0.848 are both elliptical and would propagate in the
existing solver).

---

## 4. Corrections the recon made to the surviving claims

These change the work, not just the wording.

- **F-05 is smaller than reported.** The claim that `fAlpha` was tuned against
  the inflated alpha is false: `Planet.tsx:350` is a pass-through of
  `config.alpha ?? GAIA_DEFAULT_ALPHA`, which is 1.0, and Earth sets no `alpha`.
  Nothing was ever tuned against the bug, so there is nothing to unwind. Fix the
  swizzle, look at it, and add an explicit Atlas `alpha` override only if the
  corrected look demands one.
- **F-06's causal chain runs the other way.** The camera translates rigidly with
  the live star (`controls.ts:119` → `CameraController.tsx:897`), so the camera
  follows the star and runs away from the frozen mesh. The gate therefore
  **already** fires today and will stop firing after the fix. A second copy of
  the same stale assumption sits in prose at `CameraController.tsx:452`.
- **F-07 must not carry the 2020-2030 window.** That range bounds _position_
  accuracy of the two-body propagation. The orbital period `360/n` is a
  time-independent constant of the record. Pasting the window onto Year Length
  would be a new false disclosure; the honest marker is "derived from mean
  motion".
- **D-03's honesty constraint was overstated, and a different one was missed.**
  Only Ω, ω and M0 are the fabricated zeros in the five TNOs — inclination and
  eccentricity are published values. But catalog inclination for **moons** is
  measured against a mix of reference planes (Triton to Neptune's equator,
  Iapetus to its Laplace plane, Io to Jupiter's equator) with no field recording
  which. Rendering "Inclination 15.47°" for Iapetus is invented precision. Show
  inclination only for sun-orbiting bodies, labelled "to ecliptic".
- **OPP-VALIDITY's translation cost is false, and its fix is not a one-liner.**
  The entire Sidebar is already hardcoded English, so one more English sentence
  is no new regression. But dropping the `!inValidityRange` guard naked would
  make an out-of-window user read the _analytical_ accuracy note while the Kepler
  fallback is what runs. It needs two arms.
- **The pole helper already exists.** `computePoleOrientationQuaternion` at
  `moonSceneFrame.ts:50` is already IAU-pole-first with an `axialTilt` fallback,
  and is already the live path for both render branches (`Planet.tsx:177`,
  `:634`); only `PlanetModel.tsx` bypasses it. A new `bodyOrientation.ts` must
  **absorb and delete** it, not be created alongside — otherwise the highest-risk
  wave ships two competing orientation sources.
- **The texture seam constant is derivable, but not "by construction".**
  `SphereGeometry` does put the u = 0.5 meridian on mesh **+X** — the leading
  minus on `vertex.x` (`three/src/geometries/SphereGeometry.js:100`) is what an
  external reviewer missed when claiming u = 0.5 lands on −Z. The u→axis table is
  u = 0 → −X, 0.25 → +Z, 0.5 → **+X**, 0.75 → −Z. Two corrections to the original
  wording, both landed here: the `ecliptic2ThreeJs` justification was a
  **non-sequitur** (that function remaps the orbital engine's position vectors and
  never touches the mesh-local texture path — the real argument is rotation
  handedness, `R_y(+W)` maps +X → −Z, the same sense in which u increases); and
  the residual is **not** zero by construction, it is zero **given the
  equirectangular convention that longitude 0 sits at u = 0.5**, which is a
  property of the asset, not of the geometry. Assert it once against Earth's
  Greenwich check; do not assume it per texture.
- **The flattening formula in the source spec was wrong.** `axis.y *= (1 - f)`
  would leave Jupiter's equator 1.4% and its pole 2.2% too small. The correct
  form is `R * ((1-f)^(-1/3), (1-f)^(2/3), (1-f)^(-1/3))`, verified against
  published equatorial and polar radii for all four giants to six digits. This is
  the near-miss that produced standing law 3 in the wave file.
- **The ring's Lambert diffuse already inverts.** `DoubleSide` plus three's
  `faceDirection` flip zeroes `directDiffuse` on the unlit face. What is genuinely
  face-independent is the emissive floor, which makes the fix smaller: modulate
  only the emissive, only on the unlit face.
- **The decoded ring alpha strip was the wrong file.** `2k_saturn_ring_alpha.png`
  has no manifest variant and is never loaded; the runtime asset is the 8k strip
  on focus and a 1024×62 boot strip off-focus. The qualitative structure holds;
  the calibration numbers must come from the shipped asset.
- **Saturn has no `visualProvenance` block at all**, despite shipping a painted
  ring alpha strip whose Cassini Division sits at ~113 400 km against the
  measured 117 580 km inner edge. A standing honesty gap independent of any
  scheduled item.

---

## 5. What the arbitration changed

Seven decisions were contested. The rulings are recorded in the wave file's
"Arbitrated decisions" section and must not be re-litigated without new evidence.
The one that justified using an independent model: **every prior party — three
critics and the judge — treated the pole helper as a module that did not exist
yet.** It exists, and is live in both render paths. Creating `bodyOrientation.ts`
beside it would have set exactly the competing-path trap that the wave is named
for.

---

## 6. Second-round review — 2026-07-26

Three more external AI reviewers (Codex, Grok, Antigravity) audited **this
document and the wave file** at `5e653d2`. Four of their reports' items were
already in the plan and were misreads. Eleven were real, and eight of those are
defects in _my_ text rather than in the code. Verified by three agents against
HEAD; the corrections are folded into the sections above and into the wave file.

**One rejection reversed, and it uncovered a live defect.**
§3's "BackSide atmosphere below the surface is unreachable" was a **category
error**: `minDistance` clamps the camera-to-**controls-target** distance
(`OrbitControls._clampDistance` applied to `_spherical.radius`), not
camera-to-body. Panning is enabled (`Scene.tsx:812`), the target moves by
`_panOffset` with **no bound**, and `controls.ts:114-118` deliberately preserves
the user's pan offset across focus tracking. With pan offset `d` and orbit radius
`r`, camera-to-body reaches zero at `d = r`. The surface-mode interlock that would
otherwise block it is soft in three ways: it arms only for a focused
`type === "planet"` body, it is bound to pointer-lock **success** rather than to
surface mode, and after three failed lock requests it stops re-requesting for the
session.

**NEW-5 · live defect, XS.** `atmosphereDynamics.ts:149-159` has no lower clamp
on `camHeightGr`. At the body centre `atmFactor = 1.025/0.025 = 41` and
`eSun = 10 + 41 × 100 = 4110` — a **411×** overboost, reachable today whenever
surface mode is not armed. Scheduled in W10 with the rest of the
`atmosphereDynamics` work; pull it forward as a one-line clamp if it is ever
observed.

**Corrections to numbers in this document and the wave file.**

- **The eclipse cone anchors were computed from the mean Earth–Moon distance.**
  Recomputed from the repo's own ELP and VSOP providers at 2024-04-08T18:18Z
  (`d_se` 149 463 545 km, `d_er` **359 804** km, not the mean 384 400): umbra
  **+64.9 km**, penumbra **3 417.5 km = 1.968 R_moon**. The wave file's
  −47 km / 3 529 km would render the Great North American **total** eclipse as
  annular. Independent falsification: the computed perpendicular distance from
  Earth's centre to the shadow axis is 2 192 km against a published gamma of
  2 188 km. The Io/Jupiter anchor carried the same class of slip as F-09 — it was
  derived from Jupiter's equatorial 71 492 km while the code feeds `radiusKm`
  69 911, so the true anchors are **69 558 / 70 343 km**.
- **"Realistic mode is exact" was too strong, and its supporting figure was
  circular.** The tuned `UMBRA0 = 0.04` and `PENUMBRA0 = 1.7` never read `d_er`
  or `d_se`, so no linear rescaling makes them exact: realistic mode is **13.6%**
  wrong for the Moon at Earth and **25×** wrong for Jupiter at Io. The "~46%"
  penumbral spot quoted above as the correct value was just `1.7 × 1737 / 6371` —
  the tuned constant read back. The true figure is **53.6%**.
- **Deriving obliquity from an IAU pole needs the orbital normal, not ecliptic
  north.** The W2 recipe as written was wrong by 6.98° for Mercury, **176.1°** for
  Venus (prograde where it is retrograde) and 15.5° for Uranus, and right only for
  Earth — because Earth's orbit _is_ the ecliptic.
- **The Enceladus plume speed band was the gas velocity, not the grain
  velocity.** Escape is 238.7 m/s from the record's own 0.113 m/s² and 252 km, so
  the quoted 300-1000 m/s is entirely unbound and no particle would follow a
  returning arc.
- **A 6 h eclipse scan step misses every eclipse in the decade.** The 2024-04-08
  intersection window is 5.17 h; the shortest in ten years are 2.28 h (solar,
  2029-07-11) and 1.45 h (lunar, 2031-06-05). No fixed sign-change step is safe,
  because a grazing event's window goes to zero continuously.

**Reviewer claims that did not survive.** `u = 0.5` landing on −Z (the reviewer
missed the leading minus on `vertex.x`); a 1e5 unit mismatch in `vrScale`
(everything is world units and consistent — though three JSDoc lines mislabel
world units as "km", which is worth fixing); parent poles tilting ecliptic-framed
moons (`Planet.tsx:1039` mounts them in a bare group, and Jupiter and Saturn
already carry poles today); and four items the reviewers reported as gaps that the
plan already specifies — the Sidebar `undefined°` guard, the `PlanetModel` pole
migration, the ringed-planet eclipse landmine, and `cameraNearPlane.test.ts` being
a blind gate.

---

## 7. Not audited

Recorded as an honest hole rather than implied coverage: post-processing, the
store and persistence layer, a11y, the build pipeline, and the flight/camera
subsystem (an external auditor declared it free of bugs and the two residual
items were noise — three transient `Vector3` allocations per frame during a
fly-to, and recomputing a distance before a velocity cap).

---

_End. Re-verify against HEAD before acting._
