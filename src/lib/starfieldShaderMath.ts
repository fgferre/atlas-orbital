/**
 * Pure-TypeScript mirror of the per-star transfer curve in
 * `src/components/canvas/Starfield.tsx`. The shader is authoritative;
 * this file exists so the math has an executable shape that unit tests
 * can pin. When the GLSL changes, keep this file in sync — the tests
 * below protect against drift on the TS side only.
 *
 * The inputs match the shader's vertex stage:
 *   - `mag`: the per-star magnitude attribute, already adjusted for the
 *     CPU-side didactic bias (`-0.9` in didactic, `0` in realistic).
 *   - `styleMix`: `0` = photometric (Pogson-accurate), `1` = cinematic
 *     (magnitude compression + sprite enlargement + flat alpha bump).
 *     Intermediate values linearly interpolate.
 *
 * Returned values are the pre-viewport quantities the shader computes —
 * `pixelRatio` and `particleSize` uniforms are applied on top in GLSL
 * and intentionally left out of this helper.
 */

const POGSON_NAKED_EYE_MAG = 6.5;
const POGSON_SIZE_MULTIPLIER = 2.5;
const POGSON_ALPHA_MULTIPLIER = 0.08;
const SIZE_FLOOR_PX = 1.5;
const SIZE_CEIL_PX = 60;
const ALPHA_FLOOR = 0.08;
const ALPHA_CEIL = 1;

const LIFT_WINDOW_OPEN = 6.0;
const LIFT_WINDOW_PEAK = 7.5;
const LIFT_FADE_OPEN = 9.5;
const LIFT_FADE_CLOSE = 12.0;
const LIFT_SIZE_GAIN_PX = 1.0;
const LIFT_ALPHA_GAIN = 0.12;

const COMPRESSION_ANCHOR_MAG = 6.0;
const COMPRESSION_SLOPE_PHOTOMETRIC = 1.0;
const COMPRESSION_SLOPE_CINEMATIC = 0.4;

const SIZE_BOOST_PHOTOMETRIC = 1.0;
const SIZE_BOOST_CINEMATIC = 2.5;

// In cinematic we *lower* the exponent so the fragment falloff is
// softer, not sharper — a larger sprite with a flatter alpha curve
// reads as a star with a visible halo rather than a tight dot, which
// is the AAA "cinematic glow" look. pow(d, 2) gives the sprite ~25% α
// at half-radius vs pow(d, 5)'s ~3%, so the halo actually survives
// additive blending on dark sky.
const FALLOFF_POW_PHOTOMETRIC = 5.0;
const FALLOFF_POW_CINEMATIC = 2.0;

const CINEMATIC_FLAT_ALPHA_BUMP = 0.1;

const clamp = (value: number, lo: number, hi: number) =>
  Math.min(Math.max(value, lo), hi);

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * GLSL-compatible `smoothstep`: Hermite interpolation between `edge0` and
 * `edge1`, returning 0 outside the lower edge, 1 outside the upper, and
 * a smooth cubic curve in between.
 */
export const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export interface StarfieldPointMetrics {
  /** baseSize in pixels, before the `particleSize` and `pixelRatio` uniforms. */
  baseSize: number;
  /** Multiplicative boost applied to the sprite size in cinematic mode. */
  sizeBoost: number;
  /** Per-vertex brightness passed to the fragment as `vBrightness`. */
  vBrightness: number;
  /** Fragment-stage exponent used in `pow(d, falloffPow)`. */
  falloffPow: number;
  /** Intermediate: the compressed magnitude fed into the Pogson curve. */
  compressedMag: number;
  /** Intermediate: `sqrt(fluxRatio)` from the Pogson curve. */
  sqrtFlux: number;
  /** Intermediate: the graduated smoothstep lift, in `[0, 1]`. */
  faintLift: number;
}

/**
 * Compute the shader's per-star metrics for a given magnitude and style
 * mix. Mirrors the GLSL in `Starfield.tsx` exactly — any divergence
 * indicates the shader and this mirror have drifted.
 */
export const starfieldPointMetrics = (
  mag: number,
  styleMix: number
): StarfieldPointMetrics => {
  const compressionSlope = mix(
    COMPRESSION_SLOPE_PHOTOMETRIC,
    COMPRESSION_SLOPE_CINEMATIC,
    styleMix
  );
  const compressedMag =
    mag < COMPRESSION_ANCHOR_MAG
      ? mag
      : COMPRESSION_ANCHOR_MAG +
        (mag - COMPRESSION_ANCHOR_MAG) * compressionSlope;

  const fluxRatio = Math.pow(10, (POGSON_NAKED_EYE_MAG - compressedMag) * 0.4);
  const sqrtFlux = Math.sqrt(fluxRatio);

  // Lift runs on raw `mag` (not the compressed value). See the long
  // comment in Starfield.tsx for why: driving the lift off the
  // compressed value lets the lift's peak collide with stars at
  // raw-mag 12+, inverting magnitude ordering in vBrightness.
  const faintLift =
    smoothstep(LIFT_WINDOW_OPEN, LIFT_WINDOW_PEAK, mag) *
    (1 - smoothstep(LIFT_FADE_OPEN, LIFT_FADE_CLOSE, mag));

  const sizeBoost = mix(SIZE_BOOST_PHOTOMETRIC, SIZE_BOOST_CINEMATIC, styleMix);

  const baseSize = clamp(
    sqrtFlux * POGSON_SIZE_MULTIPLIER + faintLift * LIFT_SIZE_GAIN_PX,
    SIZE_FLOOR_PX,
    SIZE_CEIL_PX
  );

  const vBrightness = clamp(
    sqrtFlux * POGSON_ALPHA_MULTIPLIER +
      faintLift * LIFT_ALPHA_GAIN +
      styleMix * CINEMATIC_FLAT_ALPHA_BUMP,
    ALPHA_FLOOR,
    ALPHA_CEIL
  );

  const falloffPow = mix(
    FALLOFF_POW_PHOTOMETRIC,
    FALLOFF_POW_CINEMATIC,
    styleMix
  );

  return {
    baseSize,
    sizeBoost,
    vBrightness,
    falloffPow,
    compressedMag,
    sqrtFlux,
    faintLift,
  };
};
