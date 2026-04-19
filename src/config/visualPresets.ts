/**
 * Visual Presets System
 *
 * The 5 presets carry context-tuned grading + lighting values that
 * `useVisualPresetLerp` smooth-interpolates between as `getPresetForContext`
 * re-classifies the camera. All values here are POST-AgX: grading sits on
 * the LDR buffer after tone mapping (see `PostProcessingPipeline.tsx` chain
 * comment for the correctness constraint).
 *
 * Per-preset intent:
 *
 * - CLOSE_FLYBY (camera < 200 from a body): surface-detail mode. Bloom
 *   knocked down so planet textures aren't washed by star halos; slight
 *   brightness + ambient bump for dark-side readability when the terminator
 *   crosses the frame; softer shadows so craters/clouds don't crush.
 *
 * - PLANET_ORBIT (camera 200–2000): balanced default — the values that felt
 *   right under AgX across the representative-views iteration.
 *
 * - INNER_SYSTEM (distanceFromSun < 3.5 AU, not orbiting a body): Sun and
 *   the four terrestrials + main-belt asteroids dominate the frame.
 *   Slightly higher saturation for warmer Mercury/Venus/Mars tones; a
 *   touch more direct-sun intensity.
 *
 * - OUTER_SYSTEM (3.5 AU ≤ distanceFromSun < 50 AU): gas/ice-giant region
 *   through Pluto and the near Kuiper belt. Cooler, less saturated;
 *   slightly dimmer direct sun to read as physically further from the
 *   illuminant.
 *
 * - DEEP_SPACE (distanceFromSun ≥ 50 AU): scattered disk + Sedna-like
 *   orbits. Moody/clinical. Slightly more bloom so remaining bright
 *   stars feel like the only sources in frame; contrast up a touch for
 *   that empty-space feel; saturation low (no nearby colored bodies to
 *   support richer mids).
 *
 * `distanceFromSun` is the body's physical heliocentric distance in AU.
 * For bodies with a parentId the engine returns parent-centered
 * positions, so the consumer (`useVisualPresetLerp`) composes the chain
 * via `resolveHeliocentricDistanceAU`. Thresholds are tuned to the real
 * dataset — the prior 500 / 3000 numbers left every body except Sedna in
 * INNER_SYSTEM and meant DEEP_SPACE never triggered.
 */

export type VisualPresetType =
  | "DEEP_SPACE"
  | "PLANET_ORBIT"
  | "CLOSE_FLYBY"
  | "INNER_SYSTEM"
  | "OUTER_SYSTEM";

export interface VisualPreset {
  bloomIntensity: number;
  bloomThreshold: number;
  bloomRadius: number;
  saturation: number;
  contrast: number;
  brightness: number;
  ambientIntensity: number;
  sunIntensity: number;
  shadowIntensity: number;
  envMapIntensity: number;
  guideIntensity: number;
  vectorIntensity: number;
}

export const VISUAL_PRESETS: Record<VisualPresetType, VisualPreset> = {
  DEEP_SPACE: {
    bloomIntensity: 1.1,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.16,
    contrast: 0.33,
    brightness: 0.0,
    ambientIntensity: 0.03,
    sunIntensity: 0.35,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
    guideIntensity: 0.85,
    vectorIntensity: 1.0,
  },
  PLANET_ORBIT: {
    bloomIntensity: 1.0,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.18,
    contrast: 0.3,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
    guideIntensity: 1.0,
    vectorIntensity: 1.0,
  },
  CLOSE_FLYBY: {
    bloomIntensity: 0.75,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.18,
    contrast: 0.28,
    brightness: 0.02,
    ambientIntensity: 0.05,
    sunIntensity: 0.4,
    shadowIntensity: 1.3,
    envMapIntensity: 2.1,
    guideIntensity: 0.7,
    vectorIntensity: 1.0,
  },
  INNER_SYSTEM: {
    bloomIntensity: 1.0,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.22,
    contrast: 0.3,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.45,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
    guideIntensity: 1.0,
    vectorIntensity: 1.0,
  },
  OUTER_SYSTEM: {
    bloomIntensity: 1.0,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.15,
    contrast: 0.32,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.35,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
    guideIntensity: 0.95,
    vectorIntensity: 1.0,
  },
};

export function getPresetForContext(
  distanceFromSun: number,
  cameraDistance: number
): VisualPresetType {
  // `distanceFromSun` is physical heliocentric distance in AU;
  // `cameraDistance` is OrbitControls.getDistance(), which is in the
  // render-space units that OrbitControls owns (separate from AU).
  // Camera-proximity beats system region so focused-body framing wins.

  if (cameraDistance < 200) return "CLOSE_FLYBY"; // Very close to a body
  if (cameraDistance < 2000) return "PLANET_ORBIT"; // Orbiting a body

  // No close body — classify by where in the system we are.
  if (distanceFromSun < 3.5) return "INNER_SYSTEM"; // Mercury → main belt
  if (distanceFromSun < 50) return "OUTER_SYSTEM"; // Jupiter → near Kuiper

  return "DEEP_SPACE"; // Scattered disk, Sedna-likes, beyond
}
