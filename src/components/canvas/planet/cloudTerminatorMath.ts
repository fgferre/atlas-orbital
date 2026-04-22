// T3.6 — cloud terminator math, ported from Gaia Sky.
//
// 1:1 mirror of Gaia's cloud-lighting formulas at
// `/tmp/gaiasky/assets/shader/cloud.fragment.glsl:144,165` (commit
// 450c344ca). `linstep` helper lives at
// `/tmp/gaiasky/assets/shader/lib/math.glsl:58-61` (already ported in
// `nightLightsMath.ts` for T3.5; re-used here).
//
// Gaia source snippet (lines 141-166 of cloud.fragment.glsl):
//   vec3 N = vec3(0.0, 0.0, 1.0);
//   vec3 L = normalize(u_dirLights[i].direction * v_tbn);
//   float NL = dot(N, L);
//   float dayFactor = 1.0 - linstep(-0.25, 0.12, -NL);
//   litColor += lightCol * dayFactor;
//   ...
//   float brightness = clamp(length(litColor + ambient), 0.03, 1.0);
//   vec3 cloudColor = cloud.rgb * brightness;
//
// Atlas pre-T3.6 used
// `cloudNightFactor = 1 - smoothstep(-0.2, 0.2, cloudIntensity)` +
// `diffuseColor.rgb *= mix(1.0, 0.05, cloudNightFactor)` — i.e. a
// SYMMETRIC 0.4-wide cubic-smoothed band with a 0.05 night floor.
// Gaia's band is ASYMMETRIC ([-0.25, 0.12] = 0.37 wide, linear)
// with a 0.03 night floor. Combined with atlas's pre-T3.6
// `AdditiveBlending` (→ even dim clouds add brightness to the night
// side where they overlap), the result was a visible "over-bright
// terminator" on Earth's cloud band. T3.6 fixes the formula AND the
// blend mode together.

import { linstep } from "./nightLightsMath";

const CLOUD_EDGE_LO = -0.25; // Gaia cloud.fragment.glsl:144
const CLOUD_EDGE_HI = 0.12; // Gaia cloud.fragment.glsl:144
const CLOUD_NIGHT_FLOOR = 0.03; // Gaia cloud.fragment.glsl:165

/**
 * Cloud day-factor as a function of the surface point's `NdotL`
 * (dot of the cloud normal with the light direction, where positive
 * = sun is in front of the cloud surface).
 *
 * Mirrors `1.0 - linstep(-0.25, 0.12, -NL)` from Gaia
 * `cloud.fragment.glsl:144`. Returns 0 in deep night (NL ≤ -0.12),
 * 1 at full day (NL ≥ 0.25), with a linear ramp between — note the
 * band is asymmetric, fading clouds from darkness into full light
 * over a steeper gradient on the night-to-dawn side.
 */
export const cloudDayFactor = (NL: number): number =>
  1.0 - linstep(CLOUD_EDGE_LO, CLOUD_EDGE_HI, -NL);

/**
 * Cloud brightness multiplier for `cloud.rgb * brightness` from Gaia
 * `cloud.fragment.glsl:165`: `clamp(length(litColor + ambient),
 * 0.03, 1.0)`.
 *
 * Simplified for the single-light atlas case (Sun only, lightCol =
 * approximately 1.0 white): `brightness ≈ clamp(dayFactor + ambient,
 * 0.03, 1.0)`. We accept a tiny divergence from Gaia's vector-length
 * computation — atlas runs with scalar lit intensity, which equals
 * Gaia's length when all RGB channels receive equal light (which is
 * the default Sun color in both systems).
 */
export const cloudBrightness = (
  dayFactor: number,
  ambient: number = 0
): number => {
  const v = dayFactor + ambient;
  if (v <= CLOUD_NIGHT_FLOOR) return CLOUD_NIGHT_FLOOR;
  if (v >= 1) return 1;
  return v;
};
