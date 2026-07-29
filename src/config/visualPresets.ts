/**
 * Visual Presets System
 *
 * The 5 presets carry context-tuned grading + lighting values that
 * `useVisualPresetLerp` smooth-interpolates between as `getPresetForContext`
 * re-classifies the camera. Grading is applied in the post chain after
 * the optional tone-mapping pass; tone mapping defaults to AgX on
 * composer tiers as of 1a (see src/lib/graphics/resolver.ts), with
 * "none" available as a Display-panel opt-in for Gaia parity.
 *
 * Per-preset intent:
 *
 * - CLOSE_FLYBY (camera < 200 from a body): surface-detail mode. Bloom
 *   is knocked down (0.15) so planet textures aren't washed by star
 *   halos; slight brightness bump (brightness +0.02) for dark-side
 *   readability when the terminator crosses the frame. Shadow / envMap
 *   tuning used to differentiate this preset but was retired when
 *   T2.5/T2.6 aligned both fields to Gaia-invariant values.
 *
 * - PLANET_ORBIT (camera 200–2000): balanced default — the values that felt
 *   right across the representative-views iteration.
 *
 * - INNER_SYSTEM (distanceFromSun < 3.5 AU, not orbiting a body): Sun and
 *   the four terrestrials + main-belt asteroids dominate the frame.
 *   Slightly higher saturation for warmer Mercury/Venus/Mars tones; a
 *   touch more direct-sun intensity.
 *
 * - OUTER_SYSTEM (3.5 AU ≤ distanceFromSun < 50 AU): gas/ice-giant region
 *   through Pluto and the near Kuiper belt. Cooler and less saturated.
 *
 * - DEEP_SPACE (distanceFromSun ≥ 50 AU): scattered disk + Sedna-like
 *   orbits. Moody/clinical. Slightly more bloom (0.35) so remaining
 *   bright stars feel like the only sources in frame; contrast up a
 *   touch for that empty-space feel; saturation low (no nearby colored
 *   bodies to support richer mids).
 *
 * Gaia-fidelity lighting baselines are intentionally invariant across
 * presets: global ambient is Gaia's `scene.renderer.ambient: 0.0`
 * (`config.yaml:238`), the central solar point light mirrors
 * `LightingUtils.java:49`'s `pointLight.intensity = 1`, and
 * `envMapIntensity = 0` mirrors Gaia's lack of a diffuse irradiance
 * cubemap — `pbr.fragment.glsl:620-621` uses the reflection skybox
 * only for specular (`finalReflection = reflectionColor * AO`), never
 * for diffuse IBL. `shadowIntensity` fed the focused-body directional
 * helper.
 *
 * **`shadowIntensity` currently changes nothing, 2026-07-28.** It drives
 * `SmartSunLight`, which `SmartSunLight.tsx:74` puts on layer 1 while the
 * render camera stays on layer 0 — and three collects lights only when
 * `object.layers.test(camera.layers)` passes. That light therefore emits
 * neither light nor shadow, and no shadow map is ever allocated. The
 * earlier text here claimed the value was "held at an empirical floor
 * (0.4) that preserves visible self-shadow contrast" with a measured
 * "over-brightness vs Gaia ≈1.4×"; neither can be true of an inert light,
 * so both are removed rather than restated. What self-shadowing the app
 * does show comes from the analytical eclipse path, not from a shadow map.
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
    // 1b: selective bloom on the HDR-allow-list (Sun + bright stars)
    // now fires by default. 0.35 base × tier multiplier (1 on ultra/high,
    // 0.75 on balanced, 0 on constrained — see PRESET_DEFAULTS) gives a
    // gentle glare that reads as "overwhelming light source" without
    // washing the black. `luminanceThreshold=1.0` keeps it selective:
    // only genuinely-HDR pixels (Sun disk, sun-glint, lit terminator
    // through AgX) cross — planets stay matte. See
    // tasks/archive/sweeps/opportunity-sweep-findings-v2-2026-06-16.md §129.
    bloomIntensity: 0.35,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.16,
    contrast: 0.33,
    brightness: 0.0,
    ambientIntensity: 0.0,
    sunIntensity: 1.0,
    shadowIntensity: 0.4,
    envMapIntensity: 0.0,
    guideIntensity: 0.85,
    vectorIntensity: 1.0,
  },
  PLANET_ORBIT: {
    bloomIntensity: 0.3,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.18,
    contrast: 0.3,
    brightness: 0.0,
    ambientIntensity: 0.0,
    sunIntensity: 1.0,
    shadowIntensity: 0.4,
    envMapIntensity: 0.0,
    guideIntensity: 1.0,
    vectorIntensity: 1.0,
  },
  CLOSE_FLYBY: {
    // Knocked down so planet textures aren't washed by star halos at
    // surface-detail magnification — the Sun is still on the HDR
    // allow-list so it keeps its glow, but the threshold=1.0 contract
    // + lower intensity keeps regolith crisp.
    bloomIntensity: 0.15,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.18,
    contrast: 0.28,
    brightness: 0.02,
    ambientIntensity: 0.0,
    sunIntensity: 1.0,
    shadowIntensity: 0.4,
    envMapIntensity: 0.0,
    guideIntensity: 0.7,
    vectorIntensity: 1.0,
  },
  INNER_SYSTEM: {
    bloomIntensity: 0.3,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.22,
    contrast: 0.3,
    brightness: 0.0,
    ambientIntensity: 0.0,
    sunIntensity: 1.0,
    shadowIntensity: 0.4,
    envMapIntensity: 0.0,
    guideIntensity: 1.0,
    vectorIntensity: 1.0,
  },
  OUTER_SYSTEM: {
    bloomIntensity: 0.3,
    bloomThreshold: 1.0,
    bloomRadius: 0.3,
    saturation: 0.15,
    contrast: 0.32,
    brightness: 0.0,
    ambientIntensity: 0.0,
    sunIntensity: 1.0,
    shadowIntensity: 0.4,
    envMapIntensity: 0.0,
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
