import { describe, expect, it } from "vitest";

import {
  ATMOSPHERE_INNER_RADIUS,
  ATMOSPHERE_INSIDE_ESUN_BOOST,
  computeDynamicAtmosphereUniforms,
  resolveAtmosphereDynamicConfig,
  type ResolvedAtmosphereDynamicConfig,
} from "./atmosphereDynamics";
import {
  GAIA_DEFAULT_ALPHA,
  GAIA_DEFAULT_E_SUN,
  GAIA_DEFAULT_OUTER_RADIUS_RATIO,
  GAIA_DEFAULT_SAMPLE_COUNT,
} from "./atmosphereShader";

describe("atmosphereDynamics", () => {
  it("pins the boost constant + inner-radius constant", () => {
    expect(ATMOSPHERE_INSIDE_ESUN_BOOST).toBeCloseTo(100.0, 6);
    expect(ATMOSPHERE_INNER_RADIUS).toBeCloseTo(1.0, 6);
  });

  describe("resolveAtmosphereDynamicConfig", () => {
    it("applies Gaia defaults when optional fields are absent", () => {
      const resolved = resolveAtmosphereDynamicConfig({
        kRayleigh: 0.0025,
        kMie: 0.001,
        wavelengthsUm: [0.65, 0.57, 0.475],
      });
      expect(resolved.kRayleigh).toBeCloseTo(0.0025, 6);
      expect(resolved.kMie).toBeCloseTo(0.001, 6);
      expect(resolved.baseESun).toBe(GAIA_DEFAULT_E_SUN);
      expect(resolved.alpha).toBe(GAIA_DEFAULT_ALPHA);
      expect(resolved.sampleCount).toBe(GAIA_DEFAULT_SAMPLE_COUNT);
      expect(resolved.atmosphereHeight).toBeCloseTo(
        GAIA_DEFAULT_OUTER_RADIUS_RATIO - ATMOSPHERE_INNER_RADIUS,
        6
      );
    });

    it("passes through explicit config values without defaulting", () => {
      const resolved = resolveAtmosphereDynamicConfig({
        kRayleigh: 0.003,
        kMie: 0.002,
        wavelengthsUm: [0.65, 0.57, 0.475],
        eSun: 20,
        alpha: 0.85,
        sampleCount: 5,
        outerRadiusRatio: 1.05,
      });
      expect(resolved.baseESun).toBe(20);
      expect(resolved.alpha).toBeCloseTo(0.85, 6);
      expect(resolved.sampleCount).toBe(5);
      expect(resolved.atmosphereHeight).toBeCloseTo(0.05, 6);
    });
  });

  describe("computeDynamicAtmosphereUniforms", () => {
    const earthLike: ResolvedAtmosphereDynamicConfig = {
      kRayleigh: 0.0025,
      kMie: 0.001,
      baseESun: 20,
      atmosphereHeight: 0.025, // = 1.025 - 1.0
      alpha: 1.0,
      sampleCount: 23,
    };

    it("returns the un-boosted kRayleigh*eSun / kMie*eSun when camera is ABOVE atmosphere shell", () => {
      // cameraHeightNormalized > fInnerRadius + atmosphereHeight (= 1.025)
      const uniforms = computeDynamicAtmosphereUniforms(earthLike, 2.0);
      expect(uniforms.fKrESun).toBeCloseTo(0.0025 * 20, 6);
      expect(uniforms.fKmESun).toBeCloseTo(0.001 * 20, 6);
    });

    it("returns the un-boosted values AT the outer boundary (atmFactor → 0)", () => {
      // cameraHeightNormalized = fInnerRadius + atmosphereHeight → camHeightGr
      // == atmosphereHeight, strict-less-than guard flips to false, no boost.
      const uniforms = computeDynamicAtmosphereUniforms(earthLike, 1.025);
      expect(uniforms.fKrESun).toBeCloseTo(0.0025 * 20, 6);
      expect(uniforms.fKmESun).toBeCloseTo(0.001 * 20, 6);
    });

    it("boosts eSun by 100 × atmFactor just inside the atmosphere", () => {
      // cameraHeightNormalized = 1.0125 → camHeightGr = 0.0125 → atmFactor = 0.5
      // → boosted eSun = 20 + 0.5 × 100 = 70
      const uniforms = computeDynamicAtmosphereUniforms(earthLike, 1.0125);
      expect(uniforms.fKrESun).toBeCloseTo(0.0025 * 70, 6);
      expect(uniforms.fKmESun).toBeCloseTo(0.001 * 70, 6);
    });

    it("applies the full 100 boost AT the inner-radius (camHeightGr = 0, atmFactor = 1)", () => {
      // cameraHeightNormalized = fInnerRadius = 1.0 → camHeightGr = 0 →
      // atmFactor = 1 → eSun = 20 + 100 = 120
      const uniforms = computeDynamicAtmosphereUniforms(earthLike, 1.0);
      expect(uniforms.fKrESun).toBeCloseTo(0.0025 * 120, 6);
      expect(uniforms.fKmESun).toBeCloseTo(0.001 * 120, 6);
    });

    it("boost is linear in the inside range (atmFactor slope = -1/atmosphereHeight)", () => {
      // At 1.005 (camHeightGr = 0.005): atmFactor = (0.025-0.005)/0.025 = 0.8
      // At 1.010 (camHeightGr = 0.010): atmFactor = (0.025-0.010)/0.025 = 0.6
      // boosted eSun at 1.005: 20 + 80 = 100; at 1.010: 20 + 60 = 80
      const u1 = computeDynamicAtmosphereUniforms(earthLike, 1.005);
      const u2 = computeDynamicAtmosphereUniforms(earthLike, 1.01);
      expect(u1.fKrESun).toBeCloseTo(0.0025 * 100, 6);
      expect(u2.fKrESun).toBeCloseTo(0.0025 * 80, 6);
    });

    it("writes alpha + sampleCount unchanged from the resolved config", () => {
      const uniforms = computeDynamicAtmosphereUniforms(earthLike, 2.0);
      expect(uniforms.fAlpha).toBeCloseTo(1.0, 6);
      expect(uniforms.nSamples).toBe(23);
    });

    it("handles custom eSun configs (Mars-like thin atmosphere)", () => {
      const marsLike: ResolvedAtmosphereDynamicConfig = {
        kRayleigh: 0.001,
        kMie: 0.0005,
        baseESun: 15,
        atmosphereHeight: 0.015,
        alpha: 0.8,
        sampleCount: 10,
      };
      // cameraHeightNormalized = 1.005 → camHeightGr = 0.005 →
      // atmFactor = (0.015 - 0.005) / 0.015 = 2/3 → eSun = 15 + 100 × 2/3 ≈ 81.67
      const uniforms = computeDynamicAtmosphereUniforms(marsLike, 1.005);
      expect(uniforms.fKrESun).toBeCloseTo(0.001 * (15 + 100 * (2 / 3)), 6);
      expect(uniforms.fAlpha).toBeCloseTo(0.8, 6);
      expect(uniforms.nSamples).toBe(10);
    });
  });
});
