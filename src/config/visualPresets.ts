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
}

export const VISUAL_PRESETS: Record<VisualPresetType, VisualPreset> = {
  DEEP_SPACE: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.78,
    bloomRadius: 0.3,
    saturation: 0.29,
    contrast: 0.42,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
  },
  PLANET_ORBIT: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.78,
    bloomRadius: 0.3,
    saturation: 0.29,
    contrast: 0.42,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
  },
  CLOSE_FLYBY: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.78,
    bloomRadius: 0.3,
    saturation: 0.29,
    contrast: 0.42,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
  },
  INNER_SYSTEM: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.78,
    bloomRadius: 0.3,
    saturation: 0.29,
    contrast: 0.42,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
  },
  OUTER_SYSTEM: {
    bloomIntensity: 0.6,
    bloomThreshold: 0.78,
    bloomRadius: 0.3,
    saturation: 0.29,
    contrast: 0.42,
    brightness: 0.0,
    ambientIntensity: 0.035,
    sunIntensity: 0.4,
    shadowIntensity: 1.5,
    envMapIntensity: 1.9,
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
