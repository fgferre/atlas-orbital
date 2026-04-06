import { describe, expect, it } from "vitest";
import {
  calculateQualityScore,
  collectDeviceSignals,
  resolveQualityProfile,
} from "./qualityProfile";

describe("qualityProfile", () => {
  it("resolves constrained hardware to the constrained profile", () => {
    const profile = resolveQualityProfile("auto", {
      deviceMemory: 1,
      hardwareConcurrency: 2,
      effectiveType: "2g",
      viewportWidth: 720,
      viewportHeight: 800,
      devicePixelRatio: 3,
    });

    expect(
      calculateQualityScore({
        deviceMemory: 1,
        hardwareConcurrency: 2,
        effectiveType: "2g",
        viewportWidth: 720,
        viewportHeight: 800,
        devicePixelRatio: 3,
      })
    ).toBeLessThanOrEqual(-2);

    expect(profile).toEqual(
      expect.objectContaining({
        name: "constrained",
        antialias: false,
        dprMax: 1,
        shadowMapSize: 1024,
        environmentResolution: 64,
        bloomEnabled: false,
        bloomIntensityMultiplier: 0,
      })
    );
  });

  it("resolves mixed capability signals to the balanced profile", () => {
    const profile = resolveQualityProfile("auto", {
      deviceMemory: 4,
      hardwareConcurrency: 8,
      effectiveType: "3g",
      viewportWidth: 1280,
      viewportHeight: 800,
      devicePixelRatio: 2,
    });

    expect(
      calculateQualityScore({
        deviceMemory: 4,
        hardwareConcurrency: 8,
        effectiveType: "3g",
        viewportWidth: 1280,
        viewportHeight: 800,
        devicePixelRatio: 2,
      })
    ).toBe(-1);

    expect(profile).toEqual(
      expect.objectContaining({
        name: "balanced",
        antialias: false,
        dprMax: 1.5,
        shadowMapSize: 2048,
        environmentResolution: 128,
        bloomEnabled: true,
        bloomIntensityMultiplier: 0.75,
      })
    );
  });

  it("resolves strong desktop signals to the ultra profile", () => {
    const profile = resolveQualityProfile("auto", {
      deviceMemory: 16,
      hardwareConcurrency: 12,
      effectiveType: "4g",
      viewportWidth: 1600,
      viewportHeight: 1200,
      devicePixelRatio: 2,
    });

    expect(
      calculateQualityScore({
        deviceMemory: 16,
        hardwareConcurrency: 12,
        effectiveType: "4g",
        viewportWidth: 1600,
        viewportHeight: 1200,
        devicePixelRatio: 2,
      })
    ).toBeGreaterThanOrEqual(4);

    expect(profile).toEqual(
      expect.objectContaining({
        name: "ultra",
        antialias: true,
        dprMax: 2,
        shadowMapSize: 4096,
        environmentResolution: 256,
        bloomEnabled: true,
        bloomIntensityMultiplier: 1,
      })
    );
  });

  it("returns manual profiles verbatim", () => {
    expect(resolveQualityProfile("high")).toEqual(
      expect.objectContaining({
        name: "high",
        antialias: true,
        dprMax: 1.75,
        shadowMapSize: 4096,
        environmentResolution: 256,
        bloomEnabled: true,
        bloomIntensityMultiplier: 1,
      })
    );
  });

  it("collects device signals safely from a window-like object", () => {
    const signals = collectDeviceSignals({
      innerWidth: 1440,
      innerHeight: 900,
      devicePixelRatio: 2.5,
      navigator: {
        deviceMemory: 8,
        hardwareConcurrency: 12,
        connection: { effectiveType: "4g" },
      },
    });

    expect(signals).toEqual({
      deviceMemory: 8,
      hardwareConcurrency: 12,
      effectiveType: "4g",
      viewportWidth: 1440,
      viewportHeight: 900,
      devicePixelRatio: 2.5,
    });
  });
});
