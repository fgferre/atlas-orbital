/**
 * Pure-TypeScript mirror of the per-star transfer curve in
 * `src/components/canvas/Starfield.tsx`. The shader is authoritative;
 * this file exists so the math has an executable shape that unit tests
 * can pin. Keep both sides in sync.
 *
 * The curve is a direct port of NASA Eyes' own shader (see
 * `src/components/canvas/shaders/nasaStarShaders.ts`) with one
 * substitution: we drive the flux from HYG's apparent magnitude (one
 * number per star) rather than NASA's absolute magnitude + camera-
 * distance formula. The two are mathematically equivalent for a
 * solar-system observer because the distance term cancels: apparent
 * magnitude *is* flux-at-Earth in magnitudes. The 250 multiplier
 * inside `log(1 + flux·250)` is what collapses NASA's absMag + 1e4 ×
 * inverse-square pipeline to a plain apparent-mag input at the
 * distance regime we actually render at.
 *
 * Inputs:
 *   - `mag`: per-star apparent magnitude.
 *   - `particleSize`: the viewport-adaptive scalar the shader gets
 *     as a uniform, set each frame to `sqrt(max(w,h) * DPR) / 60`.
 *     Already includes devicePixelRatio. Typical desktop value is
 *     0.6–0.9 depending on viewport and DPR.
 *
 * Returns the final gl_PointSize and vBrightness the shader emits,
 * with NASA's [5, 50] size clamp and [0.05, 1.0] alpha clamp applied
 * post-particleSize (same order as the GLSL).
 */

const FLUX_PER_MAG_EXPONENT = 0.4; // Pogson slope
const BRIGHTNESS_LOG_SCALE = 250; // matches NASA's effective response at apparent mag
const BRIGHTNESS_LOG_COEFF = 2; // outer coefficient on 2·log(…)
const SIZE_COEFFICIENT = 4; // NASA's original
const SIZE_FLOOR_PX = 5; // NASA's original
const SIZE_CEIL_PX = 50; // NASA's original
const ALPHA_FLOOR = 0.05; // NASA's original
const ALPHA_CEIL = 1;

// Gaia Sky star.group.quad.fragment.glsl core-kernel smoothstep edges.
// Source: `core = saturate(1.0 - smoothstep(0.0, 0.04, distance(vec2(0.5), uv) * 2.0))`.
// These are the authoritative values — NOT the (0.45, 0.50) pixel-
// space attempt that was rolled back on 2026-04-20 after the invented
// θ.1 commit. The inner edge at 0.0 and outer edge at 0.04 UV put the
// core inside a sub-pixel / single-pixel pinpoint at sprite center
// across the entire NASA-calibrated [5, 50] size range.
export const CORE_SMOOTHSTEP_EDGE_LOW = 0.0;
export const CORE_SMOOTHSTEP_EDGE_HIGH = 0.04;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Pure-TS mirror of the Gaia Sky star.group.quad.fragment.glsl core
 * kernel. `r` is the UV-space distance from sprite center scaled × 2
 * so `r = 0` is the pixel at the exact sprite center and `r = 1` is
 * the sprite edge (matches the shader's `distance(vec2(0.5), uv) * 2.0`).
 * Returns the core contribution that the shader multiplies by `2.0`
 * and adds to `vColor` before premultiplied additive blending.
 */
export const starfieldCoreKernel = (r: number): number => {
  return clamp(
    1 - smoothstep(CORE_SMOOTHSTEP_EDGE_LOW, CORE_SMOOTHSTEP_EDGE_HIGH, r),
    0,
    1
  );
};

export interface StarfieldPointMetrics {
  /** Final gl_PointSize in pixels (post particleSize, post clamp). */
  gl_PointSize: number;
  /** Final vBrightness passed to the fragment (post particleSize, post clamp). */
  vBrightness: number;
  /** Intermediate: raw Pogson flux (mag 0 = 1). */
  flux: number;
  /** Intermediate: log-compressed brightness, 2·log(1 + flux·250). */
  brightness: number;
}

export const starfieldPointMetrics = (
  mag: number,
  particleSize: number
): StarfieldPointMetrics => {
  const flux = Math.pow(10, -mag * FLUX_PER_MAG_EXPONENT);
  const brightness =
    BRIGHTNESS_LOG_COEFF * Math.log(1 + flux * BRIGHTNESS_LOG_SCALE);

  const gl_PointSize = clamp(
    brightness * SIZE_COEFFICIENT * particleSize,
    SIZE_FLOOR_PX,
    SIZE_CEIL_PX
  );
  const vBrightness = clamp(brightness * particleSize, ALPHA_FLOOR, ALPHA_CEIL);

  return { gl_PointSize, vBrightness, flux, brightness };
};
