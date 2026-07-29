import { describe, expect, it } from "vitest";

import { VISUAL_PRESETS } from "../../../config/visualPresets";
import {
  AMBIENT_VIEWING_FLOOR,
  resolveLerpRefTargets,
  type GraphicsOverrides,
} from "./visualPresetOverrides";

const BASE_PRESET = VISUAL_PRESETS.DEEP_SPACE;

describe("resolveLerpRefTargets — Wave 0 identity invariant", () => {
  it("with empty overrides and bloomIntensityMultiplier=1, every field matches the preset base (identity) — except the Onda 1.3 ambient floor", () => {
    const result = resolveLerpRefTargets(BASE_PRESET, {}, 1);

    expect(result.bloomIntensity).toBe(BASE_PRESET.bloomIntensity);
    expect(result.bloomThreshold).toBe(BASE_PRESET.bloomThreshold);
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.contrast).toBe(BASE_PRESET.contrast);
    expect(result.brightness).toBe(BASE_PRESET.brightness);
    // Not identity: the display ambient floor is active by default
    // (mul defaults to 1) and the preset's own ambientIntensity is 0.0
    // on every preset, so the floor always wins the max().
    expect(result.ambientIntensity).toBe(AMBIENT_VIEWING_FLOOR);
    expect(result.sunIntensity).toBe(BASE_PRESET.sunIntensity);
    expect(result.shadowIntensity).toBe(BASE_PRESET.shadowIntensity);
    expect(result.envMapIntensity).toBe(BASE_PRESET.envMapIntensity);
  });

  it("with empty overrides and bloomIntensityMultiplier=0.75, bloom is scaled but other fields stay preset", () => {
    // balanced-tier scenario: qualityProfile injects 0.75; the refactor
    // must preserve that exact math.
    const result = resolveLerpRefTargets(BASE_PRESET, {}, 0.75);

    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 0.75,
      10
    );
    expect(result.bloomThreshold).toBe(BASE_PRESET.bloomThreshold);
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.ambientIntensity).toBe(AMBIENT_VIEWING_FLOOR);
  });

  it("with empty overrides and bloomIntensityMultiplier=0 (constrained tier), bloomIntensity collapses to 0", () => {
    const result = resolveLerpRefTargets(BASE_PRESET, {}, 0);
    expect(result.bloomIntensity).toBe(0);
    // Every other field is unchanged — bloomIntensityMultiplier does
    // not touch the rest of the pipeline.
    expect(result.saturation).toBe(BASE_PRESET.saturation);
    expect(result.contrast).toBe(BASE_PRESET.contrast);
  });
});

describe("resolveLerpRefTargets — override composition", () => {
  it("bloomIntensity is absolute so users can opt into bloom over Gaia's 0 default", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomIntensity: 0.8, bloomIntensityMul: 2 },
      0.75
    );
    expect(result.bloomIntensity).toBe(0.8);
  });

  it("bloomIntensityMul doubles the bloom target", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomIntensityMul: 2 },
      1
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
      0.75
    );
    expect(result.bloomIntensity).toBeCloseTo(
      BASE_PRESET.bloomIntensity * 0.75 * 2,
      10
    );
  });

  it("bloomThreshold is absolute — preset value is ignored", () => {
    const OVERRIDE_THRESHOLD = 0.42;
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { bloomThreshold: OVERRIDE_THRESHOLD },
      1
    );
    expect(result.bloomThreshold).toBe(OVERRIDE_THRESHOLD);
    expect(result.bloomThreshold).not.toBe(BASE_PRESET.bloomThreshold);
  });

  it("contrastDelta is additive: preset.contrast + delta", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { contrastDelta: 0.1 },
      1
    );
    expect(result.contrast).toBeCloseTo(BASE_PRESET.contrast + 0.1, 10);
  });

  it("brightnessDelta is additive: preset.brightness + delta (works with negative delta)", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { brightnessDelta: -0.3 },
      1
    );
    expect(result.brightness).toBeCloseTo(BASE_PRESET.brightness - 0.3, 10);
  });

  it("saturationMul scales the preset saturation", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { saturationMul: 1.5 },
      1
    );
    expect(result.saturation).toBeCloseTo(BASE_PRESET.saturation * 1.5, 10);
  });

  it("every surviving *Mul field scales the matching preset field independently", () => {
    // shadowIntensityMul / envMapIntensityMul were deleted in Onda 1.1
    // (dead controls — see resolver.ts's GraphicsOverrides JSDoc trail).
    const overrides: GraphicsOverrides = {
      ambientIntensityMul: 2,
      sunIntensityMul: 0.5,
    };
    const result = resolveLerpRefTargets(BASE_PRESET, overrides, 1);
    // Floor composition (Onda 1.3): max(preset 0.0, floor 0.02) * mul.
    expect(result.ambientIntensity).toBeCloseTo(AMBIENT_VIEWING_FLOOR * 2, 10);
    expect(result.sunIntensity).toBeCloseTo(BASE_PRESET.sunIntensity * 0.5, 10);
    // shadowIntensity / envMapIntensity always pass the preset value
    // through now — no override can move them.
    expect(result.shadowIntensity).toBe(BASE_PRESET.shadowIntensity);
    expect(result.envMapIntensity).toBe(BASE_PRESET.envMapIntensity);
  });

  it("ambientIntensityMul=0 zeroes the floor (true unassisted black)", () => {
    const result = resolveLerpRefTargets(
      BASE_PRESET,
      { ambientIntensityMul: 0 },
      1
    );
    expect(result.ambientIntensity).toBe(0);
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
    };
    const result = resolveLerpRefTargets(BASE_PRESET, overrides, 0.75);
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
