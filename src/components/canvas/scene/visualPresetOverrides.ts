/**
 * Pure override-resolution math for `useVisualPresetLerp`.
 *
 * Wave α (R2 Wave 0) ship this module to single-source the per-frame
 * visual-parameter writes: the hook remains the only imperative caller
 * that mutates effect / light refs, but the math that turns
 * `(preset, overrides, multiplier, debugValues)` into the target numbers
 * lives here as a pure function. Three reasons:
 *
 * 1. The "identity when `overrides = {}`" gate for Wave 0 is a
 *    pure-function equality check — it does not require a Playwright
 *    pixel-diff to prove, and it's stricter than one (see
 *    `visualPresetOverrides.test.ts`).
 * 2. Wave 1 (R2) plugs the real `graphicsSlice.graphicsOverrides`
 *    into the same function without touching the hook.
 * 3. Unit-testable in vitest without R3F / THREE.
 *
 * Composition conventions (design §5 + §0):
 *   - `*Mul` fields: multiplier over the preset base (default 1).
 *   - `*Delta` fields: additive delta over the preset base (default 0).
 *   - bare fields (e.g. `bloomThreshold`): absolute override
 *     (default = preset value).
 *
 * `bloomIntensity` additionally composes with the quality-profile
 * gate's `bloomIntensityMultiplier` (ultra 1 / high 1 / balanced 0.75 /
 * constrained 0). Wave 1 folds that multiplier into the preset-default
 * table in `resolver.ts`; for Wave 0 it is passed in so the refactor
 * stays byte-identical to `qualityProfile.ts`'s shipped behavior.
 */

import type { VisualPreset } from "../../../config/visualPresets";

/**
 * User override record. Every field is optional; `undefined` means
 * "fall through to the preset base". In Commit 3 this moves into
 * `src/store/graphicsSlice.ts`; the local definition here lets Wave 0
 * ship without depending on the slice that Wave 1 introduces.
 */
export interface GraphicsOverrides {
  /** Multiplier applied to `preset.bloomIntensity × qualityMultiplier`. */
  bloomIntensityMul?: number;
  /** Absolute override for bloom threshold (preset value ignored). */
  bloomThreshold?: number;
  /** Multiplier applied to `preset.saturation`. */
  saturationMul?: number;
  /** Additive delta over `preset.contrast`. */
  contrastDelta?: number;
  /** Additive delta over `preset.brightness`. */
  brightnessDelta?: number;
  /** Multiplier applied to `preset.ambientIntensity`. */
  ambientIntensityMul?: number;
  /** Multiplier applied to `preset.sunIntensity`. */
  sunIntensityMul?: number;
  /** Multiplier applied to `preset.shadowIntensity`. */
  shadowIntensityMul?: number;
  /** Multiplier applied to `preset.envMapIntensity`. */
  envMapIntensityMul?: number;
}

/**
 * Debug-panel (Leva) values. Mirrors the nine fields the debug folder
 * exposes in `useSceneDebugControls.ts`. When `debugMode` is true,
 * these are returned verbatim (Leva is authoritative in debug mode —
 * Wave 1 rewires Leva through the slice; Wave 0 preserves today's
 * behavior).
 */
export interface DebugRefValues {
  ambientIntensity: number;
  sunIntensity: number;
  shadowIntensity: number;
  envMapIntensity: number;
  bloomThreshold: number;
  bloomIntensity: number;
  saturation: number;
  contrast: number;
  brightness: number;
}

/** Shape the hook writes into the effect / light / scene refs. */
export interface ResolvedRefTargets {
  bloomIntensity: number;
  bloomThreshold: number;
  saturation: number;
  brightness: number;
  contrast: number;
  ambientIntensity: number;
  sunIntensity: number;
  shadowIntensity: number;
  envMapIntensity: number;
}

/**
 * Compute the values the hook writes to each ref this frame.
 *
 * Identity invariant (Wave 0 gate): with `overrides = {}` and
 * `debugMode = false`, the output equals the pre-Wave-α behavior at
 * `Scene.tsx` commit `8969cf7` — field by field:
 *
 *   bloomIntensity   = preset.bloomIntensity × bloomIntensityMultiplier
 *   bloomThreshold   = preset.bloomThreshold
 *   saturation       = preset.saturation
 *   contrast         = preset.contrast
 *   brightness       = preset.brightness
 *   ambientIntensity = preset.ambientIntensity
 *   sunIntensity     = preset.sunIntensity
 *   shadowIntensity  = preset.shadowIntensity
 *   envMapIntensity  = preset.envMapIntensity
 *
 * `visualPresetOverrides.test.ts` pins this identity against explicit
 * numeric expectations for every field.
 */
export const resolveLerpRefTargets = (
  preset: VisualPreset,
  overrides: GraphicsOverrides,
  bloomIntensityMultiplier: number,
  debugMode: boolean,
  debugValues: DebugRefValues
): ResolvedRefTargets => {
  if (debugMode) {
    return {
      bloomIntensity: debugValues.bloomIntensity,
      bloomThreshold: debugValues.bloomThreshold,
      saturation: debugValues.saturation,
      brightness: debugValues.brightness,
      contrast: debugValues.contrast,
      ambientIntensity: debugValues.ambientIntensity,
      sunIntensity: debugValues.sunIntensity,
      shadowIntensity: debugValues.shadowIntensity,
      envMapIntensity: debugValues.envMapIntensity,
    };
  }

  return {
    bloomIntensity:
      preset.bloomIntensity *
      bloomIntensityMultiplier *
      (overrides.bloomIntensityMul ?? 1),
    bloomThreshold: overrides.bloomThreshold ?? preset.bloomThreshold,
    saturation: preset.saturation * (overrides.saturationMul ?? 1),
    brightness: preset.brightness + (overrides.brightnessDelta ?? 0),
    contrast: preset.contrast + (overrides.contrastDelta ?? 0),
    ambientIntensity:
      preset.ambientIntensity * (overrides.ambientIntensityMul ?? 1),
    sunIntensity: preset.sunIntensity * (overrides.sunIntensityMul ?? 1),
    shadowIntensity:
      preset.shadowIntensity * (overrides.shadowIntensityMul ?? 1),
    envMapIntensity:
      preset.envMapIntensity * (overrides.envMapIntensityMul ?? 1),
  };
};
