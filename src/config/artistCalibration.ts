/**
 * Artist-calibration constants for the solar-system render.
 *
 * These seven values used to live on a Leva debug panel fed by
 * `useSceneDebugControls`. Wave α's Display panel supersedes the
 * graphics-tuning half of that panel (lighting / bloom / grading —
 * all multiplier overrides on top of `VISUAL_PRESETS`). What Leva
 * still held were calibration-level values tuned once by the author
 * and then left alone: the night-lights intensity, Saturn's ring
 * shadow opacity, the sun / ring emissive multipliers, and generic
 * planet PBR roughness / metalness fallbacks.
 *
 * One value has since left: `EARTH_ROTATION_OFFSET_DEG`, which aligned
 * Earth's texture by hand. W6 replaced it with Earth's measured IAU
 * prime-meridian constant, so the alignment is now derived rather than
 * calibrated. Nothing in this file may re-acquire that role — a
 * hand-tuned angle on a body with a published rotation model is a
 * fidelity regression, not a calibration.
 *
 * Moved here so the Leva dependency can be retired without losing
 * the values. Future tuning: change the constant, commit, ship.
 * If interactive tuning is ever needed again, the path is a small
 * dev-only route (URL param or a dedicated Calibration panel) that
 * reads these as initial values — NOT re-introducing Leva.
 *
 * Numeric baselines match the Leva defaults shipped in the
 * `useSceneDebugControls.ts` revision that this file replaces.
 */

/** Multiplier on Earth night-side city-lights emissive contribution. */
export const EARTH_NIGHT_LIGHT_INTENSITY = 0.2;

/** Opacity of the analytical ring shadow cast onto Saturn's surface. */
export const RING_SHADOW_INTENSITY = 0.34;

/** Multiplier applied to the sun material's base color (HDR range). */
export const SUN_EMISSIVE_POWER = 2.7;

/** Ring material emissive glow strength. */
export const RING_EMISSIVE_POWER = 0.2;

/** Default roughness for planet surfaces without a dedicated roughness map. */
export const DEFAULT_PLANET_ROUGHNESS = 0.7;

/**
 * Default metalness for planet surfaces.
 *
 * **0.0, and it is not an artistic choice.** Rock, ice and regolith are
 * dielectrics: their specular reflectance at normal incidence is F0 ≈ 0.04,
 * which is exactly what a metalness-workflow BRDF assumes at metalness 0.
 * Above 0 the same workflow reinterprets the albedo texture as a conductor's
 * complex reflectance and *removes* that fraction of the energy from the
 * diffuse lobe — at the previous 0.3 every planetary surface in the catalog
 * lost ~30% of its direct diffuse response to a specular lobe that no
 * silicate or water-ice surface has.
 *
 * Raising it to 0.0 therefore moves peak linear direct diffuse ~1.43×
 * globally (1 / (1 − 0.3)). That is the reason W3 is sequenced ahead of every
 * other look wave: exposure has to settle before W5, W9 and W10 are smoked
 * against it, so a look change stays attributable to the wave that caused it.
 *
 * Bodies with a genuinely metallic surface fraction (M-type asteroids) would
 * need a per-record override, not a global default; none is claimed today.
 */
export const DEFAULT_PLANET_METALNESS = 0.0;
