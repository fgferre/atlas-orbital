import { describe, it, expect } from "vitest";

import { STELLAR_MESH_ENTER_RAD } from "../stellarMeshGate";
import {
  STELLAR_FLIGHT_ANCHORS,
  computeAtlasFlightLanding,
  computeAtlasFlightTarget,
  computeFlightTargetDistance,
  computeGaiaTargetFullAngleRad,
} from "./stellarFlightSolidAngle";

const DEG_TO_RAD = Math.PI / 180;
/** Sun radius in atlas world units, mirrored from
 * `src/lib/stellarMeshGate.ts`. Local copy so the math test
 * stays decoupled from the gate module's other symbols. */
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

  it("near-anchor target is 1.0° FULL angle (Gaia y0)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_FULL_DEG).toBe(1.0);
  });

  it("far-anchor target is 0.001° FULL angle (Gaia y1)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_FULL_DEG).toBe(0.001);
  });

  it("anchor radians match deg×π/180 conversion", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_FULL_RAD).toBeCloseTo(
      DEG_TO_RAD,
      12
    );
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_FULL_RAD).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("Atlas mesh-spawn floor is 5× STELLAR_MESH_ENTER_RAD", () => {
    expect(STELLAR_FLIGHT_ANCHORS.ATLAS_MIN_ANGULAR_RADIUS_RAD).toBe(
      STELLAR_MESH_ENTER_RAD * 5
    );
    // 5e-3 rad angular radius == 0.286° angular radius == 0.573°
    // FULL angle. Same value the pre-M2.5 CameraController used as
    // the fixed `targetSolidAngle` (despite the misleading name —
    // the value was always angular radius).
    expect(STELLAR_FLIGHT_ANCHORS.ATLAS_MIN_ANGULAR_RADIUS_RAD).toBeCloseTo(
      5e-3,
      12
    );
  });
});

describe("computeGaiaTargetFullAngleRad", () => {
  it("returns near-target FULL for distance below near-anchor", () => {
    expect(computeGaiaTargetFullAngleRad(0)).toBeCloseTo(DEG_TO_RAD, 12);
    expect(computeGaiaTargetFullAngleRad(0.5)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns near-target at exactly the near anchor", () => {
    expect(computeGaiaTargetFullAngleRad(1.31)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns far-target at exactly the far anchor", () => {
    expect(computeGaiaTargetFullAngleRad(2805.0)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("clamps to far-target above the far anchor", () => {
    expect(computeGaiaTargetFullAngleRad(5000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
    expect(computeGaiaTargetFullAngleRad(50_000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("interpolates linearly between anchors", () => {
    const mid = (1.31 + 2805.0) * 0.5;
    const expectedHalf = (DEG_TO_RAD + 0.001 * DEG_TO_RAD) * 0.5;
    expect(computeGaiaTargetFullAngleRad(mid)).toBeCloseTo(expectedHalf, 8);
  });

  it("named-star FULL angles match Codex-corrected reference values", () => {
    // Per Codex 2026-05-05: real Gaia adaptive lerp values across
    // the catalog. Pinned to detect any drift in the formula.
    expect(computeGaiaTargetFullAngleRad(2.6)).toBeCloseTo(
      0.9995 * DEG_TO_RAD,
      4
    );
    expect(computeGaiaTargetFullAngleRad(100)).toBeCloseTo(
      0.965 * DEG_TO_RAD,
      3
    );
    expect(computeGaiaTargetFullAngleRad(1000)).toBeCloseTo(
      0.644 * DEG_TO_RAD,
      3
    );
    expect(computeGaiaTargetFullAngleRad(1200)).toBeCloseTo(
      0.573 * DEG_TO_RAD,
      3
    );
  });

  it("returns near-target for non-finite input (defensive)", () => {
    expect(computeGaiaTargetFullAngleRad(Number.NaN)).toBe(DEG_TO_RAD);
    expect(computeGaiaTargetFullAngleRad(Number.POSITIVE_INFINITY)).toBe(
      DEG_TO_RAD
    );
    expect(computeGaiaTargetFullAngleRad(Number.NEGATIVE_INFINITY)).toBe(
      DEG_TO_RAD
    );
  });

  it("monotonically decreases between the anchors", () => {
    let prev = computeGaiaTargetFullAngleRad(1.31);
    for (let pc = 10; pc <= 2800; pc += 50) {
      const cur = computeGaiaTargetFullAngleRad(pc);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeAtlasFlightTarget — Atlas mesh-spawn clamp", () => {
  it("near-anchor (Gaia 1° FULL = 0.5° angular radius) does NOT clamp", () => {
    // Sirius-like distance. Gaia's 1° full = 8.73e-3 rad angular
    // radius, well above the 5e-3 rad mesh-spawn floor.
    const target = computeAtlasFlightTarget(2.64);
    expect(target.clampedByAtlasFloor).toBe(false);
    expect(target.angularRadiusRad).toBeGreaterThan(5e-3);
    // FULL angle ~= 1° (modulo tiny lerp pull toward far-target)
    expect(target.fullAngleRad).toBeGreaterThan(0.99 * DEG_TO_RAD);
    expect(target.fullAngleRad).toBeLessThan(DEG_TO_RAD);
  });

  it("at ~1200 pc (Gaia 0.573° FULL), Gaia equals Atlas floor", () => {
    // Per Codex 2026-05-05: this is the crossover. At ≤ 1200 pc
    // Gaia dominates; beyond it, the Atlas floor takes over.
    const target = computeAtlasFlightTarget(1200);
    // Should be right at the boundary — exact behavior depends on
    // floating-point ordering, but angularRadiusRad is essentially
    // 5e-3 rad either way.
    expect(target.angularRadiusRad).toBeCloseTo(5e-3, 4);
  });

  it("far-anchor (Gaia 0.001° FULL) DOES clamp to mesh-spawn floor", () => {
    // Gaia's 0.001° full = 8.7e-6 rad angular radius — far below
    // STELLAR_MESH_ENTER_RAD (1e-3) and the 5e-3 floor we use.
    // Without the clamp, the procedural mesh would never spawn.
    const target = computeAtlasFlightTarget(2805.0);
    expect(target.clampedByAtlasFloor).toBe(true);
    expect(target.angularRadiusRad).toBe(5e-3);
    expect(target.fullAngleRad).toBe(1e-2);
  });

  it("beyond far-anchor stays clamped", () => {
    const target = computeAtlasFlightTarget(50_000);
    expect(target.clampedByAtlasFloor).toBe(true);
    expect(target.angularRadiusRad).toBe(5e-3);
  });

  it("close star (1 pc, below near-anchor) does not clamp", () => {
    // Gaia clamps to 1° full = 0.5° angular radius = 8.73e-3 rad,
    // well above the Atlas floor.
    const target = computeAtlasFlightTarget(1.0);
    expect(target.clampedByAtlasFloor).toBe(false);
    expect(target.angularRadiusRad).toBeCloseTo(0.5 * DEG_TO_RAD, 8);
  });

  it("clampedByAtlasFloor flips at ~1200 pc crossover", () => {
    // Below crossover: not clamped. Above: clamped.
    expect(computeAtlasFlightTarget(1100).clampedByAtlasFloor).toBe(false);
    expect(computeAtlasFlightTarget(1300).clampedByAtlasFloor).toBe(true);
  });

  it("angular radius always satisfies mesh-spawn gate (with hysteresis margin)", () => {
    // Across the full distance range, the result must always be
    // ≥ STELLAR_MESH_ENTER_RAD * 5 — this is the contract that
    // M2.5 brings to the table beyond what raw Gaia provides.
    for (const pc of [
      0.5, 1.0, 1.31, 2.6, 100, 1000, 1200, 2000, 2805, 50_000,
    ]) {
      const target = computeAtlasFlightTarget(pc);
      expect(target.angularRadiusRad).toBeGreaterThanOrEqual(
        STELLAR_MESH_ENTER_RAD * 5
      );
    }
  });
});

describe("computeFlightTargetDistance", () => {
  it("matches Gaia's radius / tan(fullAngle * 0.5) formula", () => {
    const radius = 100;
    const fullAngle = 0.1; // rad
    const expected = radius / Math.tan(fullAngle * 0.5);
    expect(computeFlightTargetDistance(radius, fullAngle)).toBeCloseTo(
      expected,
      10
    );
  });

  it("Sun at 1° FULL angle lands at ~533 wu", () => {
    // Sun radius = 4.654 wu. distance = 4.654 / tan(0.5°) ≈ 533.13 wu
    const dist = computeFlightTargetDistance(
      SUN_RADIUS_WORLD_UNITS,
      DEG_TO_RAD
    );
    expect(dist).toBeGreaterThan(530);
    expect(dist).toBeLessThan(536);
  });

  it("smaller FULL angle → larger distance (monotonic)", () => {
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

  it("larger radius → larger distance at fixed angle (linear)", () => {
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

describe("computeAtlasFlightLanding — named-star pins", () => {
  // Pre-computed expected landing distances incorporating the
  // Atlas mesh-spawn clamp. Values pinned to detect drift in
  // either the Gaia formula or the floor constant.

  it("Sirius (R≈1.711 R_sun, d≈2.64 pc) → ~913 wu, NOT clamped", () => {
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS; // ~7.964 wu
    const result = computeAtlasFlightLanding(radiusWu, 2.64);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    // Lerp pulls solidAngle barely below 1° at 2.64 pc; landing
    // distance ≈ 7.964 / tan(0.4998°) ≈ 912.6 wu.
    expect(result.distanceWu).toBeGreaterThan(911);
    expect(result.distanceWu).toBeLessThan(914);
  });

  it("Betelgeuse (R≈887 R_sun, d≈197.8 pc) → ~509,000 wu, NOT clamped", () => {
    const radiusWu = 887 * SUN_RADIUS_WORLD_UNITS; // ~4128 wu
    const result = computeAtlasFlightLanding(radiusWu, 197.8);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    // solidAngle ≈ 0.930° FULL, distance ≈ 4128 / tan(0.465°) ≈ 508,700 wu
    expect(result.distanceWu).toBeGreaterThan(505_000);
    expect(result.distanceWu).toBeLessThan(513_000);
  });

  it("Proxima (R≈0.15 R_sun, d≈1.30 pc) → ~80 wu, NOT clamped", () => {
    const radiusWu = 0.15 * SUN_RADIUS_WORLD_UNITS; // ~0.698 wu
    const result = computeAtlasFlightLanding(radiusWu, 1.3);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    expect(result.distanceWu).toBeGreaterThan(79);
    expect(result.distanceWu).toBeLessThan(81);
  });

  it("Sun-like dwarf at far anchor (d=2805 pc) lands per Atlas floor", () => {
    // Without the clamp, this would land at ~533,300 wu (Gaia
    // 0.001° full angle). With the clamp, it lands at the Atlas
    // floor (5e-3 rad angular radius = 1e-2 rad full angle):
    // distance = 4.654 / tan(0.005 rad) ≈ 930.8 wu — same as
    // pre-M2.5's "fixed 5×ENTER" landing.
    const result = computeAtlasFlightLanding(SUN_RADIUS_WORLD_UNITS, 2805);
    expect(result.target.clampedByAtlasFloor).toBe(true);
    expect(result.distanceWu).toBeGreaterThan(925);
    expect(result.distanceWu).toBeLessThan(940);
  });

  it("regression vs Atlas pre-M2.5 fixed 5×ENTER baseline (Codex-corrected)", () => {
    // Atlas pre-M2.5 used `STELLAR_MESH_ENTER_RAD * 5 = 5e-3 rad`
    // as the angular RADIUS target → 1e-2 rad FULL angle. Our
    // M2.5 lands CLOSER for stars below ~1200 pc (Gaia adaptive
    // dominates) and IDENTICAL for stars beyond (clamp dominates).
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS; // Sirius
    const m25 = computeAtlasFlightLanding(radiusWu, 2.64);

    // Pre-M2.5 baseline: fixed 1e-2 rad FULL angle (5e-3 rad
    // angular radius), ignoring distance.
    const preM25Full = STELLAR_MESH_ENTER_RAD * 5 * 2; // 1e-2 rad
    const preM25Distance = computeFlightTargetDistance(radiusWu, preM25Full);

    // Sirius post-M2.5 lands closer than pre-M2.5.
    expect(m25.distanceWu).toBeLessThan(preM25Distance);
    // Ratio (Codex-corrected expectation): ~1.74×, not ~3.5× as
    // the first-draft test wrongly claimed.
    const ratio = preM25Distance / m25.distanceWu;
    expect(ratio).toBeGreaterThan(1.6);
    expect(ratio).toBeLessThan(1.9);
  });

  it("far star (3000 pc, beyond Gaia far-anchor) matches pre-M2.5 baseline exactly", () => {
    // The clamp ensures behavior is byte-equivalent to pre-M2.5
    // for distant stars — no regression of the mesh-spawn gate.
    const radiusWu = SUN_RADIUS_WORLD_UNITS;
    const m25 = computeAtlasFlightLanding(radiusWu, 3000);
    const preM25Full = STELLAR_MESH_ENTER_RAD * 5 * 2;
    const preM25Distance = computeFlightTargetDistance(radiusWu, preM25Full);
    expect(m25.distanceWu).toBeCloseTo(preM25Distance, 6);
    expect(m25.target.clampedByAtlasFloor).toBe(true);
  });
});
