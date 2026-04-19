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
 * - INNER_SYSTEM (distanceFromSun < 500, not orbiting a body): Sun and the
 *   four terrestrials dominate the frame. Slightly higher saturation for
 *   warmer Mercury/Venus/Mars tones; a touch more direct-sun intensity.
 *
 * - OUTER_SYSTEM (500 ≤ distanceFromSun < 3000): ice-giant region. Cooler,
 *   less saturated; slightly dimmer direct sun to read as physically
 *   further from the illuminant.
 *
 * - DEEP_SPACE (distanceFromSun ≥ 3000, Kuiper + beyond): moody/clinical.
 *   Slightly more bloom so remaining bright stars feel like the only
 *   sources in frame; contrast up a touch for that empty-space feel;
 *   saturation low (no nearby colored bodies to support richer mids).
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
  // 1 AU = ~150,000,000 km. In our scale, 1 AU might be represented differently.
  // Assuming standard AU units or similar scale.
  // Prioritize camera distance to body first.

  if (cameraDistance < 200) return "CLOSE_FLYBY"; // Very close to a body
  if (cameraDistance < 2000) return "PLANET_ORBIT"; // Orbiting a body

  // If not close to a specific body, check solar system region
  if (distanceFromSun < 500) return "INNER_SYSTEM"; // Inner solar system (Mercury to Mars)
  if (distanceFromSun < 3000) return "OUTER_SYSTEM"; // Outer solar system (Jupiter to Neptune)

  return "DEEP_SPACE"; // Kuiper belt and beyond
}
