import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  getFarIntersection,
  getNearIntersection,
  miePhase,
  rayleighPhase,
  scale,
} from "./atmosphereMath";

// Pinned values for the five scalar helpers ported 1:1 from Gaia Sky
// `/tmp/gaiasky/assets/shader/lib/atmscattering.frag.glsl` (commit
// 450c344ca). These regress any future drift in θ.5b/c/d when the
// snippet gets wired into an atmosphere shader and plugged into planet
// materials. Values computed by hand from Gaia's closed-form formulas,
// not by black-box comparison against a reference implementation.

describe("rayleighPhase — Gaia atmscattering.frag.glsl:28-33", () => {
  it("cos²=0 (θ=90°) → 0.75", () => {
    expect(rayleighPhase(0)).toBeCloseTo(0.75, 10);
  });

  it("cos²=1 (θ=0° or 180°, forward/back scatter) → 1.5", () => {
    expect(rayleighPhase(1)).toBeCloseTo(1.5, 10);
  });

  it("cos²=0.25 (cos=±0.5) → 0.9375", () => {
    expect(rayleighPhase(0.25)).toBeCloseTo(0.9375, 10);
  });

  it("cos²=0.5 (cos=±√0.5) → 1.125", () => {
    expect(rayleighPhase(0.5)).toBeCloseTo(1.125, 10);
  });
});

describe("miePhase — Gaia atmscattering.frag.glsl:35-39", () => {
  it("isotropic (g=0, cos=0) → 0.75", () => {
    // g=0 collapses Henyey-Greenstein: (1-0)/(2+0) · (1+0) / 1^1.5
    //   = 0.5. miePhase = 1.5 · 0.5 · 1/1 = 0.75.
    expect(miePhase(0, 0, 0)).toBeCloseTo(0.75, 10);
  });

  it("isotropic forward (g=0, cos=1) → 1.5", () => {
    // 1.5 · 0.5 · (1+1)/1 = 1.5.
    expect(miePhase(1, 1, 0)).toBeCloseTo(1.5, 10);
  });

  it("Earth-like Mie (g=-0.85, cos=1, forward) → ≈0.04830", () => {
    // g²=0.7225; (1-g²)/(2+g²) = 0.2775/2.7225 = 0.1019284…
    // denom = (1 + 0.7225 − 2·(-0.85)·1)^1.5 = 3.4225^1.5 = 3.4225·1.85
    //   = 6.331625. miePhase = 1.5 · 0.1019284 · 2 / 6.331625 ≈ 0.04830.
    expect(miePhase(1, 1, -0.85)).toBeCloseTo(0.0483, 4);
  });

  it("Earth-like Mie (g=-0.85, cos=0, sideways) → ≈0.06763", () => {
    // denom = (1 + 0.7225)^1.5 = 1.7225^1.5 ≈ 2.2607.
    // miePhase = 1.5 · 0.1019284 · 1 / 2.2607 ≈ 0.06763.
    expect(miePhase(0, 0, -0.85)).toBeCloseTo(0.06763, 4);
  });
});

describe("scale — Gaia atmscattering.frag.glsl:40-43", () => {
  // scaleDepth=0.25 is Gaia's Earth default (from config/body params).
  const sd = 0.25;

  it("cos=1 (x=0, straight up) → scaleDepth · exp(-0.00287) ≈ 0.24928", () => {
    expect(scale(1, sd)).toBeCloseTo(0.25 * Math.exp(-0.00287), 10);
  });

  it("cos=0 (x=1, horizontal) → scaleDepth · exp(2.73613) ≈ 3.857", () => {
    // Polynomial eval at x=1: -0.00287 + 0.459 + 3.83 − 6.80 + 5.25
    //   = 2.73613. scale = 0.25 · exp(2.73613) ≈ 3.857.
    const expected = 0.25 * Math.exp(-0.00287 + 0.459 + 3.83 + -6.8 + 5.25);
    expect(scale(0, sd)).toBeCloseTo(expected, 10);
  });

  it("cos=0.5 (x=0.5) → scaleDepth · exp(0.662255) ≈ 0.4848", () => {
    const x = 0.5;
    const polynomial =
      -0.00287 + x * (0.459 + x * (3.83 + x * (-6.8 + x * 5.25)));
    expect(scale(0.5, sd)).toBeCloseTo(0.25 * Math.exp(polynomial), 10);
  });

  it("scales linearly with scaleDepth", () => {
    // scaleDepth is a simple pre-multiplier; doubling it doubles output.
    expect(scale(0.3, 0.5)).toBeCloseTo(2 * scale(0.3, 0.25), 10);
  });
});

describe("getNearIntersection / getFarIntersection — Gaia lib/atmscattering.frag.glsl:44-57", () => {
  it("ray from (2,0,0) along −x hits unit sphere at t=1 (near) and t=3 (far)", () => {
    const pos = new THREE.Vector3(2, 0, 0);
    const ray = new THREE.Vector3(-1, 0, 0);
    const distance2 = pos.lengthSq(); // 4
    const radius2 = 1;
    expect(getNearIntersection(pos, ray, distance2, radius2)).toBeCloseTo(
      1,
      10
    );
    expect(getFarIntersection(pos, ray, distance2, radius2)).toBeCloseTo(3, 10);
  });

  it("ray from (0,5,0) along −y hits sphere radius 2 at t=3 and t=7", () => {
    const pos = new THREE.Vector3(0, 5, 0);
    const ray = new THREE.Vector3(0, -1, 0);
    const distance2 = 25;
    const radius2 = 4;
    expect(getNearIntersection(pos, ray, distance2, radius2)).toBeCloseTo(
      3,
      10
    );
    expect(getFarIntersection(pos, ray, distance2, radius2)).toBeCloseTo(7, 10);
  });

  it("ray that misses the sphere: fDet clamps to 0, returns −B/2", () => {
    // Ray from (0,5,0) along +x never hits a sphere of radius 1 at origin.
    // Discriminant goes negative (B²−4C = 0 − 4·24 = −96) and Gaia's
    // `max(0, …)` clamps it to 0, collapsing near/far to −B/2 = 0.
    // toBeCloseTo(_, 10) is used instead of toBe(0) because `0.5 · -0`
    // returns IEEE-754 −0 in JavaScript; GLSL treats ±0 equivalently
    // for downstream arithmetic, and `toBeCloseTo` mirrors that.
    const pos = new THREE.Vector3(0, 5, 0);
    const ray = new THREE.Vector3(1, 0, 0);
    const distance2 = 25;
    const radius2 = 1;
    expect(getNearIntersection(pos, ray, distance2, radius2)).toBeCloseTo(
      0,
      10
    );
    expect(getFarIntersection(pos, ray, distance2, radius2)).toBeCloseTo(0, 10);
  });

  it("B² − 4C is clamped to 0 (not negative) — mirrors Gaia `max(0, …)`", () => {
    // This specific test pins the clamp behavior: caller relies on both
    // fns returning real numbers even when the ray misses, so the
    // downstream `sqrt(fDet)` never produces NaN.
    const pos = new THREE.Vector3(10, 0, 0);
    const ray = new THREE.Vector3(0, 1, 0);
    const distance2 = 100;
    const radius2 = 1;
    const near = getNearIntersection(pos, ray, distance2, radius2);
    const far = getFarIntersection(pos, ray, distance2, radius2);
    expect(Number.isNaN(near)).toBe(false);
    expect(Number.isNaN(far)).toBe(false);
  });
});
