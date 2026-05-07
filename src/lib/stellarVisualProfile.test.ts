import { describe, expect, it } from "vitest";

import {
  SUN_DEFAULT_VISUAL_PROFILE,
  type StellarVisualProfile,
} from "./stellarVisualProfile";

/**
 * T6.1 regression test — pins every uniform value in
 * `SUN_DEFAULT_VISUAL_PROFILE` to its pre-T6.1 hardcoded value in
 * `ProceduralSun3D.tsx`. Drift here means the Sun's visual identity
 * changed; a Sun-mount runtime smoke would catch it but tests catch
 * it earlier and pin the source-of-truth at the data layer.
 *
 * Each `expect` cites the source file:line of the original
 * hardcoded value so a future audit can trace each pin.
 */

describe("SUN_DEFAULT_VISUAL_PROFILE — granulation (perlin cubemap)", () => {
  // Source: ProceduralSun3D.tsx:370-374
  it("granulationSpatialFreq matches pre-T6.1 perlin uSpatialFrequency=6", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.granulationSpatialFreq).toBe(6);
  });
  it("granulationTemporalFreq matches pre-T6.1 perlin uTemporalFrequency=0.1", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.granulationTemporalFreq).toBe(0.1);
  });
  it("granulationH matches pre-T6.1 perlin uH=1", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.granulationH).toBe(1);
  });
  it("granulationContrast matches pre-T6.1 perlin uContrast=0.25", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.granulationContrast).toBe(0.25);
  });
  it("granulationFlatten matches pre-T6.1 perlin uFlatten=0.72", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.granulationFlatten).toBe(0.72);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — surface sphere", () => {
  // Source: ProceduralSun3D.tsx (sun material). T6.4-M4-fix
  // re-introduced `surfaceTint=0.2` after the audit pass found
  // that M4's `mix(white, classColor, smoothstep)` formula could
  // not preserve the pre-M4 Sun visual identity. The post-audit
  // fix restores the pre-M4 `vec3(b, b², b⁴) × tint` shape with
  // `surfaceTint` driving the b² and b⁴ damping factors.
  it("surfaceFresnelPower matches pre-T6.1 sun uFresnelPower=1", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceFresnelPower).toBe(1);
  });
  it("surfaceFresnelInfluence matches pre-T6.1 sun uFresnelInfluence=0.8", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceFresnelInfluence).toBe(0.8);
  });
  it("surfaceBase matches pre-T6.1 sun uBase=4", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceBase).toBe(4);
  });
  it("surfaceBrightnessOffset matches pre-T6.1 sun uBrightnessOffset=1", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightnessOffset).toBe(1);
  });
  it("surfaceBrightness matches pre-T6.1 sun uBrightness=0.6", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceBrightness).toBe(0.6);
  });
  it("surfaceTint=0.2 matches pre-M4 sphere uTint (legacy curve damping)", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.surfaceTint).toBe(0.2);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — glow (ring corona)", () => {
  it("glowRadius matches pre-T6.1 glow uRadius=0.4", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.glowRadius).toBe(0.4);
  });
  it("glowBrightness matches pre-T6.1 glow uBrightness=1.06", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.glowBrightness).toBe(1.06);
  });
  it("glowFalloffColor matches pre-T6.1 glow uFalloffColor=0.5", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.glowFalloffColor).toBe(0.5);
  });
  it("glowTint=0.4 matches pre-M4 glow uTint (separate from sphere's 0.2)", () => {
    // Pre-M4 the surface and glow had different tint values to give
    // them distinct visual roles (surface deeply saturated, corona
    // more diffuse). The post-audit fix preserves this split.
    expect(SUN_DEFAULT_VISUAL_PROFILE.glowTint).toBe(0.4);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — class color (T6.4-M4, shared sphere + glow)", () => {
  it("classColor pinned to blackbody(5778 K) ≈ (1.0, 0.891, 0.796) linear-RGB", () => {
    const [r, g, b] = SUN_DEFAULT_VISUAL_PROFILE.classColor;
    expect(r).toBeCloseTo(1.0, 3);
    expect(g).toBeCloseTo(0.891, 3);
    expect(b).toBeCloseTo(0.796, 3);
  });
  it("classColor reads as r > g > b (warm-white solar bias)", () => {
    const [r, g, b] = SUN_DEFAULT_VISUAL_PROFILE.classColor;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — rays", () => {
  // Source: ProceduralSun3D.tsx:455-461
  it("raysLength matches pre-T6.1 rays uLength=0.45", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysLength).toBe(0.45);
  });
  it("raysNoiseFrequency matches pre-T6.1 rays uNoiseFrequency=8", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysNoiseFrequency).toBe(8);
  });
  it("raysNoiseAmplitude matches pre-T6.1 rays uNoiseAmplitude=0.4", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysNoiseAmplitude).toBe(0.4);
  });
  it("raysAlphaBlended matches pre-T6.1 rays uAlphaBlended=0.3", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysAlphaBlended).toBe(0.3);
  });
  it("raysHueSpread matches pre-T6.1 rays uHueSpread=0.2", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysHueSpread).toBe(0.2);
  });
  it("raysHue matches pre-T6.1 rays uHue=0.2", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.raysHue).toBe(0.2);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — flares", () => {
  // Source: ProceduralSun3D.tsx:485-491
  it("flaresAmp matches pre-T6.1 flares uAmp=0.5", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresAmp).toBe(0.5);
  });
  it("flaresAlphaBlended matches pre-T6.1 flares uAlphaBlended=0.65", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresAlphaBlended).toBe(0.65);
  });
  it("flaresHueSpread matches pre-T6.1 flares uHueSpread=0.16", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresHueSpread).toBe(0.16);
  });
  it("flaresHue matches pre-T6.1 flares uHue=0", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresHue).toBe(0);
  });
  it("flaresNoiseFrequency matches pre-T6.1 flares uNoiseFrequency=4", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresNoiseFrequency).toBe(4);
  });
  it("flaresNoiseAmplitude matches pre-T6.1 flares uNoiseAmplitude=0.2", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.flaresNoiseAmplitude).toBe(0.2);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — light direction", () => {
  // Source: ProceduralSun3D.tsx:321-324
  // The component normalizes via THREE.Vector3(1,1,1).normalize().
  // The raw [1,1,1] tuple is what gets passed in.
  it("lightDirection matches pre-T6.1 raw input [1, 1, 1]", () => {
    expect(SUN_DEFAULT_VISUAL_PROFILE.lightDirection).toEqual([1, 1, 1]);
  });

  it("normalized magnitude is 1 (sanity check on the tuple)", () => {
    const [x, y, z] = SUN_DEFAULT_VISUAL_PROFILE.lightDirection;
    const len = Math.sqrt(x * x + y * y + z * z);
    const nx = x / len;
    const ny = y / len;
    const nz = z / len;
    const normLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    expect(normLen).toBeCloseTo(1, 12);
  });
});

describe("SUN_DEFAULT_VISUAL_PROFILE — completeness", () => {
  it("contains 30 keys (28 numeric + classColor + lightDirection)", () => {
    // Pin the field count so adding a new field in
    // StellarVisualProfile flags this test (forcing the author to
    // also extend the regression coverage above). T6.4-M5 post-audit:
    // added `planBWeight` (Plan B blend weight, 0 for Sun) — net
    // +1 vs M4-fix baseline of 29.
    const keys = Object.keys(SUN_DEFAULT_VISUAL_PROFILE);
    expect(keys.length).toBe(30);
  });

  it("planBWeight = 0 (Sun below Plan B activation threshold)", () => {
    // T6.4-M5 Plan B is gated on tEff > ~7500 K. Sun at 5778 K is
    // far below, so weight = 0 and the Sun renders pure legacy ×
    // bias (byte-identical pre-M4 by construction).
    expect(SUN_DEFAULT_VISUAL_PROFILE.planBWeight).toBe(0);
  });

  it("every numeric field is finite (sanity — no NaN / Infinity drift)", () => {
    const profile: StellarVisualProfile = SUN_DEFAULT_VISUAL_PROFILE;
    for (const [key, value] of Object.entries(profile)) {
      // Tuple fields are validated structurally via dedicated tests above.
      if (key === "lightDirection" || key === "classColor") continue;
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe("StellarVisualProfile — type contract sanity", () => {
  it("supports clean derivation via spread for class-tuned profiles (T6.4 forward-compat)", () => {
    // T6.4 will create class-tuned profiles by spreading the Sun
    // default and overriding select fields. Pin that pattern works
    // and produces a fully-typed StellarVisualProfile.
    const giantProfile: StellarVisualProfile = {
      ...SUN_DEFAULT_VISUAL_PROFILE,
      surfaceBrightness: 1.2, // hypothetical giant tweak
      glowRadius: 0.6,
    };
    expect(giantProfile.surfaceBrightness).toBe(1.2);
    expect(giantProfile.glowRadius).toBe(0.6);
    // unchanged fields preserved
    expect(giantProfile.granulationSpatialFreq).toBe(6);
    expect(giantProfile.lightDirection).toEqual([1, 1, 1]);
  });
});
