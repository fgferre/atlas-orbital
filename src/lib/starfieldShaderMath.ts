/**
 * Pure-TypeScript mirror of the per-star transfer curve in
 * `src/components/canvas/Starfield.tsx`. The shader is authoritative;
 * this file exists so the math has an executable shape that unit tests
 * can pin. Keep both sides in sync.
 *
 * The curve is NASA Eyes–inspired: apparent-magnitude flux compressed
 * logarithmically (Fechner's law), then clamped into a sprite-size /
 * alpha range with a small floor so faint stars stay visibly present
 * without a haze-producing hard alpha clamp.
 *
 * Inputs:
 *   - `mag`: per-star apparent magnitude, already adjusted for the
 *     CPU-side didactic bias (`-0.9` in didactic, `0` in realistic).
 *
 * Returned values are the pre-viewport quantities the shader computes;
 * the `pixelRatio` / `particleSize` uniforms apply on top in GLSL.
 */

const FLUX_PER_MAG_EXPONENT = 0.4; // Pogson slope
const BRIGHTNESS_LOG_SCALE = 5000; // multiplier inside log(1 + flux * S)
const BRIGHTNESS_LOG_COEFF = 2; // outer coefficient on 2·log(…)
const SIZE_COEFFICIENT = 3; // base-size multiplier on brightness
const SIZE_FLOOR_PX = 4;
const SIZE_CEIL_PX = 40;
const ALPHA_COEFFICIENT = 0.08;
const ALPHA_FLOOR = 0.12;
const ALPHA_CEIL = 1;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

export interface StarfieldPointMetrics {
  /** Size in pixels before the particleSize / pixelRatio uniforms. */
  baseSize: number;
  /** Per-vertex alpha passed to the fragment as `vBrightness`. */
  vBrightness: number;
  /** Intermediate: raw Pogson flux (mag 0 = 1). */
  flux: number;
  /** Intermediate: log-compressed brightness, 2·log(1 + flux·5000). */
  brightness: number;
}

export const starfieldPointMetrics = (mag: number): StarfieldPointMetrics => {
  const flux = Math.pow(10, -mag * FLUX_PER_MAG_EXPONENT);
  const brightness =
    BRIGHTNESS_LOG_COEFF * Math.log(1 + flux * BRIGHTNESS_LOG_SCALE);

  const baseSize = clamp(
    brightness * SIZE_COEFFICIENT,
    SIZE_FLOOR_PX,
    SIZE_CEIL_PX
  );
  const vBrightness = clamp(
    brightness * ALPHA_COEFFICIENT,
    ALPHA_FLOOR,
    ALPHA_CEIL
  );

  return { baseSize, vBrightness, flux, brightness };
};
