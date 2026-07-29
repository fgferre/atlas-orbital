import { describe, expect, it } from "vitest";

import { getPresetForContext, VISUAL_PRESETS } from "./visualPresets";

// `getPresetForContext(distanceFromSun, cameraDistance)` is the
// auto-preset classifier consumed by `useVisualPresetLerp`. The camera
// branch dominates (CLOSE_FLYBY / PLANET_ORBIT), then the system-region
// branch classifies by physical AU heliocentric distance.

describe("getPresetForContext — camera-proximity branch wins over system region", () => {
  it("very near a body → CLOSE_FLYBY regardless of distanceFromSun", () => {
    expect(getPresetForContext(0.0, 100)).toBe("CLOSE_FLYBY");
    expect(getPresetForContext(1.0, 100)).toBe("CLOSE_FLYBY");
    expect(getPresetForContext(30, 50)).toBe("CLOSE_FLYBY");
    expect(getPresetForContext(525, 10)).toBe("CLOSE_FLYBY");
  });

  it("orbit range → PLANET_ORBIT regardless of distanceFromSun", () => {
    expect(getPresetForContext(1.0, 500)).toBe("PLANET_ORBIT");
    expect(getPresetForContext(30, 1999)).toBe("PLANET_ORBIT");
  });
});

describe("getPresetForContext — system region by heliocentric AU", () => {
  // Camera held well clear of any body so the region branch is the one
  // under test. Physical AU values mirror the real dataset.
  const FAR_CAM = 5000;

  it.each([
    ["Mercury", 0.387],
    ["Venus", 0.723],
    ["Earth", 1.0],
    ["Mars", 1.523],
  ])("inner terrestrial %s (%f AU) → INNER_SYSTEM", (_label, au) => {
    expect(getPresetForContext(au, FAR_CAM)).toBe("INNER_SYSTEM");
  });

  it.each([
    ["Ceres", 2.77],
    ["Vesta", 2.36],
  ])("main-belt asteroid %s (%f AU) → INNER_SYSTEM", (_label, au) => {
    // Asteroid belt bodies read visually as warm/inner, not gas-giant
    // cold. Threshold 3.5 AU keeps them on the warm side.
    expect(getPresetForContext(au, FAR_CAM)).toBe("INNER_SYSTEM");
  });

  it.each([
    ["Jupiter", 5.2],
    ["Saturn", 9.5],
    ["Uranus", 19.2],
    ["Neptune", 30.1],
    ["Pluto", 39.5],
    ["Haumea", 43.1],
    ["Makemake", 45.8],
  ])("outer body %s (%f AU) → OUTER_SYSTEM", (_label, au) => {
    expect(getPresetForContext(au, FAR_CAM)).toBe("OUTER_SYSTEM");
  });

  it.each([
    ["Eris", 67.9],
    ["Gonggong", 67.2],
    ["Sedna", 525],
  ])("scattered disk / Sedna-like %s (%f AU) → DEEP_SPACE", (_label, au) => {
    expect(getPresetForContext(au, FAR_CAM)).toBe("DEEP_SPACE");
  });

  it("inner ↔ outer boundary at 3.5 AU is exclusive on the low side", () => {
    expect(getPresetForContext(3.499, FAR_CAM)).toBe("INNER_SYSTEM");
    expect(getPresetForContext(3.5, FAR_CAM)).toBe("OUTER_SYSTEM");
  });

  it("outer ↔ deep boundary at 50 AU is exclusive on the low side", () => {
    expect(getPresetForContext(49.999, FAR_CAM)).toBe("OUTER_SYSTEM");
    expect(getPresetForContext(50, FAR_CAM)).toBe("DEEP_SPACE");
  });
});

describe("VISUAL_PRESETS — lighting/postprocess defaults", () => {
  it("ambient stays Gaia 0 and central sun stays 1 across all contexts", () => {
    for (const preset of Object.values(VISUAL_PRESETS)) {
      expect(preset.ambientIntensity).toBe(0);
      expect(preset.sunIntensity).toBe(1);
    }
  });

  // 1b: bloomIntensity is no longer uniformly 0 — each context now
  // carries a tuned selective-bloom base that the tier multiplier
  // compounds (see visualPresets.ts comment + the sweep §129 note).
  // The per-context values are the Atlas-opinion defaults; users can
  // override via the Display panel Bloom Intensity slider, and the
  // `shouldMountBloom` gate in Scene.tsx falls through to this base
  // when no override is set.
  it("bloomIntensity is non-zero and per-context tuned", () => {
    expect(VISUAL_PRESETS.DEEP_SPACE.bloomIntensity).toBe(0.35);
    expect(VISUAL_PRESETS.PLANET_ORBIT.bloomIntensity).toBe(0.3);
    expect(VISUAL_PRESETS.CLOSE_FLYBY.bloomIntensity).toBe(0.15);
    expect(VISUAL_PRESETS.INNER_SYSTEM.bloomIntensity).toBe(0.3);
    expect(VISUAL_PRESETS.OUTER_SYSTEM.bloomIntensity).toBe(0.3);
  });
});
