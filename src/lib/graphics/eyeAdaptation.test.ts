import { describe, expect, it } from "vitest";
import {
  EYE_ADAPTATION_CEILING,
  EYE_ADAPTATION_TARGET,
  exposureFromAdaptedLuminance,
  isLuminanceSampleDue,
  stepExposureTowards,
} from "./eyeAdaptation";

describe("exposureFromAdaptedLuminance", () => {
  it("keeps an empty sky at neutral exposure", () => {
    // The GPU sample is floored at `minLuminance = EYE_ADAPTATION_TARGET`,
    // so the common case (deep space) must be byte-identical to pre-1d.
    expect(exposureFromAdaptedLuminance(0)).toBe(EYE_ADAPTATION_CEILING);
    expect(exposureFromAdaptedLuminance(EYE_ADAPTATION_TARGET)).toBe(
      EYE_ADAPTATION_CEILING
    );
  });

  it("never leaves [target, 1] — a blown frame cannot crush the scene", () => {
    for (const luminance of [-1, 0.05, 0.3, 0.9, 1, 4, 1e6, Number.NaN]) {
      const exposure = exposureFromAdaptedLuminance(luminance);
      expect(exposure).toBeGreaterThanOrEqual(EYE_ADAPTATION_TARGET);
      expect(exposure).toBeLessThanOrEqual(EYE_ADAPTATION_CEILING);
    }
  });

  it("dims monotonically as the scene brightens", () => {
    expect(exposureFromAdaptedLuminance(0.9)).toBeLessThan(
      exposureFromAdaptedLuminance(0.4)
    );
  });
});

describe("isLuminanceSampleDue", () => {
  it("caps GPU readbacks at a handful per second at 60 fps", () => {
    // The perf contract: the synchronous-readback-per-frame version of
    // this bridge stalled the pipeline 60×/s. Simulate a second of
    // 60 fps frames and assert the sampler fires only a few times.
    let last = Number.NEGATIVE_INFINITY;
    let samples = 0;
    for (let frame = 0; frame < 60; frame++) {
      const now = (frame * 1000) / 60;
      if (isLuminanceSampleDue(now, last)) {
        last = now;
        samples++;
      }
    }
    expect(samples).toBeLessThanOrEqual(5);
  });
});

describe("stepExposureTowards", () => {
  it("approaches the target without overshooting", () => {
    let value = 1;
    for (let frame = 0; frame < 60; frame++) {
      const next = stepExposureTowards(value, 0.4, 1 / 60);
      expect(next).toBeLessThanOrEqual(value);
      expect(next).toBeGreaterThanOrEqual(0.4);
      value = next;
    }
    // ~1 s of frames against a 0.15 s time constant: effectively there.
    expect(value).toBeCloseTo(0.4, 2);
  });

  it("is inert on a non-advancing or settled frame", () => {
    expect(stepExposureTowards(0.5, 0.5, 1 / 60)).toBe(0.5);
    expect(stepExposureTowards(1, 0.4, 0)).toBe(1);
    expect(stepExposureTowards(1, 0.4, Number.NaN)).toBe(1);
  });
});
