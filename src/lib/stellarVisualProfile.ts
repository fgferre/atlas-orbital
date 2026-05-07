/**
 * T6.1 — externalized visual-identity profile for `ProceduralSun3D`.
 *
 * Pre-T6.1, every uniform value driving the Sun's surface /
 * granulation / glow / rays / flares appearance was hardcoded
 * inside `ProceduralSun3D.tsx`'s ShaderMaterial constructors. T6.1
 * generalizes the component so any HYG-catalog star (per T6.3) can
 * spawn its own procedural mesh with class-tuned values; this
 * module is the data layer.
 *
 * **Scope tag**: atlas-native. `ProceduralSun3D` is an atlas-original
 * component — Gaia's `assets/shader/starsurface.fragment.glsl` is a
 * different codebase entirely (hardcoded `frequency=80`,
 * `viewport=1500x750`). T6.1 is NOT a port; it's an internal
 * refactor preparing the call surface for T6.3. Per the kickoff
 * prompt's atlas-native scope rule, DIFF GATE here applies to:
 * (a) the regression test pinning every uniform's pre-T6.1 value,
 * and (b) per-divergence rationale comments where the new prop
 * interface intentionally diverges from a previously-hardcoded
 * value.
 *
 * **What's externalized** (T6.1 baseline: 26 numeric uniforms +
 * `lightDirection`. T6.4-M4 swaps `surfaceTint` + `glowTint` for
 * `surfaceWhitePoint` + `classColor` so the new linear-RGB
 * shader path replaces the prior `vec3(b, b², b⁴) × tint`
 * formula — same 28 keys total, different shape.) Runtime-
 * mutated uniforms (`uTime`, `uVisibility`, `uDirection`,
 * `uPerlinCube`, `uCamUp`) stay inside the component — they're
 * driven by `useFrame` and have no per-star meaning.
 *
 * **What's NOT externalized** (out of scope for T6.1):
 * - Per-quality `lowRes` ray/flare width/opacity pairs
 *   (`uWidth_lowRes` 0.05 / 0.03; `uOpacity_lowRes` 0.05 / 0.03;
 *   flares `uWidth` 0.01 / 0.005; `uOpacity` 3 / 0.2). These are
 *   **session-global** quality-tier choices, not stellar-class
 *   choices — every star in the scene at a given quality picks
 *   the same value. They stay inside `ProceduralSun3D`'s
 *   `SUN_FX_PROFILES` map, where they live alongside other
 *   per-quality knobs (cube resolution, sphere segments, line
 *   counts).
 * - Geometry sizing constants (SPHERE_RADIUS, SURFACE_RADIUS,
 *   GLOW_RING_RADIUS, lineLength). These are unit-of-measurement
 *   decisions tied to the component's coordinate frame, not
 *   visual identity.
 *
 * Future ondas (T6.5 limb darkening) extend this profile with
 * additional class-driven values. The profile shape is forward-
 * compatible: every consumer reads the field by name; new fields
 * default to the Sun value without requiring callsite churn.
 *
 * **T6.4-M4 update**: granulation cell scale (`granulationSpatialFreq`,
 * `granulationTemporalFreq`, `granulationContrast`) is now
 * tuned per luminosity class + temperature in
 * `stellarVisualProfileFrom`; supergiant cells are larger / slower
 * / higher-contrast than main-sequence; hot O / B / A stars get
 * granulation flattened to mimic radiative atmospheres.
 */

/**
 * Visual-identity profile for a procedural stellar surface.
 *
 * Field naming convention: `<material><Property>` so values
 * cluster by which ShaderMaterial they feed (granulation*,
 * surface*, glow*, rays*, flares*). `lightDirection` is the only
 * cross-material field — it feeds alpha modulation in the sphere
 * fragment shader (`proceduralSunShaders.ts:230-232`) plus glow
 * / rays / flares vertex shaders.
 */
export interface StellarVisualProfile {
  // ─── Granulation noise (perlin cubemap baking) ───
  /** `uSpatialFrequency` in `proceduralSunPerlinFragmentShader`. */
  granulationSpatialFreq: number;
  /** `uTemporalFrequency`; drives the cubemap re-bake animation rate. */
  granulationTemporalFreq: number;
  /** `uH` (Hurst exponent); shapes the noise spectrum. */
  granulationH: number;
  /** `uContrast`; squeezes the noise distribution. */
  granulationContrast: number;
  /** `uFlatten`; biases the noise toward bright/dark extremes. */
  granulationFlatten: number;

  // ─── Surface (sphere) shader ───
  /** `uFresnelPower` in `proceduralSunSphereFragmentShader`. */
  surfaceFresnelPower: number;
  /** `uFresnelInfluence`; rim-glow intensity. */
  surfaceFresnelInfluence: number;
  /** `uBase`; brightness multiplier from cubemap sample. */
  surfaceBase: number;
  /** `uBrightnessOffset`; DC term added before fresnel. */
  surfaceBrightnessOffset: number;
  /** `uBrightness`; final output multiplier. */
  surfaceBrightness: number;
  /**
   * `uClassWhitePoint` in `proceduralSunSphereFragmentShader`
   * (T6.4-M4). Brightness above which the surface saturates to
   * white, giving the HDR-core look while the limb / lower-
   * brightness regions retain `classColor`. Replaces the prior
   * `uTint`-modulated `vec3(b, b², b⁴)` formula which could not
   * produce blue-dominant output for hot stars regardless of
   * the tint value.
   */
  surfaceWhitePoint: number;

  // ─── Glow (ring corona) shader ───
  /** `uRadius` in `proceduralSunGlowFragmentShader`; ring thickness. */
  glowRadius: number;
  /** `uBrightness`; glow output multiplier. */
  glowBrightness: number;
  /** `uFalloffColor`; controls the radial falloff color cutoff. */
  glowFalloffColor: number;

  // ─── Rays shader (long thin streamers) ───
  /** `uLength` in `proceduralSunRaysFragmentShader`; ray length scalar. */
  raysLength: number;
  /** `uNoiseFrequency`; spatial frequency of ray modulation noise. */
  raysNoiseFrequency: number;
  /** `uNoiseAmplitude`; ray modulation noise depth. */
  raysNoiseAmplitude: number;
  /** `uAlphaBlended`; alpha-mode mix factor. */
  raysAlphaBlended: number;
  /** `uHueSpread`; hue variance across rays. */
  raysHueSpread: number;
  /** `uHue`; central hue of rays. */
  raysHue: number;

  // ─── Flares shader (short bright tongues) ───
  /** `uAmp` in `proceduralSunFlaresFragmentShader`; flare amplitude. */
  flaresAmp: number;
  /** `uAlphaBlended`; alpha-mode mix factor. */
  flaresAlphaBlended: number;
  /** `uHueSpread`; hue variance across flares. */
  flaresHueSpread: number;
  /** `uHue`; central hue of flares. */
  flaresHue: number;
  /** `uNoiseFrequency`; spatial frequency of flare modulation noise. */
  flaresNoiseFrequency: number;
  /** `uNoiseAmplitude`; flare modulation noise depth. */
  flaresNoiseAmplitude: number;

  // ─── Class color (shared sphere + glow, T6.4-M4) ───
  /**
   * Linear-RGB blackbody color shared by `proceduralSunSphereFragmentShader`'s
   * and `proceduralSunGlowFragmentShader`'s `uClassColor` uniform. Sourced
   * from `blackbodyRgbFromTemperature(tEff)` in
   * `stellarVisualProfileFrom`; a single value drives both materials so
   * the corona color cannot drift from the surface color. Linear-RGB
   * because every consuming material is `toneMapped: false` per
   * `proceduralSunShaders.ts:269-279`.
   */
  classColor: readonly [number, number, number];

  // ─── Light direction (cross-material) ───
  /**
   * Raw light-direction vector. Component normalizes via
   * `new THREE.Vector3(...lightDirection).normalize()` so any
   * non-unit input is accepted (matches pre-T6.1 behavior where
   * `(1, 1, 1)` was passed unnormalized to a `useMemo` that
   * normalized it).
   */
  lightDirection: readonly [number, number, number];
}

/**
 * Sun's pre-T6.1 visual profile, byte-identical to the hardcoded
 * uniforms inside `ProceduralSun3D.tsx` before this onda. Pinned
 * by `stellarVisualProfile.test.ts` so any drift is caught at
 * test time, not at runtime smoke.
 *
 * Source for each value (file:line):
 * - granulation*: `ProceduralSun3D.tsx:370-374` (perlin material)
 * - surface*: `ProceduralSun3D.tsx:397-402` (sun material)
 * - glow*: `ProceduralSun3D.tsx:424-427` (glow material)
 * - rays*: `ProceduralSun3D.tsx:455-461` (rays material;
 *   non-lowRes-conditional fields only)
 * - flares*: `ProceduralSun3D.tsx:485-491` (flares material;
 *   non-lowRes-conditional fields only)
 * - lightDirection: `ProceduralSun3D.tsx:321-324` (lightDirWorld
 *   useMemo input)
 */
export const SUN_DEFAULT_VISUAL_PROFILE: StellarVisualProfile = {
  granulationSpatialFreq: 6,
  granulationTemporalFreq: 0.1,
  granulationH: 1,
  granulationContrast: 0.25,
  granulationFlatten: 0.72,

  surfaceFresnelPower: 1,
  surfaceFresnelInfluence: 0.8,
  surfaceBase: 4,
  surfaceBrightnessOffset: 1,
  surfaceBrightness: 0.6,
  // T6.4-M4: white-point of 5 matches the upper end of the
  // pre-M4 `vec3(b, b², b⁴)` saturation regime — at b ≥ 5 the
  // old formula produced `vec3(5, 25, 625) × tintScale` which
  // already clipped to white through the post-process pipeline.
  // The new mix-to-white formula reproduces that behavior
  // explicitly while letting the limb retain `classColor`.
  surfaceWhitePoint: 5,

  glowRadius: 0.4,
  glowBrightness: 1.06,
  glowFalloffColor: 0.5,

  raysLength: 0.45,
  raysNoiseFrequency: 8,
  raysNoiseAmplitude: 0.4,
  raysAlphaBlended: 0.3,
  raysHueSpread: 0.2,
  raysHue: 0.2,

  flaresAmp: 0.5,
  flaresAlphaBlended: 0.65,
  flaresHueSpread: 0.16,
  flaresHue: 0,
  flaresNoiseFrequency: 4,
  flaresNoiseAmplitude: 0.2,

  // T6.4-M4: blackbody at solar T_eff = 5778 K, in linear-RGB.
  // Pinned numerically (not derived from blackbodyRgbFromTemperature
  // here) so the Sun's pre-M4 baseline is reproducible byte-for-byte
  // independent of the helper's piecewise fit.
  classColor: [1.0, 0.891, 0.796] as const,

  lightDirection: [1, 1, 1] as const,
};
