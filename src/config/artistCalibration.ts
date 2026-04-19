/**
 * Artist-calibration constants for the solar-system render.
 *
 * These seven values used to live on a Leva debug panel fed by
 * `useSceneDebugControls`. Wave α's Display panel supersedes the
 * graphics-tuning half of that panel (lighting / bloom / grading —
 * all multiplier overrides on top of `VISUAL_PRESETS`). What Leva
 * still held were calibration-level values tuned once by the author
 * and then left alone: Earth's rotation alignment to its texture,
 * the night-lights intensity, Saturn's ring shadow opacity, the
 * sun / ring emissive multipliers, and generic planet PBR
 * roughness / metalness fallbacks.
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

/** Rotation offset (degrees) applied to Earth so its texture aligns with geography. */
export const EARTH_ROTATION_OFFSET_DEG = 0;

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

/** Default metalness for planet surfaces (most are non-metallic by default). */
export const DEFAULT_PLANET_METALNESS = 0.3;
