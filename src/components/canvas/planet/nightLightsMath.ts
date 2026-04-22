// T3.5 — night-lights terminator math, ported from Gaia Sky.
//
// 1:1 mirror of `linstep(-0.1, 0.1, -NdotL)` at
// `/tmp/gaiasky/assets/shader/lib/pbr.glsl:98-99` (commit 450c344ca).
// `linstep` helper defined at
// `/tmp/gaiasky/assets/shader/lib/math.glsl:58-61`:
//   float linstep(float e0, float e1, float x) {
//     float d = e1 - e0;
//     return d != 0.0 ? clamp((x - e0) / d, 0.0, 1.0) : 0.0;
//   }
//
// Gaia's day/night gate:
//   float dayFactor = 1.0 - linstep(-0.1, 0.1, -NdotL);
//   float nightFactor = 1.0 - dayFactor;
// Which simplifies to `nightFactor = linstep(-0.1, 0.1, -NdotL)` —
// a LINEAR ramp over a 0.2-wide band centered on the geometric
// terminator (NdotL = 0).
//
// Atlas pre-θ.5-T3.5 used
// `nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity)`:
// a cubic-Hermite ramp over a 0.4-wide band (2x wider than Gaia).
// Consequence: at `intensity = 0.1` (sun ~5.7° above horizon),
// `1 - smoothstep(-0.2, 0.2, 0.1) = 0.159` — atlas leaked 16% of
// the night-lights texture onto the day side. Gaia gate at the
// same sunDot returns 0. Fixed in T3.5.
//
// This TS helper exists to pin the exact Gaia formula in unit tests
// so future shader tweaks can't silently regress the terminator
// behavior. The live path is the GLSL copy injected in
// `usePlanetMaterials.ts`.

const NIGHT_EDGE_LO = -0.1; // Gaia pbr.glsl:98
const NIGHT_EDGE_HI = 0.1; // Gaia pbr.glsl:98

/**
 * `linstep` — linear remap of `x` from `[e0, e1]` to `[0, 1]` with
 * clamping. Mirrors Gaia `math.glsl:58-61` byte-for-byte (minus the
 * `d != 0.0` divide-by-zero guard, which we recreate explicitly).
 */
export const linstep = (edge0: number, edge1: number, x: number): number => {
  const d = edge1 - edge0;
  if (d === 0) return 0;
  const t = (x - edge0) / d;
  return t < 0 ? 0 : t > 1 ? 1 : t;
};

/**
 * Night-lights emissive multiplier as a function of the surface
 * point's dot product with the light direction (`NdotL` in Gaia
 * shader terms; `intensity = dot(worldNormal, worldLightDir)` in
 * atlas shader terms — same quantity, different variable name).
 *
 * Returns 0 on the day side (`intensity >= 0.1`, sun ≥ 5.7° above
 * local horizon), 1 on the deep night side (`intensity <= -0.1`),
 * and a linear ramp between.
 *
 * Derived from Gaia `pbr.glsl:98-99`:
 *   float dayFactor = 1.0 - linstep(-0.1, 0.1, -NdotL);
 *   float nightFactor = 1.0 - dayFactor; // = linstep(-0.1, 0.1, -NdotL)
 */
export const nightFactor = (intensity: number): number =>
  linstep(NIGHT_EDGE_LO, NIGHT_EDGE_HI, -intensity);
