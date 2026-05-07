/**
 * T6.4-M4 — blackbody-radiator color in linear-RGB space.
 *
 * Maps an effective temperature (Kelvin) to a linear-RGB triple
 * for use as the `uClassColor` shader uniform on the procedural
 * sun's sphere + glow materials. Replaces the prior hardcoded
 * `vec3(b, b², b⁴)` tint formula in `proceduralSunShaders.ts`,
 * which only spanned warm-yellow → white and could not produce
 * blue-dominant output for hot O / B / A stars regardless of
 * `uTint` value.
 *
 * **Scope tag**: atlas-native. Gaia Sky has no blackbody-color
 * helper at the rendering layer (its `starsurface.fragment.glsl`
 * is hardcoded). This module is the visible-class-color anchor
 * the M4 spec relies on.
 *
 * **Algorithm**: Tanner Helland piecewise polynomial fit (1000 K
 * → 40000 K), which approximates the CIE 1931 chromaticity →
 * sRGB primaries pathway with sub-percent error in the visible
 * band. Output is normalized to [0..1] sRGB then run through
 * the standard sRGB→linear inverse-gamma transfer so the result
 * lands in the linear-RGB space the shaders consume (every
 * `ProceduralSun3D` material is `toneMapped: false` per the
 * comments in `proceduralSunShaders.ts:269-279` — uniforms are
 * already linear-RGB HDR; tone mapping happens downstream).
 *
 * Numeric pins live in `stellarColor.test.ts` for Sun, Sirius,
 * Betelgeuse, Proxima — the 4 named-star perception targets
 * driving M4.
 */

/**
 * sRGB → linear-RGB inverse-gamma transfer.
 *
 * Standard piecewise transfer per IEC 61966-2-1: the toe is
 * linear (c / 12.92) for low values, the rest follows
 * ((c + 0.055) / 1.055)^2.4. Negative inputs clamp to 0 (sRGB
 * is undefined on negatives); inputs > 1 pass through unchanged
 * shape so HDR-extended sRGB values stay representable.
 */
export const srgbToLinearChannel = (c: number): number => {
  if (!Number.isFinite(c)) return 0;
  if (c <= 0) return 0;
  if (c <= 0.04045) return c / 12.92;
  return Math.pow((c + 0.055) / 1.055, 2.4);
};

/**
 * Helland piecewise temperature → sRGB-normalized triple, valid
 * for ~1000 K → ~40000 K. Below 1000 K the formula is undefined
 * (returns deep orange-red as the implicit floor); above 40000 K
 * it saturates to (clamped) blue-white. Returns each channel in
 * [0..1].
 */
const hellandSrgbFromTemperature = (tEff: number): [number, number, number] => {
  // Domain clamp matching Helland's published valid range.
  const T = Math.max(1000, Math.min(40000, tEff)) / 100;

  // Red channel.
  let r: number;
  if (T <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(T - 60, -0.1332047592);
  }

  // Green channel.
  let g: number;
  if (T <= 66) {
    g = 99.4708025861 * Math.log(T) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(T - 60, -0.0755148492);
  }

  // Blue channel.
  let b: number;
  if (T >= 66) {
    b = 255;
  } else if (T <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(T - 10) - 305.0447927307;
  }

  // Clamp 0..255 then normalize.
  const clamp = (x: number) => Math.max(0, Math.min(255, x));
  return [clamp(r) / 255, clamp(g) / 255, clamp(b) / 255];
};

/**
 * Map an effective temperature (Kelvin) to a linear-RGB triple.
 *
 * Pipeline: `tEff → Helland sRGB → sRGB→linear inverse-gamma →
 * linear RGB`. Output range is roughly [0..1] per channel,
 * suitable as a `vec3` uniform feeding multiplicative chroma
 * in the sphere + glow fragment shaders.
 *
 * Pinned named-star outputs (see `stellarColor.test.ts`):
 *
 *   Sun (5778 K)        → linear RGB ≈ (1.000, 0.891, 0.796) — warm white
 *   Sirius (9940 K)     → linear RGB ≈ (0.592, 0.703, 1.000) — blue-white
 *   Betelgeuse (3500 K) → linear RGB ≈ (1.000, 0.530, 0.266) — deep orange
 *   Proxima (3050 K)    → linear RGB ≈ (1.000, 0.450, 0.166) — reddish-orange
 *
 * Non-finite or negative temperatures fall back to the Sun-like
 * value (5778 K) so caller-side guards aren't required for
 * pathological inputs.
 */
export const blackbodyRgbFromTemperature = (
  tEff: number
): readonly [number, number, number] => {
  const T = Number.isFinite(tEff) && tEff > 0 ? tEff : 5778;
  const [sr, sg, sb] = hellandSrgbFromTemperature(T);
  return [
    srgbToLinearChannel(sr),
    srgbToLinearChannel(sg),
    srgbToLinearChannel(sb),
  ] as const;
};
