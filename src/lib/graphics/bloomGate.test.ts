import { describe, it, expect } from "vitest";
import { shouldMountBloom } from "./bloomGate";

describe("T5.3a shouldMountBloom — Gaia MainPostProcessor.java:335 parity", () => {
  it("bloomEnabled=false always skips (matches low-tier preset)", () => {
    expect(shouldMountBloom(false, 0)).toBe(false);
    expect(shouldMountBloom(false, 0.5)).toBe(false);
    expect(shouldMountBloom(false, 1.0)).toBe(false);
    expect(shouldMountBloom(false, undefined)).toBe(false);
  });

  it("effectiveBloomIntensity=undefined skips (no preset value + no override)", () => {
    expect(shouldMountBloom(true, undefined)).toBe(false);
  });

  it("effectiveBloomIntensity=0 skips (matches Gaia default config.yaml:bloom.intensity=0.0)", () => {
    expect(shouldMountBloom(true, 0)).toBe(false);
  });

  it("effectiveBloomIntensity>0 AND bloomEnabled=true mounts", () => {
    expect(shouldMountBloom(true, 0.1)).toBe(true);
    expect(shouldMountBloom(true, 0.5)).toBe(true);
    expect(shouldMountBloom(true, 1.0)).toBe(true);
    expect(shouldMountBloom(true, 10.0)).toBe(true);
  });

  it("negative effectiveBloomIntensity skips (defensive clamp)", () => {
    expect(shouldMountBloom(true, -0.1)).toBe(false);
    expect(shouldMountBloom(true, -1.0)).toBe(false);
  });

  it("tiny positive effectiveBloomIntensity mounts (no epsilon threshold)", () => {
    // Matches Gaia's strict `intensity > 0` check — even 1e-10 mounts.
    expect(shouldMountBloom(true, 1e-10)).toBe(true);
  });

  it("intensity=0 predicate: skips even when bloomEnabled=true", () => {
    // 1b: this is the per-predicate behavior the gate relies on when
    // the user drags Bloom Intensity to 0 — `shouldMountBloom` returns
    // false, the <Bloom> component unmounts, and the 5-mip pass drops
    // out of the frame budget. Out-of-box the visual presets are now
    // NON-zero (0.35 / 0.3 / 0.15 / 0.3 / 0.3 — see visualPresets.ts),
    // so the default path MOUNTS bloom; this test just verifies the
    // "user explicitly zeroed it → skip" edge case still holds.
    expect(shouldMountBloom(true, 0)).toBe(false);
  });
});
