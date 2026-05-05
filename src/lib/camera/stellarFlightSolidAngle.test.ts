import { describe, it, expect } from "vitest";

import {
  computeTargetSolidAngleRad,
  computeFlightTargetDistance,
  computeStellarLandingDistance,
  STELLAR_FLIGHT_ANCHORS,
} from "./stellarFlightSolidAngle";

const DEG_TO_RAD = Math.PI / 180;
/** Sun radius in atlas world units, mirrored from
 * `src/lib/stellarMeshGate.ts`. Local copy so the math test
 * stays decoupled from the gate module. */
const SUN_RADIUS_WORLD_UNITS = (696_340 / 149_597_870.7) * 1000;

describe("STELLAR_FLIGHT_ANCHORS — Gaia source pin", () => {
  // Gaia source: InteractiveCameraModule.java:158-168
  //   var rx0 = 1.31; // pc
  //   var rx1 = 2805.0; // pc
  //   var y0 = 1.0; // deg
  //   var y1 = 0.001; // deg
  it("near-anchor distance is 1.31 pc (Gaia rx0)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_ANCHOR_PC).toBe(1.31);
  });

  it("far-anchor distance is 2805.0 pc (Gaia rx1)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.FAR_ANCHOR_PC).toBe(2805.0);
  });

  it("near-anchor target is 1.0° (Gaia y0)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_DEG).toBe(1.0);
  });

  it("far-anchor target is 0.001° (Gaia y1)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_DEG).toBe(0.001);
  });

  it("anchor radians match deg×π/180 conversion", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_RAD).toBeCloseTo(DEG_TO_RAD, 12);
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_RAD).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });
});

describe("computeTargetSolidAngleRad", () => {
  it("returns near-target for distance below near-anchor", () => {
    // Sun at distance 0 → clamp to NEAR_TARGET_RAD = 1°
    expect(computeTargetSolidAngleRad(0)).toBeCloseTo(DEG_TO_RAD, 12);
    // Half a parsec — still below 1.31 pc anchor
    expect(computeTargetSolidAngleRad(0.5)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns near-target at exactly the near anchor", () => {
    expect(computeTargetSolidAngleRad(1.31)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns far-target at exactly the far anchor", () => {
    expect(computeTargetSolidAngleRad(2805.0)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("clamps to far-target above the far anchor", () => {
    // 5000 pc — beyond rx1 → clamp to FAR_TARGET_RAD
    expect(computeTargetSolidAngleRad(5000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
    expect(computeTargetSolidAngleRad(50_000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("interpolates linearly between anchors", () => {
    // Halfway between 1.31 and 2805.0 in pc → halfway in rad
    const mid = (1.31 + 2805.0) * 0.5;
    const expectedHalf = (DEG_TO_RAD + 0.001 * DEG_TO_RAD) * 0.5;
    expect(computeTargetSolidAngleRad(mid)).toBeCloseTo(expectedHalf, 8);
  });

  it("Sirius (~2.64 pc) lands very close to 1°", () => {
    // Sirius is just past the 1.31 pc near-anchor, so the lerp
    // pulls only a tiny bit toward y1. Expected ≈ 0.9995°.
    const sirius = computeTargetSolidAngleRad(2.64);
    expect(sirius).toBeGreaterThan(0.99 * DEG_TO_RAD);
    expect(sirius).toBeLessThan(DEG_TO_RAD);
  });

  it("Betelgeuse (~197.8 pc) lands at ~0.93°", () => {
    // t = (197.8 - 1.31) / (2805 - 1.31) ≈ 0.0701
    // y = 1° + 0.0701 × (0.001° - 1°) ≈ 0.930°
    const bet = computeTargetSolidAngleRad(197.8);
    expect(bet).toBeCloseTo(0.93 * DEG_TO_RAD, 3);
  });

  it("returns near-target for non-finite input (defensive)", () => {
    expect(computeTargetSolidAngleRad(Number.NaN)).toBe(DEG_TO_RAD);
    expect(computeTargetSolidAngleRad(Number.POSITIVE_INFINITY)).toBe(
      DEG_TO_RAD
    );
    expect(computeTargetSolidAngleRad(Number.NEGATIVE_INFINITY)).toBe(
      DEG_TO_RAD
    );
  });

  it("monotonically decreases between the anchors", () => {
    let prev = computeTargetSolidAngleRad(1.31);
    for (let pc = 10; pc <= 2800; pc += 50) {
      const cur = computeTargetSolidAngleRad(pc);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeFlightTargetDistance", () => {
  it("matches Gaia's radius / tan(angle * 0.5) formula", () => {
    // Gaia: targetDistance = radius / FastMath.tan(targetAngle * 0.5)
    const radius = 100;
    const angle = 0.1; // rad
    const expected = radius / Math.tan(angle * 0.5);
    expect(computeFlightTargetDistance(radius, angle)).toBeCloseTo(
      expected,
      10
    );
  });

  it("Sun at 1° solid angle lands at ~533 wu", () => {
    // Sun radius = 4.654 wu (1 R_sun in atlas units)
    // distance = 4.654 / tan(0.5°) ≈ 533.13 wu
    const dist = computeFlightTargetDistance(
      SUN_RADIUS_WORLD_UNITS,
      DEG_TO_RAD
    );
    expect(dist).toBeGreaterThan(530);
    expect(dist).toBeLessThan(536);
  });

  it("smaller solid angle → larger distance (monotonic)", () => {
    const radius = 10;
    const distAt1deg = computeFlightTargetDistance(radius, DEG_TO_RAD);
    const distAt05deg = computeFlightTargetDistance(radius, DEG_TO_RAD * 0.5);
    const distAt001deg = computeFlightTargetDistance(
      radius,
      DEG_TO_RAD * 0.001
    );
    expect(distAt05deg).toBeGreaterThan(distAt1deg);
    expect(distAt001deg).toBeGreaterThan(distAt05deg);
  });

  it("larger radius → larger distance at fixed angle (linear scaling)", () => {
    const angle = DEG_TO_RAD;
    const dr1 = computeFlightTargetDistance(10, angle);
    const dr2 = computeFlightTargetDistance(20, angle);
    expect(dr2 / dr1).toBeCloseTo(2.0, 6);
  });

  it("returns Infinity for zero or negative radius", () => {
    expect(computeFlightTargetDistance(0, DEG_TO_RAD)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(computeFlightTargetDistance(-1, DEG_TO_RAD)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("returns Infinity for zero or negative angle", () => {
    expect(computeFlightTargetDistance(10, 0)).toBe(Number.POSITIVE_INFINITY);
    expect(computeFlightTargetDistance(10, -0.1)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("returns Infinity for non-finite inputs", () => {
    expect(computeFlightTargetDistance(Number.NaN, DEG_TO_RAD)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(computeFlightTargetDistance(10, Number.NaN)).toBe(
      Number.POSITIVE_INFINITY
    );
    expect(
      computeFlightTargetDistance(Number.POSITIVE_INFINITY, DEG_TO_RAD)
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("computeStellarLandingDistance — named-star pins", () => {
  // Pre-computed expected landing distances based on the Gaia
  // contract. Values pinned to the M2.5 spec so any drift in
  // the underlying formula or anchor constants is flagged.

  it("Sirius (R≈1.711 R_sun, d≈2.64 pc) → ~913 wu", () => {
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS; // ~7.964 wu
    const dist = computeStellarLandingDistance(radiusWu, 2.64);
    // Lerp pulls solidAngle barely below 1° at 2.64 pc; landing
    // distance ≈ 7.964 / tan(0.4998°) ≈ 912.6 wu.
    expect(dist).toBeGreaterThan(911);
    expect(dist).toBeLessThan(914);
  });

  it("Betelgeuse (R≈887 R_sun, d≈197.8 pc) → ~509,000 wu", () => {
    const radiusWu = 887 * SUN_RADIUS_WORLD_UNITS; // ~4128 wu
    const dist = computeStellarLandingDistance(radiusWu, 197.8);
    // solidAngle ≈ 0.930°, distance ≈ 4128 / tan(0.465°) ≈ 508,700 wu
    expect(dist).toBeGreaterThan(505_000);
    expect(dist).toBeLessThan(513_000);
  });

  it("Proxima (R≈0.15 R_sun, d≈1.30 pc) → ~80 wu", () => {
    const radiusWu = 0.15 * SUN_RADIUS_WORLD_UNITS; // ~0.698 wu
    // Distance below near-anchor → solidAngle clamps to 1°
    const dist = computeStellarLandingDistance(radiusWu, 1.3);
    // distance ≈ 0.698 / tan(0.5°) ≈ 79.97 wu
    expect(dist).toBeGreaterThan(79);
    expect(dist).toBeLessThan(81);
  });

  it("Sun-like dwarf at the far anchor (d=2805 pc) lands at ~533,300 wu", () => {
    // Exactly at the FAR_ANCHOR → solidAngle clamps to 0.001°
    // (FAR_TARGET_RAD = 1.7453e-5 rad). distance = 4.654 /
    // tan(0.5 × 1.7453e-5) = 4.654 / 8.727e-6 ≈ 533,300 wu.
    const dist = computeStellarLandingDistance(SUN_RADIUS_WORLD_UNITS, 2805);
    expect(dist).toBeGreaterThan(530_000);
    expect(dist).toBeLessThan(540_000);
  });

  it("Sun-like dwarf at d=2800 pc lands at ~192,000 wu", () => {
    // 2800 pc is just below the far anchor; the lerp is 99.82%
    // toward FAR_TARGET, so solidAngle ≈ 4.66e-5 rad ≈ 0.00267°.
    // distance = 4.654 / tan(2.33e-5) ≈ 199,700 wu. Lower bound
    // chosen with ~5% headroom around the actual computed value
    // so this test pins the lerp behavior near (but not at) the
    // far anchor.
    const dist = computeStellarLandingDistance(SUN_RADIUS_WORLD_UNITS, 2800);
    expect(dist).toBeGreaterThan(180_000);
    expect(dist).toBeLessThan(210_000);
  });

  it("regression vs Atlas pre-M2.5 fixed-target gives larger landing for nearby stars", () => {
    // Pre-M2.5: Atlas used a fixed 0.286° target, so Sirius
    // landed at ~7.964 / tan(0.143°) ≈ 3192 wu — way beyond
    // the visible disc range.
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS;
    const m25Landing = computeStellarLandingDistance(radiusWu, 2.64);
    const preM25Target = 0.286 * DEG_TO_RAD;
    const preM25Landing = computeFlightTargetDistance(radiusWu, preM25Target);
    // M2.5 lands ~3.5× closer for a nearby bright star, which
    // is the user-visible "feels right" change.
    expect(m25Landing).toBeLessThan(preM25Landing);
    expect(preM25Landing / m25Landing).toBeGreaterThan(3.0);
  });
});
