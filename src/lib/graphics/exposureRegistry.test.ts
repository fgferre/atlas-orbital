import { afterEach, describe, expect, it } from "vitest";

import { SOLAR_IRRADIANCE_MAX_AU } from "./solarIrradiance";
import {
  EXPOSURE_ADAPTATION_MAX,
  EXPOSURE_ADAPTATION_MIN,
  SCENE_EXPOSURE_MAX,
  SCENE_EXPOSURE_MIN,
  getExposureAdaptation,
  getExposureAnchor,
  getSceneExposure,
  resetSceneExposure,
  sceneExposure,
  setExposureAdaptation,
  setExposureAnchor,
} from "./exposureRegistry";

afterEach(() => {
  // Mutable singleton — a test that moves a factor must not leak.
  resetSceneExposure();
});

describe("exposure registry — the two-factor composition (Onda 2.4)", () => {
  it("starts neutral: both factors 1, product 1", () => {
    expect(getExposureAnchor()).toBe(1);
    expect(getExposureAdaptation()).toBe(1);
    expect(getSceneExposure()).toBe(1);
  });

  it("composes the scene exposure as anchor × adaptation", () => {
    setExposureAnchor(89);
    setExposureAdaptation(0.5);
    expect(getSceneExposure()).toBeCloseTo(44.5, 10);
  });

  it("each driver owns exactly one factor — neither can overwrite the other", () => {
    // The structural half of the "single multiplier" law: two writers on
    // one number is the stacked-multiplier failure mode the lighting plan
    // names. Writing one factor must leave the other bit-identical.
    setExposureAnchor(906);
    const adaptationBefore = getExposureAdaptation();
    setExposureAdaptation(0.75);
    expect(getExposureAnchor()).toBe(906);
    expect(adaptationBefore).toBe(1);

    const anchorBefore = getExposureAnchor();
    setExposureAnchor(27);
    expect(getExposureAdaptation()).toBe(0.75);
    expect(anchorBefore).toBe(906);
  });

  it("publishes the product through the shared `{ value }` reference", () => {
    // `ExposureBridge` holds the object, not a snapshot — a write has to be
    // visible through the same reference on the next frame.
    const held = sceneExposure;
    setExposureAnchor(4);
    expect(held.value).toBe(4);
  });

  it("ignores non-finite writes instead of poisoning the renderer", () => {
    setExposureAnchor(8);
    setExposureAnchor(Number.NaN);
    setExposureAnchor(Number.POSITIVE_INFINITY);
    expect(getExposureAnchor()).toBe(8);

    setExposureAdaptation(Number.NaN);
    expect(getExposureAdaptation()).toBe(1);
  });
});

describe("exposure registry — bounds", () => {
  it("clamps the anchor to the registry range", () => {
    setExposureAnchor(1e12);
    expect(getExposureAnchor()).toBe(SCENE_EXPOSURE_MAX);
    setExposureAnchor(-5);
    expect(getExposureAnchor()).toBe(SCENE_EXPOSURE_MIN);
  });

  it("the ceiling is the reciprocal of the irradiance module's distance clamp", () => {
    // NOT a taste number: `solarIrradianceAtAU` clamps its input to
    // SOLAR_IRRADIANCE_MAX_AU, so the smallest irradiance the app can
    // produce is 1/AU². The registry has to be able to express its
    // reciprocal, or the anchor's `fused × exposure ≡ 1` invariant would
    // silently break for the farthest bodies — reproducing, for those
    // bodies only, the exact black-disc defect Onda 2.4 exists to fix.
    expect(SCENE_EXPOSURE_MAX).toBe(
      SOLAR_IRRADIANCE_MAX_AU * SOLAR_IRRADIANCE_MAX_AU
    );
  });

  it("the ceiling clears every body the catalog can hold — Neptune, Pluto, Sedna at aphelion", () => {
    // Regression pin for the pre-2.4 ceiling of 16, which would have
    // clipped everything from Jupiter (~27) outward.
    for (const requiredAnchor of [27, 89, 906, 1_560, 9_525, 941_094]) {
      setExposureAnchor(requiredAnchor);
      expect(getExposureAnchor()).toBe(requiredAnchor);
    }
  });

  it("clamps the measured adaptation factor to ±1 stop", () => {
    // The eye-adaptation composition contract. 1d's own mapping bottoms out
    // at STAR_DISPLAY_BLACK_POINT (0.165); the registry is what stops that
    // from relocating the analytical anchor by 2.6 stops.
    setExposureAdaptation(0.165);
    expect(getExposureAdaptation()).toBe(EXPOSURE_ADAPTATION_MIN);

    setExposureAdaptation(50);
    expect(getExposureAdaptation()).toBe(EXPOSURE_ADAPTATION_MAX);
  });

  it("a fully-engaged measured trim moves the anchor by at most one stop", () => {
    setExposureAnchor(89);
    setExposureAdaptation(0.001);
    // Not 89 × 0.001. The subject stays within a stop of reference.
    expect(getSceneExposure()).toBe(44.5);
    expect(getSceneExposure() / 89).toBe(EXPOSURE_ADAPTATION_MIN);
  });

  it("±1 stop is exactly one stop in each direction", () => {
    expect(Math.log2(EXPOSURE_ADAPTATION_MIN)).toBe(-1);
    expect(Math.log2(EXPOSURE_ADAPTATION_MAX)).toBe(1);
  });

  it("clamps the product too, not just the factors", () => {
    setExposureAnchor(SCENE_EXPOSURE_MAX);
    setExposureAdaptation(EXPOSURE_ADAPTATION_MAX);
    expect(getSceneExposure()).toBe(SCENE_EXPOSURE_MAX);
  });
});
