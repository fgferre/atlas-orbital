/**
 * Pure override-resolution math for `useVisualPresetLerp`.
 *
 * The hook remains the only imperative caller that mutates effect /
 * light refs, but the math that turns `(preset, overrides, multiplier)`
 * into the target numbers lives here as a pure function so:
 *
 * 1. The "identity when `overrides = {}`" contract is a pure-function
 *    equality check — stricter than a Playwright pixel-diff (see
 *    `visualPresetOverrides.test.ts`).
 * 2. `useEffectiveGraphics` + DisplayPanel's sliders plug into the
 *    same function without touching the hook.
 * 3. Unit-testable in vitest without R3F / THREE.
 *
 * Composition conventions (graphics-settings-design §5 + §0):
 *   - `*Mul` fields: multiplier over the preset base (default 1).
 *   - `*Delta` fields: additive delta over the preset base (default 0).
 *   - bare fields (e.g. `bloomThreshold`): absolute override
 *     (default = preset value).
 *
 * `bloomIntensity` additionally composes with the quality-profile
 * gate's `bloomIntensityMultiplier` (ultra 1 / high 1 / balanced 0.75
 * / constrained 0). The resolver folds that multiplier into
 * `PRESET_DEFAULTS.bloomIntensityMul` in `src/lib/graphics/resolver.ts`;
 * we pass it into this function so the hook stays byte-identical to
 * `qualityProfile.ts`'s shipped behavior while both paths coexist.
 *
 * The earlier Leva debug branch (debugMode + debugValues) was removed
 * when the Leva panel retired — the DisplayPanel is the single
 * canonical user surface for these knobs, and the artist-calibration
 * constants that remained live in `src/config/artistCalibration.ts`.
 */

import type { VisualPreset } from "../../../config/visualPresets";

/**
 * User override record. Every field is optional; `undefined` means
 * "fall through to the preset base".
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
 * Identity invariant: with `overrides = {}` and
 * `bloomIntensityMultiplier = 1`, every field equals the
 * corresponding preset field. `visualPresetOverrides.test.ts` pins
 * this against explicit numeric expectations.
 */
export const resolveLerpRefTargets = (
  preset: VisualPreset,
  overrides: GraphicsOverrides,
  bloomIntensityMultiplier: number
): ResolvedRefTargets => ({
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
  shadowIntensity: preset.shadowIntensity * (overrides.shadowIntensityMul ?? 1),
  envMapIntensity: preset.envMapIntensity * (overrides.envMapIntensityMul ?? 1),
});
