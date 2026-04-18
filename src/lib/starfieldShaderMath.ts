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

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

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
