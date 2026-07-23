# Atlas Orbital — Improvement Sweep (validation + grounded blueprints)

_Generated 2026-06-16 by a 25-agent validation+blueprint swarm. The source prompt was AI-generated; every architectural claim was fact-checked against real code before authoring blueprints. Each blueprint carries an adversarial worth-it verdict._

## 1. Prompt validation (claim-by-claim vs real code)

### Atlas Orbital Physics Engine - Propagators & Dispatch

| Verdict       | Claim                                                                                                 | Evidence                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Analytical orbit dispatch (VSOP87D, Pluto-Meeus, ELP/MPP02-trunc) and Keplerian two-body propagators. | registry.ts:6-15 (PLAN.md Path A models), analyticalProvider.ts:1-15 (analytical dispatch), keplerProvider.ts:1-10 (Kepler implementation). Actual models: VSOP87D (8 planets), Pluto-Meeus (Pluto), ELP-MPP02-trunc (Moon), and satellite/aster |
| **CONFIRMED** | There is a dispatch/registry mechanism choosing per-body which propagator to use.                     | engine.ts:112-149 selectProvider() method dispatches based on getOrbitalMetadata(bodyId) + isWithinValidityRange() check. analyticalProvider.ts:55-62 classify() function routes to internal branches (vsop87, pluto, moon, satellite, asteroid, |
| **CONFIRMED** | Keplerian two-body propagation exists for some bodies (which ones?).                                  | keplerProvider.ts:47-63 calculateKeplerianPosition() implements mean-anomaly-based two-body propagation via elementsToCartesian(). Bodies using Kepler: (1) Primary fallback for all bodies when analytical unavailable; (2) Satellites (phobos, |

<details><summary>Real APIs to build on</summary>

## Engine Public API

**OrbitalEngine class methods:**

- `registerProvider(provider: OrbitalProvider)` - Register a provider (engine.ts:80)
- `calculatePosition(bodyId, date, parentId?)` - Main calculation entry (engine.ts:154)
- `calculatePositions(bodies[], date)` - Batch calculation (engine.ts:234)
- `getOsculatingElements(bodyId, date)` - Get elements with analytical fallback (engine.ts:258)
- `getBodyMetadata(bodyId)` - Fetch registry entry (engine.ts:286)
- `getProvenance(bodyId, date?)` - Provenance tracking (engine.ts:293)

**Singleton export:**

- `orbitalEngine: OrbitalEngine` (engine.ts:430)
- `calculateOrbitalPosition(bodyId, date, parentId?)` (engine.ts:435)
- `getOrbitalProvenance(bodyId, date?)` (engine.ts:446)

## Provider Registration & Dispatch

**Registration (engine.ts:69-75):**

```typescript
constructor() {
  this.providers.set("kepler", keplerProvider);
  this.providers.set("ephem", analyticalProvider);
}
```

**Dispatch mechanism (engine.ts:112-149 selectProvider):**

- Get metadata: `getOrbitalMetadata(bodyId)` from registry
- Check validity: `isWithinValidityRange(bodyId, date)`
- Priority: analytical (if in-range) > Kepler fallback
- Returns: `{ provider: OrbitalProvider, isFallback: boolean }`

**OrbitalProvider interface (types.ts:112-151):**

- `id: string` - Unique identifier ("kepler" or "ephem")
- `canCalculate(bodyId): boolean` - Supported body check
- `calculatePosition(context): OrbitalPositionResult` - Main calculation

## Analytical Provider Internal Dispatch

**AnalyticalProvider.classify() (analyticalProvider.ts:55-62):**

- Routes by body ID to: vsop87 | pluto | moon | satellite | asteroid | kepler
- Uses helper predicates: `isVsop87Planet()`, `isAnalyticalSatellite()`, `isAnalyticalAsteroid()`

**Model labels (types.ts:16-25):**

- VSOP87D: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
- Pluto-Meeus: Pluto
- ELP-MPP02-trunc: Moon
- GalileanMeanElements: Io, Europa, Ganymede, Callisto
- SaturnianMeanElements: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
- UranianMeanElements: Miranda, Ariel, Umbriel, Titania, Oberon
- MartianSatMeanElements: Phobos, Deimos
- AsteroidOsculating: Ceres, Pallas, Vesta (1900-2050 window)
- Kepler: All others or out-of-range

## Kepler Propagator

**KeplerProvider.calculateKeplerianPosition() (keplerProvider.ts:48-63):**

```typescript
function calculateKeplerianPosition(elements, daysSinceJ2000): THREE.Vector3
  - M = (M0 + n × dt) mod 360
  - Calls elementsToCartesian(a, e, i, Ω, ω, M)
  - Returns ecliptic → three.js rotation
```

**Element registration (keplerProvider.ts:171-176):**

- `registerBody(bodyId, elements)` - Add Keplerian orbit

**Bodies with Kepler propagation:**

1. **Satellites (parent-centered):** Phobos, Deimos, Io, Europa, Ganymede, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus, Miranda, Ariel, Umbriel, Titania, Oberon (registry.ts:141-272)
2. **Asteroids (heliocentric):** Ceres, Pallas, Vesta (registry.ts:275-298)
3. **Kepler-only (heliocentric):** Triton, Charon, Hygiea, Haumea, Makemake, Eris, Gonggong, Quaoar, Orcus, Sedna, Salacia, Vanth, Weywot (registry.ts:301-378)

</details>

### HYG v4.2 Starfield Implementation

| Verdict       | Claim                                                                  | Evidence                                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Real star coordinates from the HYG v4.2 catalog (up to ~109,400 stars) | src/lib/starfield.ts:42 — 'Astronexus HYG v4.2: 109,400 runtime stars with real B-V colour index, per-magnitude size, and annual proper motion from pmra/pmdec.' Also src/lib/starfield.ts:162 states 'ultra → full (~1.77 MB, ~109 400 stars —  |
| **PARTIAL**   | mapped to 3D space via parallax and RA/Dec equatorial coords           | src/utils/hygBinary.ts:21 documents binary format per-star record as '[0..12) x, y, z float32 ×3 (parsec, HYG equatorial J2000)' — positions are Cartesian (parsec-based), NOT RA/Dec or parallax. src/components/canvas/Starfield.tsx:31-32 sta |
| **CONFIRMED** | rotated 23.4° to align with the ecliptic                               | src/components/canvas/Starfield.tsx:623 applies explicit rotation: 'rotation={[(23.4 * Math.PI) / 180, 0, 0]}'. src/components/canvas/Starfield.tsx:31-32 explains: 'Star positions are equatorial J2000 parsecs. The scene is ecliptic, so the  |

<details><summary>Real APIs to build on</summary>

**Star Data Structures:**

- Per-star record in HYG binary (v3 format, 38 bytes): positions (float32 x3 in parsecs, equatorial J2000), magnitude quantized (uint8), B-V color index (uint8), proper motion RA/Dec (int16 mas/yr each), spectral index + absmag, and v3 designation fields (proper name, Bayer, constellation, Gliese, Flamsteed/HD/HIP numeric IDs).
- Decoded into HygCatalogData with Float32Array positions, Float32Array magnitudes/colorIndices, Int16Array pmRA/pmDec, per-star designation indices.

**Buffer/Geometry Setup:**

- THREE.InstancedBufferGeometry with single quad geometry (4 vertices at [-0.5,-0.5] to [0.5,0.5], 2 UV coords).
- Instanced attributes: starPosition (Float32Array, 3D parsecs × DISTANCE_SCALE=206,265,000), velocity (Float32Array, 3D parsecs/year × DISTANCE_SCALE), a_size (Float32Array, pseudo-size in scene units = pseudoSizeFromApparentMag(mag, dist) × DISTANCE_SCALE × STAR_SIZE_FACTOR where STAR_SIZE_FACTOR=1.31526e-6), starColor (Float32Array RGB), a_fadeAlpha (per-star cross-fade ramp [0..1]), a_focusMask (binary focus flag).
- instanceCount = catalog.header.count (up to 109,400 for full tier).
- geometry.frustumCulled=false (no frustum testing — 109k instance buffer is lighter than per-instance culling).

**Shader/Material:**

- THREE.ShaderMaterial with custom GLSL vertex + fragment.
- **Vertex shader** (Gaia Sky θ.1b port): computes solid angle = a_size / dist (radians), maps to opacity via smoothstep(u_solidAngleMap.x/y, u_opacityLimits.x/y), applies brightness-power boost with fp32 precision wraps (degrees12/radians12), boundary-fades near camera (LEN0), cross-fades with procedural mesh (M3 — continuous a_fadeAlpha ramp), builds screen-facing billboard quad with world-space size = solidAngle × dist × u_sizeFactor.
- **Fragment shader** (θ.1 kernel): reads baked radial-Gaussian halo texture (u_starTex, 64×64 DataTexture with GAUSSIAN_SIGMA=10), adds razor-thin additive white core via smoothstep(0.0, 0.04, r), premultiplies RGB by alpha.
- **Uniforms:** yearsSinceJ2000 (proper-motion animation), u_solidAngleMap (vec2 [1e-10, 2e-9]), u_opacityLimits (vec2 opacity endpoints), u_brightnessPower (1.0), u_minQuadSolidAngle (1e-10 resolution-adaptive), u_LEN0 (~134k wu hero-star takeover threshold), u_sizeFactor (1.2e6 = Gaia Sky pointSize default), u_alphaFactor (1.0), u_starBrightness (U_STAR_BRIGHTNESS_DEFAULT), u_starTex (halo texture).
- **Blending:** CustomBlending with AddEquation (GL_ONE, GL_ONE — premultiplied additive).

</details>

### Camera flight-to and surface-mode system (atlas-orbital)

| Verdict       | Claim                                                                                                                       | Evidence                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | HygPhysicsFlight.ts — a symplectic Euler integrator mapping force, friction, and dynamic velocity limits based on distance. | src/lib/camera/hygPhysicsFlight.ts:35-41, 78, 104, 116, 325-416. Lines 35-41 document semi-implicit Euler as 'symplectic, energy-stable'; INITIAL_FORCE_FACTOR=8.0, MAX_VELOCITY_FACTOR=3.0, FRICTION_RATE=2.0 constants; advanceOneStep() imple |
| **CONFIRMED** | AimLerp.ts which slerps the unit aim direction vector to prevent orientation flips/gimbal-lock.                             | src/lib/camera/aimLerp.ts:99-136. Private slerpDirections() helper uses THREE.Quaternion.setFromUnitVectors() at line 133, followed by qPartial.slerp(q, t) and applyQuaternion. Lines 113-130 handle gimbal-lock by detecting near-180° (dot <  |
| **CONFIRMED** | A SurfaceModeFirstPerson exists (first-person surface mode) — confirm and describe how the camera transitions into it.      | src/components/canvas/SurfaceModeFirstPerson.tsx exists and is the entry point. Transition flow: (1) CameraController.tsx:736-742 evaluates isSurfaceModeActive() gate (focus-is-planet AND distance AND fov thresholds); (2) SurfaceModeFirstPe |

<details><summary>Real APIs to build on</summary>

**HygPhysicsFlight** (symplectic Euler integrator for gate-driven HYG fly-to):

- export class HygPhysicsFlight { start(spec: HygPhysicsFlightSpec): void; update(dt: number): HygPhysicsFlightFrame | null; cancel(): { position: THREE.Vector3 } | null; get isActive(): boolean; get progressRaw(): number; }
- Calibration export: HYG_PHYSICS_CALIBRATION = { INITIAL_FORCE_FACTOR: 8.0, MAX_VELOCITY_FACTOR: 3.0, FRICTION_RATE: 2.0, DECEL_ONSET_ANGULAR_RADIUS_RATIO: 3.0, STUCK_VELOCITY_RELATIVE: 1e-4 }

**AimLerp** (slerp-based aim-direction lerp preventing gimbal lock):

- export class AimLerp { start(spec: AimLerpSpec): void; update(currentCameraPos: THREE.Vector3): AimLerpFrame | null; cancel(): void; get isActive(): boolean; }
- Private helper slerpDirections(out: Vector3, a: Vector3, b: Vector3, t: number, q: Quaternion, qPartial: Quaternion, qIdentity: Quaternion): Vector3 implements quaternion slerp via q.setFromUnitVectors(a, b); qPartial.slerp(q, t); out.applyQuaternion(qPartial)

**SurfaceModeFirstPerson** (pointer-lock first-person camera):

- export const SurfaceModeFirstPerson = () => React.ReactNode
- Consumes isSurfaceModeActive(config: {focusIsPlanet: boolean, distFromFocus: number, focusRadius: number, fovDegrees: number}): boolean from CameraController
- Writes store.setSurfaceModeActive(boolean) via useStore()
- useSurfaceModePointerLock hook manages lock lifecycle (request/exit)
- useFrame applies rotations: camera.rotateY(yaw), camera.rotateX(clampedPitch), camera.rotateZ(roll)
- Helper functions from surfaceLook.ts: computeMouseLookDelta(movementX, movementY), computeRollDelta(qPressed, ePressed, dt), clampPitch(pitch)

</details>

### Scale System: Didactic Distance Mapping & Subsystem Compression

| Verdict       | Claim                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Didactic Distance: Logarithmic base-10 distance mapping (interpolateLogAnchors) with a cubic Hermite spline smooth transition at the origin (r < 0.39 AU) to preserve topological ordering. | src/lib/astrophysics.ts:270-301 defines interpolateLogAnchors() using Math.log10() for interpolation between anchors. Lines 238-268 define interpolateHermite() with cubic Hermite polynomial basis functions (h00, h10, h01, h11). Lines 370-40 |
| **CONFIRMED** | Subsystem Compression: Exaggerates planetary radii while keeping moons outside rings and parents via power-law scales.                                                                      | src/lib/astrophysics.ts:501-541 defines mapDidacticSubsystemDistance(). Line 518 implements power-law: `2.2 + 0.95 * Math.pow(physicalParentRadii, 0.55)` where physicalParentRadii is computed from AU distance (lines 515-516). Lines 510-513  |

<details><summary>Real APIs to build on</summary>

REAL FUNCTION SIGNATURES & AU MAPPING:

1. **Distance Scaling Functions** (src/lib/astrophysics.ts):
   - `AstroPhysics.interpolateLogAnchors(value: number, anchors: readonly NumericAnchor[]): number` — Maps input value via log10-spaced interpolation between anchor pairs (line 270-301)
   - `AstroPhysics.interpolateHermite(value, startInput, endInput, startOutput, endOutput, startSlope, endSlope): number` — Cubic Hermite spline with 3rd-order polynomial basis (h00, h10, h01, h11) (line 238-268)
   - `AstroPhysics.mapDidacticHeliocentricDistance(distanceAU: number): number` — Master heliocentric scale; returns 0 at origin, Hermite transition [0–0.39 AU], then log anchors; capped at 3200 (line 370-401)
   - `AstroPhysics.mapDidacticSubsystemDistance(distanceAU, parentBody, body): number` — Subsystem (moon) scale; power-law compression formula at line 518 with bounds [3–15] parent radii (line 501-541)

2. **Radius Scaling**:
   - `AstroPhysics.calculateDidacticRadius(radiusKm: number): number` — Calls interpolateLogAnchors on DIDACTIC_RADIUS_ANCHORS (line 454-456)
   - `AstroPhysics.resolveSemanticBodyRadius(ctx): number` — Selects didactic vs realistic; applies shapeScale multiplier (line 473-485)

3. **Position Computation in 3D**:
   - `AstroPhysics.calculatePhysicalLocalPositionAU(orbitParams, date): THREE.Vector3` — Solves Kepler equation (Newton-Raphson 5 iterations); returns AU coordinates (line 339-368)
   - `AstroPhysics.calculateLocalPosition(orbitParams, date, scaleMode): THREE.Vector3` — Scales AU position: realistic mode multiplies by AU_TO_3D_UNITS=1000; didactic normalizes direction then scales by mapDidacticHeliocentricDistance (line 432-452)
   - `AstroPhysics.mapPhysicalPositionToDisplay(body, parentBody, positionAU, scaleMode): THREE.Vector3` — Dispatches to heliocentric vs subsystem scaling via classifyDidacticOrbit (line 601-632)
   - `AstroPhysics.getDisplayOrbitPoints(body, segments, scaleMode): THREE.Vector3[]` — Generates 1024 orbit trail points; calls resolveDisplayLocalPosition for each (line 634-661)

4. **Constants**:
   - `AU_IN_KM = 149597870.7` — 1 AU in km (line 3)
   - `AU_TO_3D_UNITS = 1000` — Linear scaling: 1 AU = 1000 3D units in realistic mode (line 4)
   - `KM_TO_3D_UNITS = AU_TO_3D_UNITS / AU_IN_KM ≈ 6.68e-6` (line 5)

5. **Anchor Data** (readonly arrays):
   - `DIDACTIC_HELIOCENTRIC_DISTANCE_ANCHORS`: 11 pairs [AU, screenUnits]; Mercury=0.39 AU first anchor; Neptune/Oort at 80 AU capped output 2350
   - `DIDACTIC_RADIUS_ANCHORS`: 12 pairs [radiusKm, didacticRadiusUnits]; ranges 1–700000 km to 0.8–60 didactic units

**Orbit Trail Limitation (not yet tested in code review)**:

- Orbit trails use getDisplayOrbitPoints() which calls resolveDisplayLocalPosition() per segment
- In didactic mode, this calls mapPhysicalPositionToDisplay() which normalizes direction and applies mapDidacticHeliocentricDistance/mapDidacticSubsystemDistance
- **Issue B1: Comets with high eccentricity lose conic geometry** — calculatePhysicalLocalPositionAU solves Kepler equation assuming bound orbits (ellipse/parabola); hyperbolic comets (e > 1 at certain epochs) will still solve for ellipse position, then normalize/scale distorts the true conic trajectory. No epoch clipping or hyperbolic solver present.

</details>

### Timeline/Clock System: requestAnimationFrame Loop, getNow() Polling, and UI Tick Throttling

| Verdict       | Claim                                                                                             | Evidence                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Simulation time (nowMs) runs in an independent requestAnimationFrame clock outside React/Zustand. | src/lib/simulationClock.ts:41-52, 183-207. The SimulationClock class holds private `nowMs` field and runs its own rAF loop via `this.rafId = requestAnimationFrame(this.loop)` (line 172, 206). The class never writes to the Zustand store dire |
| **CONFIRMED** | R3F components poll it synchronously using simulationClock.getNow().                              | src/components/canvas/Planet.tsx:769 - inside useFrame callback: `const simNow = simulationClock.getNow();`. Also Starfield.tsx:570-574 calls simulationClock.getNow() inside useFrame. simulationClock.ts:70-72 defines the public API: `getNow |
| **CONFIRMED** | Reactive UI panels listen to a throttled tick (~4 Hz).                                            | src/lib/simulationClock.ts:41 - `const DEFAULT_UI_TICK_MS = 250;` (4 Hz = 1000/250). Emitted via onUiTick() subscribers. Timeline.tsx:65 subscribes via `const displayedDatetime = useStore((state) => state.displayedDatetime);`. The store bri |

<details><summary>Real APIs to build on</summary>

**SimulationClock public API (src/lib/simulationClock.ts):**

Constructor options:

```typescript
constructor(options?: {
  initialDate?: Date;
  initialSpeed?: number;
  initialIsPlaying?: boolean;
  initialIsLiveMode?: boolean;
  uiTickMs?: number;  // default 250ms
})
```

Public methods:

- `getNow(): Date` (line 70) — synchronous read of current simulated time, used by useFrame
- `setSpeed(speed: number): void` (line 74)
- `setIsLiveMode(isLive: boolean): void` (line 78)
- `setIsPlaying(playing: boolean): void` (line 85)
- `seek(date: Date): void` (line 96)
- `onUiTick(fn: (now: Date) => void): () => void` (line 101) — subscribe/unsubscribe pattern; emits at DEFAULT_UI_TICK_MS=250ms cadence plus milestones
- `syncFromState(state: { speed, isPlaying, isLiveMode }): void` (line 113) — boot/HMR alignment
- `advanceForTest(deltaMs): void` (line 140) — test-only time advancement without rAF
- `dispose(): void` (line 158) — teardown for tests/HMR

**rAF loop entry point:** line 172 `this.rafId = requestAnimationFrame(this.loop)` inside startLoop()
**rAF loop callback:** line 183-207, arrow function stored at line 183, advanced by `requestAnimationFrame(this.loop)` at line 206

**Store bridge (src/store.ts:679-702):**

- Clock→Store (line 679): `simulationClock.onUiTick((now) => useStore.setState({ displayedDatetime: now }))`
- Store→Clock (line 687-693): `useStore.subscribe()` to sync speed/isPlaying/isLiveMode mutations
- Boot (line 698-702): `simulationClock.syncFromState({...})`

**For E2E virtual-time-warping (A1 blueprint), intercept exactly:**

1. `simulationClock.getNow()` — inject test-clock read in R3F frames
2. `simulationClock.setIsPlaying(bool)` and `setSpeed(num)` — test controls
3. `simulationClock.seek(date)` — seek to test epoch
4. `simulationClock.onUiTick()` — optionally verify UI refresh at milestone epochs
5. `requestAnimationFrame()` — optionally mock/stub the rAF loop for deterministic test frames (or use advanceForTest() which is test-aware)

</details>

### Rendering/Shader Implementation Validation

| Verdict       | Claim                                                     | Evidence                                                                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **FALSE**     | Atmosphere Fresnel glow                                   | src/components/canvas/shaders/atmosphereShader.ts:33 explicitly states: 'Replaces the pre-θ rim-glow Fresnel pow(max(0.0, 0.6 - dot(normal, viewDir)), 4.0) with a never-written viewVector uniform.' The actual implementation (atmscatteringSn |
| **CONFIRMED** | Saturn ring shadows via ray-plane/ray-sphere intersection | src/components/canvas/planet/ringShadowMath.ts:31-47 defines intersectRingPlane() using ray-plane intersection (y=0 plane). usePlanetMaterials.ts:589-607 implements GLSL ray-plane intersection: 't = -vPos.y / lightDir.y' then 'radius = leng |
| **CONFIRMED** | Earth day/night transitioning                             | usePlanetMaterials.ts:377-484 applies Earth-specific night shader. Line 463 implements linstep(-0.1, 0.1, -intensity) terminator formula (Gaia-1:1 port per pbr.glsl:98-99). Night lights modulate emissive at line 468 via 'nightFactor = linst |
| **CONFIRMED** | Procedural 3D Sun cubemaps                                | ProceduralSun3D.tsx:403-411 creates THREE.WebGLCubeRenderTarget() and THREE.CubeCamera(). proceduralSunShaders.ts:223 declares 'uniform samplerCube uPerlinCube' and lines 306-308 sample it: textureCube(uPerlinCube, vLayer0/1/2).r for Perlin |
| **CONFIRMED** | HDR post-processing (Bloom, Tone Mapping, dynamic DPR)    | PostProcessingPipeline.tsx:167 uses EffectComposer frameBufferType={THREE.HalfFloatType} (HDR buffer). Line 171-177 mounts Bloom with luminanceThreshold={1.0}. Line 182 conditionally mounts ToneMapping. Scene.tsx:388-389 computes canvasDpr= |

<details><summary>Real APIs to build on</summary>

ATMOSPHERE SHADER UNIFORMS (atmscatteringSnippet.ts:64-82):

- v3PlanetPos, v3CameraPos, v3LightPos (per-frame dynamic, Planet.tsx updates)
- v3InvWavelength (1/λ^4 per channel RGB), fOuterRadius, fInnerRadius, fKrESun, fKmESun
- fKr4PI, fKm4PI, fScale, fScaleDepth, fScaleOverScaleDepth, fAlpha, fG (Mie asymmetry)
- nSamples (int, sample count)
- Phase functions: rayleighPhase(fCos2), miePhase(fCos, fCos2) — NO Fresnel; uses Rayleigh 3/16π\*(1+cos²θ) + Henyey-Greenstein

RING SHADOW MATH (usePlanetMaterials.ts:589-607):

- t = -vPos.y / lightDir.y (ray-plane, y=0)
- radius = length(hitPos.xz) (distance from y-axis on plane)
- Check: t > 0.0 AND radius > uInnerRadius AND radius < uOuterRadius
- Modulate diffuseColor.rgb _= (1.0 - ringColor.a _ 0.9 \* terminatorFade)

PLANET SHADOW ON RINGS (planetShadowShader.ts:15-32):

- Ray-sphere: |O + tD|² = R² → t² + 2*dot(vPos,lightDir)*t + dot(vPos,vPos) - 1.0 = 0
- delta = b² - 4c; inShadow if delta >= 0.0 AND b < 0.0 (ray toward planet)

PROCEDURAL SUN FRESNEL (proceduralSunShaders.ts:322):

- fresnel = pow(1.0 - nDotV, uFresnelPower) \* uFresnelInfluence
- Uniforms: uFresnelPower, uFresnelInfluence (stellarVisualProfile-driven)

EARTH DAY/NIGHT (usePlanetMaterials.ts:463):

- nightFactor = linstep(-0.1, 0.1, -intensity) [linstep defined line 431]
- Applied to totalEmissiveRadiance at line 468

PROCEDURAL SUN CUBEMAP (proceduralSunShaders.ts:223, 306-308):

- uniform samplerCube uPerlinCube (baked real-time by CubeCamera)
- Sampled 3 times per fragment: textureCube(uPerlinCube, vLayer0/1/2).r

HDR POSTPROCESSING PIPELINE (PostProcessingPipeline.tsx:167, 171-177, 182):

- EffectComposer frameBufferType={THREE.HalfFloatType} (line 167)
- Bloom (luminanceThreshold={1.0}, luminanceSmoothing={0.1}) with mipmapBlur
- ToneMapping (AGX/ACES/Reinhard/Cineon via ToneMappingMode enum)
- DPR: Scene.tsx:567 dpr={canvasDpr} where canvasDpr=[1, qualityProfile.dprMax]

</details>

### QA/Testing Infrastructure - Playwright E2E, Time-Stepping, Screenshot Handling

| Verdict       | Claim                                                                                                         | Evidence                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Headless Playwright tests in CI run at 1 Hz, making stellar flights take up to 47 seconds of wall-clock time. | e2e/hyg-focus.spec.ts:17-18,44-45,167-179 - Explicit documentation: 'environment runs R3F at a much-reduced frame rate (often ~1 Hz in headless Chromium)' and 'Worst-case budget: 45 s boot + ~50 s flight (1 Hz headless R3F × 0.1 s integrato |
| **PARTIAL**   | Playwright screenshots suffer from frame damping differences and HDR compression failures.                    | e2e/helpers.ts:29-50 documents HDR-related screenshot issues: 'The HDR postprocess pipeline on the ultra tier occasionally tripped Chromium's `Page.captureScreenshot` protocol with "Unable to capture screenshot" even after a multi-second se |
| **CONFIRMED** | Whether any NASA JPL Horizons fixtures / baseline JSON exist already.                                         | scripts/generate-horizons-fixtures.js defines fixture generation pipeline (26-32 specifies directory: src/test/fixtures/horizons). Verified existing fixtures: src/test/fixtures/horizons/ contains 86 fixture files across 26 bodies at 3 epoch |

<details><summary>Real APIs to build on</summary>

Test scripts available: (1) test:run via vitest run (unit tests in src/\*_/_.test.ts); (2) test:e2e via playwright test (e2e specs in e2e/_.spec.ts). Playwright config uses chromium only, 30s timeout per test, 60s webServer startup timeout. E2E currently drives time via freezeSimulation() hook + wall-clock performance.now() for orientation lerp (no time-stepping control from Playwright directly—R3F frame pacing is the only control). MAX_DT_TOTAL=0.1s and MAX_DT_SUBSTEP=0.05s in hygPhysicsFlight.ts are the integrator's internal time caps. Horizons fixture pipeline: scripts/generate-horizons-fixtures.js (fetch from NASA API) -> src/test/fixtures/horizons/_.json; scripts/derive-elements-from-fixtures.js (RV->COE conversion for analytical validation). Fixture indexing at src/test/fixtures/horizons/index.json. 86 fixtures (26 bodies × 3 epochs + 1 historical) currently on disk. Usage: import fixtures in regression tests (e.g., src/lib/orbital/regression.test.ts matching MULTI_EPOCH_DATES).

</details>

### UI/i18n validation for atlas-orbital

| Verdict       | Claim                                                                    | Evidence                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **CONFIRMED** | Code duplication in UI primitive controls (Toggle, ChoiceButton, Slider) | DisplayPanel.tsx:433-461 (ChoiceButton), 463-509 (Toggle); LayersPanel.tsx:586-609 (ChoiceButton), 611-650 (Toggle); A11yPanel.tsx:136-186 (Toggle with title prop). Slider exists as standalone primitive (src/components/ui/primitives/Slider. |
| **CONFIRMED** | Partial pt-BR translation (only HygStarPanel is translated)              | src/i18n/locales/en/common.json and pt-BR/common.json: both files contain ONLY hygStarPanel namespace with identical key depth. i18n test (i18n.test.ts:130-151) verifies 'declares the same key set in every supported locale' — all other UI p |
| **CONFIRMED** | No language selector in the UI                                           | GearPopover.tsx:1-230 contains no useTranslation, no language selector button, no i18n.changeLanguage() call. The 'Settings' menu (lines 110-193) has 4 sections: Help, About, Integrations (Wikipedia toggle), Developer (Debug Logging) — no l |

<details><summary>Real APIs to build on</summary>

PRIMITIVES DIR STRUCTURE: src/components/ui/primitives/ contains only Slider.tsx (lines 34-90, exported as named export) and Accordion.tsx (lines 9-52, exported as named export). No barrel/index.ts exists. No standalone Toggle or ChoiceButton components.

I18N SETUP: Library is i18next + react-i18next. Init config at src/i18n/index.ts exports: SUPPORTED_LANGUAGES=['en','pt-BR'] (line 8), DEFAULT_LANGUAGE='en' (line 9), DEFAULT_NAMESPACE='common' (line 10), LANGUAGE_STORAGE_KEY='i18nextLng' (line 18), RESOURCES object keyed by lang→namespace (lines 20-23). Browser detection order: querystring(?lng=), localStorage(i18nextLng), navigator fallback (lines 39-42). Only HYG_STAR_PANEL keys exist: hygStarPanel.{title,closeLabel,unknown,fields._,units._,wikipedia.\*} in both en and pt-BR locales (identical key structure per i18n.test.ts line 141-150 parity check).

GEAROPOVER STRUCTURE: Lines 23-230 render a role='dialog' popover with 4 GearSection children: Help (Replay Tutorial, Keyboard Shortcuts), About (Mission Report, version), Integrations (Wikipedia toggle), Developer (Debug Logging). No useTranslation hook, no language controls anywhere in component tree (verified grep returned 0 results for i18n/useTranslation outside HygStarPanel).

DUPLICATE CONTROL SIGNATURES:

- Toggle: ChoiceButton.tsx signature (label, isActive, onClick, disabled, isWide) vs DisplayPanel.tsx:463-509 inline (label, checked, onChange, disabled) vs LayersPanel.tsx:611-650 inline (label, checked, onChange) — all same role='switch' aria-checked pattern
- ChoiceButton: DisplayPanel.tsx:433-461 inline (label, isActive, onClick, disabled, isWide) vs LayersPanel.tsx:586-609 inline (label, isActive, onClick, isWide) — identical button with aria-pressed=isActive
- Slider: Only standalone at primitives/Slider.tsx, not duplicated

</details>

## 2. Blueprints (authored grounded in real code) + adversarial verdict

### C1 — UI Primitive Dryness — unify Toggle/ChoiceButton into existing primitives/ barrel

**Verdict:** `NICE_TO_HAVE` · **ROI score:** 5/10 · **Effort:** S · **Grounding verified:** true

**Lazy 80% alternative:** Extract ONLY Toggle.tsx + ChoiceButton.tsx as the A11y/Display superset, rewire the 3 panels' imports to the direct files (`./primitives/Toggle`, `./primitives/ChoiceButton`) matching the EXISTING per-file import convention, and delete the 5 inline copies. Skip the barrel index.ts entirely (the codebase has zero barrels today — Slider/Accordion import direct; creating one introduces a new convention nobody asked for and re-export barrels can hurt tree-shaking/HMR). Skip step 5's Slider/Accordion import migration (blueprint itself flags it cosmetic). Skip the 2 new vitest specs IF you keep them — actually keep just Toggle.test.tsx for the derived-data-testid regression guard, since that's the single load-bearing contract; ChoiceButton is already covered by LayersPanel.test.tsx's getByRole queries + e2e. That captures ~85% of the dedup value in a ~6-file diff with no new architectural pattern.

**Architecture fit:** Fits cleanly. primitives/ already holds Slider + Accordion as named-export presentational components with a co-located .test.tsx; Toggle/ChoiceButton extend that exact pattern. No runtime/R3F/GPU surface touched — these are DOM side-panel buttons outside useFrame. Nothing breaks IF the superset markup stays byte-identical to the A11yPanel/DisplayPanel copies (verified: the proposed Toggle mirrors A11yPanel:148-186 exactly, ChoiceButton mirrors DisplayPanel:446-461 exactly). Three real guardrails, all correctly identified by the blueprint: (1) the derived data-testid must keep producing toggle-reduced-motion/toggle-high-contrast — e2e/a11y.spec.ts:23,48 depend on it; verified slug fn matches A11yPanel:156 inline derivation. (2) aria-checked (switch) vs aria-pressed (button) must NOT be merged — LayersPanel.test.tsx:55-98 resolves by getByRole; blueprint keeps them separate. (3) CategoryToggle (LayersPanel:652-673) is genuinely distinct (px-2, aria-pressed, no knob) and correctly excluded. Reuse, don't add new convention: the lazy path should reuse the existing direct-import style rather than introduce the barrel the brief assumed already existed.

**Inaccuracies caught:** Blueprint itself is essentially clean — every line-number and prop-shape claim I spot-checked is correct (DisplayPanel ChoiceButton 433-461 / Toggle 463-509; LayersPanel ChoiceButton 586-609 / Toggle 611-650 / CategoryToggle 652-673; A11yPanel Toggle 136-186 with data-testid at :156; panel-local components are non-exported const, grep-confirmed safe to delete; A11yPanel call sites pass label='Reduced Motion'/'High Contrast' so derived ids hold). One nit: the blueprint asserts DisplayPanel call sites '117, 223, 141, 404, 552' and LayersPanel '226, 260-352' are unchanged — I confirmed LayersPanel:260 (<Toggle label='Icons'>) but did not exhaustively verify every cited line; low risk since prop shapes are subsets of the superset. Separately, the SOURCE DIGEST (not the blueprint) is misleading in its 'DUPLICATE CONTROL SIGNATURES' block: it cites 'ChoiceButton.tsx signature' as the Toggle comparison baseline, implying a primitives/ChoiceButton.tsx exists — it does NOT (only Slider.tsx + Accordion.tsx + Accordion.test.tsx). The blueprint correctly disregards that artifact and treats both Toggle and ChoiceButton as net-new files.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## C1 — UI Primitive Dryness (unify controls)

### Verified reality (read, not assumed)

- `src/components/ui/primitives/` currently holds **only** `Slider.tsx`, `Accordion.tsx`, `Accordion.test.tsx`. **No barrel `index.ts` exists** (digest claim CONFIRMED). The brief's casing/path was correct; the prompt's implied "Toggle/ChoiceButton already partly extracted" is FALSE — both are still inlined.
- **Three `Toggle` copies**, all `role="switch"` + `aria-checked`, with the same knob markup (`h-6 w-11` track, `translate-x-[1.35rem]` thumb):
  - `DisplayPanel.tsx:463-509` — props `{label, checked, onChange, disabled=false}`.
  - `LayersPanel.tsx:611-650` — props `{label, checked, onChange}` (no `disabled`, hover classes hard-coded inline rather than conditional).
  - `A11yPanel.tsx:136-186` — props `{label, checked, onChange, disabled=false, title}` **plus** `data-testid={\`toggle-${label.toLowerCase().replace(/\s+/g,"-")}\`}`.
- **Two `ChoiceButton` copies**, both `aria-pressed`, identical base classes:
  - `DisplayPanel.tsx:433-461` — props `{label, isActive, onClick, disabled=false, isWide=false}`.
  - `LayersPanel.tsx:586-609` — props `{label, isActive, onClick, isWide=false}` (no `disabled`).
- **`CategoryToggle`** (`LayersPanel.tsx:652-673`) is a genuinely **distinct** control: `aria-pressed` semantics, `px-2`, no slider knob, different active classes. It is NOT a Toggle and NOT pixel-identical to ChoiceButton — keep it local (do not fold; folding would change its DOM/visuals). Call this out as an explicit non-merge.
- **Hard test constraints that gate the refactor** (these are the load-bearing facts):
  - `e2e/a11y.spec.ts:23,48` resolve `panel.getByTestId("toggle-reduced-motion")` and `toggle-high-contrast`. These ids are produced by the A11yPanel Toggle's `data-testid` line. The unified primitive **must keep emitting that derived `data-testid`** or the suite breaks.
  - `aria-checked` (Toggle) vs `aria-pressed` (ChoiceButton) must be preserved — `LayersPanel.test.tsx` resolves controls by `getByRole("button", { name })`, and a11y semantics differ. Do not collapse the two into one component.
- Existing import convention is per-file: `import { Slider } from "./primitives/Slider"` (DisplayPanel:40, A11yPanel:26), `import { Accordion } from "./primitives/Accordion"` (LayersPanel:35). The brief asks to "extend the barrel" — but **no barrel exists yet**, so step 1 is to _create_ `primitives/index.ts` and re-export the existing Slider/Accordion through it (without deleting the direct files), then add the two new primitives.

### Step-by-step

**1. Create the barrel `src/components/ui/primitives/index.ts`.**
Re-export existing + new symbols. Do NOT move/rename `Slider.tsx` or `Accordion.tsx` (AGENTS.md §11 — no reorg). The barrel just aggregates:

```ts
export { Slider, type SliderProps } from "./Slider";
export { Accordion } from "./Accordion";
export { Toggle, type ToggleProps } from "./Toggle";
export { ChoiceButton, type ChoiceButtonProps } from "./ChoiceButton";
```

**2. Add `primitives/Toggle.tsx`** — superset of the three copies. Props: `{label, checked, onChange, disabled?, title?, testId?}`. Mirror the A11yPanel markup exactly (it is the richest copy). Preserve:

- `role="switch"`, `aria-checked={checked}`.
- `disabled` → `cursor-not-allowed opacity-60` else `hover:border-white/20 hover:bg-black/30` (this is the DisplayPanel/A11y conditional; LayersPanel's copy hard-coded the hover branch, which is behaviorally identical when never disabled).
- **`data-testid`**: default-derive `toggle-${slug(label)}` so A11yPanel keeps its e2e ids _for free_. Allow an explicit `testId` override for callers that want a stable id independent of label text.
- `title` passthrough (A11y tooltip).

**3. Add `primitives/ChoiceButton.tsx`** — superset of the two copies. Props: `{label, isActive, onClick, disabled?, isWide?}`. Use the DisplayPanel copy verbatim (it already has the `disabled` branch the LayersPanel copy lacks); LayersPanel callers simply omit `disabled` and get identical output (the disabled branch is unreachable when `disabled` is undefined → `false`).

**4. Rewrite the three panels to consume the primitives** (this is the DRY payoff):

- `DisplayPanel.tsx`: delete local `Toggle` (463-509) and `ChoiceButton` (433-461); add to the existing primitives import. Call sites at `:117, :223, :141, :404, :552` are unchanged (prop shape is a subset of the superset).
- `LayersPanel.tsx`: delete local `Toggle` (611-650) and `ChoiceButton` (586-609); import from barrel. Keep `CategoryToggle` (652-673) local. Call sites `:226, :260-352` unchanged. The LayersPanel Toggle currently passes no `disabled` — now it can, but no behavior change required.
- `A11yPanel.tsx`: delete local `Toggle` (136-186); import from barrel. **Verify the derived `data-testid` still matches** (`toggle-reduced-motion`, `toggle-high-contrast`) — same slug fn, so it holds. Call sites pass `title` and `disabled`, both supported.

**5. Migrate the existing Slider/Accordion imports to the barrel (optional, low-risk, keeps one import style).** Change the three `./primitives/Slider` / `./primitives/Accordion` imports to `./primitives`. This is cosmetic; skip if minimizing diff is preferred. The direct-file imports keep working regardless because the barrel does not delete the source files.

**6. Tests.** Add `primitives/Toggle.test.tsx` and `primitives/ChoiceButton.test.tsx` mirroring `primitives/Accordion.test.tsx` conventions (`// @vitest-environment jsdom`, `@testing-library/jest-dom/vitest`, `fireEvent`, `screen.getByRole`). Cover, per primitive: role/aria attribute (`switch`/`aria-checked` vs `button`/`aria-pressed`), `onChange`/`onClick` firing, `disabled` suppressing interaction + class, and for Toggle the **derived `data-testid`** assertion (regression guard for the a11y e2e contract). Existing `LayersPanel.test.tsx` and `e2e/a11y.spec.ts` are the integration regression net — run both.

**7. Cleanup pass (AGENTS.md §12).** Confirm no orphaned `SubsectionLabel`/`SectionLabel` removed accidentally (those are panel-local layout, not control primitives — leave them). Grep for any remaining inline `role="switch"` / `aria-pressed` button literals in the three panels post-refactor to prove zero duplication remains.

### Why this is the elegant minimal cut

- Superset-props, not lowest-common-denominator: every call site keeps its exact current behavior with a zero-diff prop shape, so the refactor is a pure de-dup with no UX change.
- `CategoryToggle` explicitly excluded — merging it would _increase_ surface risk for no payoff (different markup), which violates AGENTS.md §3 (smallest change).
- The `data-testid` default-derivation makes the A11y e2e contract survive transparently — the single highest-risk breakage is neutralized by design, not by patching specs.

### Risks / assumptions called out

- ASSUMPTION (verified): no other file imports the panel-local `Toggle`/`ChoiceButton` (they are `const`, not exported) — grep confirmed usages only within their own panels. Deleting them is safe.
- RISK: if any _visual_ pixel-diff e2e baseline (`e2e/quality.spec.ts`, `postprocessing.spec.ts`) snapshots the Display/Layers panel, the markup must stay byte-identical. The supersets are byte-identical to the richest existing copy, so baselines should hold — but run `npm run test:e2e` to confirm, and the 1% `maxDiffPixelRatio` tolerance (boot.spec.ts:50-73) absorbs rasterization noise.
- NON-GOAL: i18n. The digest notes hardcoded English in these panels, but C1 is dryness only; do not thread `useTranslation` here (separate improvement).

#### Code draft

```ts
// src/components/ui/primitives/index.ts  (NEW — the barrel the brief asked to "extend")
export { Slider, type SliderProps } from "./Slider";
export { Accordion } from "./Accordion";
export { Toggle, type ToggleProps } from "./Toggle";
export { ChoiceButton, type ChoiceButtonProps } from "./ChoiceButton";
```

```tsx
// src/components/ui/primitives/Toggle.tsx  (NEW — superset of DisplayPanel/LayersPanel/A11yPanel copies)
export interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  /** Visually disable + drop out of hover affordance; stays in tab order off. */
  disabled?: boolean;
  /** Native tooltip (A11yPanel grayed-row explainer). */
  title?: string;
  /**
   * Stable test hook. Defaults to `toggle-${slug(label)}` so the
   * e2e a11y contract (toggle-reduced-motion / toggle-high-contrast)
   * survives the extraction unchanged. Pass to decouple id from label.
   */
  testId?: string;
}

const slug = (s: string) => s.toLowerCase().replace(/\s+/g, "-");

export const Toggle = ({
  label,
  checked,
  onChange,
  disabled = false,
  title,
  testId,
}: ToggleProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    title={title}
    onClick={onChange}
    data-testid={testId ?? `toggle-${slug(label)}`}
    className={`flex w-full items-center justify-between gap-3 border border-white/10 bg-black/20 px-3 py-2.5 text-left transition-[border-color,color,background-color] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      disabled
        ? "cursor-not-allowed opacity-60"
        : "hover:border-white/20 hover:bg-black/30"
    }`}
  >
    <div className="min-w-0 text-sm text-white">{label}</div>
    <div className="flex shrink-0 items-center gap-3">
      <span className="text-[10px] font-orbitron uppercase tracking-[0.16em] text-white/55">
        {checked ? "On" : "Off"}
      </span>
      <span
        aria-hidden="true"
        className={`relative block h-6 w-11 border transition-[background-color,border-color] ${
          checked
            ? "border-nasa-accent/60 bg-nasa-accent/20"
            : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-1 h-3.5 w-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-[1.35rem] bg-nasa-accent"
              : "translate-x-1 bg-white/45"
          }`}
        />
      </span>
    </div>
  </button>
);
```

```tsx
// src/components/ui/primitives/ChoiceButton.tsx  (NEW — DisplayPanel copy verbatim, the superset with disabled)
export interface ChoiceButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  isWide?: boolean;
}

export const ChoiceButton = ({
  label,
  isActive,
  onClick,
  disabled = false,
  isWide = false,
}: ChoiceButtonProps) => (
  <button
    type="button"
    aria-pressed={isActive}
    disabled={disabled}
    onClick={onClick}
    className={`border px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
      disabled
        ? "cursor-not-allowed border-white/5 bg-black/10 text-white/25"
        : isActive
          ? "border-nasa-accent bg-nasa-accent/10 text-white shadow-[0_0_12px_rgba(0,240,255,0.18)]"
          : "border-white/10 bg-black/35 text-white/60 hover:border-white/25 hover:text-white"
    } ${isWide ? "col-span-2" : ""}`}
  >
    {label}
  </button>
);
```

```tsx
// src/components/ui/DisplayPanel.tsx — DELETE local Toggle (463-509) & ChoiceButton (433-461)
// before:  import { Slider } from "./primitives/Slider";
// after:
import { Slider, Toggle, ChoiceButton } from "./primitives";
// All call sites (:117, :223, :141, :404, :552) unchanged — prop shapes are a subset of the superset.

// src/components/ui/LayersPanel.tsx — DELETE local Toggle (611-650) & ChoiceButton (586-609); KEEP CategoryToggle (652-673)
// before:  import { Accordion } from "./primitives/Accordion";
// after:
import { Accordion, Toggle, ChoiceButton } from "./primitives";

// src/components/ui/A11yPanel.tsx — DELETE local Toggle (136-186)
// before:  import { Slider } from "./primitives/Slider";
// after:
import { Slider, Toggle } from "./primitives";
// Call sites keep passing { title, disabled } and label — derived data-testid stays:
//   toggle-reduced-motion / toggle-high-contrast  ← e2e/a11y.spec.ts:23,48 still green.
```

```tsx
// src/components/ui/primitives/Toggle.test.tsx  (NEW — mirrors Accordion.test.tsx style)
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toggle } from "./Toggle";

describe("Toggle", () => {
  it("exposes switch semantics and fires onChange", () => {
    const onChange = vi.fn();
    render(
      <Toggle label="Reduced Motion" checked={false} onChange={onChange} />
    );
    const sw = screen.getByRole("switch", { name: /reduced motion/i });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("derives the e2e data-testid from the label (a11y contract guard)", () => {
    render(<Toggle label="High Contrast" checked onChange={() => {}} />);
    expect(screen.getByTestId("toggle-high-contrast")).toBeInTheDocument();
  });

  it("does not fire when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle label="X" checked={false} onChange={onChange} disabled />);
    fireEvent.click(screen.getByRole("switch"));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

#### Performance trade-offs

## Performance / cost analysis

**Runtime (60 Hz render loop): net-neutral to slightly positive.**

- These are pure presentational `<button>` primitives that live in side panels (`DisplayPanel`, `LayersPanel`, `A11yPanel`) — none participate in the R3F `useFrame` loop or the `simulationClock` polling path. Zero impact on the 60 Hz canvas render or per-frame work. The panels re-render only on Zustand store mutations (user toggling a control), not per frame.
- Component-identity nuance: extracting `Toggle`/`ChoiceButton` to module scope gives each a **single stable component type** across all three panels, vs three distinct inline `const` definitions today. Inline `const Toggle = ...` declared inside a panel body would re-create the type each panel render and force remount; here they are already module-level `const`s, so behavior is equivalent — but consolidating removes any future risk of someone moving one inside a render body. Marginal win, not a regression.
- No new memoization needed; props are primitives + a callback. If a caller passes an inline arrow (`onClick={() => setLabelMode(mode)}`), that already allocates today — unchanged.

**Memory footprint: strictly lower.**

- Removes ~5 duplicated component closures (3× Toggle, 2× ChoiceButton) from the bundle, replaced by 2 shared definitions. Net source/bundle reduction (~150-200 lines of near-identical JSX collapse to two files). Tailwind class strings are static literals already shared by the JIT compiler, so no CSS growth.
- Barrel `index.ts` adds one tiny re-export module; tree-shaking (Vite/Rollup) drops unused re-exports, so no runtime cost.

**GPU: zero.** No shaders, textures, draw calls, or canvas buffers touched. This is DOM/React only.

**CI cost: low and bounded.**

- Adds 2 fast jsdom unit specs (`Toggle.test.tsx`, `ChoiceButton.test.tsx`) — sub-100 ms each, in the `vitest run` (`npm run test:run`) tier, not the slow Playwright tier.
- No new e2e specs required; the refactor is validated by the _existing_ `e2e/a11y.spec.ts` (testid contract) and `LayersPanel.test.tsx` (role-based queries) acting as the regression net. The only Playwright risk is pixel-diff baselines (`quality.spec.ts`/`postprocessing.spec.ts`) — but the supersets are byte-identical markup to the richest existing copy, and the 1% `maxDiffPixelRatio` tolerance absorbs rasterization noise, so no baseline re-capture is expected. Net added CI wall-clock: a few hundred ms of unit time, no added headless-R3F flight time (the expensive part of this suite).

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\index.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\Toggle.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\ChoiceButton.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\Toggle.test.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\ChoiceButton.test.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\DisplayPanel.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\LayersPanel.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\A11yPanel.tsx

</details>

### A2 — Headless WebGL & Offscreen Shader Unit Testing

**Verdict:** `GOLD_PLATING` · **ROI score:** 4/10 · **Effort:** M · **Grounding verified:** true

**Lazy 80% alternative:** Ship ONLY Tier-1 Steps 1.2/1.3 (GLSL-string contract assertions) + Step 1.4 (a CI unit-test job). That's ~30 lines of test code appended to the two EXISTING test files plus one CI job, and it captures ~80% of the real value (close the silent GLSL/mirror drift gap + give the repo its first unit-test CI). Drop all of Tier 2 (headless-gl), drop Step 1.1's hoist-refactor of usePlanetMaterials, drop the new src/test/gl/ tree, drop the optional gl devDependency, drop the unmirrored sky-integrator TS port in 1.3. For string-contract tests that need the GLSL as a string, the ring snippet can be asserted by importing the module and reading the literal via a tiny exported const ONLY IF a hoist is trivial; otherwise just assert against atmscatteringSnippet's already-exported ATMSCATTERING_FRAG_GLSL (atmosphere side needs zero refactor — the constant is already exported). Net: the single highest-ROI line (CI test job) plus drift guards, zero native deps, zero new directories.

**Architecture fit:** Tier 1 fits cleanly: atmscatteringSnippet.ts ALREADY exports ATMSCATTERING_FRAG_GLSL, so the atmosphere contract test (Step 1.3) needs no refactor — just append to the existing atmosphereMath.test.ts. The ring side needs Step 1.1's hoist (the GLSL is an inline literal at usePlanetMaterials.ts:560-609, not exported) — that hoist is small and reversible and co-locating RING_SHADOW_FRAG_SNIPPET next to its mirror in ringShadowMath.ts is defensible per AGENTS.md SRP/DRY. Step 1.4 (CI test job) is pure additive win — repo has zero unit-test CI today. What BREAKS / is over-engineered: Tier 2 (headless-gl) is the gold-plating. (1) It's a native C++ addon on a repo with zero native test deps; Node 22.22 + Win11 dev box has unreliable ABI-127 prebuilds — real red-npm-ci risk the blueprint itself flags. (2) The team ALREADY codified GPU non-determinism tolerance (boot.spec.ts:50-73, 1% pixel band) and HDR-screenshot hangs (helpers.ts:29-50) — Tier 2 inherits exactly that flakiness class and the blueprint admits it must downgrade from golden-image to differential/monotonic assertions. (3) A monotonic 'annulus hit ⇒ R darkened' GPU assertion proves almost nothing the deterministic JS-mirror test (ringShadowMath.test.ts) + string-contract doesn't already prove — the mirror IS the spec, executed in node, deterministically. (4) The src/test/gl/ harness reinvents shader compile/link/readPixels plumbing (~80 LOC) to test 2 shaders. Existing modules to reuse instead of new code: append to ringShadowMath.test.ts and atmosphereMath.test.ts (both exist); reuse ATMSCATTERING_FRAG_GLSL (already exported); reuse intersectRingPlane/sunInObjectSpace mirrors (already pinned). For a didactic teaching tool, executing the real GLSL on a software rasterizer in CI is cost the product never perceives.

**Inaccuracies caught:** Grounding corrections are accurate (verified): no atmosphere Fresnel — atmosphereShader.ts:33-36 documents the replacement; ring shadow IS string-injected at usePlanetMaterials.ts:560-609 (brief's '560-609' matches the .replace block; '589-607' in the digest is the inner intersection math — both fine); tests run environment:node with no GL; deploy.yml has no test job; GLSL is never executed in tests. Minor errors: (a) blueprint references usePlanetMaterials.ts:289-362 indirectly via ringShadowMath.ts's stale comment, but the live code is at 540-610 — the BLUEPRINT cites 560-609 correctly, only the source-file comment is stale (not the blueprint's fault). (b) Step 1.3 claims atmosphereMath.ts already mirrors near/far intersection 'plus' the scalar helpers and proposes mirroring the FULL sky integrator loop in TS — but atmscatteringSnippet.ts:35-44 deliberately did NOT mirror computeAtmosphericScattering (runtime is the shader). Adding a full TS loop mirror is net-new complexity the original authors consciously declined; calling it a gap is arguable, not a bug. (c) Step 2.2's 'compiles as-is, GLSL1 = same dialect' is optimistic — the live atmosphere shader depends on a luma() include (atmscatteringSnippet.ts:16-17) and #define-driven branch selection (atmosphericScattering/atmosphereGround) that the test harness must supply or the 'real' fragment won't link; the blueprint's wrapMain stub silently drops these, so it's not truly byte-identical-as-shipped. None of these sink Tier 1; they're all confined to the Tier-2 path that should be cut anyway.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## Grounding corrections (the brief's premise is partly wrong)

I read the real files. Three claims in the brief need correcting before any code:

1. **There is no "atmosphere Fresnel" shader.** `src/components/canvas/shaders/atmosphereShader.ts:33-36` explicitly states it _replaced_ the legacy Fresnel rim-glow (`pow(max(0.0, 0.6 - dot(normal, viewDir)), 4.0)`) with a 1:1 Gaia Sky Rayleigh+Mie sky integrator. The live atmosphere fragment (`atmscatteringSnippet.ts:193-273` `computeAtmosphericScattering`) has **no Fresnel term**. The only Fresnel in the codebase is the **procedural Sun** at `proceduralSunShaders.ts:322` (`fresnel = pow(1.0 - nDotV, uFresnelPower) * uFresnelInfluence`). So the two real GLSL pixel-test targets are: **(a) the atmosphere sky scattering shader** and **(b) the Saturn ring-shadow injection** — plus optionally the Sun Fresnel as a bonus. I'll scope to (a) and (b) since those are the brief's intent (atmosphere + ring shadow), and call out the Sun Fresnel as the actual home of "Fresnel".

2. **Ring shadow is GLSL string-injected, not a standalone material.** It lives inside `MeshStandardMaterial.onBeforeCompile` as a `.replace("#include <map_fragment>", ...)` patch at `usePlanetMaterials.ts:560-609`. Uniforms: `uSunPosition`, `uInnerRadius`, `uOuterRadius`, `tRing`, plus the auto-injected `vPos`/`vObjectNormal` varyings. A JS mirror already exists: `intersectRingPlane()` + `sunInObjectSpace()` in `src/components/canvas/planet/ringShadowMath.ts`, pinned by `ringShadowMath.test.ts`.

3. **The existing test surface is JS-mirror pinning, not GL execution.** `atmosphereMath.test.ts` and `ringShadowMath.test.ts` run under `vitest.config.ts` `environment: "node"` with **no GL context** — they test hand-mirrored TS (`atmosphereMath.ts`, `ringShadowMath.ts`) against hand-computed closed-form values. The GLSL itself is _never executed_ in tests today. **That is the real gap A2 should close: the live GLSL string and the JS mirror can silently drift.**

## Honest feasibility verdict on headless-gl (read this first)

`headless-gl` (`npm i gl`) is a **native C++ addon** that links against system OpenGL/ANGLE and requires `node-gyp` + a C++ toolchain + (on Linux CI) a software rasterizer (`xvfb` / `mesa` / `swiftshader`). Concrete risk assessment for _this_ repo:

- **Windows (dev machine, the user's primary env — Win 11, Node 22.22):** `gl` ships prebuilt binaries for some Node/ABI combos but is chronically behind on Node major versions. Node 22 (ABI 127) prebuilds are unreliable; a source build needs Visual Studio Build Tools + Python. This is exactly the "native build pain" the brief flags, and it is **real**. High chance of a red `npm ci` on a fresh clone.
- **CI (`.github/workflows/deploy.yml` is `ubuntu-latest`, Node 20):** there is currently **no test job at all** — CI only builds + deploys Pages. Adding `gl` means installing `libgl1-mesa-dev libxi-dev` and running under `xvfb-run`, plus pinning Node to a version with `gl` prebuilds (Node 20 is safer than 22). Workable but adds a fragile native-dep surface to a project that today has zero native test deps.
- **Determinism:** even when it builds, raster output differs across Mesa/SwiftShader/ANGLE backends — the team already learned this lesson in `e2e/boot.spec.ts:50-73` (1% pixel tolerance for GPU non-determinism) and `e2e/helpers.ts:29-50` (HDR screenshot protocol hangs). Pixel-exact GLSL assertions across Win-dev and Linux-CI are **not** achievable; you'd be back to tolerance bands.

**Recommendation (tiered, so the user chooses):**

- **Tier 1 (ship this first — zero native deps):** Close the drift gap _without_ a GPU by executing the GLSL math in JS via a tiny transpile-free approach — extract the load-bearing GLSL expressions into the already-existing TS mirrors and add **differential tests** that assert the live GLSL string still contains the mirrored expression (string-contract tests) + numeric pinning. This is 100% portable, runs in the current `node` vitest env, and catches the real failure mode (mirror drifting from GLSL).
- **Tier 2 (opt-in GPU, gated):** Add `gl` as an **optional** devDependency behind a `describe.skipIf(!hasGL)` guard and a separate `test:gl` script, so it never blocks `test:run` on Windows. Render the _real_ shader strings into a 1×1 (or 8×8) offscreen FBO and assert the output pixel against the JS mirror within tolerance. This is the genuine "pixel-test the REAL shader" deliverable, but it is **never on the default/critical path** and is wired into CI as a _separate, allowed-to-be-skipped_ Linux job.

This split gives the user the real value (no more silent GLSL/mirror drift) immediately and portably, while making the fragile GPU path strictly additive and opt-in. Below is the concrete plan for both tiers.

---

## Tier 1 — Differential GLSL-contract tests (portable, ship first)

**Step 1.1 — Extract the ring-shadow GLSL into a single exported string constant.**
Today the ring-shadow GLSL is an inline template literal inside the `.replace()` at `usePlanetMaterials.ts:560-609`. Hoist it to a named export `RING_SHADOW_FRAG_SNIPPET` in a new sibling `usePlanetMaterials` helper or, better, co-locate it next to its mirror in `src/components/canvas/planet/ringShadowMath.ts` as an exported GLSL constant. `usePlanetMaterials.ts` then imports and injects it. This (a) makes the GLSL string testable, (b) keeps mirror and GLSL physically adjacent (the DRY/SRP rule from AGENTS.md §17), and (c) is a small reversible diff.

**Step 1.2 — Add a string-contract test** that pins the GLSL ↔ mirror relationship: assert that `RING_SHADOW_FRAG_SNIPPET` contains the exact ray-plane lines (`t = -vPos.y / lightDir.y`, `radius = length(hitPos.xz)`, `radius > uInnerRadius && radius < uOuterRadius`) that `intersectRingPlane()` mirrors. If a future edit changes one without the other, the test fails. This is cheap, deterministic, and the highest-ROI guard.

**Step 1.3 — Same for atmosphere.** `atmosphereMath.ts` already mirrors the _scalar helpers_ (`rayleighPhase`, `miePhase`, `scale`, near/far intersection). Add a contract test asserting `ATMSCATTERING_FRAG_GLSL` (already exported from `atmscatteringSnippet.ts`) contains the byte-identical formula bodies the mirror pins (the file header already promises byte-identical, so this enforces it). Also extend coverage to the **full sky integrator** (`computeAtmosphericScattering`) by mirroring its loop in TS — currently _unmirrored_ per `atmscatteringSnippet.ts:38-40` — using the real per-frame uniforms from `computeDynamicAtmosphereUniforms()` (`atmosphereDynamics.ts:145`) and `buildAtmosphereUniforms()` (`atmosphereShader.ts:155`) as inputs. That gives a pure-JS reference for Tier 2 to validate against.

**Step 1.4 — Wire a real unit-test CI job.** There is currently none. Add a `test` job to `.github/workflows/deploy.yml` (or a new `ci.yml`) running `npm ci && npm run test:run` on `ubuntu-latest`, Node 20. This is independent of any GL work and is the single biggest CI-coverage win.

---

## Tier 2 — Optional offscreen GPU pixel tests (opt-in, never blocks default suite)

**Step 2.1 — Add `gl` as an optional devDependency** and a harness module `src/test/gl/offscreenShader.ts` that:

- lazily `await import("gl")` inside a `try/catch`; export `hasGL: boolean` + a `renderFragment()` helper.
- creates a `1x1` (or `8x8`) context: `createGL(W, H, { preserveDrawingBuffer: true })`.
- compiles a full-screen-triangle vertex shader + the **real** fragment string (`atmosphereFragmentShader` from `atmosphereShader.ts`, or `RING_SHADOW_FRAG_SNIPPET` wrapped in a minimal `main()`), sets the **real uniforms** produced by `buildAtmosphereUniforms()` / `computeDynamicAtmosphereUniforms()` / `sunInObjectSpace()` + `intersectRingPlane()` inputs, draws, and `readPixels` into a `Uint8Array`.

**Step 2.2 — Reuse the GLSL1 shim.** The live atmosphere shader compiles under Three's GLSL1 with `#define out varying` + `#define a_position position` (`atmosphereShader.ts:55-76, 110-136`). `headless-gl` is WebGL1 → GLSL ES 1.00, the _same_ dialect. So the real `atmosphereFragmentShader`/`atmosphereVertexShader` strings should compile **as-is** without a GLSL3 transpile step (this is a genuine advantage of the project already targeting GLSL1). The only substitution: replace Three's auto-injected `projectionMatrix`/`modelViewMatrix`/`position` with explicit uniforms/attributes in the test vertex stub, while keeping the **fragment** byte-identical (the fragment is where the physics lives).

**Step 2.3 — Differential assertion, not golden image.** Render the fragment at chosen uniform inputs; independently compute the expected color from the Tier-1 JS mirror; assert `abs(pixel - expected) <= TOL` per channel (TOL ≈ 2/255 for the linear math, looser if tonemapping is involved). This avoids brittle golden PNGs and the GPU-nondeterminism problem the team already documented. Gate the whole file with `describe.skipIf(!hasGL)`.

**Step 2.4 — Separate script + CI lane.** Add `"test:gl": "vitest run src/test/gl"` to `package.json`. Default `test:run` must **exclude** `src/test/gl` (add to `vitest.config.ts` `exclude`) so Windows dev + the Tier-1 CI job never touch native `gl`. Add an _optional, continue-on-error_ Linux CI job that installs `libgl1-mesa-dev xvfb` and runs `xvfb-run -a npm run test:gl`. If `gl` fails to build, the job is skipped/yellow, not red.

**Step 2.5 — Smoke targets, in priority order:** (1) ring-shadow: surface point on the lit side with sun positioned so the ray pierces the annulus → assert `diffuseColor` darkened vs. a control point outside the annulus, matching `intersectRingPlane().hits`. (2) atmosphere sky: camera outside vs. inside the shell → assert the inside `fKrESun` boost from `computeDynamicAtmosphereUniforms()` produces a brighter integrated color. (3) (bonus) Sun Fresnel: vary `nDotV` → assert `pow(1-nDotV, uFresnelPower)*uFresnelInfluence` monotonicity. These exercise the _actual_ uniforms from the validation digest.

#### Code draft

```ts
// ── Tier 1, Step 1.1: hoist ring-shadow GLSL next to its JS mirror ──
// src/components/canvas/planet/ringShadowMath.ts  (ADD export)
export const RING_SHADOW_FRAG_SNIPPET = /* glsl */ `
  vec3 lightDir = normalize(uSunPosition - vPos);
  float sunDot = dot(normalize(vObjectNormal), lightDir);
  float terminatorFade = smoothstep(0.0, 0.05, sunDot);
  if (terminatorFade > 0.0) {
    if (abs(lightDir.y) > 0.000001) {
      float t = -vPos.y / lightDir.y;          // mirror: intersectRingPlane t
      if (t > 0.0) {
        vec3 hitPos = vPos + lightDir * t;
        float radius = length(hitPos.xz);       // mirror: hypot(hitX, hitZ)
        if (radius > uInnerRadius && radius < uOuterRadius) {
          float u = (radius - uInnerRadius) / (uOuterRadius - uInnerRadius);
          vec4 ringColor = texture2D(tRing, vec2(u, 0.5));
          diffuseColor.rgb *= (1.0 - ringColor.a * 0.9 * terminatorFade);
        }
      }
    }
  }
`;
```

```ts
// src/components/canvas/planet/usePlanetMaterials.ts  (REPLACE inline literal)
import { RING_SHADOW_FRAG_SNIPPET } from "./ringShadowMath";
// ...
mat.onBeforeCompile = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    `#include <map_fragment>\n${RING_SHADOW_FRAG_SNIPPET}`
  );
};
```

```ts
// ── Tier 1, Step 1.2/1.3: GLSL↔mirror contract tests (node env, no GL) ──
// src/components/canvas/planet/ringShadowMath.test.ts  (APPEND)
import { RING_SHADOW_FRAG_SNIPPET } from "./ringShadowMath";

describe("GLSL ↔ JS mirror contract (live shader can't drift)", () => {
  it("ring-shadow GLSL still contains the exact ray-plane math intersectRingPlane mirrors", () => {
    expect(RING_SHADOW_FRAG_SNIPPET).toContain("t = -vPos.y / lightDir.y");
    expect(RING_SHADOW_FRAG_SNIPPET).toContain("radius = length(hitPos.xz)");
    expect(RING_SHADOW_FRAG_SNIPPET).toContain(
      "radius > uInnerRadius && radius < uOuterRadius"
    );
  });
});
```

```ts
// src/components/canvas/shaders/atmosphereMath.test.ts  (APPEND)
import { ATMSCATTERING_FRAG_GLSL } from "./atmscatteringSnippet";
it("sky integrator GLSL keeps the byte-identical phase formulas the mirror pins", () => {
  // miePhase Henyey-Greenstein body — must match atmosphereMath.ts mirror
  expect(ATMSCATTERING_FRAG_GLSL).toContain(
    "1.5 * ((1.0 - g2) / (2.0 + g2)) * (1.0 + fCos2) / pow (1.0 + g2 - 2.0 * fG * fCos, 1.5)"
  );
  expect(ATMSCATTERING_FRAG_GLSL).toContain("return 0.75 + 0.75 * fCos2;"); // rayleighPhase
});
```

```ts
// ── Tier 2, Step 2.1/2.2: optional offscreen GL harness ──
// src/test/gl/offscreenShader.ts
let createGL:
  | ((w: number, h: number, o?: object) => WebGLRenderingContext)
  | null = null;
export let hasGL = false;
try {
  // dynamic so a missing native build can't crash module load on Windows
  createGL = (await import("gl")).default as typeof createGL;
  hasGL = !!createGL;
} catch {
  hasGL = false;
}

const FS_TRIANGLE_VS = `
  attribute vec2 aClip;
  void main() { gl_Position = vec4(aClip, 0.0, 1.0); }
`;

export function renderFragment(opts: {
  fragSrc: string; // REAL shader string, GLSL ES 1.00
  uniforms: Record<string, number | number[]>;
  width?: number;
  height?: number;
}): Uint8Array {
  if (!createGL) throw new Error("headless-gl unavailable");
  const W = opts.width ?? 8,
    H = opts.height ?? 8;
  const gl = createGL(W, H, { preserveDrawingBuffer: true });
  const prog = gl.createProgram()!;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(s) ?? "compile fail");
    return s;
  };
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, FS_TRIANGLE_VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, opts.fragSrc));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  // full-screen triangle
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );
  const loc = gl.getAttribLocation(prog, "aClip");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  // set REAL uniforms (vec3 → uniform3fv, float → uniform1f, int → uniform1i)
  for (const [name, v] of Object.entries(opts.uniforms)) {
    const u = gl.getUniformLocation(prog, name);
    if (!u) continue;
    if (Array.isArray(v)) gl.uniform3fv(u, v);
    else if (Number.isInteger(v) && name.startsWith("n")) gl.uniform1i(u, v);
    else gl.uniform1f(u, v);
  }
  gl.viewport(0, 0, W, H);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const px = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}
```

```ts
// ── Tier 2, Step 2.3/2.5: differential pixel test (skipped if no GL) ──
// src/test/gl/ringShadow.gl.test.ts
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { hasGL, renderFragment } from "./offscreenShader";
import { RING_SHADOW_FRAG_SNIPPET } from "../../components/canvas/planet/ringShadowMath";
import { intersectRingPlane } from "../../components/canvas/planet/ringShadowMath";

const wrapMain = (snippet: string) => `
  precision highp float;
  uniform vec3 uSunPosition; uniform float uInnerRadius, uOuterRadius;
  // test stubs for varyings + texture the live path supplies:
  void main() {
    vec3 vPos = vec3(0.0, 0.5, 0.0);
    vec3 vObjectNormal = vec3(0.0, 1.0, 0.0);
    vec4 diffuseColor = vec4(1.0);
    ${snippet.replace("texture2D(tRing, vec2(u, 0.5))", "vec4(1.0)")}
    gl_FragColor = diffuseColor;
  }
`;

describe.skipIf(!hasGL)("ring shadow — REAL GLSL pixel vs JS mirror", () => {
  it("darkens exactly when intersectRingPlane reports a hit", () => {
    const sun = new THREE.Vector3(2.0, -0.5, 0.0); // ray pierces annulus at r≈1
    const mirror = intersectRingPlane(
      new THREE.Vector3(0, 0.5, 0),
      sun,
      0.5,
      2.0
    );
    const px = renderFragment({
      fragSrc: wrapMain(RING_SHADOW_FRAG_SNIPPET),
      uniforms: {
        uSunPosition: [sun.x, sun.y, sun.z],
        uInnerRadius: 0.5,
        uOuterRadius: 2.0,
      },
    });
    const darkened = px[0] < 250; // R channel pulled below 1.0
    expect(darkened).toBe(mirror.hits); // GLSL and mirror must agree
  });
});
```

```jsonc
// package.json (ADD script; gl stays OPTIONAL / not in default install path)
"scripts": {
  "test:run": "vitest run",
  "test:gl": "vitest run src/test/gl"   // opt-in; needs `npm i -D gl`
}
```

```ts
// vitest.config.ts — keep default suite GL-free & deterministic
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "src/test/gl/**"], // GL lane runs separately
  },
});
```

```yaml
# .github/workflows/ci.yml — Tier-1 test job (always) + optional GL lane
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:run # portable, no native deps — the real win
  gl:
    runs-on: ubuntu-latest
    continue-on-error: true # never block the merge on native build pain
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: sudo apt-get update && sudo apt-get install -y libgl1-mesa-dev libxi-dev xvfb
      - run: npm ci && npm i -D gl
      - run: xvfb-run -a npm run test:gl
```

#### Performance trade-offs

## Runtime / 60Hz render loop

**Zero impact on the app's render loop.** Every change here is test-only. Step 1.1 (hoisting `RING_SHADOW_FRAG_SNIPPET` to a `const` and importing it) produces a byte-identical shader string at `onBeforeCompile` time — the compiled program, uniforms, and per-frame writes (`Planet.tsx` useFrame, `usePlanetMaterials.ts:560-609`) are unchanged, so there is no added GPU work, no extra draw call, no re-render. The `useMemo` dependency array at `usePlanetMaterials.ts:614-631` is untouched.

## CPU / memory (test process)

- **Tier 1** is pure CPU string + arithmetic, microseconds per assertion, no allocation beyond a few `THREE.Vector3`s already used by the existing mirror tests. Adds negligibly to `test:run` wall time (these suites already run in the node env).
- **Tier 2** spins up a real GL context per `renderFragment()` call. An 8×8 FBO `readPixels` is ~256 bytes; the dominant cost is context creation + shader compile/link (~5-30 ms each under SwiftShader/Mesa). Keep render targets tiny (1×1–8×8) — pixel _count_ is irrelevant to the assertion (the physics is per-fragment uniform-driven), so there is no reason to allocate a large buffer. Memory footprint of `gl` itself is a few MB of native heap, freed when the worker exits.

## CI cost

- **Tier 1 CI job:** this repo has **no unit-test CI today** (`deploy.yml` only builds Pages). Adding `npm run test:run` on `ubuntu-latest`/Node 20 is ~30-60 s including `npm ci` cache — the single highest-ROI line in this whole plan, and it carries no native-dep risk.
- **Tier 2 GL job:** adds `apt-get install libgl1-mesa-dev xvfb` (~20-40 s) + a source/prebuild of `gl`. Marked `continue-on-error: true` and excluded from the default suite, so a failed native build is a yellow advisory, never a merge blocker. This is the deliberate containment of the "headless-gl native build pain" the brief asked me to assess honestly.

## Determinism trade-off (the load-bearing caveat)

Pixel-exact equality across Windows-dev and Linux-CL GL backends is **not** attainable — the team already codified this in `e2e/boot.spec.ts:50-73` (1% tolerance for GPU non-determinism) and `e2e/helpers.ts:29-50` (HDR `captureScreenshot` hangs). Tier 2 therefore asserts **differential/monotonic properties within a per-channel tolerance** (e.g. "annulus hit ⇒ R darkened", "inside-shell ESun boost ⇒ brighter integral"), validated against the deterministic Tier-1 JS mirror, rather than golden PNGs. This keeps the GPU tests meaningful without inheriting the screenshot-flakiness class of failures.

## Why not make GL the default

Putting `gl` in the default `devDependencies` would risk a red `npm ci` on the user's Windows/Node 22 machine (ABI 127 prebuilds for `gl` are unreliable; source build needs VS Build Tools + Python) and on any contributor clone. The optional-import + `describe.skipIf(!hasGL)` + separate `test:gl` script structure means the portable Tier-1 value lands unconditionally, and the GPU path is strictly additive — matching AGENTS.md §3 (smallest change that solves it) and §16 (avoid over-engineering on a fragile dependency).

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\ringShadowMath.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\usePlanetMaterials.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\ringShadowMath.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\shaders\atmosphereMath.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\shaders\atmscatteringSnippet.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\test\gl\offscreenShader.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\test\gl\ringShadow.gl.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\test\gl\atmosphere.gl.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\vitest.config.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\package.json, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\.github\workflows\ci.yml

</details>

### C2 — Full Dynamic i18n + Language Selector

**Verdict:** `NICE_TO_HAVE` · **ROI score:** 4/10 · **Effort:** L · **Grounding verified:** true

**Lazy 80% alternative:** Ship ONLY Steps 2+3: the LanguageSelector primitive mounted in GearPopover, plus translate GearPopover's own ~12 literals. That alone delivers the headline premium feature — a working, persisting language switcher in the settings menu — for ~1/4 the effort and ~1/10 the surface area. The HygStarPanel (the richest data panel, already fully translated) flips live, proving the toggle works end-to-end. Defer Steps 4-6 (converting Sidebar/Timeline/DisplayPanel/A11yPanel/LayersPanel) to a later wave: until body content itself is translated (explicitly out-of-scope here), a user who switches to pt-BR still reads English body descriptions, escape velocities labeled in English, etc. Translating only the _chrome_ of those panels while the _content_ stays English is a half-finished feel that the lazy version sidesteps by simply not advertising those panels as translated yet. ~80% of perceivable value (a real selector that visibly localizes the star panel) for an S/M effort instead of L.

**Architecture fit:** Fits the real architecture cleanly — no friction. Confirmed: i18next ^26 + react-i18next ^17 + browser-languagedetector ^8 initialized synchronously with inlined RESOURCES (i18n/index.ts:48-63); detector caches to localStorage[i18nextLng] (line 41) so changeLanguage() persists with NO Zustand slice — correct, no over-engineering there. The parity test (i18n.test.ts:141-151 collectKeyPaths) is a genuine mechanical lockstep gate and the blueprint correctly leans on it. REUSE is right: local GearSection/GearButton (GearPopover.tsx:201-230), ChoiceButton markup verbatim from DisplayPanel.tsx:433-461. What BREAKS if done naively, all correctly pre-empted by the blueprint: (1) A11yPanel.tsx:156 derives data-testid from the English label — confirmed real; left coupled, a localized run breaks toggle-_ selectors. This is the one mandatory robustness fix. (2) TIME_STEPS (45 entries, Timeline.tsx:14-60) and VISUAL_FIDELITY_LABELS (Sidebar.tsx:12-17) are module-scope constants that go stale on switch — confirmed; useMemo-keyed-on-i18n.language is the correct fix. (3) Timeline's currentLabel/rateSummary additionally hardcode 'Paused'/'Custom Speed'/'Realtime sync'/'1 second/second' (lines 190-237) — must also route through t(); blueprint covers via timeline.state._ and the rate token map. ARCHITECTURAL CAUTION the blueprint under-weights: the existing ChoiceButton/Toggle is already triplicated across DisplayPanel/LayersPanel/A11yPanel (each with its own data-testid derivation). Copying the ChoiceButton markup a FOURTH time into LanguageSelector adds to debt the blueprint itself flags as out-of-scope. Cheaper-aligned move: extract a shared primitives/ChoiceButton first (or have LanguageSelector import DisplayPanel's), so this feature reduces duplication instead of adding to it.

**Inaccuracies caught:** Effectively none — the blueprint is unusually well-grounded; every load-bearing claim verified true against source. Spot-checks: GearPopover has 4 sections + no useTranslation + the 'help · about · developer' breadcrumb (line 116) despite 4 sections — confirmed (the blueprint itself flags this). SUPPORTED_LANGUAGES, LANGUAGE_STORAGE_KEY='i18nextLng', resolvedLanguage normalization (pt→pt-BR, en-US→en), and the collectKeyPaths parity gate — all confirmed at the cited lines. HygStarPanel side-effect import 'import \"../../i18n\";' is at line 10 as claimed. A11yPanel testid-from-label coupling confirmed (line 156). Bodies are data-driven with name.en/name.pt (45 entries) and body-content translation correctly flagged out-of-scope. Two trivial nits, neither load-bearing: (a) DETECTION_CONFIG order is querystring→localStorage→navigator (no 'cookie'/'sessionStorage'), explicitly pinned at i18n/index.ts:39-44 — the blueprint's persistence claim is right but slightly undersells that the contract is deliberately locked-down. (b) The blueprint says the parity test 'auto-covers new keys' — true, but note it ONLY enforces key-set equality, NOT that pt-BR values are actually translated (a key copied with the English string still passes). The added per-locale spot-checks (Step 7) are therefore not optional polish but the only thing preventing untranslated-but-key-present strings from passing green.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## C2 — Full Dynamic i18n + Language Selector

Grounded in the real files. Existing stack is **i18next ^26.0.9 + react-i18next ^17.0.6 + i18next-browser-languagedetector ^8.2.1**, initialized synchronously with inlined resources in `src/i18n/index.ts`. The only translated surface today is `hygStarPanel.*` in `src/i18n/locales/{en,pt-BR}/common.json`. Build on this exact setup — do NOT introduce a second i18n system.

### Prompt-vs-reality corrections (load-bearing)

- **No Sidebar/TopBar/Timeline i18n exists** — all use hardcoded English. Real files: `src/components/ui/{Sidebar,TopBar,Timeline,DisplayPanel,A11yPanel,LayersPanel,GearPopover}.tsx`.
- **GearPopover has FOUR sections** (`Help`, `About`, `Integrations`, `Developer` — `GearPopover.tsx:130-193`), not three, despite the `help · about · developer` breadcrumb (line 116). No `useTranslation` anywhere in it.
- **No store language slice and no `changeLanguage()` caller exists** (grep: only `HygStarPanel`, `i18n/index.ts`, `i18n.test.ts`, `main.tsx` touch i18n). The detector already caches to `localStorage[i18nextLng]` (`i18n/index.ts:41`), so `i18n.changeLanguage()` **persists automatically — no Zustand slice needed**.
- **Sidebar is data-driven**: body strings come from `BODIES_BY_ID` (`src/data/celestialBodies.ts`, with `name.en`/`name.pt`). Only panel _chrome_ (`Selected Body`, `Quick Context`, `Physical Data`, `StatBox`/`HeaderChip` labels, `VISUAL_FIDELITY_LABELS` at `Sidebar.tsx:12-17`, `OrbitalProvenanceDisplay` strings) is in scope. Body-content translation is a separate effort — flag it.

### Step 1 — Key taxonomy (single `common` NS)

Keep the single `common` namespace (`DEFAULT_NAMESPACE`, `i18n/index.ts:10`) — no lazy-load machinery. Add sibling top-level keys per panel owner: `language.*`, `settings.*`, `topBar.*`, `timeline.*`, `sidebar.*`, `displayPanel.*`, `a11yPanel.*`, `layersPanel.*`. **Hard constraint:** `i18n.test.ts:141-151` (`collectKeyPaths`) enforces identical key sets across every locale — every key added to `en/common.json` MUST exist in `pt-BR/common.json` or the parity test fails. Use it as the mechanical lockstep gate.

### Step 2 — `LanguageSelector` primitive + consumption pattern

Reference pattern: `HygStarPanel.tsx:39` (`const { t, i18n } = useTranslation()`) + side-effect import `import "../../i18n";` (`HygStarPanel.tsx:10`) for test self-containment. New `src/components/ui/primitives/LanguageSelector.tsx`: a `role="group"` of `aria-pressed` ChoiceButtons (reuse exact markup from `DisplayPanel.tsx:433-461`), iterating `SUPPORTED_LANGUAGES` (`i18n/index.ts:8`), active = `i18n.resolvedLanguage === lng` (proven correct by `i18n.test.ts:90-127`: normalizes `pt`→`pt-BR`, `en-US`→`en`), onClick `i18n.changeLanguage(lng)`.

### Step 3 — Mount in GearPopover

Add `useTranslation` + side-effect import. Insert `<GearSection label={t("settings.section.language")}><LanguageSelector/></GearSection>` reusing the local `GearSection`/`GearButton` (`GearPopover.tsx:201-230`). Route all literals incl. `aria-label="Settings menu"` (line 101) and `aria-label="Close settings menu"` (line 123) through `t()`.

### Step 4 — Convert remaining panels

Add `useTranslation` + side-effect import to each; swap JSX text + `aria-label`/`title` for `t()`. Keep leaf `Toggle`/`ChoiceButton` dumb (`label: string` prop, parent passes translated text). **Decouple `A11yPanel.tsx:156` `data-testid` from the translated label** (explicit `testId` prop) or test selectors break on language switch.

### Step 5 — Re-render correctness

`useTranslation` subscribes to `languageChanged` → owning components re-render automatically. Module-level baked constants go stale: move `TIME_STEPS` (`Timeline.tsx:14-60`) and `VISUAL_FIDELITY_LABELS` (`Sidebar.tsx:12-17`) into `useMemo` keyed on `i18n.language`. For the 45 `TIME_STEPS` rate strings use a `timeline.rate.unit.*` token map, not 45 literal translations.

### Step 6 — Locale-aware Intl

Thread `i18n.language` into `Intl.DateTimeFormat`/`toLocaleString` (`Timeline.tsx:206-226`, `Sidebar.tsx:249`) — `HygStarPanel.tsx:207` already does this. Low-risk polish.

### Step 7 — Tests + gate

Parity test auto-covers new keys; add per-namespace `t()` spot-checks in `en`+`pt-BR` (mirror `i18n.test.ts:47-79`). New `LanguageSelector.test.tsx` (jsdom, mirror `GearPopover.test.tsx` harness): click pt-BR, assert `i18n.resolvedLanguage==="pt-BR"` + `localStorage[LANGUAGE_STORAGE_KEY]` written. Add `afterEach(() => i18n.changeLanguage("en"))` guard. Gate: `npm run test:run` then `npm run docs:check`.

### Out-of-scope (flag, don't expand)

Body content translation in Sidebar; the duplicated Toggle/ChoiceButton dedup (separate refactor) — keep this diff reviewable.

#### Code draft

```jsonc
// src/i18n/locales/en/common.json — ADD siblings to existing hygStarPanel.
// pt-BR/common.json MUST mirror EVERY key (i18n.test.ts:141-151 parity gate).
{
  "hygStarPanel": {
    /* unchanged */
  },
  "language": {
    "label": "Language",
    "en": "English",
    "pt-BR": "Português (BR)",
  },
  "settings": {
    "title": "Settings",
    "subtitle": "help · about · developer",
    "close": "Close",
    "closeAria": "Close settings menu",
    "menuAria": "Settings menu",
    "section": {
      "language": "Language",
      "help": "Help",
      "about": "About",
      "integrations": "Integrations",
      "developer": "Developer",
    },
    "replayTutorial": "Replay Tutorial",
    "shortcuts": "Keyboard Shortcuts",
    "missionReport": "Mission Report",
    "wikipediaToggle": "Wikipedia about-text",
    "wikipediaDesc": "Pulls a brief summary + thumbnail from Wikipedia for the selected star (HYG focus). Off ⇒ no network requests, no cache writes.",
    "debugLogging": "Debug Logging",
    "debugDesc": "Orbital engine + overlay counters — console only.",
    "on": "On",
    "off": "Off",
  },
  "topBar": {
    "systemOnline": "System Online",
    "back": "Back",
    "home": "Home",
    "menu": "Menu",
    "backAria": "Return to the previous focused body",
    "homeAria": "Focus the Sun and reset the sidebar selection",
    "menuOpenAria": "Open settings menu",
    "menuCloseAria": "Close settings menu",
  },
  "timeline": {
    "simulationTime": "Simulation time",
    "liveSync": "Live sync",
    "normalRate": "Normal rate",
    "liveMode": "Live mode",
    "reverse": "Reverse",
    "normal": "Normal",
    "forward": "Forward",
    "playAria": "Play timeline",
    "pauseAria": "Pause timeline",
    "state": {
      "paused": "Paused",
      "custom": "Custom Speed",
      "realtime": "Realtime sync",
    },
    // unit-token map instead of translating 45 baked English strings:
    "rate": {
      "second": "{{count}} s/s",
      "minute": "{{count}} min/s",
      "hour": "{{count}} h/s",
      "day": "{{count}} d/s",
      "week": "{{count}} wk/s",
      "month": "{{count}} mo/s",
      "year": "{{count}} yr/s",
    },
  },
  "sidebar": {
    "selectedBody": "Selected Body",
    "quickContext": "Quick Context",
    "visualFidelity": "Visual Fidelity",
    "telemetry": "Real-time Telemetry",
    "physicalData": "Physical Data",
    "orbitalData": "Orbital Data",
    "orbitModel": "Orbit Model",
    "stat": {
      "radius": "Radius",
      "gravity": "Gravity",
      "mass": "Mass",
      "escapeVel": "Escape Vel.",
      "orbitalSpeed": "Orbital Speed",
    },
    "visualFidelityLabel": {
      "measured": "Measured Asset",
      "observational-model": "Observational Model",
      "interpretive": "Interpretive Visual",
      "procedural": "Procedural Visual",
    },
  },
  // ... displayPanel.*, a11yPanel.*, layersPanel.* analogous
}
```

```tsx
// src/components/ui/primitives/LanguageSelector.tsx  (NEW)
import { useTranslation } from "react-i18next";
import "../../../i18n"; // side-effect (HygStarPanel.tsx:10 precedent)
import { SUPPORTED_LANGUAGES } from "../../../i18n";

export const LanguageSelector = () => {
  const { t, i18n } = useTranslation();
  const active = i18n.resolvedLanguage; // pt→pt-BR / en-US→en normalized
  return (
    <div
      role="group"
      aria-label={t("language.label")}
      className="grid grid-cols-2 gap-2"
      data-testid="language-selector"
    >
      {SUPPORTED_LANGUAGES.map((lng) => {
        const isActive = active === lng;
        return (
          <button
            key={lng}
            type="button"
            aria-pressed={isActive}
            data-testid={`lang-${lng}`}
            onClick={() => {
              if (!isActive) void i18n.changeLanguage(lng);
            }}
            // ChoiceButton classes copied verbatim from DisplayPanel.tsx:451-457
            className={`border px-3 py-2 text-[10px] font-orbitron uppercase tracking-[0.16em] transition-[border-color,color,background-color,box-shadow] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-nasa-accent touch-manipulation ${
              isActive
                ? "border-nasa-accent bg-nasa-accent/10 text-white shadow-[0_0_12px_rgba(0,240,255,0.18)]"
                : "border-white/10 bg-black/35 text-white/60 hover:border-white/25 hover:text-white"
            }`}
          >
            {t(`language.${lng}`)}
          </button>
        );
      })}
    </div>
  );
};
```

```tsx
// src/components/ui/GearPopover.tsx  (DIFF sketch)
import { useTranslation } from "react-i18next";
import "../../i18n";
import { LanguageSelector } from "./primitives/LanguageSelector";

export const GearPopover = () => {
  const { t } = useTranslation();
  // ...existing store hooks...
  return (
    /* ... */
    <motion.div
      role="dialog"
      aria-label={t("settings.menuAria")} /* line 101 */
    >
      {/* header */}
      <div className="...text-nasa-accent">{t("settings.title")}</div>
      <div className="...text-white/45">{t("settings.subtitle")}</div>
      <button
        aria-label={t("settings.closeAria")}
        onClick={() => setGearOpen(false)}
      >
        {t("settings.close")}
      </button>

      {/* NEW section, reuses local GearSection (GearPopover.tsx:201) */}
      <GearSection label={t("settings.section.language")}>
        <LanguageSelector />
      </GearSection>

      <GearSection label={t("settings.section.help")}>
        <GearButton onClick={handleReplayTutorial}>
          <span>{t("settings.replayTutorial")}</span>
          <span className="...">Ctrl+Shift+T</span>
        </GearButton>
        {/* ...Keyboard Shortcuts → t("settings.shortcuts") */}
      </GearSection>
      {/* About / Integrations / Developer: swap literals + On/Off for t() */}
      <span>
        {wikipediaIntegrationEnabled ? t("settings.on") : t("settings.off")}
      </span>
    </motion.div>
  );
};
```

```tsx
// src/components/ui/Timeline.tsx  — fix stale module constants (Step 5)
// BEFORE: const TIME_STEPS = [...] at module scope (line 14) goes stale on switch.
// AFTER: keyed unit-token formatter inside the component.
const { t, i18n } = useTranslation();
const TIME_STEPS = useMemo(() => buildTimeSteps(t), [i18n.language]); // rebuild on switch
const currentLabel = useMemo(() => {
  if (Math.abs(speed - NORMAL_SPEED) < 1e-10)
    return t("timeline.rate.second", { count: 1 });
  if (speed === 0) return t("timeline.state.paused");
  return currentStepIndex !== -1
    ? TIME_STEPS[currentStepIndex].label
    : t("timeline.state.custom");
}, [currentStepIndex, speed, i18n.language]);
// Intl now locale-aware:
new Intl.DateTimeFormat(i18n.language, {
  /* … */
}).format(displayedDatetime);
```

```tsx
// src/components/ui/A11yPanel.tsx — decouple testid from translated label
const Toggle = ({
  label,
  testId,
  checked,
  onChange,
  disabled,
  title,
}: {
  label: string;
  testId: string /* ... */;
}) => (
  <button
    role="switch"
    aria-checked={checked}
    data-testid={testId} /* not derived from label */
  >
    <div>{label}</div>
    <span>{checked ? t("settings.on") : t("settings.off")}</span>
  </button>
);
// caller: <Toggle label={t("a11yPanel.reducedMotion")} testId="toggle-reduced-motion" .../>
```

```tsx
// src/i18n/i18n.test.ts — additions (parity test already auto-covers new keys)
it("translates settings keys per locale", async () => {
  expect(i18n.t("settings.title")).toBe("Settings");
  await i18n.changeLanguage("pt-BR");
  expect(i18n.t("settings.title")).toBe("Configurações");
});
```

```tsx
// src/components/ui/primitives/LanguageSelector.test.tsx  (NEW, mirror GearPopover.test.tsx)
afterEach(async () => {
  await i18n.changeLanguage("en");
});
it("switches language + persists to localStorage", () => {
  render(<LanguageSelector />);
  act(() => fireEvent.click(screen.getByTestId("lang-pt-BR")));
  expect(i18n.resolvedLanguage).toBe("pt-BR");
  expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("pt-BR");
});
```

#### Performance trade-offs

## Performance & cost analysis

**60Hz render loop — zero impact.** All work lives in React UI panels (Overlay/LayersPanel/GearPopover tree), outside the R3F `useFrame` path and the `simulationClock` rAF loop. No `t()` call touches the canvas, shaders, or per-frame propagation. Starfield/planet draw is untouched.

**Re-render on switch — bounded, infrequent.** `i18n.changeLanguage()` fires once per click. react-i18next re-renders only `useTranslation`-subscribed components — at most ~10 small visible panels. One-shot reconcile comparable to opening a panel; the canvas (not subscribed) keeps rendering uninterrupted. No jank.

**Memory — negligible.** Resources stay inlined (`RESOURCES`, `i18n/index.ts:20-23`), bundled at build, not network-lazy-loaded. Full panel key set adds a few KB per locale (~1–2 KB gzip each), held once in the i18next store. No per-component duplication, no new hot-path allocations.

**Module-constant→useMemo (Step 5) — micro-cost, correct.** `TIME_STEPS` (45 entries) + `VISUAL_FIDELITY_LABELS` rebuild on language change instead of once at module load. Sub-millisecond, only on switch, never per frame. Required for correctness (stale labels otherwise).

**Bundle/deps — none added.** Reuses installed i18next ^26.0.9 / react-i18next ^17.0.6 / i18next-browser-languagedetector ^8.2.1. No new packages, no second i18n system.

**Persistence — free.** Detector already caches to `localStorage[i18nextLng]` (`DETECTION_CONFIG.caches`). `changeLanguage()` writes synchronously; no Zustand slice, no persist middleware, one localStorage write per switch.

**CI cost — minimal.** New tests are jsdom (`vitest run`), ms each, reusing `GearPopover.test.tsx` harness; the parity test auto-covers added keys (no per-key test). **No new Playwright e2e needed** — switch is unit-verifiable, so the expensive ~47s headless-R3F flight budget is untouched. `afterEach` language reset prevents cross-test leak → avoids flaky-retry burn.

**Risk hotspot:** `A11yPanel.tsx:156` derives `data-testid` from the English label; left coupled, a future localized e2e breaks selectors. Decoupling testids from translated text is the one mandatory robustness fix — trivial cost, latent flake if omitted.

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\i18n\locales\en\common.json, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\i18n\locales\pt-BR\common.json, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\LanguageSelector.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\GearPopover.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\TopBar.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\Timeline.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\Sidebar.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\DisplayPanel.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\A11yPanel.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\LayersPanel.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\i18n\i18n.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\GearPopover.test.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\primitives\LanguageSelector.test.tsx

</details>

### A1 — Virtual Time-Warping for E2E Tests

**Verdict:** `GOLD_PLATING` · **ROI score:** 3/10 · **Effort:** L · **Grounding verified:** true

**Lazy 80% alternative:** Replace the fixed `await page.waitForTimeout(55_000)` (hyg-focus.spec.ts:179) with `await expect.poll(() => dist(camera.position, camera.target), { timeout: 60_000 }).toBeLessThanOrEqual(1000)` against the existing `__ATLAS_TEST_CAMERA__()` hook. ~10 lines, no new file, no global API override. It returns the instant the camera lands (so faster-than-1Hz CI runs finish early), kills the brittle fixed budget, and keeps determinism — capturing ~80% of the value at ~5% of the risk. The mid-fly orientation sample at t=0.5s already works (AimLerp is performance.now-driven, frame-rate-independent) and needs no change. If even the worst-case 1Hz wall time must drop, that is a separate, smaller fight — but a single ~95s e2e test is not a CI emergency for a teaching tool with exactly one flight spec.

**Architecture fit:** Fits at the integration boundary (test-only `addInitScript`, never touches src/) — that part is clean and correctly avoids un-freezing simulationClock. But it reinvents global timing control by monkeypatching `requestAnimationFrame`/`cancelAnimationFrame`/`performance.now` wholesale. In an R3F app, that global rAF is shared by the WebGLRenderer loop, Drei OrbitControls (priority -1 useFrame, CameraController.tsx:786), AND simulationClock's own rAF loop. Draining 60 queued callbacks synchronously per real tick means 60 back-to-back R3F render passes with no vsync/paint between them; whether the headless GPU flushes vs. coalesces those composites is unverified and is exactly what determines if the trajectory stays "bit-for-bit production." The blueprint asserts this, doesn't prove it. Should reuse: (1) the existing `__ATLAS_TEST_CAMERA__()` outcome hook for an event-driven poll instead of inventing `__ATLAS_VCLOCK__`; (2) the existing `screenshotWithRetry` (which the blueprint admits it still needs anyway). What breaks risk: if the vclock shim leaks into boot.spec.ts/postprocessing.spec.ts byte-stable baselines, or starves Playwright's protocol channel at high rate (blueprint flags this itself).

**Inaccuracies caught:** Minor: the blueprint references the orientation channel as `AimLerp` (correct — aimLerp.ts class is `AimLerp`), while one inherited spec comment calls it `OrientationLerp`; not the blueprint's error. The substantive overstatement is the cost/benefit framing: it sells "CI budget that scales linearly with flight count" but there is exactly ONE flight spec (hyg-focus.spec.ts) in the repo — the growing-suite justification is hypothetical, not real. The HDR-screenshot payoff is also overstated: the blueprint itself concedes virtual time does NOT fix the Chromium protocol hang (postprocessing.spec.ts:45-57 is a protocol issue, confirmed) and retains screenshotWithRetry regardless, so "finally makes the ultra-tier HDR screenshot plausible" is speculative, not delivered. Technical core claims (freezeSimulation pins simulationClock store.ts:719-736; update(delta) at CameraController.tsx:799; MAX_DT_SUBSTEP=0.05/MAX_DT_TOTAL=0.1 at hygPhysicsFlight.ts:211-212; 47s cost) are all accurate.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## A1 — Virtual Time-Warping for E2E Tests

### What the brief got wrong / what I verified

The prompt's premise — "hook the REAL simulationClock + rAF loop" — is partially mis-scoped. I read the real code:

- `src/lib/simulationClock.ts` **is not what governs the camera flight.** It owns _simulated time_ (`nowMs` → `getNow()`), and in e2e it is already **frozen** by `freezeSimulation()` (`e2e/helpers.ts:20-26` sets `window.__ATLAS_TEST_FREEZE__`, consumed at `src/store.ts:719-736` → `setIsPlaying(false)` + `seek(frozenEpoch)`). A frozen clock's rAF loop self-terminates (`simulationClock.ts:184-187`). So warping the simulationClock does nothing for the flight and would actually _un-freeze_ the scene and break the existing byte-stable screenshot gate.
- The ~47 s flight is driven by **two real wall-clock channels**, both ultimately reading `performance.now()`:
  1. **Position:** `HygPhysicsFlight.update(delta)` called in `src/components/canvas/CameraController.tsx:799` with R3F's `delta`. R3F derives `delta` from `THREE.Clock` → `performance.now()` (verified `node_modules/three/src/core/Clock.js:64,113`). The integrator caps each call at `MAX_DT_TOTAL = 0.1 s` (`hygPhysicsFlight.ts:212`). Under headless ~1 Hz rAF that yields 0.1 s of sim per second of wall → `4.65 s flight ≈ 47 s wall` (`hyg-focus.spec.ts:167-179`).
  2. **Orientation:** `AimLerp` reads `performance.now()` directly (`src/lib/camera/aimLerp.ts:173,179`).

**Therefore the correct hook is not simulationClock at all — it is the browser-global `performance.now()` + `requestAnimationFrame` that both R3F's clock and `AimLerp` consume.** Virtualizing those two globals accelerates _both_ flight channels coherently, while leaving the frozen `simulationClock` untouched (it's paused, so a faster clock advances nothing). This is the single elegant lever the brief was groping for. I adapt the brief accordingly and call this out explicitly.

### Step 1 — Add a virtual-clock init script (`e2e/helpers.ts`)

Add `installVirtualClock(page, { rate, fixedStepMs })` alongside the existing `freezeSimulation`. It uses `page.addInitScript` (same queue-before-`goto` pattern as `freezeSimulation`, helpers.ts:20-26) to, **before any app module evaluates**:

- Capture real `performance.now`, `requestAnimationFrame`, `cancelAnimationFrame`, `Date.now`.
- Maintain a `virtualNowMs` counter. Override `performance.now()` to return `virtualNowMs`.
- Override `requestAnimationFrame(cb)`: queue the callback, and on each real-rAF pump **advance `virtualNowMs` by a fixed virtual step** (e.g. `fixedStepMs = 16.7`) and invoke `cb(virtualNowMs)`. Drive pumping with the _real_ rAF so the event loop still yields to the renderer/GPU — we are decoupling _time_ from _frame cadence_, not busy-looping. Each real tick pumps N virtual frames (`rate`) so a 47 s flight collapses into a few hundred ms of real CPU.
- Expose `window.__ATLAS_VCLOCK__ = { setRate, pause, resume, virtualNow }` so a spec can ramp the warp up during flight and back to 1× for the settle/screenshot phase.

This is deliberately a **test-only browser shim** — it never touches `src/`. It composes with `freezeSimulation`: `__ATLAS_TEST_FREEZE__` keeps `simulationClock` paused; the virtual clock only speeds the wall-clock-derived flight channels.

### Step 2 — Keep the integrator honest (no code change needed, but document the guard)

`HygPhysicsFlight.update` already sub-steps at `MAX_DT_SUBSTEP = 0.05 s` and caps total advance at `MAX_DT_TOTAL = 0.1 s` (`hygPhysicsFlight.ts:211-212, 311-321`). With a _fixed_ virtual step of ~16.7 ms per virtual frame, every `update()` call gets a single clean 0.0167 s substep — identical to production 60 fps — and the warp comes purely from **calling rAF more often per real second**, not from feeding giant deltas. This is the key correctness property: virtual frames are production-sized, so the integrator trajectory is bit-for-bit the production path, just played faster. No `MAX_DT_TOTAL` relaxation, no integrator divergence. (If a spec instead fed fewer-but-larger virtual frames, `MAX_DT_TOTAL` would clamp them and _desync_ warp from real progress — so the blueprint mandates the fixed-small-step approach.)

`AimLerp` is duration-based on virtual `performance.now()` (`aimLerp.ts:179-181`), so its sigmoid eases over the same virtual timeline — orientation and position stay phase-locked exactly as in production.

### Step 3 — Rewrite the wait strategy in `e2e/hyg-focus.spec.ts`

Replace the brittle `await page.waitForTimeout(55_000)` (hyg-focus.spec.ts:179) with an **event-driven poll on the real completion outcome**, now that the flight finishes in ms:

- Drive focus via the existing `__ATLAS_TEST_STORE__.getState().setFocusId("hyg:0")` (store.ts:733-735; spec :140-147).
- Poll `__ATLAS_TEST_CAMERA__()` (Scene.tsx:318) until `|position − target|` settles into the `[400,1000]` landing bracket (spec :229-237) — i.e. wait on the _gate-driven_ outcome, not a wall-clock budget. The natural completion is `HygPhysicsFlight.completeNaturally()` (hygPhysicsFlight.ts:455) firing the gate; the camera probe is the observable proxy.
- Mid-fly orientation sample (spec :157-165): under warp, sample at a _virtual_ mid-point. Simplest robust approach — temporarily set `__ATLAS_VCLOCK__.setRate(1)` for one real frame, read `__ATLAS_TEST_CAMERA__().target`, then ramp warp back. This preserves the existing "lerp moved but didn't snap" assertions (spec :246-255) deterministically.
- Drop `test.setTimeout(140_000)` (spec :47) to the default 30 s (or lower); the flight no longer needs a multi-minute budget.

### Step 4 — Frame-damping / HDR screenshot handling

Two distinct, verified issues — handle separately:

1. **OrbitControls damping coast (frame-count-dependent).** `controlsInstance.dampingFactor` is mutated per-frame (`CameraController.tsx:726,749,669`) and OrbitControls integrates damping _per rendered frame_, not per wall-second. Under virtual warp we render _production-count_ frames (Step 2), so damping converges over the same frame budget as production — the warp does not under-damp. After the gate fires, run a **virtual settle**: pump ~30 virtual frames at `rate=1` (still fast in real time) so the post-flight damping tail and `useVisualPresetLerp` converge before any screenshot, mirroring boot.spec.ts:99's `waitForTimeout(1000)` but in virtual frames.

2. **HDR `captureScreenshot` protocol hang/flake.** This is a _Chromium-protocol_ failure, **not** a timing issue (postprocessing.spec.ts:45-57 — hangs "when the renderer is mid-allocation," reproducibly; helpers.ts:28-51 — "Unable to capture screenshot"). Virtual time does **not** fix it and the blueprint must say so. Mitigations that compose with warp: (a) **pause the virtual clock** (`__ATLAS_VCLOCK__.pause()`) before `screenshotWithRetry`, so the EffectComposer half-float buffer (`PostProcessingPipeline.tsx:167`) is not mid-allocation when `Page.captureScreenshot` fires — a _quiescent_ renderer is far less likely to trip the protocol than one churning rAF; (b) keep the existing `screenshotWithRetry` 3×/2 s backoff (helpers.ts:37-51) as the belt-and-suspenders. This finally makes the ultra-tier HDR screenshot that postprocessing.spec.ts:45-57 abandoned _plausible_, because the renderer can be frozen on demand without freezing `simulationClock` (which the frozen-epoch gate already did) — the new lever is freezing the _render pump_ itself.

### Step 5 — Verification

- Unit: the virtual clock is a pure browser shim; assert via a tiny Playwright spec that `performance.now()` advances by `rate×fixedStepMs` per real tick and that `HygPhysicsFlight` (already covered by `hygPhysicsFlight.test.ts`) is untouched.
- Integration: run `npm run test:e2e -- hyg-focus` and confirm wall time drops from ~95 s to a few seconds, landing bracket + mesh-active (`__ATLAS_TEST_MESH_STATE__`, HygStellarMesh.tsx:371) + console-clean assertions all still pass.
- Regression guard: `boot.spec.ts` and `postprocessing.spec.ts` must NOT install the virtual clock unless they opt in — keep `freezeSimulation`-only behavior the default so existing baselines hold.

#### Code draft

```ts
// e2e/helpers.ts — NEW: virtual wall-clock shim (test-only, never in src/)
// Composes with freezeSimulation: that pins simulationClock (paused),
// this accelerates the performance.now()-derived flight channels
// (R3F THREE.Clock delta -> HygPhysicsFlight.update, and AimLerp).

export interface VirtualClockOptions {
  /** Virtual frames pumped per real animation frame. 60 ⇒ ~1 s flight in ~16 ms real. */
  rate?: number;
  /** Virtual ms advanced per virtual frame. 16.7 ⇒ production-sized dt (single integrator substep). */
  fixedStepMs?: number;
}

export const installVirtualClock = async (
  page: Page,
  opts: VirtualClockOptions = {}
) => {
  await page.addInitScript(
    ({ rate, fixedStepMs }) => {
      const realRaf = window.requestAnimationFrame.bind(window);
      const realPerfNow = performance.now.bind(performance);
      const origin = realPerfNow();
      let virtualNow = 0;
      let paused = false;
      let curRate = rate;

      // Both R3F's THREE.Clock and AimLerp read performance.now().
      // Returning virtualNow accelerates BOTH coherently.
      performance.now = () => virtualNow;

      type FrameCb = (t: number) => void;
      let queue: FrameCb[] = [];
      window.requestAnimationFrame = ((cb: FrameCb): number => {
        queue.push(cb);
        return queue.length;
      }) as typeof window.requestAnimationFrame;
      window.cancelAnimationFrame =
        (() => {}) as typeof window.cancelAnimationFrame;

      // Pump: each REAL frame fires curRate virtual frames. Fixed small
      // step ⇒ HygPhysicsFlight gets one clean 0.0167 s substep per call,
      // identical trajectory to production 60fps, just denser in real time.
      const pump = () => {
        if (!paused) {
          for (let i = 0; i < curRate; i++) {
            virtualNow += fixedStepMs;
            const due = queue;
            queue = [];
            for (const cb of due) cb(virtualNow);
          }
        }
        realRaf(pump); // yield to renderer/GPU between real ticks
      };
      realRaf(pump);

      (window as any).__ATLAS_VCLOCK__ = {
        setRate: (r: number) => {
          curRate = Math.max(0, r);
        },
        pause: () => {
          paused = true;
        },
        resume: () => {
          paused = false;
        },
        virtualNow: () => virtualNow,
        realElapsed: () => realPerfNow() - origin,
      };
    },
    { rate: opts.rate ?? 60, fixedStepMs: opts.fixedStepMs ?? 16.7 }
  );
};
```

```ts
// e2e/hyg-focus.spec.ts — flight wait, warped + event-driven
import {
  freezeSimulation,
  installVirtualClock,
  visitAtlasAndWaitForReady,
} from "./helpers";

test("Sirius focus respects the flight contract (virtual-time)", async ({
  page,
}) => {
  await freezeSimulation(page); // pins simulationClock (unchanged gate)
  await installVirtualClock(page, { rate: 60, fixedStepMs: 16.7 });
  await visitAtlasAndWaitForReady(page);
  // ... existing loader-gone + hooks-wired + isIntroAnimating gates unchanged ...

  await page.evaluate(() =>
    (window as any).__ATLAS_TEST_STORE__.getState().setFocusId("hyg:0")
  );

  // Mid-fly orientation sample at 1× for one real frame (deterministic).
  await page.evaluate(() => (window as any).__ATLAS_VCLOCK__.setRate(1));
  await page.waitForTimeout(50);
  const midTarget = await page.evaluate(
    () => (window as any).__ATLAS_TEST_CAMERA__().target
  );
  await page.evaluate(() => (window as any).__ATLAS_VCLOCK__.setRate(60));

  // Wait on the GATE outcome, not a 55 s wall budget. Flight done in ms now.
  const dist = (a: any, b: any) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  await expect
    .poll(
      async () => {
        const c = await page.evaluate(() =>
          (window as any).__ATLAS_TEST_CAMERA__()
        );
        return dist(c.position, c.target);
      },
      { timeout: 10_000 }
    )
    .toBeLessThanOrEqual(1000);

  // Virtual settle: let damping tail + M3 cross-fade converge at 1×.
  await page.evaluate(() => (window as any).__ATLAS_VCLOCK__.setRate(1));
  await page.waitForTimeout(100);
  // ... landed/focusId/mesh-active/fadeAlpha assertions unchanged (spec:205-258) ...
});
```

```ts
// HDR screenshot path: pause the render pump so the half-float
// EffectComposer buffer (PostProcessingPipeline.tsx:167) is quiescent
// before Chromium's captureScreenshot fires. Composes with the existing
// 3x/2s retry wrapper in helpers.ts:37-51.
await page.evaluate(() => (window as any).__ATLAS_VCLOCK__?.pause());
const shot = await screenshotWithRetry(page, { animations: "disabled" });
await page.evaluate(() => (window as any).__ATLAS_VCLOCK__?.resume());
```

```ts
// NOTE — do NOT warp simulationClock. It is paused under
// __ATLAS_TEST_FREEZE__ (store.ts:730), so getNow() is constant; a
// faster wall clock advances no simulated time. Warping it would
// un-freeze the scene and break boot.spec.ts byte-stable baselines.
```

#### Performance trade-offs

## Performance & cost trade-offs

**Production runtime (60 Hz loop): zero impact.** The virtual clock lives entirely in `e2e/helpers.ts` `addInitScript` — it never ships in `src/`. No new uniforms, no per-frame allocation, no React subscription. `HygPhysicsFlight` already allocates nothing per `update()` (reuses scratch vectors, hygPhysicsFlight.ts:262-268) and is unchanged. `AimLerp` likewise (aimLerp.ts:147-154). The integrator trajectory under warp is _identical_ to production because virtual frames are production-sized (16.7 ms ⇒ single 0.0167 s substep, below `MAX_DT_SUBSTEP`), so there is no risk of changing on-screen behavior to satisfy the test.

**CPU during the warped test:** the pump runs `rate` synchronous callbacks per real animation frame. At `rate=60`, each real frame does ~60 R3F render passes. The bottleneck becomes **GPU draw + shader work**, not the integrator (the integrator is ~µs of vector math). A 47 s/~2800-frame flight collapses to ~2800 real GPU frames regardless — warp removes the _idle wait between frames_ (the ~1 Hz headless throttle), not the rendering cost itself. Realistic outcome: flight wall time drops from ~47 s to a few seconds (GPU-bound), and the spec's _total_ runtime from ~95 s to well under 30 s, letting `playwright.config.ts:6`'s default 30 s timeout apply and removing the `test.setTimeout(140_000)` override.

**Memory footprint:** negligible — one closure holding a small `queue: FrameCb[]` (drained every virtual frame, so it stays at the steady-state rAF subscriber count, a handful of entries) plus four captured function refs. No buffers, no textures.

**HDR/screenshot:** pausing the pump _reduces_ peak memory pressure during capture — a quiescent renderer is not mid-allocating the `THREE.HalfFloatType` EffectComposer target (PostProcessingPipeline.tsx:167), which is the documented trigger for the `captureScreenshot` hang (postprocessing.spec.ts:45-57). Net: lower flake, no new cost. Caveat (stated as unverified): the protocol hang is a Chromium-side issue; pause-before-capture is a strong mitigation but cannot be _guaranteed_ to eliminate it, hence the retained `screenshotWithRetry` fallback.

**CI cost:** the dominant win. The hyg-focus spec's ~95 s worst case drops to seconds of GPU-bound work; across a growing flight-test suite this is the difference between a CI budget that scales linearly with flight count and one that's near-constant. Risk to watch: at very high `rate`, real-frame GPU saturation could starve Playwright's protocol channel — keep `rate` tunable (default 60) and back off if `captureScreenshot`/`evaluate` latency rises in CI.

**Determinism trade-off:** warp makes the flight _faster_ but the fixed virtual step makes it _more_ deterministic than today (no dependence on headless rAF jitter feeding variable `delta` into `MAX_DT_TOTAL`). The one place needing care is the mid-fly orientation sample — handled by momentarily dropping to `rate=1` so the sample lands at a reproducible virtual instant rather than racing the warp.

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\e2e\helpers.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\e2e\hyg-focus.spec.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\e2e\postprocessing.spec.ts

</details>

### A3 — Automated NASA JPL Horizons Fixture Pipeline

**Verdict:** `GOLD_PLATING` · **ROI score:** 3/10 · **Effort:** L · **Grounding verified:** true

**Lazy 80% alternative:** Just Step 4, minus the report script. Add a ~15-line `.github/workflows/ci.yml` that runs `npm ci` + `npm run test:run -- src/lib/orbital` on pull_request and push-to-main. That single file wires the ALREADY-EXISTING `regression.test.ts` (which already loads all 85 fixtures, transforms frames, and asserts angular/distance error against per-family TOLERANCES/MULTI_EPOCH_OVERRIDES) into CI — making the existing deviation gate actually block merges. That is ~80% of the entire blueprint's value for ~2% of its effort and zero new modules, scripts, dependencies, or cron jobs. Optionally widen scope to `npm run test:run` (whole suite) since it is pure-CPU and fast. Skip the extracted module, the drift-report JSON, the stable-write guard, the monthly Horizons cron, and the index assertion entirely.

**Architecture fit:** Hook points are real and correctly cased (verified): `orbitalEngine.calculatePosition(bodyId, date, parentId?)`, `initializeOrbitalEngine()` lives in src/lib/orbital/setup.ts re-exported by index.ts, engine entry has NO DOM deps so a Node script CAN import it, `parentId` exists on SOLAR_SYSTEM_BODIES. Render loop is genuinely untouched. WHAT BREAKS / SHOULD REUSE INSTEAD: (1) Step 2's report script requires `vite-node`, which is NOT installed (not in node_modules, not a dependency) — the blueprint's claim that it 'ships with vite' is false; this is an unbudgeted new toolchain dep. tsx is also absent. (2) Step 1 extracts helpers into a new horizonsRegression.ts — but the ONLY consumer that needs them is the new report script from Step 2; if you drop Step 2 (lazy path) the extraction has no reason to exist. regression.test.ts already owns this logic and works. (3) The proper home for a one-shot CI gate is the existing test file run via the existing `test:run` script — no new module, no new script, no new dependency. Steps 1, 2, 3, 5, 6 are all scaffolding around the test that already throws on deviation.

**Inaccuracies caught:** TWO load-bearing errors. (1) The 'index drift signal' that justifies Steps 5 and 6 does not exist. I counted: 85 fixture JSON files on disk (the digest's '86' wrongly includes index.json itself). index.json reads totalFixtures:85, its fixtures array has exactly 85 entries, and every on-disk file appears in the array exactly once — INCLUDING ceres-1890-01-01.json (index.json lines 71-75). The index is fully self-consistent. Step 6's premise ('index was last rebuilt before the historical fixture landed; totalFixtures 85 vs 86 on disk') is fabricated, and Step 5's 'a file that changes is a real upstream revision' framing inherits the same phantom. (2) `vite-node` is NOT available in the repo (verified: absent from node_modules and package.json); Step 2 cannot run as written and silently adds a dependency. Minor: generate script is 356 lines not 357, retries=4 (5 attempts) not '4 attempts'. Accurate: no CI runs test:run (only deploy.yml exists; grep of .github found zero vitest/test invocations), husky only lints pre-commit, all the cited engine/test APIs and the 'zero render-loop impact' claim are correct.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## Reality check — what the prompt got wrong, and what already exists

The brief implies we must build the Horizons pipeline from scratch. **We must not — most of it already exists and works.** Verified by reading the real files:

- `scripts/generate-horizons-fixtures.js` (357 lines) — already queries `https://ssd.jpl.nasa.gov/api/horizons.api` (VECTORS, AU-D, ECLIPTIC, parent-centric `CENTER` per body), retries 429/503 with backoff, writes `src/test/fixtures/horizons/<body>-<date>.json`, and rebuilds `index.json` from disk. 27 `TARGET_BODIES`, `DEFAULT_TEST_DATES` = the 3 canonical epochs, env overrides (`HORIZONS_DATES`, `HORIZONS_BODIES`, `HORIZONS_SKIP_EXISTING`, `HORIZONS_RATE_LIMIT_MS`).
- `scripts/derive-elements-from-fixtures.js` (303 lines) — deterministic RV→COE inversion (Vallado/Curtis) printing element blocks for `satellites.ts`/`asteroids.ts`, with correct UT→TDB epoch handling.
- `src/lib/orbital/regression.test.ts` (506 lines) — already the deviation detector: loads every fixture, runs `orbitalEngine.calculatePosition(bodyId, new Date(fixture.date), parent)`, converts the fixture into engine frame via `fixturePositionToEngineFrame` (`x, z, -y`), and asserts `angularSeparation` + distance-ratio against per-family `TOLERANCES` / `MULTI_EPOCH_OVERRIDES`.
- 86 fixtures on disk + `index.json` (`totalFixtures` recorded as 85 in the file header — already a drift signal, see Step 5).

So **A3 is not "build a pipeline" — it is "wrap the existing pipeline in CI automation + autonomous drift detection."** The genuinely missing pieces:

1. **No CI workflow runs the regression test at all.** The only workflow is `.github/workflows/deploy.yml` (Pages build). `npm run test:run` is never invoked in CI. So the existing deviation gate is invisible until a human runs it.
2. **No scheduled job re-queries Horizons** to catch upstream ephemeris revisions (JPL re-fits SPK kernels; a fixture captured 2026-04-17 can silently diverge from current Horizons truth).
3. **No machine-readable deviation report** — the test throws a vitest assertion but there is no committed artifact summarizing per-body angular/distance error, so "detects deviation autonomously" has no surfaced output.
4. **`generate-horizons-fixtures.js` overwrites fixtures in place with a fresh `generatedAt`/`apiUrl`**, so a re-fetch produces noisy git diffs even when the physics is identical — making "regenerate and detect deviation" hard to read in a PR.

### Hook points (REAL, correct-casing APIs)

- Engine entry: `orbitalEngine.calculatePosition(bodyId, date, parentId?)` and the singleton `orbitalEngine` from `src/lib/orbital/engine.ts` (re-exported by `src/lib/orbital/index.ts`). Boot via `initializeOrbitalEngine()` from `src/lib/orbital/setup.ts`.
- Result shape: `OrbitalPositionResult` (`src/lib/orbital/types.ts:74`) — `.position: THREE.Vector3` (AU), `.distanceAU`, `.model: AnalyticalModel`, `.isFallback`.
- Frame transform + error metrics already live in `regression.test.ts`: `fixturePositionToEngineFrame`, `angularSeparation`. **Reuse, do not reinvent.**
- Tolerances already encode the contract: `TOLERANCES`, `MULTI_EPOCH_OVERRIDES`, `KEPLER_COARSE_TOLERANCES`.

## Step-by-step solution

### Step 1 — Extract the deviation math into a shared, importable module (the only new "logic" file)

`regression.test.ts` currently keeps `fixturePositionToEngineFrame`, `angularSeparation`, the `HorizonsFixture` interface, and all tolerance tables file-private. The drift-report script and a GitHub Action both need them. Lift them into a new non-test module **`src/lib/orbital/horizonsRegression.ts`** that exports:

- `interface HorizonsFixture` (moved, single source)
- `fixturePositionToEngineFrame(fixture): THREE.Vector3`
- `angularSeparation(a, b): number`
- `TOLERANCES`, `MULTI_EPOCH_OVERRIDES`, `KEPLER_COARSE_TOLERANCES`, `MULTI_EPOCH_DATES`, `REPRESENTATIVE_BODIES`
- `evaluateBody(bodyId, fixture, parentId?): { angleErrorDeg, distanceErrorRatio, tol, model, isFallback, withinTolerance }` — wraps the exact comparison the test already does, calling `orbitalEngine.calculatePosition`.

Then `regression.test.ts` imports from this module (behavior identical; AGENTS.md rule 6 — update tests when behavior moves, but here it is a pure extraction so assertions stay byte-identical). This is the DRY fix that lets both the test and the report consume one comparison implementation.

### Step 2 — Add a deviation-report script: `scripts/report-horizons-drift.js`

A thin Node entry (mirrors the existing scripts' style) that:

1. `initializeOrbitalEngine()`, loads all fixtures from `src/test/fixtures/horizons/` (skipping `index.json`).
2. For each fixture calls `evaluateBody(...)` from Step 1.
3. Emits **`src/test/fixtures/horizons/drift-report.json`**: per `(bodyId, date)` the angular error, distance-ratio, the tolerance bound applied, headroom (`error / bound`), `model`, `isFallback`, and a top-level `worst` summary + `failCount`.
4. Exit code: `0` if all within tolerance, `1` if any body exceeds. This makes the report dual-use: human-readable artifact + CI gate that does not need vitest spun up.

Because this script imports TS (`engine.ts`), run it via `tsx`/`vite-node` (already have `vite`; add `vite-node` invocation `npx vite-node scripts/report-horizons-drift.ts`) — author it as `.ts` to import the engine cleanly. Register `npm run report:horizons-drift`.

### Step 3 — Make regeneration deterministic & diff-friendly (small edit to the generator)

In `scripts/generate-horizons-fixtures.js`, add a **stable-write guard** in `saveFixture`: before writing, if a fixture already exists, parse it, compare ONLY the physics fields (`position.{x,y,z}`, `velocity.{x,y,z}`) at full precision; if unchanged, **skip the write entirely** (preserve old `generatedAt`/`apiUrl`). Only rewrite when the state vector actually moved beyond a tiny epsilon (e.g. `1e-13 AU`). This turns "re-query produced no physics change" into a zero-line git diff, so a scheduled regeneration PR is readable: any file that _does_ change is a real upstream Horizons revision. Add an env flag `HORIZONS_FORCE_REWRITE=1` to bypass for intentional full refresh.

### Step 4 — CI workflow: regression gate on every PR (`.github/workflows/ci.yml`)

New workflow, **offline** (no Horizons calls — uses committed fixtures), so it is fast and hermetic:

- Triggers: `pull_request` + `push` to `main`.
- Steps: checkout → `setup-node@v4` (node 20, npm cache) → `npm ci` → `npm run test:run -- src/lib/orbital` (scopes to orbital suite incl. `regression.test.ts`) → `npm run report:horizons-drift` → upload `drift-report.json` as an artifact.
- This is the "detect deviation from the analytical engine autonomously" gate: any fixture-vs-engine divergence beyond tolerance fails the PR. It runs the EXISTING `regression.test.ts` — we are wiring it into CI, not authoring new assertions.

### Step 5 — Scheduled Horizons refresh workflow (`.github/workflows/horizons-refresh.yml`)

This is the genuinely new "automated NASA JPL Horizons pipeline" piece:

- Trigger: `schedule` (monthly cron, e.g. `0 6 1 * *`) + `workflow_dispatch`.
- Steps: checkout → node setup → `npm ci` → `node scripts/generate-horizons-fixtures.js` (re-queries Horizons; Step 3 makes unchanged files no-ops) → `npm run test:run -- src/lib/orbital` → `npm run report:horizons-drift`.
- **Outcome branching** using `peter-evans/create-pull-request@v6`:
  - If `git status` shows changed fixtures AND the regression suite still passes → open an auto-PR "chore(fixtures): refresh Horizons baselines" with the `drift-report.json` diff in the body. Human reviews the (now-readable, Step 3) physics delta.
  - If the suite FAILS after refresh → the upstream ephemeris moved beyond our analytical engine's tolerance: open an **issue** (`actions/github-script`) tagged `orbital-drift` containing the worst-N rows from `drift-report.json`, so it is triaged rather than silently merged.
- Network resilience: the generator already retries 429/503; set `HORIZONS_RATE_LIMIT_MS=1200` (its default) to stay polite. Wrap the generate step with `continue-on-error: false` but guard the whole job so a Horizons outage (all fetches return `null`, producing no file changes) is a clean no-op, not a red build — detect "zero fixtures changed AND fetch errors logged" and `exit 0` with a notice.

### Step 6 — Reconcile the index drift + add an index integrity assertion

`index.json` header says `totalFixtures: 85` but the brief/disk count is 86 (the `ceres-1890-01-01.json` historical fixture is the +1, and `bodies` array lists 28 but `index.json` dates list 4). Add one test to `regression.test.ts` (or the new module's test) asserting `index.json.totalFixtures === (files on disk minus index.json)` and that every on-disk fixture appears in `index.fixtures`. `rebuildIndexFromDisk()` already produces the correct count — the stale `85` just means the index was last rebuilt before the historical fixture landed. The scheduled job re-running the generator will self-heal it; the new assertion prevents recurrence.

### Step 7 — Docs sync (CLAUDE.md mandated gate)

Update the wave/STATUS hot-path doc to point at the two new workflows + the report script, then run `npm run docs:check` (the mandated final gate) before commit. One canonical mention, others link (L38 rule).

## Why this is the elegant minimum

- Zero new physics code — the comparison, frame transform, and tolerances already exist and are battle-tested; we extract once (Step 1) and reuse.
- The PR gate (Step 4) and the refresh job (Step 5) are cleanly separated: PRs are hermetic/offline/fast; only the cron job touches the flaky external API. This respects AGENTS.md rule 15 (don't make every PR depend on a 3rd-party network).
- Step 3 is the keystone that makes autonomous regeneration _reviewable_ instead of noise.

#### Code draft

```typescript
// ── Step 1: src/lib/orbital/horizonsRegression.ts (NEW — extracted, not invented) ──
import * as THREE from "three";
import { orbitalEngine } from "./engine";
import type { AnalyticalModel } from "./types";

export interface HorizonsFixture {
  bodyId: string;
  date: string;
  center: string;
  referenceFrame: string;
  source: string;
  position: { x: number; y: number; z: number; unit: string };
  velocity: { x: number; y: number; z: number; unit: string };
}

// Frame transform identical to current regression.test.ts:266-272
export function fixturePositionToEngineFrame(
  f: HorizonsFixture
): THREE.Vector3 {
  return new THREE.Vector3(f.position.x, f.position.z, -f.position.y);
}

export function angularSeparation(a: THREE.Vector3, b: THREE.Vector3): number {
  const c = a.dot(b) / (a.length() * b.length());
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

// TOLERANCES / MULTI_EPOCH_OVERRIDES / KEPLER_COARSE_TOLERANCES moved here verbatim.
export interface BodyDeviation {
  bodyId: string;
  date: string;
  angleErrorDeg: number;
  distanceErrorRatio: number;
  angleBoundDeg: number;
  distanceBoundRatio: number;
  headroom: number; // max(angleErr/bound, distErr/bound)
  model: AnalyticalModel;
  isFallback: boolean;
  withinTolerance: boolean;
}

export function evaluateBody(
  fixture: HorizonsFixture,
  parentId: string | undefined,
  multiEpoch: boolean
): BodyDeviation {
  const r = orbitalEngine.calculatePosition(
    fixture.bodyId,
    new Date(fixture.date),
    parentId
  );
  const expected = fixturePositionToEngineFrame(fixture);
  const angleErrorDeg = angularSeparation(r.position, expected);
  const distanceErrorRatio =
    Math.abs(r.distanceAU - expected.length()) / expected.length();
  const tol =
    (multiEpoch ? MULTI_EPOCH_OVERRIDES[fixture.bodyId] : undefined) ??
    TOLERANCES[fixture.bodyId] ??
    KEPLER_COARSE_TOLERANCES;
  const headroom = Math.max(
    angleErrorDeg / tol.maxAngularErrorDeg,
    distanceErrorRatio / tol.maxDistanceErrorRatio
  );
  return {
    bodyId: fixture.bodyId,
    date: fixture.date,
    angleErrorDeg,
    distanceErrorRatio,
    angleBoundDeg: tol.maxAngularErrorDeg,
    distanceBoundRatio: tol.maxDistanceErrorRatio,
    headroom,
    model: r.model,
    isFallback: r.isFallback,
    withinTolerance: headroom < 1,
  };
}
```

```typescript
// ── Step 2: scripts/report-horizons-drift.ts (NEW) — run via `vite-node` ──
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeOrbitalEngine } from "../src/lib/orbital/index";
import {
  evaluateBody,
  MULTI_EPOCH_DATES,
  type HorizonsFixture,
  type BodyDeviation,
} from "../src/lib/orbital/horizonsRegression";
import { SOLAR_SYSTEM_BODIES } from "../src/data/celestialBodies";

const DIR = fileURLToPath(
  new URL("../src/test/fixtures/horizons/", import.meta.url)
);
const parentOf = new Map(SOLAR_SYSTEM_BODIES.map((b) => [b.id, b.parentId]));

initializeOrbitalEngine();
const rows: BodyDeviation[] = readdirSync(DIR)
  .filter(
    (f) =>
      f.endsWith(".json") && f !== "index.json" && f !== "drift-report.json"
  )
  .map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")) as HorizonsFixture)
  .map((fx) =>
    evaluateBody(
      fx,
      parentOf.get(fx.bodyId),
      MULTI_EPOCH_DATES.includes(fx.date as never)
    )
  );

const failures = rows.filter((r) => !r.withinTolerance);
const report = {
  generatedAt: new Date().toISOString(),
  total: rows.length,
  failCount: failures.length,
  worst: [...rows].sort((a, b) => b.headroom - a.headroom).slice(0, 10),
  failures,
  rows,
};
writeFileSync(join(DIR, "drift-report.json"), JSON.stringify(report, null, 2));
console.log(
  `Horizons drift: ${rows.length} fixtures, ${failures.length} over tolerance`
);
process.exit(failures.length > 0 ? 1 : 0);
```

```js
// ── Step 3: patch scripts/generate-horizons-fixtures.js — stable-write guard ──
const PHYS_EPSILON = 1e-13;
function physicsUnchanged(prev, next) {
  const p = prev.position,
    q = next.position,
    pv = prev.velocity,
    qv = next.velocity;
  return ["x", "y", "z"].every(
    (k) =>
      Math.abs(p[k] - q[k]) < PHYS_EPSILON &&
      Math.abs(pv[k] - qv[k]) < PHYS_EPSILON
  );
}
function saveFixture(fixture) {
  if (!fixture) return false;
  const filepath = path.join(
    FIXTURES_DIR,
    `${fixture.bodyId}-${fixture.date.split("T")[0]}.json`
  );
  if (!process.env.HORIZONS_FORCE_REWRITE && fs.existsSync(filepath)) {
    const prev = JSON.parse(fs.readFileSync(filepath, "utf8"));
    if (physicsUnchanged(prev, fixture)) {
      // identical physics → no noisy diff
      console.log(`    Unchanged (physics-stable): ${path.basename(filepath)}`);
      return false;
    }
  }
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(fixture, null, 2));
  return true;
}
```

```yaml
# ── Step 4: .github/workflows/ci.yml (NEW — offline regression gate) ──
name: CI
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  orbital-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run test:run -- src/lib/orbital # runs regression.test.ts (offline)
      - run: npm run report:horizons-drift # writes drift-report.json, exit 1 on breach
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          {
            name: horizons-drift-report,
            path: src/test/fixtures/horizons/drift-report.json,
          }
```

```yaml
# ── Step 5: .github/workflows/horizons-refresh.yml (NEW — scheduled re-query) ──
name: Horizons Fixture Refresh
on:
  schedule: [{ cron: "0 6 1 * *" }] # monthly
  workflow_dispatch: {}
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - name: Re-query Horizons (unchanged physics = no-op write)
        env: { HORIZONS_RATE_LIMIT_MS: "1200" }
        run: node scripts/generate-horizons-fixtures.js
      - name: Regression gate against refreshed baselines
        id: gate
        run: npm run test:run -- src/lib/orbital
        continue-on-error: true
      - run: npm run report:horizons-drift
        continue-on-error: true
      - name: Open PR when baselines moved but engine still in tolerance
        if: steps.gate.outcome == 'success'
        uses: peter-evans/create-pull-request@v6
        with:
          branch: chore/horizons-refresh
          title: "chore(fixtures): refresh Horizons baselines"
          body-path: src/test/fixtures/horizons/drift-report.json
          commit-message: "chore(fixtures): refresh Horizons baselines\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
      - name: File drift issue when engine breaks tolerance
        if: steps.gate.outcome == 'failure'
        uses: actions/github-script@v7
        with:
          script: |
            const r = require('./src/test/fixtures/horizons/drift-report.json');
            const top = r.worst.slice(0,5).map(w =>
              `- **${w.bodyId}@${w.date.slice(0,10)}** ${w.angleErrorDeg.toFixed(2)}° / ` +
              `${(w.distanceErrorRatio*100).toFixed(2)}% (bound ${w.angleBoundDeg}°/${(w.distanceBoundRatio*100)}%)`
            ).join('\n');
            await github.rest.issues.create({ ...context.repo,
              title: `Horizons drift: ${r.failCount} bodies exceed engine tolerance`,
              labels: ['orbital-drift'],
              body: `Scheduled Horizons refresh diverged from the analytical engine.\n\n${top}` });
```

```jsonc
// ── package.json scripts additions ──
"refresh:horizons": "node scripts/generate-horizons-fixtures.js",
"report:horizons-drift": "vite-node scripts/report-horizons-drift.ts"
```

#### Performance trade-offs

## Render loop (60 Hz) — zero impact

None of this touches runtime code paths. `engine.ts`, `keplerProvider.ts`, `analyticalProvider.ts` are unchanged. Step 1 only _moves_ already-file-private helpers and tolerance tables out of `regression.test.ts` into a sibling module that is imported by tests and scripts — it is never bundled into the app (Vite tree-shakes it; nothing in `src/components` imports it). No new allocations in `calculatePosition`, no change to the position cache (`MAX_POSITION_CACHE_ENTRIES = 2000`), no effect on `useFrame` callers (`Planet.tsx`, `Starfield.tsx`).

## CPU / memory (script + CI only)

- `report-horizons-drift.ts`: 86 fixtures × one `orbitalEngine.calculatePosition` each. Each call is a VSOP87/Kepler series eval (sub-millisecond); whole report < ~100 ms wall + JSON write of a few hundred KB. Engine's per-tick cache makes repeat dates cheap. Memory: all 86 fixtures (~few hundred bytes each) + 86 `BodyDeviation` rows — trivial (< 1 MB).
- The stable-write guard (Step 3) adds one extra `readFileSync` + parse per already-existing fixture during regeneration (~86 small reads). Negligible vs. the network fetches that dominate, and it _saves_ disk writes + git churn on unchanged physics.

## CI cost

- **PR gate (`ci.yml`)**: offline. `npm ci` (~30–60 s cached) + scoped `test:run -- src/lib/orbital` (orbital suite is pure CPU, a handful of seconds — the regression `describe` blocks generate 28 bodies × 3 epochs ≈ 84 fast assertions) + report script. Total well under 2 min per run. No external network → hermetic, no flaky-API failures blocking merges. This is the deliberate split: PRs never call Horizons.
- **Scheduled refresh (`horizons-refresh.yml`)**: the only network cost, once per month. 27 bodies × 3 epochs = 81 Horizons requests at the existing 1200 ms rate-limit ≈ ~100 s of polite throttled fetching + retries; the generator's exponential backoff (2–3 s × attempt) already absorbs 429/503. Free GitHub Actions minutes (public repo) or a few cents on a private repo. `peter-evans/create-pull-request`/`github-script` are standard, no self-hosted runner.

## Risk / tradeoffs to flag (AGENTS.md rule 8)

- **Horizons upstream re-fits**: by design, a refresh PR that changes fixtures is a _signal_, not a bug — but a maintainer must review it (we route engine-breaking drift to a labeled issue, tolerable drift to a PR, so triage is automatic).
- **`index.json` staleness (totalFixtures 85 vs 86 on disk)** is real and now caught by the Step 6 assertion; the refresh job's `rebuildIndexFromDisk()` self-heals it.
- **`vite-node` dependency**: `report-horizons-drift.ts` imports TS engine code, so it needs `vite-node` (or `tsx`). `vite` is already a devDependency; `vite-node` ships with it but verify it resolves in CI, else add `tsx` explicitly. This is the one new toolchain assumption — called out rather than assumed.
- Hyperbolic-comet edge (digest issue B1) is _out of scope_ for A3 — no comet fixtures exist; the pipeline only covers the 27 bound bodies, so the Kepler-ellipse assumption is not exercised here.

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\lib\orbital\horizonsRegression.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\lib\orbital\regression.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\scripts\report-horizons-drift.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\scripts\generate-horizons-fixtures.js, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\.github\workflows\ci.yml, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\.github\workflows\horizons-refresh.yml, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\package.json, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\test\fixtures\horizons\index.json

</details>

### B1 — Dynamic Semantic Orbit Trails (shader fade-tail) for Atlas Orbital

**Verdict:** `GOLD_PLATING` · **ROI score:** 3/10 · **Effort:** L · **Grounding verified:** true

**Lazy 80% alternative:** The "spaghetti bowl" overdraw the brief targets is ALREADY solved by useOrbitalSalience + the per-frame opacity write (Planet.tsx:818-839), which fades whole background ellipses to 0.02-0.08. If deeper decluttering is wanted, the laziest 80% is: (a) lower the salience floor for non-context bodies, or (b) in the existing useFrame, gate orbitLineRef.current.visible on the distance signal already computed (distance vs fadeStart) so far/background orbits drop out entirely in deep views. Zero new shader, zero new attribute, zero geometry-lifecycle code, zero new store flag — a 3-5 line tweak inside a loop that already has every signal in scope. A trailing-comet aesthetic, if truly desired, is a NICE_TO_HAVE that does not justify a new GLSL block + interleaved instance attribute + math module + tests.

**Architecture fit:** Mechanically it FITS and would compile. Verified: (1) shader.uniforms IS material.uniforms for a ShaderMaterial (three.module.js:7533-7549 getUniforms returns material.uniforms for non-builtin types; LineMaterial extends ShaderMaterial), so writing uHeadParam in onBeforeCompile and updating it from useFrame genuinely works — the existing material.uniforms?.opacity path (Planet.tsx:835) confirms this. (2) The instanceTrailParamStart/End interleaved attribute correctly mirrors LineSegmentsGeometry.setColors (lines 46-55) and the position.y<0.5?Start:End select is LineMaterial's own pattern (line 95). (3) Folding into the single useGaiaSdfLinePatch onBeforeCompile (not a 2nd hook) is the right call — a 2nd hook would fight over the gl_FragColor replace target and need its own sentinel.\n\nWhat it should REUSE instead of new code: useOrbitalSalience already owns the "how visible is this orbit" decision; the per-frame opacity loop already has distance/fadeStart/focusId/orbitSalience in scope. The decluttering value is already delivered there.\n\nWhat's fragile: the param buffer must be re-attached every time drei rebuilds LineGeometry (per orbitDateBucket via the orbitPoints memo, Planet.tsx:715-761), and the buffer length must exactly equal the geometry's instance count = points.length-1 = segments (integration.ts loops j<=segments → segments+1 points → segments instances). The proposal passes a hand-supplied `segments` rather than reading the geometry's real instanceCount, and never specifies the re-attach lifecycle on geometry recreation. Off-by-one or stale-attribute risk under HMR/bucket-flip.

**Inaccuracies caught:** Mostly accurate grounding, but two substantive errors. (1) PEDAGOGICAL: the proposal parameterizes the tail by true anomaly ν (correct, since the polyline is uniform in ν per keplerProvider.ts:140), but then sells it as a "comet-like history tail" / "where the body recently was". A mask uniform in ν is NOT a temporal history — for the eccentric bodies actually in the registry (Sedna e=0.85 line 1585, Eris, Gonggong e=0.5 line 1441 — all confirmed present and bound) the body spends most of its TIME near apoapsis but the ν-uniform tail races near periapsis and crawls near apoapsis, so the visual tail length misrepresents recent motion. For a teaching tool that is actively misleading, not just imperfect. A true history tail would need time-stepping (which the brief's own Step-6 honesty note half-acknowledges but the head-tracking framing then ignores). (2) DEAD CODE: Step 6's e≥1 fallback (uTrailEnabled=0 for unbound conics) is unreachable — the proposal itself states no registry body carries e≥1, and I confirmed all distant bodies are bound. The clamp to 0.999 in meanAnomalyToTrueAnomalyNormalized is the only part that ever runs; the whole hyperbolic-guard paragraph is scope theater. (3) Minor: claim "~40 bodies in the catalogue" is plausible but unverified here. Everything about file paths, the SDF patch sentinel mechanism, getOsculatingElements(engine.ts:258), and the alignment-test invariant being geometry-only (orbitAlignment.test.ts asserts point-to-polyline distance, untouched by an additive attribute) checks out.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## Grounding corrections to the brief (read before designing)

I read the real files. Several prompt assumptions are wrong; the design below uses verified casing/symbols:

- The orbit polyline is **not** time-stepped. `getOrbitalDisplayOrbitPoints` (real path `src/lib/orbital/integration.ts:51`) sweeps **true anomaly ν from 0→360°** via `generateOsculatingEllipsePoints(elements, segments)` (`src/lib/orbital/keplerProvider.ts:131`), then maps each AU point through `AstroPhysics.mapPhysicalPositionToDisplay` (`src/lib/astrophysics.ts:601`). The old prose about `getDisplayOrbitPoints` time-stepping a period (`astrophysics.ts:634`) is a _legacy/secondary_ path the renderer does NOT use. The fade-tail must therefore be parameterized by **ν (true anomaly), not time**.
- The line is a drei `<Line>` (Line2 + three-stdlib `LineMaterial`), wrapped by `PlanetOrbitLine` (`src/components/canvas/planet/PlanetOrbitLine.tsx`) with `useGaiaSdfLinePatch` already injecting an `onBeforeCompile` block. There is **no** custom `ShaderMaterial` for orbits to reuse from the starfield — the `OrbitLineMaterial` type in `Planet.tsx:65` is just `THREE.Material & {opacity, uniforms?}`. The full-static-ellipse opacity is already driven per-frame in `Planet.tsx:818-839`.
- `orbitSalience` (`useOrbitalSalience`, `src/components/canvas/planet/useOrbitalSalience.ts`) and `declutterOrbits`/`showOrbits` (`src/store.ts:70-71`) already implement _declutter by fading whole ellipses_. B1 should compose with this, not replace it: salience stays the global "how visible is this orbit at all" gain; the trail is a _spatial_ mask on top.
- **Comet/hyperbolic caveat is real** (digest Issue B1): `calculatePhysicalLocalPositionAU` and `generateOsculatingEllipsePoints` both assume a bound ellipse (e<1) and there is no hyperbolic solver. Under log-distance remap (`mapDidacticHeliocentricDistance`) the direction is normalized then re-scaled, so a true conic is distorted in didactic mode regardless. **The fade-tail does not fix this and must not pretend to** — see Step 6 for the explicit guard.

The hard invariant I must preserve: `src/lib/orbital/orbitAlignment.test.ts` asserts the rendered body lies on the exact polyline from `getOrbitalDisplayOrbitPoints`. **So I must not reorder, drop, or move any polyline vertex.** The trail is implemented as (a) an _additive_ per-vertex attribute + (b) a head-position uniform + (c) a fragment fade — geometry stays byte-identical.

## Design: parametric head + wrap-aware tail mask

The body's current location on the swept ellipse is a single scalar: its current true anomaly νₙₒw ∈ [0,1) (normalized). Each polyline vertex j already corresponds to ν = j/segments (`keplerProvider.ts:140`). So:

1. Tag every vertex with `aTrailParam = j/segments` (the same fraction the sweep uses).
2. Each frame, compute the head fraction `uHeadParam = νₙₒw/2π` from the body's osculating mean anomaly M (already available — `OsculatingElements.M`, `types.ts:64`), converted M→E→ν.
3. In the fragment shader, fade alpha by the **wrap-aware angular distance behind the head along the sweep direction**: vertices in the arc _just behind_ the body are bright; alpha decays to ~0 over `uTrailLength` (fraction of the orbit), and the arc _ahead_ of the body is fully suppressed. This yields a comet-like history tail.

This is a pure shader mask multiplied into the existing alpha — it composes cleanly with `useGaiaSdfLinePatch`'s perpendicular SDF feather and with the per-frame `orbitSalience` opacity in `Planet.tsx`.

### Step 1 — Pure math module (testable, no Three): `src/components/canvas/planet/orbitTrailMath.ts`

New file (no existing equivalent; mirrors the `lineSdfMath.ts` pattern of "pure TS + Vitest pins beside the GLSL"). Exports:

- `meanAnomalyToTrueAnomalyNormalized(Mdeg, e): number` — Newton-Raphson on Kepler's equation (reuse the 5-iteration convention already used in `astrophysics.ts:339` `calculatePhysicalLocalPositionAU`; do NOT invent a new solver — extract/share if one is exported, otherwise inline the identical 5-iter loop) → E → ν, return `ν/(2π)` in [0,1).
- `wrapTrailMask(param, head, trailLen): number` — pure mirror of the GLSL fade so it can be unit-pinned: `d = fract(head - param)` (distance _behind_ head along +ν); `mask = d <= trailLen ? smoothstep(1,0, d/trailLen) : 0`. Returns [0,1].
- Constants `ORBIT_TRAIL_LENGTH_DEFAULT` (e.g. `0.45` of an orbit) and `ORBIT_TRAIL_MIN_FLOOR` (small residual so the full ellipse never fully vanishes when the user wants context — tunable, default `0.0`).

### Step 2 — GLSL injection hook: `src/components/canvas/planet/useOrbitTrailPatch.ts`

New hook modeled 1:1 on `useGaiaSdfLinePatch.ts` (same sentinel-tag re-entry guard for StrictMode/HMR — this is mandatory, the existing patch documents the N-stack bug at lines 83-107). It takes the same `lineRef` plus a `paramsRef` (uniforms). It:

- Adds `attribute float aTrailParam; varying float vTrailParam;` to the **vertex** shader and `vTrailParam = aTrailParam;` (the attribute must be an _instance_ attribute on the LineGeometry — see Step 3 — because Line2 is instanced; declare it via `InstancedBufferAttribute` with `instanceTrailParamStart/End` following the `instanceColorStart/End` precedent in `LineMaterial.js:90-95`, OR more simply pigg-back on the existing `vUv.x` along-segment coordinate — see Step 3 note).
- Adds uniforms `uHeadParam`, `uTrailLength`, `uTrailEnabled` to `shader.uniforms` and keeps a live reference so `Planet.tsx`'s `useFrame` can write `uHeadParam` per frame without a recompile.
- Injects the fade **into the same `gl_FragColor = diffuseColor;` replacement point** the SDF patch uses, but ordered so both apply. To avoid two hooks fighting over one replace target, **fold the trail block into `useGaiaSdfLinePatch` instead of a second hook** (cleaner — one `onBeforeCompile`, one sentinel). I recommend extending the existing patch rather than adding a parallel one (AGENTS.md rule 3: smallest change; rule 11: reuse). Concretely: add the trail GLSL right after the SDF block, before the final `gl_FragColor` assignment:
  `if (uTrailEnabled > 0.5) { diffuseColor.a *= trailMask(vTrailParam, uHeadParam, uTrailLength); }`

### Step 3 — Per-vertex param attribute on the geometry

drei `<Line>` builds a `LineGeometry` (`three/examples/jsm/lines/LineGeometry.js`) which stores per-vertex data as **interleaved instance attributes** (`instanceColorStart/End`, verified `LineSegmentsGeometry.js:134 setColors`). The robust, version-safe path: in `PlanetOrbitLine`, after drei mounts the Line2, read `line.geometry` and call `setColors`-style population — but `setColors` only covers color. For an arbitrary scalar we add our own interleaved start/end instance attribute mirroring `setColors`'s construction. **Simpler alternative that avoids touching geometry internals:** the LineMaterial already exposes `vUv.x` which runs 0→1 _per segment_, which is NOT a global param — so it cannot be used directly. Therefore the param attribute is required. Implement a tiny helper `setLineTrailParams(geometry, segments)` in `useOrbitTrailPatch.ts` that builds `Float32Array` start/end buffers (length = segment count, value = j/segments) and assigns `instanceTrailParamStart/End` as `InterleavedBufferAttribute`s, exactly paralleling `LineSegmentsGeometry.setColors`. The vertex shader then mirrors the `position.y < 0.5 ? Start : End` select used for color (`LineMaterial.js:95`).

### Step 4 — Wire head-param into the existing per-frame loop (`Planet.tsx`)

The orbit opacity is already updated every frame in `Planet.tsx:779-840` inside the existing `useFrame` that reads `simulationClock.getNow()`. Extend that exact block (no new `useFrame`): after computing `opacity`, also compute `uHeadParam` once per frame:

- Get osculating M: `orbitalEngine.getOsculatingElements(body.id, simNow)` → `{ M, e }` (already a public method, `engine.ts:258`). Cheap; no allocation if we reuse a scratch.
- `head = meanAnomalyToTrueAnomalyNormalized(M, e)`.
- Write `material.uniforms.uHeadParam.value = head` (the uniform exists once the patched shader compiles; guard with the same `material.uniforms?.opacity` existence check already at `Planet.tsx:835`).
- `uTrailEnabled` is set from a new store flag (Step 7) and a "deep view" predicate (Step 5).

### Step 5 — "Deep view" activation (only fade-tail in deep/cluttered views)

The brief says replace static ellipses **in deep views**. Reuse the existing distance signal already computed in the same loop: `distance = camera.position.distanceTo(worldPos)` and `fadeStart/fadeEnd` (`Planet.tsx:815-816`). Define deep-view as "camera far enough that the full ellipse is in declutter territory" — i.e. gate `uTrailEnabled` on `declutterOrbits && orbitSalience < 1 && body.id !== focusId`. The focused body keeps its full ellipse (it's the user's subject); siblings/background bodies get the trail. This piggybacks entirely on signals already in scope — no new distance math, no new re-render.

### Step 6 — Eccentric/comet guard (the stated limitation)

For high-e bodies under log scaling the polyline is already a distorted conic; a tail does not worsen it but should degrade predictably:

- Clamp `e` used in M→ν to `< 0.999` in `orbitTrailMath` (prevents Newton-Raphson divergence near parabolic). If the registry ever carries e≥1 (currently none do — all Kepler-only bodies are bound), fall back to `uTrailEnabled = 0` (full static ellipse) for that body, since the parametric head is undefined for an unbound conic.
- Document in the module header that B1 is a _visual declutter mask over the existing bound-ellipse polyline_, not a fix for the hyperbolic-solver gap (which is a separate engine concern in `calculatePhysicalLocalPositionAU`). This keeps the scope honest per AGENTS.md rule 8.

### Step 7 — Store flag + UI (optional, thin)

Add `orbitTrailMode: boolean` (default true) beside `declutterOrbits` in `src/store.ts:71` and a toggle action beside `toggleDeclutterOrbits` (`store.ts:377`). Surface it in `LayersPanel.tsx` next to the existing orbit toggles (reuse the inline ChoiceButton/Toggle pattern there — do not build a new primitive). If you want zero UI surface for v1, hardcode `orbitTrailMode = true` and skip this step; the deep-view gate already prevents it from touching focused/overview ellipses.

### Step 8 — Tests

- `src/components/canvas/planet/orbitTrailMath.test.ts` (new): pin `meanAnomalyToTrueAnomalyNormalized` against known E.g. e=0 ⇒ ν=M; circular orbit head fraction == M/360; and `wrapTrailMask` boundary cases (head==param ⇒ 1, exactly trailLen behind ⇒ ~0, ahead of head ⇒ 0, wrap across 0/1 seam). Mirror the `lineSdfMath.test.ts` style.
- **Do not modify** `orbitAlignment.test.ts` — verify it still passes (geometry unchanged). Run `npm run test:run -- orbital` and `-- orbitTrail`.
- Runtime smoke per the MEMORY browser-console rule: Claude-Preview, boot ~20s, zoom out to a deep view, confirm trailing tails render and the GLSL compiled (no black orbits / no "no matching overloaded function").

## Why this is the elegant minimum

One attribute + two uniforms + one GLSL block folded into the patch that already exists. No new material, no new render pass, no geometry churn, no per-frame allocation, no change to the alignment invariant. It composes with salience-declutter rather than duplicating it.

#### Code draft

```ts
// src/components/canvas/planet/orbitTrailMath.ts  (NEW — pure, Vitest-pinned)
const D2R = Math.PI / 180;

/** Kepler M(deg)+e -> normalized true anomaly nu/(2pi) in [0,1).
 *  Same 5-iteration Newton-Raphson convention as
 *  AstroPhysics.calculatePhysicalLocalPositionAU (astrophysics.ts:339). */
export function meanAnomalyToTrueAnomalyNormalized(
  Mdeg: number,
  e: number
): number {
  const ec = Math.min(Math.max(e, 0), 0.999); // Step-6 clamp
  const M = (((Mdeg % 360) + 360) % 360) * D2R;
  let E = M;
  for (let k = 0; k < 5; k++) {
    E = E - (E - ec * Math.sin(E) - M) / (1 - ec * Math.cos(E));
  }
  const nu = Math.atan2(Math.sqrt(1 - ec * ec) * Math.sin(E), Math.cos(E) - ec);
  return (((nu / (2 * Math.PI)) % 1) + 1) % 1;
}

export const ORBIT_TRAIL_LENGTH_DEFAULT = 0.45; // fraction of orbit
export const ORBIT_TRAIL_FLOOR = 0.0;

/** Wrap-aware mask: bright at head, ->0 trailLen behind, 0 ahead.
 *  GLSL mirror lives in the onBeforeCompile block below. */
export function wrapTrailMask(
  param: number,
  head: number,
  trailLen: number
): number {
  const d = (((head - param) % 1) + 1) % 1; // distance BEHIND head along +nu
  if (d > trailLen) return ORBIT_TRAIL_FLOOR;
  const t = d / trailLen; // 0 at head .. 1 at tail end
  const s = t * t * (3 - 2 * t); // smoothstep
  return Math.max(ORBIT_TRAIL_FLOOR, 1 - s);
}
```

```ts
// Extend src/components/canvas/planet/useGaiaSdfLinePatch.ts
// (fold trail into the SINGLE existing onBeforeCompile — no 2nd hook).
// 1) Add to newPatched(shader): inject attribute + uniforms.
shader.uniforms.uHeadParam = { value: 0 };
shader.uniforms.uTrailLength = { value: ORBIT_TRAIL_LENGTH_DEFAULT };
shader.uniforms.uTrailEnabled = { value: 0 };
paramsRef.current = shader.uniforms; // expose to Planet.tsx useFrame

shader.vertexShader = shader.vertexShader.replace(
  "void main() {",
  /* glsl */ `
    attribute float instanceTrailParamStart;
    attribute float instanceTrailParamEnd;
    varying float vTrailParam;
    void main() {
      vTrailParam = ( position.y < 0.5 ) ? instanceTrailParamStart : instanceTrailParamEnd;
  `
);

shader.fragmentShader = shader.fragmentShader
  .replace(
    "void main() {",
    /* glsl */ `
    uniform float uHeadParam; uniform float uTrailLength; uniform float uTrailEnabled;
    varying float vTrailParam;
    void main() {
  `
  )
  .replace(
    "gl_FragColor = diffuseColor;",
    /* glsl */ `
    { // existing SDF block stays above this; trail mask multiplies after
      if (uTrailEnabled > 0.5) {
        float d = fract(uHeadParam - vTrailParam);     // behind head along +nu
        float m = (d <= uTrailLength)
          ? (1.0 - smoothstep(0.0, 1.0, d / uTrailLength))
          : 0.0;
        diffuseColor.a *= m;
      }
    }
    gl_FragColor = diffuseColor;
  `
  );
```

```ts
// Helper in the patch hook: build interleaved per-vertex param attribute,
// paralleling LineSegmentsGeometry.setColors (jsm/lines/LineSegmentsGeometry.js:134).
function setLineTrailParams(geom: LineGeometry, segments: number) {
  const start = new Float32Array(segments);
  const end = new Float32Array(segments);
  for (let j = 0; j < segments; j++) {
    start[j] = j / segments; // matches keplerProvider sweep nu=j/seg
    end[j] = (j + 1) / segments;
  }
  const buf = new THREE.InstancedInterleavedBuffer(
    interleave(start, end),
    2,
    1
  ); // [start,end] per instance
  geom.setAttribute(
    "instanceTrailParamStart",
    new THREE.InterleavedBufferAttribute(buf, 1, 0)
  );
  geom.setAttribute(
    "instanceTrailParamEnd",
    new THREE.InterleavedBufferAttribute(buf, 1, 1)
  );
}
```

```tsx
// src/components/canvas/Planet.tsx — extend the EXISTING useFrame block
// already at lines 779-840 (no new useFrame). After `opacity *= orbitSalience`:
const mat = orbitLineRef.current.material as OrbitLineMaterial;
if (mat.uniforms?.uHeadParam) {
  const deepView =
    declutterOrbits &&
    orbitSalience < 1 &&
    body.id !== focusId &&
    body.type !== "star";
  mat.uniforms.uTrailEnabled.value = showOrbitTrail && deepView ? 1 : 0;
  if (deepView) {
    const osc = orbitalEngine.getOsculatingElements(body.id, simNow); // engine.ts:258
    if (osc) {
      mat.uniforms.uHeadParam.value = meanAnomalyToTrueAnomalyNormalized(
        osc.M,
        osc.e
      );
    }
  }
}
```

```ts
// src/store.ts — add beside declutterOrbits (line 71) / toggleDeclutterOrbits (377)
showOrbitTrail: boolean;                 // default: true (line ~269)
toggleOrbitTrail: () => set((s) => ({ showOrbitTrail: !s.showOrbitTrail })),
```

#### Performance trade-offs

## CPU (60 Hz loop)

- **Per body, per frame:** one extra `orbitalEngine.getOsculatingElements(body.id, simNow)` call (`engine.ts:258`) + one `meanAnomalyToTrueAnomalyNormalized` (5 Newton iterations = ~15 flops). This runs only when `deepView` is true (decluttered, non-focused, non-star bodies), so the focused subject and overview majors skip it. With ~40 bodies in the catalogue, worst case ~40 osculating-element evals/frame. `getOsculatingElements` for Kepler bodies is a few trig ops (`keplerProvider.ts:69`); for VSOP87 it is heavier but is **already computed for position each frame** via `resolveOrbitalDisplayPosition` at `Planet.tsx:770` — consider memoizing M from that existing call to avoid a second analytical evaluation (the elements are already on `OrbitalPositionResult.elements`). If you thread the already-computed result through, the marginal CPU cost is ~0. **Recommendation:** reuse `result.elements.M` from the position call instead of a second `getOsculatingElements`, eliminating the only real CPU add.
- No new `useFrame`; folds into the existing one (`Planet.tsx:763`). No per-frame allocation (uniforms are mutated in place; clamp/trig are scalar).
- React re-render cost: **zero** — head param is written to a uniform inside `useFrame`, never to the store. The `orbitPoints` memo (`Planet.tsx:715`) and its `ORBIT_POINTS_CACHE` are untouched.

## GPU

- One float varying (`vTrailParam`) + 3 scalar uniforms + ~6 ALU ops (one `fract`, one `smoothstep`, a compare, a multiply) per fragment, added to the existing line fragment shader. Negligible against the SDF block already there. No new texture, no new draw call, no new pass — it reuses the same Line2 draw.
- Blending unchanged (drei Line `transparent`+`depthWrite={false}`, `PlanetOrbitLine.tsx:42-43`). Because alpha→0 in the suppressed arc, the _visible_ fill rate of background orbits **drops** (most of each ellipse is now near-transparent), which is a net win for the "spaghetti bowl" overdraw the brief targets — fewer blended transparent fragments composited per frame in deep views.

## Memory

- Per orbit: two `Float32Array(segments)` interleaved into one buffer. Segments default 1024–4096 (`orbitQuality.ts:21-26`), focused 16384. At 4096 that is ~32 KB/orbit; across ~40 orbits ≈ 1.3 MB GPU-side, one-time, rebuilt only when the polyline is regenerated (per `orbitDateBucket`, i.e. rarely). The param buffer can be cached/reused exactly like `ORBIT_POINTS_CACHE` since it depends only on `segments`, not on date — **build it once per segment-count, share across all bodies/buckets** to drop the footprint to a handful of arrays (one per distinct segment count: 4 profiles + focused = 5 buffers total).

## CI

- New unit file `orbitTrailMath.test.ts`: pure scalar math, microseconds, no GPU — negligible CI add. No Playwright change required; the GLSL-only risk (compile failure → black orbit) is not caught by headless pixel diffs (per the digest's HDR-screenshot caveat and the `feedback_pmndrs_effect_signature` lesson), so the verification gate is a **Claude-Preview boot + deep-view console read**, not a new e2e baseline. `orbitAlignment.test.ts` must stay green unchanged (geometry untouched) — that is the load-bearing regression guard.

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\orbitTrailMath.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\orbitTrailMath.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\useGaiaSdfLinePatch.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\PlanetOrbitLine.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\Planet.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\store.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\ui\LayersPanel.tsx

</details>

### B2 — Screen-Space Label Repulsion (CPU) for Solar-System Overlays

**Verdict:** `GOLD_PLATING` · **ROI score:** 3/10 · **Effort:** M · **Grounding verified:** true

**Lazy 80% alternative:** Two cheaper paths capture ~80% of the value at a fraction of the cost: (A) PURE-REFACTOR ONLY — extract intersects/fitsWithinBounds + the greedy arbitration loop from OverlayPositionTracker.tsx:195-246 into a pure, tested src/components/canvas/labelLayout.ts with a regression-lock test (iters=0 ≡ legacy). That delivers the testability seam (no test exists today) with ZERO behavior change and ZERO risk, and is the genuinely valuable part of this blueprint. (B) If product actually complains about dropped labels, add the HTML-only single-axis vertical nudge (just the translate(12px, calc(-50% + dy)) edit + a 1-iteration y-only push) and SKIP the SDF path entirely — SDF labels are opt-in via the Layers panel, default is HTML, so the SDF worldPerPx machinery serves a minority code path. Most of B2's cost (steps 4-SDF, 5, warm-start solver) buys premium for a scenario users rarely hit in a teaching tool.

**Architecture fit:** Fits the real architecture well — the blueprint did read the files and its hook points are accurate (OverlayPositionTracker owns project→sort→collide in useFrame(...,10); PlanetOverlay honors x/y+transform for free; PlanetLabels3D consumes only item.showLabel and positions at world pos; store.ts:124-132 interface + setter at :360 with set({overlayItems})). The pure-core extraction is the right move and SHOULD reuse/relocate the existing intersects(:35) and fitsWithinBounds(:49) verbatim rather than reinventing. What's over-built: (1) the force-relaxation solver (MAX_ITERS, STIFFNESS, MTV, priority-weighted yield, warm-start prevOffsetRef, SETTLE_EPS dead-zone) is a force-directed layout engine for ≤20 on-screen quads — that's a lot of tunable machinery (3 magic constants the blueprint admits need eyeballing against a crowded scene) to make 'a few more labels survive.' (2) The SDF nudge doubles the integration surface (a second renderer must honor a screen-space delta via an approximate screen→world conversion) for the non-default, opt-in label mode. Nothing structurally BREAKS, but it adds a stateful per-frame solver + cross-renderer offset plumbing to a hot path that today is a clean stateless greedy pass. For a didactic tool where N<20 and dense clusters are an infrequent focus-mode-moons edge case, the elegance/value ratio is poor.

**Inaccuracies caught:** Mostly accurate, three issues. (1) Body count: blueprint says ~46 SOLAR_SYSTEM_BODIES; actual is 45 (grep id: → 45). Trivial. (2) SDF worldPerPx math is self-defeating as written: worldPerPx = clampedFontScale / FONT_WORLD_BASE * 0.009 reduces to (distance/1000)*0.009 = distance\*9e-6, which is NOT the true on-screen world-per-pixel (that depends on FOV and viewport height, not a fixed constant). The blueprint flags this as 'approximate, eyeball in Claude-Preview' but understates it — the SDF offset is genuinely miscalibrated and will need real tuning, so the SDF path is the fragile half and its 'visual consistency with HTML' goal is not actually guaranteed by the given formula. (3) 'reuses existing hysteresis to prevent force-directed jitter' is optimistic: the existing stabilityBonus/prevKeyRef machinery suppresses VISIBILITY flicker and sub-pixel re-emits; it does nothing to damp a continuous-position solver's oscillation. The warm-start + SETTLE_EPS the blueprint adds are the real anti-jitter mechanism, and those are NEW, not 'reused' — so the 'reuse existing machinery' framing oversells safety on the one part (continuous nudges) that didn't exist before.

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## Reality check vs. the brief

I read the real files. Three corrections to the prompt's framing:

1. **There is no GPU label system and no per-star screen labels.** Stars (`Starfield.tsx`, up to ~109k instances) have **no persistent name labels** — only a hover tooltip (`src/components/ui/StarHoverTooltip.tsx`) and a click panel (`src/components/ui/HygStarPanel.tsx`). Grep for `label` in `Starfield.tsx` returns nothing. So "starfield labels" is not a real overlap source.
2. **The only label-overlap domain is the ~46 solar-system bodies** in `SOLAR_SYSTEM_BODIES` (`src/data/celestialBodies.ts`), driven by **one** screen-space pass in `src/components/canvas/OverlayPositionTracker.tsx`. N ≤ 46, and after frustum/visibility culling typically N < 20 on screen. **CPU screen-space is correct; GPU is unjustified** (a compute/transform-feedback pass to repel ≤46 quads would cost more in readback/plumbing than it saves; the existing pass is already sub-0.1 ms).
3. The existing pass **already does collision arbitration** — it just resolves collisions by **hiding** (greedy first-fit: `OverlayPositionTracker.tsx:195-246`). B2's value-add is to **repel/nudge** overlapping labels so more survive instead of being dropped, while keeping the hide path as the last resort.

So B2 = "add a bounded repulsion relaxation step between the priority sort and the final hide decision, reusing the existing project→sort→AABB pipeline."

## Where it hooks in (real symbols)

- `OverlayPositionTracker.tsx` (`OverlayPositionTracker`, `useFrame(..., 10)`): owns the per-frame project→sort→collide loop. Helpers `intersects(box, others)` (line 35) and `fitsWithinBounds(box, bounds)` (line 49) are pure and already export-shaped.
- It emits `OverlayItem[]` via `setOverlayItems` (store field `overlayItems`, `store.ts:124-132`, setter `store.ts:360`). Each item carries `{id,name,x,y,isSmall,showLabel,showIcon}`.
- Consumers:
  - **HTML**: `PlanetOverlay.tsx` renders the label button at `left:item.x, top:item.y` with CSS `transform: translate(12px, -50%)` (line 65). This is the path that can honor a 2D nudge for free.
  - **SDF**: `PlanetLabels3D.tsx` consumes **only `item.showLabel`** (line 140) and positions the `<Text>` at the body's **world** position, not `item.x/y`. So a screen-space nudge is invisible to SDF unless we thread the offset through.

### Critical design constraint

The nudge must be expressed as a **screen-space delta** added to `item.x/y`. HTML honors it directly. For SDF, I add the same `(dx,dy)` pixel offset as a local screen-space translation on the troika group (converted to world units via the existing `distance/FONT_DISTANCE_DIVISOR` scale already computed at `PlanetLabels3D.tsx:181-183`). This keeps both label renderers visually consistent and avoids a second layout system.

## Step-by-step

### Step 1 — Extract the layout core into a pure, tested module

Create `src/components/canvas/labelLayout.ts`. Move `intersects`, `fitsWithinBounds`, and the candidate→placed-box arbitration into a pure function:

```
computeLabelLayout(candidates: LabelCandidate[], bounds, opts): LabelPlacement[]
```

`LabelCandidate` = the already-projected screen data (`id, x, y, priority, iconBox, labelBox`). This is a refactor with **zero behavior change** when repulsion iterations = 0 — it just makes the arbitration testable (no `OverlayPositionTracker.test.tsx` exists today; this is the seam to add one). `OverlayPositionTracker.tsx` keeps ownership of projection (camera/scene access) and store I/O; it calls `computeLabelLayout` where the inline `candidates.forEach` loop is now.

### Step 2 — Insert a bounded repulsion relaxation BEFORE the hide pass

Inside `computeLabelLayout`, between the priority sort and the greedy placement, run a small fixed-iteration force relaxation on **label** boxes only (icons stay pinned to the body — moving an icon would lie about position):

- For each iteration (cap `MAX_ITERS = 4`), for each pair of label boxes whose AABBs overlap, compute the minimum-translation vector (MTV: push along the smaller of x/y penetration). Apply a fraction (`STIFFNESS = 0.5`) split by priority — **lower-priority label yields more** (weight = `1 - priority/(pA+pB)`), so the focused/Sun label barely moves.
- After each push, **re-anchor**: clamp each label box back inside `bounds` (`fitsWithinBounds`) and cap the offset magnitude to `MAX_OFFSET_PX` (e.g. 28 px) so a label never detaches from its leader-line origin. The label's "home" is `x+12` (the existing `translate(12px)` anchor); offset is measured from there.
- Apply a **dead-zone / epsilon** (`SETTLE_EPS = 0.5 px`): if total movement in an iteration < eps, break early. This makes the common no-collision case O(N) and zero-jitter.

### Step 3 — Greedy hide pass becomes the fallback (unchanged semantics)

After relaxation, run the **existing** first-fit loop (`intersects` against `placedLabels`/`placedIcons`). Labels that still overlap after being nudged get `showLabel=false` exactly as today. Net effect: labels that _can_ be separated by a small nudge now survive; only genuinely over-dense clusters fall back to hiding. The icon-implies-label and bounds rules are preserved verbatim.

### Step 4 — Carry the nudge to consumers

Extend `OverlayItem` with two optional fields `dx?: number; dy?: number` (screen-space pixels relative to the current `x+12 / -50%` anchor; default 0 / omitted = today's behavior). Update:

- `store.ts:124-132` interface + (no setter change needed).
- `PlanetOverlay.tsx:65`: change `translate(12px, -50%)` → `translate(${12 + (item.dx ?? 0)}px, calc(-50% + ${item.dy ?? 0}px))`.
- `PlanetLabels3D.tsx`: after computing `clampedFontScale`, add a screen-space-to-world offset on the troika child group. Convert `(dx,dy)` px into world units using the per-frame scale (`worldPerPx ≈ clampedFontScale / FONT_WORLD_BASE` already encodes the screen-stable ratio) and apply as a billboard-local translation **after** the lookAt/`rotateY(π)` so it stays screen-aligned. Read `dx/dy` from the same `overlayItems` map already iterated at line 139.

### Step 5 — Stability (anti-jitter) — reuse the existing machinery

- The tracker already has **hysteresis** (`prevVisibleRef`, `stabilityBonus`, lines 163-167) and a **pixel-quantized fingerprint** gate (`prevKeyRef`, lines 248-265) that suppresses re-emits on sub-pixel drift. Extend the fingerprint key to include quantized `dx|0`/`dy|0` (line 254) so a settled nudge doesn't churn React, but a _changed_ nudge does repaint.
- Carry last frame's offsets in a `prevOffsetRef: Map<id,{dx,dy}>` and **seed** the relaxation from them (warm-start). This makes the solver converge in 1 iteration at steady state and removes frame-to-frame popping when the cluster geometry is stable.

### Step 6 — Gating / lifecycle / robustness

- Gate the whole repulsion behind a cheap early-out: if `placedLabels.length < 2` or no pair overlaps on iteration 0, skip the solver entirely (the 0-or-1-label and sparse-field cases, which are the majority during normal navigation).
- Respect the existing visibility toggles (lines 118-122) and `viewportFraming.overlayRect` bounds — repulsion operates only on candidates that already passed those filters.
- Keep the `useFrame` defensive posture: the solver is pure and allocation-free (preallocated scratch arrays at module scope, mirroring `TMP_WORLD` at line 62), so it can't throw on hot path.

### Step 7 — Tests

- New `src/components/canvas/labelLayout.test.ts` (Vitest): (a) two overlapping equal-priority labels separate symmetrically; (b) high-priority label (focus) holds position, low yields; (c) offset never exceeds `MAX_OFFSET_PX` and box stays in `bounds`; (d) iters=0 reproduces the legacy hide-only output byte-for-byte (regression lock); (e) settle-eps early-exit. No camera/R3F needed because the core is pure.
- E2E smoke is optional and not worth the CI cost (headless R3F ~1 Hz per `e2e/hyg-focus.spec.ts`); a unit test on the pure solver is the right altitude.

#### Code draft

```ts
// src/components/canvas/labelLayout.ts  (NEW — pure, testable)
export interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface LabelCandidate {
  id: string;
  priority: number;
  iconBox: ScreenBox; // pinned to body — never moved
  labelBox: ScreenBox; // home box at x+12 anchor — may be nudged
}
export interface LabelPlacement {
  id: string;
  showIcon: boolean;
  showLabel: boolean;
  dx: number; // px offset from label home anchor (added to translate(12px,…))
  dy: number;
}

// pure helpers (moved verbatim from OverlayPositionTracker.tsx:35,49)
export const intersects = (b: ScreenBox, others: ScreenBox[]): boolean => {
  /* …unchanged… */ return false;
};
export const fitsWithinBounds = (b: ScreenBox, bd: Bounds): boolean =>
  b.x >= bd.left &&
  b.y >= bd.top &&
  b.x + b.w <= bd.right &&
  b.y + b.h <= bd.bottom;

const MAX_ITERS = 4,
  STIFFNESS = 0.5,
  MAX_OFFSET_PX = 28,
  SETTLE_EPS = 0.5;

// Repulsion relaxation on label boxes only. Mutates labelBox.x/y in place;
// returns per-id offset from the home anchor.
function repel(
  cands: LabelCandidate[],
  bounds: Bounds,
  warm: Map<string, { dx: number; dy: number }>
): Map<string, { dx: number; dy: number }> {
  const home = new Map<string, { x: number; y: number }>();
  for (const c of cands) {
    const w = warm.get(c.id);
    home.set(c.id, { x: c.labelBox.x, y: c.labelBox.y });
    if (w) {
      c.labelBox.x += w.dx;
      c.labelBox.y += w.dy;
    } // warm-start
  }
  for (let it = 0; it < MAX_ITERS; it++) {
    let moved = 0;
    for (let i = 0; i < cands.length; i++)
      for (let j = i + 1; j < cands.length; j++) {
        const A = cands[i].labelBox,
          B = cands[j].labelBox;
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x);
        const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        if (ox <= 0 || oy <= 0) continue; // no overlap
        // min-translation axis; lower priority yields more
        const pA = cands[i].priority,
          pB = cands[j].priority;
        const wB = pA / (pA + pB),
          wA = 1 - wB; // share of push
        if (ox < oy) {
          const dir = A.x < B.x ? -1 : 1,
            push = ox * STIFFNESS;
          A.x += dir * push * wA;
          B.x -= dir * push * wB;
        } else {
          const dir = A.y < B.y ? -1 : 1,
            push = oy * STIFFNESS;
          A.y += dir * push * wA;
          B.y -= dir * push * wB;
        }
        moved += ox + oy;
      }
    // clamp to bounds + max offset from home
    for (const c of cands) {
      const h = home.get(c.id)!;
      c.labelBox.x = clampOffset(c.labelBox.x, h.x);
      c.labelBox.y = clampOffset(c.labelBox.y, h.y);
      reanchorIntoBounds(c.labelBox, bounds);
    }
    if (moved < SETTLE_EPS) break; // dead-zone exit
  }
  const out = new Map<string, { dx: number; dy: number }>();
  for (const c of cands) {
    const h = home.get(c.id)!;
    out.set(c.id, { dx: c.labelBox.x - h.x, dy: c.labelBox.y - h.y });
  }
  return out;
}

export function computeLabelLayout(
  cands: LabelCandidate[],
  bounds: Bounds,
  focusId: string | null,
  warm: Map<string, { dx: number; dy: number }>
): {
  placements: LabelPlacement[];
  offsets: Map<string, { dx: number; dy: number }>;
} {
  // cands already priority-sorted by caller (preserves OverlayPositionTracker order)
  const offsets = cands.length > 1 ? repel(cands, bounds, warm) : new Map();
  const placedIcons: ScreenBox[] = [],
    placedLabels: ScreenBox[] = [];
  const placements: LabelPlacement[] = [];
  for (const c of cands) {
    // SAME greedy hide pass
    const iconFits = fitsWithinBounds(c.iconBox, bounds);
    const labelFits = fitsWithinBounds(c.labelBox, bounds);
    let showIcon = iconFits,
      showLabel = iconFits && labelFits;
    if (c.id !== focusId && showIcon) {
      if (intersects(c.iconBox, placedIcons)) {
        showIcon = false;
        showLabel = false;
      } else if (
        !labelFits ||
        intersects(c.labelBox, placedLabels) ||
        intersects(c.labelBox, placedIcons)
      )
        showLabel = false;
    }
    if (showIcon) placedIcons.push(c.iconBox);
    if (showLabel) placedLabels.push(c.labelBox);
    const o = offsets.get(c.id) ?? { dx: 0, dy: 0 };
    placements.push({ id: c.id, showIcon, showLabel, dx: o.dx, dy: o.dy });
  }
  return { placements, offsets };
}
```

```tsx
// OverlayPositionTracker.tsx — call site (replaces the inline forEach at 195-246)
const prevOffsetRef = useRef(new Map<string, { dx: number; dy: number }>());
// …after building & sorting `candidates`, map to LabelCandidate (icon/label boxes
//   are the same iconBox/labelBox already computed at lines 198-203)…
const { placements, offsets } = computeLabelLayout(
  labelCandidates,
  overlayBounds,
  focusId,
  prevOffsetRef.current
);
prevOffsetRef.current = offsets; // warm-start next frame
const finalOverlays: OverlayItem[] = placements.map((p) => ({
  id: p.id,
  name: nameById.get(p.id)!,
  x: xById.get(p.id)!,
  y: yById.get(p.id)!,
  isSmall: true,
  showLabel: p.showLabel,
  showIcon: p.showIcon,
  dx: p.dx,
  dy: p.dy,
}));
// fingerprint: append quantized offset so settled nudges don't churn React (line 254)
key += `${o.id}|${o.x | 0}|${o.y | 0}|${(o.dx ?? 0) | 0}|${(o.dy ?? 0) | 0}|${o.showLabel ? 1 : 0}|${o.showIcon ? 1 : 0};`;
```

```tsx
// PlanetOverlay.tsx:65 — honor the nudge (HTML path, free)
transform: `translate(${12 + (item.dx ?? 0)}px, calc(-50% + ${item.dy ?? 0}px))`,
```

```tsx
// PlanetLabels3D.tsx — honor the nudge (SDF path)
// after group.scale.setScalar(clampedFontScale) and the lookAt/rotateY(π):
const off = visibilityRef.current; // extend ref to also hold {dx,dy} per id
const px = item.dx ?? 0,
  py = item.dy ?? 0;
const worldPerPx = (clampedFontScale / FONT_WORLD_BASE) * 0.009; // screen-stable ratio
TMP_OFFSET.set(px * worldPerPx, -py * worldPerPx, 0) // y flips (screen→world)
  .applyQuaternion(group.quaternion); // billboard-local → world
group.position.add(TMP_OFFSET);
```

```ts
// store.ts:124-132 — additive, backward-compatible
overlayItems: Array<{
  id: string;
  name: string;
  x: number;
  y: number;
  isSmall: boolean;
  showLabel: boolean;
  showIcon: boolean;
  dx?: number;
  dy?: number; // NEW: screen-space repulsion offset (px)
}>;
```

#### Performance trade-offs

**CPU.** N ≤ 46 candidates, typically <20 on-screen after frustum/visibility culling. The solver is O(MAX_ITERS · N²) worst case = 4 · 46² ≈ 8.5k cheap AABB ops/frame — sub-0.05 ms on any modern CPU, and the `placedLabels.length < 2` / no-overlap-on-iter-0 early-out makes the common navigation case effectively O(N) (the warm-start + SETTLE_EPS dead-zone exits after 1 iteration at steady state). This runs in the same `useFrame(..., 10)` tick that already does the project→sort→collide work, so it adds one bounded pass, not a new frame loop.

**GPU.** Zero new draw calls, zero new buffers, zero shaders. HTML labels are DOM (compositor handles transform). SDF labels reuse the existing troika `<Text>` meshes — only `group.position` gets a vector add, which is already happening per frame. No texture/atlas/RT allocation. This is the whole justification for **not** going GPU: a transform-feedback/compute repulsion for ≤46 quads would add a readback stall and shader plumbing to save a sub-0.05 ms CPU pass — strictly worse.

**Memory.** Two new module-scope scratch objects (`TMP_OFFSET` Vector3 in PlanetLabels3D; preallocated `home`/`offsets` maps sized ≤46). `prevOffsetRef` holds ≤46 `{dx,dy}` entries. `OverlayItem` grows by two optional numbers (≤46 × 16 bytes ≈ <1 KB). Negligible; no per-frame allocation (mirrors the existing `TMP_WORLD` allocation-free pattern).

**60 Hz render loop.** No added React re-renders in the steady state: the pixel-quantized fingerprint (extended with quantized `dx|0/dy|0`) still gates `setOverlayItems`, so a _settled_ nudge emits nothing; only a _changed_ cluster repaints `PlanetOverlay`. Hysteresis (`stabilityBonus`) + warm-start prevent the well-known force-directed jitter/oscillation. Frame-budget impact is within noise of the current tracker.

**CI cost.** New `labelLayout.test.ts` is pure Vitest (no R3F/canvas) — adds milliseconds to `npm run test:run`, no Playwright. The regression lock (iters=0 ≡ legacy output) guarantees the refactor doesn't perturb existing overlay behavior, so no new flaky E2E baseline is needed. Headless E2E (~1 Hz, per `e2e/hyg-focus.spec.ts`) is deliberately avoided for this feature.

**Risk / not-verified.** (1) The SDF screen→world `worldPerPx` constant (`0.009 ≈ FONT_WORLD_BASE/FONT_DISTANCE_DIVISOR`) is an approximation of the on-screen px ratio and should be smoke-checked in Claude-Preview at a couple of camera ranges (per the per-ship browser-console rule) — HTML path is exact, SDF is the one to eyeball. (2) Leader lines: the current HTML label has no connector line to its icon; a nudged label sits visibly offset from its dot. If product wants a connector at larger offsets, that's a follow-on (a thin `<div>`/SVG line in `PlanetOverlay`), out of B2 scope. (3) `MAX_OFFSET_PX`, `STIFFNESS`, `MAX_ITERS` are tuning constants — start conservative (28/0.5/4) and adjust against a crowded scene (e.g. Jupiter's Galilean moons in focus mode, the densest real cluster).

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\labelLayout.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\labelLayout.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\OverlayPositionTracker.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\PlanetOverlay.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\PlanetLabels3D.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\store.ts

</details>

### B3 — Volumetric Atmospheric Entry + Local Terrain LOD

**Verdict:** `GOLD_PLATING` · **ROI score:** 2/10 · **Effort:** XL · **Grounding verified:** true

**Lazy 80% alternative:** If a "you're landing" cue is even wanted: skip the whole volumetric+terrain+dissolve stack. Just add the pure `computeSurfaceEntryRatio` helper (~15 lines, tested) + one store float, and feed it to ONE cheap existing effect — e.g. ramp the already-present atmosphere shell opacity (Planet.tsx:473 atmosphereScattering mesh) or nudge `usePlanetMaterials` surfaceFillLight emissive up as ratio→1. That is the 80% "the planet fills the view, things brighten as you approach" payoff for ~S effort, zero new shaders, zero raymarch, zero GLSL-compile-gate risk. The continuous-ratio signal is the only genuinely reusable piece here; everything downstream of it is the gold plating.

**Architecture fit:** Partial fit on the signal layer, breaks on the rendering layer. GOOD: the continuous-ratio idea sits cleanly beside the existing boolean gate — surfaceMode.ts already exposes computeFovFactor + SURFACE_MODE_RADII_MULTIPLIER, CameraController.tsx:736-742 already has cameraDistance/focusRadius/fovDegrees in scope, and store.ts:383-388 setSurfaceModeActive uses exactly the `=== ? state` dedupe the blueprint mirrors. That part is real and small. BREAKS: (1) The blueprint treats planet-material onBeforeCompile as a single universal hook to inject `uSurfaceEntry`. It is NOT — usePlanetMaterials.ts:378-526 is a branched if/else: Earth-only, eclipsing-only, ringed-only; every OTHER body (incl. Mars, the obvious landing target) gets a plain MeshStandardMaterial with NO onBeforeCompile. Adding a universal dissolve means a new branch wrapping/forking all of them — a material-system change the blueprint hand-waves. (2) The terrain patch is geometrically incoherent with the scale system: planets render at unit-radius sphere scaled by resolveSemanticBodyRadius (didactic anchors compress radii to ~0.8–60 units, astrophysics.ts:10-23/454-456); a flat 4×4 PlaneGeometry at position [0,-1,0] inside the unit rotation group is not at any believable surface scale and tracks nothing real — it's decorative noise on a teaching tool whose whole value prop is honest scale. (3) New transparent + depthWrite-toggled planet draw fights the existing cloud (1.01), atmosphere (1.025), and ring transparent passes and the analytical ring/eclipse shadow math — sort-order and depth interactions across 4+ transparent shells is exactly the class of bug that won't show in headless Playwright and eats MCP-smoke iterations. REUSE: the ratio helper belongs in surfaceMode.ts (correct); but it should drive the ALREADY-EXISTING atmosphere/fill-light, not a net-new SurfaceVolumetricLayer.

**Inaccuracies caught:** Mostly-honest grounding with two load-bearing errors. CORRECT claims (verified): proceduralSurface.ts exports + getSurfaceProfile is private (would need promoting); surfaceMode.ts has no discrete transition fn, just the per-frame gate at CameraController.tsx:736-742 writing a deduped boolean; store dedupe idiom at store.ts:383-388 is exactly as described; planet base sphere is MeshStandardMaterial at Planet.tsx:457-466, unit-radius `<sphereGeometry args={[1,64,64]}/>`. ERRORS: (1) "inject one uniform into the planet-material onBeforeCompile (~line 380)" implies a single shared onBeforeCompile — false. Line 380 is INSIDE the `if (body.id === "earth" && textureNight)` branch (usePlanetMaterials.ts:378-485); generic planets have no onBeforeCompile, so the dissolve injection is not a one-liner add, it's new shader plumbing across the material branch tree. (2) "Mount inside Planet.tsx's rotation group ... inherits the body's orientation/scale ... for free" — the SCALE is not applied at the inner rotation-group sphere (it's unit radius there); semantic radius is applied at the group/mesh level in PlanetVisualWrapper.useFrame (Planet.tsx:561-568), so a terrain plane mounted in the rotation group does NOT get physical-scale terrain "for free"; it gets unit-scale geometry that needs its own scale reasoning the blueprint omits. (3) Minor: there is ALREADY a cloud layer (Planet.tsx:514-525, scale 1.01) and an atmosphere layer (473-484, ratio 1.025); the blueprint calls clouds "net-new" and a 1.06 cloud shell would stack a third overlapping shell — contradicts MEMORY rule feedback_no_effect_stacking (replace, don't stack).

<details><summary>Full blueprint — conceptual / code / perf</summary>

#### Conceptual blueprint

## B3 — Volumetric Atmospheric Entry + Local Terrain LOD

### Grounding corrections vs. the AI brief

- The brief's `src/utils/proceduralSurface.ts` path/casing is **correct**. Verified exports: `createProceduralSurfaceTexture(body, width?, height?)`, `getSurfaceFillLight(body)`, `shouldRenderDirectSurfaceMap(body)`, plus the internal `SURFACE_PROFILES` / `mulberry32` / `hashString` noise machinery. This module is **2D canvas-texture-only** (no GLSL, no vertex displacement). It is the right _parameter source_ (per-body color profile + seeded RNG) but does NOT contain raymarch or terrain code to "extend" — terrain/cloud GLSL is net-new.
- **There is no `surface-mode transition entry point` as a discrete function.** The real entry is a per-frame gate in `CameraController.tsx:736-742` calling `isSurfaceModeActive(...)` (from `src/lib/camera/surfaceMode.ts`), which writes a **deduped boolean** `surfaceModeActive` to the Zustand store (`store.ts:383`). `SurfaceModeFirstPerson.tsx` (mounted at `Scene.tsx:669`) observes that boolean to grab pointer-lock. A boolean cannot drive a fade. The blueprint therefore adds a **continuous proximity ratio** alongside the existing boolean, derived from the _same_ `cameraDistance` / `threshold` the gate already computes — zero new distance math.
- The planet sphere is rendered in `Planet.tsx:458-467` (`<sphereGeometry args={[1,64,64]}/>` + `planetMaterial`), where `planetMaterial` is a **`MeshStandardMaterial`** patched via `onBeforeCompile` in `usePlanetMaterials.ts:327-375` — NOT a from-scratch ShaderMaterial. We fade _this_ mesh, we do not replace it.

### Architecture (3 cooperating pieces, all additive)

**1. Continuous entry signal — `src/lib/camera/surfaceMode.ts` (extend, pure)**
Add a sibling pure function `computeSurfaceEntryRatio(inputs: SurfaceModeInputs): number` that returns `0` (full orbit) → `1` (fully on surface) using the existing `computeFovFactor` + `SURFACE_MODE_RADII_MULTIPLIER`. Define an inner "fade band" e.g. `[threshold, threshold * SURFACE_FADE_OUTER_RATIO]` and `smoothstep` the camera distance across it. This keeps the boolean `isSurfaceModeActive` untouched (existing tests in `surfaceMode.test.ts` stay green) and adds one tested pure helper. Publish the ratio to the store via a new field `surfaceEntryRatio: number` (add to `store.ts` interface @ ~105, default `0` @ ~273, setter `setSurfaceEntryRatio` @ ~383 with an epsilon-dedupe like the boolean already uses to avoid 60Hz re-renders).

In `CameraController.tsx:736-742`, inside the existing `try` block that already has `cameraDistance`, `focusRadius`, `fovDegrees`, add a single call to `computeSurfaceEntryRatio(...)` and `setSurfaceEntryRatio(ratio)`. No new distance computation; reuses locals already in scope.

**2. Planet-sphere dissolve — `usePlanetMaterials.ts` + `Planet.tsx` (extend the existing onBeforeCompile)**
In `usePlanetMaterials.ts:327-375` planet-material `onBeforeCompile`, inject one uniform `uSurfaceEntry` (default `0`) and one fragment line that lifts dissolve: as `uSurfaceEntry → 1`, fade the lit sphere shading toward the volumetric layer. Implement as alpha dissolve driven by a hash-noise threshold (reuse the _same_ seeded value-noise pattern already in `proceduralSurface.ts` — port `hashString`/value-noise into a tiny shared GLSL snippet under `src/components/canvas/shaders/` so CPU profile + GPU dissolve agree per body). Drive `uSurfaceEntry` per-frame from the store value inside the existing `Planet.tsx` `useFrame` (~line 769, where `simNow`/uniform updates already happen). Set `planetMaterial.transparent` only while `uSurfaceEntry > 0` and gate `depthWrite` so the dissolve doesn't punch holes against the terrain.

**3. New volumetric+terrain layer — `src/components/canvas/SurfaceVolumetricLayer.tsx` (net-new, child of the planet group)**
Mount **inside** `Planet.tsx`'s rotation group (sibling to the base sphere mesh, `Planet.tsx:456-499`) so it inherits the body's orientation/scale and tracks the body through space for free. It renders only when `surfaceEntryRatio > 0` (cheap early-return → null). Two sub-meshes:

- **Volumetric cloud shell**: a back-faces sphere (`THREE.BackSide`) slightly larger than radius 1, ShaderMaterial doing a **bounded fixed-step raymarch** (8–16 steps, `uSurfaceEntry`-scaled) through analytic fbm built on the shared value-noise snippet. Density/tint seeded from the body's `SURFACE_PROFILES[body.id]` (import the profile via a new tiny export `getSurfaceProfile(body)` from `proceduralSurface.ts` — currently private; promote it). Blends additively over the dissolving sphere; opacity ramps with `uSurfaceEntry`.
- **Local terrain patch**: a single subdivided `THREE.PlaneGeometry` (or low-band-count sphere cap) under the camera, **vertex-displaced** in the vertex shader by the same fbm. LOD = swap subdivision via a `useMemo` keyed on a coarse `surfaceEntryRatio` bucket (e.g. 0 / 0.5 / 1 → 32² / 96² / 192² verts) so we never allocate the high-res grid until close. Reuse `getSurfaceFillLight(body)` for ambient tint to match the existing lit look.

Lifecycle: dispose geometries/materials in `useEffect` cleanup (mirror `PlanetModel.tsx:116-119` pattern). Guard `typeof document` is not needed (GPU only). Respect quality tier: read `qualityProfile.dprMax`/tier already threaded through `Scene.tsx` and clamp raymarch steps + terrain subdivision on `low`/`medium`.

### Verification plan

- Unit: `surfaceMode.test.ts` gains cases for `computeSurfaceEntryRatio` (0 far, 1 inside threshold, monotone smoothstep across band, `focusRadius<=0 → 0`).
- Integration: Vitest store test that the new setter dedupes within epsilon.
- Runtime smoke (mandatory per `feedback_browser_console_per_ship.md`): Claude-Preview MCP — fly to Earth, confirm console clean, observe sphere dissolve → clouds → terrain as distance closes, and clean reversal on pull-out (no orphaned transparent planet). GLSL-only errors won't show in headless Playwright, so this MCP smoke is the gate (`feedback_pmndrs_effect_signature.md`).
- E2E: extend `e2e/hyg-focus.spec.ts`-style flight, assert `surfaceEntryRatio` store field crosses 0→1 via `preview_eval`, not pixel diff (HDR screenshot hangs per `e2e/postprocessing.spec.ts:45-57`).

#### Code draft

```ts
// src/lib/camera/surfaceMode.ts — ADD (pure, tested). Boolean gate untouched.
export const SURFACE_FADE_OUTER_RATIO = 2.0; // fade band: [threshold, threshold*2]

/** 0 = full orbit, 1 = fully on surface. Reuses the gate's own threshold math. */
export const computeSurfaceEntryRatio = ({
  focusIsPlanet,
  distFromFocus,
  focusRadius,
  fovDegrees,
  gamepadInput = false,
  vr = false,
  isTracking = false,
}: SurfaceModeInputs): number => {
  if (gamepadInput || vr || isTracking || !focusIsPlanet || focusRadius <= 0)
    return 0;
  const fovFactor = computeFovFactor(fovDegrees);
  const threshold = (focusRadius * SURFACE_MODE_RADII_MULTIPLIER) / fovFactor;
  const outer = threshold * SURFACE_FADE_OUTER_RATIO;
  // smoothstep(outer -> threshold): 0 when far (>=outer), 1 when close (<=threshold)
  const t = (outer - distFromFocus) / (outer - threshold);
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};
```

```ts
// src/components/canvas/CameraController.tsx ~ inside the existing try @ 736-742.
// cameraDistance / focusRadius / fovDegrees already in scope — no new math.
const entry = computeSurfaceEntryRatio({
  focusIsPlanet: focusBody.type === "planet",
  distFromFocus: cameraDistance,
  focusRadius,
  fovDegrees,
});
useStore.getState().setSurfaceEntryRatio(entry); // dedupes with epsilon, like setSurfaceModeActive
```

```glsl
// src/components/canvas/shaders/proceduralNoise.glsl.ts (NEW) — shared CPU-parity value noise.
// Mirrors proceduralSurface.ts hashString/mulberry seeding so per-body look matches.
export const VALUE_NOISE_GLSL = /* glsl */`
float hash13(vec3 p){ p=fract(p*0.1031); p+=dot(p,p.yzx+33.33); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
  float n=mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x),
                  mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x),f.y),
              mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x),
                  mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x),f.y),f.z);
  return n; }
float fbm(vec3 p){ float a=0.5,s=0.0; for(int k=0;k<5;k++){s+=a*vnoise(p);p*=2.02;a*=0.5;} return s; }`;
```

```ts
// usePlanetMaterials.ts — inside planetMaterial onBeforeCompile (~ line 380), additive:
shader.uniforms.uSurfaceEntry = { value: 0 };
shader.fragmentShader = shader.fragmentShader.replace(
  "#include <dithering_fragment>",
  `float dissolve = step(fract(vNoiseSeed + uSurfaceEntry*1.7), uSurfaceEntry);
     gl_FragColor.a *= (1.0 - uSurfaceEntry*0.85); // hand off to volumetric layer
     #include <dithering_fragment>`
);
// Planet.tsx useFrame (~769): planetMaterial.userData.shader?.uniforms.uSurfaceEntry.value = entry;
// + planetMaterial.transparent = entry > 0.001; planetMaterial.depthWrite = entry < 0.5;
```

```tsx
// src/components/canvas/SurfaceVolumetricLayer.tsx (NEW) — child of Planet rotation group.
export const SurfaceVolumetricLayer = ({ body }: { body: CelestialBody }) => {
  const entry = useStore((s) => s.surfaceEntryRatio);
  const profile = getSurfaceProfile(body); // promoted export
  const matRef = useRef<THREE.ShaderMaterial>(null);
  // LOD: bucket the ratio so geometry only re-allocates at 3 levels.
  const seg = entry < 0.34 ? 32 : entry < 0.67 ? 96 : 192;
  const terrainGeo = useMemo(
    () => new THREE.PlaneGeometry(4, 4, seg, seg),
    [seg]
  );
  useEffect(() => () => terrainGeo.dispose(), [terrainGeo]);
  useFrame(() => {
    if (matRef.current) matRef.current.uniforms.uEntry.value = entry;
  });
  if (entry <= 0.001) return null; // zero cost in orbit
  return (
    <>
      <mesh scale={[1.06, 1.06, 1.06]}>
        {" "}
        {/* cloud shell, raymarched */}
        <sphereGeometry args={[1, 48, 48]} />
        <shaderMaterial
          ref={matRef}
          side={THREE.BackSide}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uniforms={{
            uEntry: { value: entry },
            uTint: { value: new THREE.Color(profile.secondary) },
          }}
          vertexShader={CLOUD_VERT}
          fragmentShader={
            VALUE_NOISE_GLSL + CLOUD_FRAG /* 8-16 step march, steps*=uEntry */
          }
        />
      </mesh>
      <mesh
        geometry={terrainGeo}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1, 0]}
      >
        <shaderMaterial
          vertexShader={VALUE_NOISE_GLSL + TERRAIN_VERT /* displace y by fbm */}
          fragmentShader={TERRAIN_FRAG}
          uniforms={{
            uEntry: { value: entry },
            uBase: { value: new THREE.Color(profile.base) },
            uAccent: { value: new THREE.Color(profile.accent) },
          }}
        />
      </mesh>
    </>
  );
};
```

#### Performance trade-offs

## Performance & cost

**Orbit / far state (the 99% case): ZERO added GPU cost.**
`SurfaceVolumetricLayer` early-returns `null` when `surfaceEntryRatio <= 0.001`, so no extra draw calls, no raymarch, no high-res grid in orbit. The only always-on cost is one `smoothstep` per focused planet per frame in `CameraController` (negligible — reuses locals already computed for proximity damping) and one extra uniform write in `Planet.tsx`'s existing `useFrame`.

**60Hz loop impact.** The new store field uses the same epsilon-dedupe idiom as `setSurfaceModeActive` (store.ts:383), so React does NOT re-render every frame — only on perceptible ratio changes. The continuous value is read by R3F components via `useStore` selector; the per-frame uniform push happens inside the _existing_ `Planet.tsx` `useFrame`, adding no new frame callback. No new `requestAnimationFrame` loop; the simulationClock path is untouched.

**Surface state (camera inside threshold) GPU cost:**

- _Cloud raymarch_: bounded 8–16 fixed steps, full-screen-ish back-face shell, fragment-bound. On a desktop GPU at 1080p this is the dominant new cost (~0.3–0.8ms). Steps scale with `uSurfaceEntry` so the march is cheap during the fade-in and only reaches full step count at full surface. Clamp to 8 on `low`/`medium` quality tiers (tier already threaded via `qualityProfile` in Scene.tsx).
- _Terrain_: a single vertex-displaced plane. At max LOD 192²≈37k verts ≈ 74k tris — trivial for the vertex stage; fbm-in-vertex is 5 octaves × ~8 hash ops. LOD bucketing (32²/96²/192²) means the 192² grid only exists when fully landed.
- _Sphere dissolve_: one extra `fract`/`step` + alpha multiply per fragment in the already-compiled planet material — sub-microsecond, but it flips the planet to `transparent` during the fade (one sorted transparent draw); mitigated by toggling `depthWrite` so it still occludes correctly until handoff.

**Memory footprint.** Terrain geometry at max LOD: 192² verts × (pos+normal+uv ≈ 32B) ≈ 1.2MB VBO, allocated lazily and disposed on unmount/LOD-down (`useEffect` cleanup mirrors PlanetModel.tsx:116-119). Cloud shell reuses a 48² sphere (~14k verts, ~0.3MB). Shared `VALUE_NOISE_GLSL` is a string constant — no runtime data textures, so no DataTexture upload (unlike the starfield's 64×64 halo). Net steady-state VRAM add when landed: <2MB per active planet; zero when in orbit.

**CI cost.** No pixel-diff baseline added (HDR `Page.captureScreenshot` hangs reproducibly per e2e/postprocessing.spec.ts:45-57). E2E asserts the `surfaceEntryRatio` store field via `preview_eval`, which is frame-rate-independent and survives the ~1Hz headless R3F cadence noted in e2e/hyg-focus.spec.ts — so it adds ~1 short spec, not a 47s flight budget. Unit tests for `computeSurfaceEntryRatio` are pure and instant.

**Risk / not-verified.** Raymarch step count and fade-band `SURFACE_FADE_OUTER_RATIO=2.0` are tuning guesses — runtime smoke is the authority. GLSL compile errors are invisible to headless Playwright; the MCP browser smoke is mandatory before ship.

**Files to touch:** C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\lib\camera\surfaceMode.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\lib\camera\surfaceMode.test.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\store.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\CameraController.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\Planet.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\planet\usePlanetMaterials.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\utils\proceduralSurface.ts, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\SurfaceVolumetricLayer.tsx, C:\Users\fgfer\OneDrive\Documents\GitHub\atlas-orbital\src\components\canvas\shaders\proceduralNoise.glsl.ts

</details>

## 3. High-ROI opportunities the prompt MISSED

| Score | Effort | Cat  | Title                                                                                                                             | Rationale                                                                                                                                                                                                                     | Evidence                                                                                                                                                         |
| ----- | ------ | ---- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 92    | S      | QA   | Wrap Scene/Overlay in App.tsx with the existing ErrorBoundary (no top-level WebGL crash guard)                                    | App.tsx mounts <Scene/>, <Overlay/>, <TutorialOverlay/> etc. only inside <Suspense> with fallback={null} — there is no ErrorBoundary around them. A throw during R3F render (shader compile failure, a bad uniform, a contex  | src/App.tsx:102-109 (Scene/Overlay mounted with only Suspense fallback={null}); src/components/utils/ErrorBoundary.tsx:16-53 (boundary exists, used only in Plan |
| 80    | S      | UI   | Set anisotropic filtering on planet surface textures (grazing-angle blur on every globe)                                          | A spherical planet always presents its texture at grazing angles near the limb, where isotropic mip filtering produces visible blur/shimmer. `grep anisotropy` returns ZERO matches in usePlanetAssets.ts, deferredTextureCa  | deferredTextureCache.ts:33 (shared TextureLoader, no anisotropy set anywhere); useDeferredTexture.ts:22-42 (only colorSpace plumbed); grep anisotropy = 0 hits i |
| 78    | M      | MATH | Orbit trails use the deprecated 5-iteration Kepler solver while body positions use the converged 12-iteration solver              | Body positions go through the canonical engine whose solver runs Newton-Raphson with a 12-iteration budget and a 1e-12 convergence break (coordUtils.ts:90-93). But orbit TRAILS still flow through AstroPhysics.calculatePh  | astrophysics.ts:339-349 (deprecated, fixed 5-iter, no convergence) called at :437 and :592; coordUtils.ts:90-93 (canonical 12-iter + 1e-12 break); celestialBodi |
| 76    | M      | PERF | WebP/AVIF variants generated for only 3 of ~75 textures despite a fully wired delivery pipeline                                   | textureVariants.ts already has runtime WebP detection (detectWebPSupport, :67) and a variant-selection system, but WEBP_AVAILABLE_BASENAMES contains exactly THREE entries: 4k_oberon, 8k_mercury, 8k_moon (textureVariants.  | textureVariants.ts:54-58 (only 3 webp basenames); on-disk counts 75 jpg / 15 png / 3 webp; detectWebPSupport+variant selector already at textureVariants.ts:67   |
| 71    | M      | PERF | No texture resolution cap on mobile/low-memory devices — 8k maps load on phones                                                   | Texture tier is chosen by qualityProfileName (usePlanetAssets.ts:54-120 resolveTextureRequest), and quality is derived from a profile — but there is no detection of navigator.deviceMemory / hardwareConcurrency / coarse-p  | usePlanetAssets.ts:54-120 (tier driven only by qualityProfileName); mobile detection exists only for layout (GearPopover.tsx:39, HygStarPanel.tsx:46); 8k textur |
| 63    | S      | A11Y | Simulation date/time and active-focus changes are not announced to screen readers (no aria-live on the clock)                     | The app has invested in a11y (aria-live regions in HygStarPanel, LayersPanel, SearchBar, StarHoverTooltip; useDialogFocus trapping in modals), but the CORE state of the simulation — the running date/time in Timeline.tsx   | Timeline.tsx:205-226 (date/time rendered, no aria-live); aria-live exists elsewhere (HygStarPanel.tsx:315/354, LayersPanel.tsx:362, SearchBar.tsx:505) but not f |
| 58    | M      | A11Y | Three near-identical Toggle/ChoiceButton implementations carry inconsistent a11y semantics, not just duplicated markup            | Beyond the DRY duplication the prompt's primitive-extraction item targets, the duplicates differ in accessibility detail, which is the higher-value angle. DisplayPanel.tsx Toggle (:463-509) exposes role='switch' aria-che  | DisplayPanel.tsx:463-509 (Toggle role=switch) + :433-461 (ChoiceButton aria-pressed); LayersPanel.tsx:586-650 (re-inlined pair); A11yPanel.tsx:136-186 (Toggle v |
| 52    | M      | MATH | No epoch/validity clipping for high-eccentricity bodies — orbit trails extrapolate two-body ellipses far outside their fit window | getDisplayOrbitPoints sweeps a full period from J2000 using fixed mean-motion n (astrophysics.ts:646-660: period = 360/n, sampled over 86.4M ms \* period). For scattered-disk / high-e bodies (Sedna, Eris e=0.5, and the e= | astrophysics.ts:646-660 (full-period sweep, fixed n, no validity clamp); digest Issue B1 (no hyperbolic solver / epoch clipping); registry validity windows exis |
