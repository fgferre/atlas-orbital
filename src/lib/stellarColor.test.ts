import { describe, expect, it } from "vitest";

import {
  blackbodyRgbFromTemperature,
  srgbToLinearChannel,
} from "./stellarColor";

/**
 * T6.4-M4 regression tests for the blackbody-color helper. The
 * Helland fit is a published approximation; we pin the four
 * named-star outputs the M4 spec uses as perception targets so
 * the visual identity is reproducible across refactors. ±0.02
 * tolerance is the noise floor of the fit itself.
 */

describe("srgbToLinearChannel — sRGB → linear inverse-gamma", () => {
  it("0 → 0 (black is black)", () => {
    expect(srgbToLinearChannel(0)).toBe(0);
  });
  it("1 → 1 (white round-trips)", () => {
    expect(srgbToLinearChannel(1)).toBeCloseTo(1, 6);
  });
  it("0.5 → ~0.214 (mid-gray darker in linear)", () => {
    expect(srgbToLinearChannel(0.5)).toBeCloseTo(0.214, 3);
  });
  it("toe value 0.04045 → exactly at piecewise junction", () => {
    expect(srgbToLinearChannel(0.04045)).toBeCloseTo(0.04045 / 12.92, 6);
  });
  it("negative input clamps to 0", () => {
    expect(srgbToLinearChannel(-0.5)).toBe(0);
  });
  it("NaN input falls back to 0", () => {
    expect(srgbToLinearChannel(NaN)).toBe(0);
  });
});

describe("blackbodyRgbFromTemperature — named-star pins", () => {
  // Tolerances reflect the Helland fit's published accuracy band
  // (~2% peak error vs CIE 1931 in the visible band) plus the
  // sRGB transfer's quantization. Tightening below ±0.02 would
  // pin against floating-point rounding rather than visual-color
  // identity.
  const TOL = 0.02;

  it("Sun (5778 K) → warm-white tilt with red dominant", () => {
    const [r, g, b] = blackbodyRgbFromTemperature(5778);
    expect(r).toBeCloseTo(1.0, 1);
    expect(g).toBeCloseTo(0.891, 1);
    expect(b).toBeCloseTo(0.796, 1);
    // Linear RGB ordering for solar: r > g > b (red-warm bias).
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    // Tight numeric pin so future regressions catch unintended drift.
    expect(Math.abs(r - 1.0)).toBeLessThan(TOL);
    expect(Math.abs(g - 0.891)).toBeLessThan(TOL);
    expect(Math.abs(b - 0.796)).toBeLessThan(TOL);
  });

  it("Sirius (9940 K) → blue-white tilt with blue dominant", () => {
    const [r, g, b] = blackbodyRgbFromTemperature(9940);
    expect(b).toBe(1.0); // Helland clamps blue at 100% above ~6600 K
    // Blue dominant; green > red (cool side of the curve).
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
    expect(Math.abs(r - 0.592)).toBeLessThan(TOL);
    expect(Math.abs(g - 0.703)).toBeLessThan(TOL);
  });

  it("Betelgeuse (3500 K) → deep orange-red", () => {
    const [r, g, b] = blackbodyRgbFromTemperature(3500);
    expect(r).toBe(1.0);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(Math.abs(g - 0.53)).toBeLessThan(TOL);
    expect(Math.abs(b - 0.266)).toBeLessThan(TOL);
  });

  it("Proxima (3050 K) → reddish-orange (warmer than Betelgeuse on green/blue)", () => {
    const [r, g, b] = blackbodyRgbFromTemperature(3050);
    expect(r).toBe(1.0);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(Math.abs(g - 0.45)).toBeLessThan(TOL);
    expect(Math.abs(b - 0.166)).toBeLessThan(TOL);
  });
});

describe("blackbodyRgbFromTemperature — monotonicity", () => {
  it("hotter star has more blue than cooler (b channel monotonic up)", () => {
    const cool = blackbodyRgbFromTemperature(3000);
    const warm = blackbodyRgbFromTemperature(5000);
    const hot = blackbodyRgbFromTemperature(8000);
    expect(cool[2]).toBeLessThan(warm[2]);
    expect(warm[2]).toBeLessThanOrEqual(hot[2]);
  });

  it("cooler star has more red dominance (r/b ratio monotonic down with T)", () => {
    const cool = blackbodyRgbFromTemperature(3000);
    const hot = blackbodyRgbFromTemperature(10000);
    const ratioCool = cool[0] / Math.max(cool[2], 1e-6);
    const ratioHot = hot[0] / Math.max(hot[2], 1e-6);
    expect(ratioCool).toBeGreaterThan(ratioHot);
  });
});

describe("blackbodyRgbFromTemperature — domain edges", () => {
  it("clamps temperatures below 1000 K to the lower endpoint output", () => {
    const veryCool = blackbodyRgbFromTemperature(500);
    const at1000 = blackbodyRgbFromTemperature(1000);
    expect(veryCool).toEqual(at1000);
  });

  it("clamps temperatures above 40000 K to the upper endpoint output", () => {
    const veryHot = blackbodyRgbFromTemperature(80000);
    const at40000 = blackbodyRgbFromTemperature(40000);
    expect(veryHot).toEqual(at40000);
  });

  it("non-finite input falls back to Sun-like (5778 K)", () => {
    const sunLike = blackbodyRgbFromTemperature(5778);
    expect(blackbodyRgbFromTemperature(NaN)).toEqual(sunLike);
    expect(blackbodyRgbFromTemperature(Infinity)).toEqual(sunLike);
    expect(blackbodyRgbFromTemperature(-100)).toEqual(sunLike);
  });

  it("every channel in [0, 1] across a swept range", () => {
    for (let t = 1000; t <= 40000; t += 500) {
      const [r, g, b] = blackbodyRgbFromTemperature(t);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });
});
