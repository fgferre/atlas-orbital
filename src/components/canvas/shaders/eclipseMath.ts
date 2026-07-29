/**
 * Constant registry for the eclipse shader patch (`eclipseShaderPatch.ts`).
 *
 * Pre-W7 this file was a pure-TypeScript 1:1 mirror of the whole GLSL
 * algorithm (`computeEclipseShading`, `eclipseBlend`, `distSegmentPoint`,
 * `getDiffractionSpectrum`), kept only so a hand-edit to the GLSL literal
 * couldn't silently drift from a parallel TS copy nobody consumed at
 * runtime. W7 rewrote the algorithm itself (real umbra/penumbra cone
 * geometry from `../../../lib/eclipseGeometry.ts`, consumed by production
 * code, not just tests) and deleted the mirror along with its 26 test
 * cases — maintaining a hand-written parallel copy of logic that no longer
 * exists anywhere else is exactly the coverage theatre AGENTS.md §6 rules
 * out. What survives here are the handful of literals the GLSL still
 * interpolates directly, so THIS file (not a second copy) is the one
 * source of truth for each.
 */

/** `eclipses.glsl:47 smoothstep(-0.1, 0.2, dot_NL)` terminator lower edge. */
export const ECLIPSE_EDGE_FADE_LO = -0.1;

/** `eclipses.glsl:47 smoothstep(-0.1, 0.2, dot_NL)` terminator upper edge. */
export const ECLIPSE_EDGE_FADE_HI = 0.2;

/** `eclipses.glsl:49 if (dot_NM > -0.15)` near-side gate: fragment's normal must face the eclipsing body within this slack. */
export const ECLIPSE_NEAR_SIDE_DOT_THRESHOLD = -0.15;

/**
 * Lunar-eclipse umbral floor — sunlight refracted through the eclipser's
 * limb atmosphere into its own shadow cone, the physical cause of the
 * "blood moon" colour. Only ever baked into a material whose eclipser has
 * an `atmosphereScattering` config (today: only Earth, so only the Moon's
 * material reads this) — see `usePlanetMaterials.ts`'s eclipse branch.
 * Third-round arbitration (2026-07-26): the pre-W7 diffraction band had no
 * physical grounding for a SOLAR receiver (an airless eclipser's penumbra
 * is neutral, seen from space) and was deleted there; this floor is what
 * the same spectrum constants were repurposed into for the one case where
 * an orange-red term has real physics behind it.
 *
 * ~10⁻³–10⁻⁴ of direct sunlight is the typical order of magnitude cited
 * for a Danjon L2–L3 (mid-brightness) total lunar eclipse. This ships a
 * representative L2/L3 value, disclosed as such: the EXISTENCE and colour
 * family of the effect are measured physics, the exact brightness on any
 * given real eclipse is not predictable from geometry alone (it depends on
 * that night's stratospheric aerosol loading) and this is not a claim that
 * it is.
 */
export const ECLIPSE_LUNAR_UMBRA_FLOOR = 0.0015;

/**
 * Danjon-scale reddish-orange tint applied at `ECLIPSE_LUNAR_UMBRA_FLOOR`.
 * Repurposed from the pre-W7 diffraction spectrum's hot end
 * (`eclipses.glsl:26`) — the same RGB literal, a new meaning. Linear RGB.
 */
export const ECLIPSE_LUNAR_REFRACTION_TINT: readonly [number, number, number] =
  [0.88, 0.42, 0.063];
