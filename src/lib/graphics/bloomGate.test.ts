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

  it("mirrors Gaia default out-of-box (bloomEnabled=true, intensity=0 → skipped)", () => {
    // Atlas presets ship bloomEnabled=true for ultra/high/medium AND
    // bloomIntensity=0 for all 5 visual presets, matching Gaia's
    // default `bloom.intensity: 0.0` in `config.yaml`. Both default
    // paths resolve to "do not mount Bloom".
    expect(shouldMountBloom(true, 0)).toBe(false);
  });
});
