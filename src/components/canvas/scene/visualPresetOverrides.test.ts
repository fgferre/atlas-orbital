import { describe, expect, it } from "vitest";

import { VISUAL_PRESETS } from "../../../config/visualPresets";
import {
  resolveLerpRefTargets,
  type DebugRefValues,
  type GraphicsOverrides,
} from "./visualPresetOverrides";

const BASE_PRESET = VISUAL_PRESETS.DEEP_SPACE;

// Representative debug values — distinct from preset so tests can tell
// which branch (debug vs preset+override) fired.
const DEBUG_VALUES: DebugRefValues = {
  ambientIntensity: 0.42,
  sunIntensity: 3.14,
  shadowIntensity: 2.71,
  envMapIntensity: 1.23,
  bloomThreshold: 0.11,
  bloomIntensity: 1.5,
  saturation: 0.88,
  contrast: 0.99,
  brightness: 0.22,
};

describe("resolveLerpRefTargets — Wave 0 identity invariant", () => {
  it("with empty overrides and bloomIntensityMultiplier=1, every field matches the preset base (identity)", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      {},
      1,
      false,
      DEBUG_VALUES
    );

    expect(result.bloomIntensity).toBe(BASE_PRESET.bloomIntensity);
    expect(result.bloomThreshold).toBe(BASE_PRESET.bloomThreshold);
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.contrast).toBe(BASE_PRESET.contrast);
    expect(result.brightness).toBe(BASE_PRESET.brightness);
    expect(result.ambientIntensity).toBe(BASE_PRESET.ambientIntensity);
    expect(result.sunIntensity).toBe(BASE_PRESET.sunIntensity);
    expect(result.shadowIntensity).toBe(BASE_PRESET.shadowIntensity);
    expect(result.envMapIntensity).toBe(BASE_PRESET.envMapIntensity);
  });

  it("with empty overrides and bloomIntensityMultiplier=0.75, bloom is scaled but other fields stay preset", () => {
    // balanced-tier scenario: qualityProfile injects 0.75; the refactor
    // must preserve that exact math.
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      {},
      0.75,
      false,
      DEBUG_VALUES
    );

    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 0.75,
      10
    );
    expect(result.bloomThreshold).toBe(BASE_PRESET.bloomThreshold);
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.ambientIntensity).toBe(BASE_PRESET.ambientIntensity);
  });

  it("with empty overrides and bloomIntensityMultiplier=0 (constrained tier), bloomIntensity collapses to 0", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      {},
      0,
      false,
      DEBUG_VALUES
    );
    expect(result.bloomIntensity).toBe(0);
    // Every other field is unchanged — bloomIntensityMultiplier does
    // not touch the rest of the pipeline.
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.contrast).toBe(BASE_PRESET.contrast);
  });
});

describe("resolveLerpRefTargets — override composition", () => {
  it("bloomIntensityMul doubles the bloom target", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomIntensityMul: 2 },
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 2,
      10
    );
  });

  it("bloomIntensityMul composes multiplicatively with bloomIntensityMultiplier", () => {
    // balanced tier (0.75) + user turns bloom up 2x → net 1.5x
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomIntensityMul: 2 },
      0.75,
      false,
      DEBUG_VALUES
    );
    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 0.75 * 2,
      10
    );
  });

  it("bloomThreshold is absolute — preset value is ignored", () => {
    // Override value deliberately different from the preset base so
    // "the override wins" is visible. After the Wave α HDR-contract
    // shift, preset `bloomThreshold` is 1.0; we pick 0.42 for the
    // override so neither `override === preset` nor `override ===
    // preset × anything trivial` can sneak a false pass.
    const OVERRIDE_THRESHOLD = 0.42;
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomThreshold: OVERRIDE_THRESHOLD },
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.bloomThreshold).toBe(OVERRIDE_THRESHOLD);
    expect(result.bloomThreshold).not.toBe(BASE_PRESET.bloomThreshold);
  });

  it("contrastDelta is additive: preset.contrast + delta", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { contrastDelta: 0.1 },
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.contrast).toBeCloseTo(BASE_PRESET.contrast + 0.1, 10);
  });

  it("brightnessDelta is additive: preset.brightness + delta (works with negative delta)", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { brightnessDelta: -0.3 },
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.brightness).toBeCloseTo(BASE_PRESET.brightness - 0.3, 10);
  });

  it("saturationMul scales the preset saturation", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { saturationMul: 1.5 },
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.saturation).toBeCloseTo(BASE_PRESET.saturation * 1.5, 10);
  });

  it("every *Mul field scales the matching preset field independently", () => {
    const overrides: GraphicsOverrides = {
      ambientIntensityMul: 2,
      sunIntensityMul: 0.5,
      shadowIntensityMul: 1.25,
      envMapIntensityMul: 3,
    };
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      overrides,
      1,
      false,
      DEBUG_VALUES
    );
    expect(result.ambientIntensity).toBeCloseTo(
      BASE_PRESET.ambientIntensity * 2,
      10
    );
    expect(result.sunIntensity).toBeCloseTo(BASE_PRESET.sunIntensity * 0.5, 10);
    expect(result.shadowIntensity).toBeCloseTo(
      BASE_PRESET.shadowIntensity * 1.25,
      10
    );
    expect(result.envMapIntensity).toBeCloseTo(
      BASE_PRESET.envMapIntensity * 3,
      10
    );
  });

  it("all override types combined produce the expected composite", () => {
    const overrides: GraphicsOverrides = {
      bloomIntensityMul: 2,
      bloomThreshold: 0.5,
      saturationMul: 1.5,
      contrastDelta: 0.1,
      brightnessDelta: -0.2,
      ambientIntensityMul: 2,
      sunIntensityMul: 0.5,
      shadowIntensityMul: 1.25,
      envMapIntensityMul: 3,
    };
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      overrides,
      0.75,
      false,
      DEBUG_VALUES
    );
    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 0.75 * 2,
      10
    );
    expect(result.bloomThreshold).toBe(0.5);
    expect(result.saturation).toBeCloseTo(BASE_PRESET.saturation * 1.5, 10);
    expect(result.contrast).toBeCloseTo(BASE_PRESET.contrast + 0.1, 10);
    expect(result.brightness).toBeCloseTo(BASE_PRESET.brightness - 0.2, 10);
  });
});

describe("resolveLerpRefTargets — debug-mode branch", () => {
  it("returns debugValues verbatim when debugMode=true, ignoring preset and overrides", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomIntensityMul: 99, saturationMul: 99 },
      0.75,
      true,
      DEBUG_VALUES
    );
    expect(result.bloomIntensity).toBe(DEBUG_VALUES.bloomIntensity);
    expect(result.bloomThreshold).toBe(DEBUG_VALUES.bloomThreshold);
    expect(result.saturation).toBe(DEBUG_VALUES.saturation);
    expect(result.contrast).toBe(DEBUG_VALUES.contrast);
    expect(result.brightness).toBe(DEBUG_VALUES.brightness);
    expect(result.ambientIntensity).toBe(DEBUG_VALUES.ambientIntensity);
    expect(result.sunIntensity).toBe(DEBUG_VALUES.sunIntensity);
    expect(result.shadowIntensity).toBe(DEBUG_VALUES.shadowIntensity);
    expect(result.envMapIntensity).toBe(DEBUG_VALUES.envMapIntensity);
  });
});
