import { describe, it, expect } from "vitest";

import { STELLAR_MESH_ENTER_RAD } from "../stellarMeshGate";
import {
  ATLAS_MIN_LANDING_DISTANCE_WU,
  STELLAR_FLIGHT_ANCHORS,
  computeAtlasFlightLanding,
  computeAtlasFlightTarget,
  computeFlightTargetDistance,
  computeGaiaTargetAngularRadiusRad,
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
  //   var y0 = 1.0; // deg  (angular radius — see lib header)
  //   var y1 = 0.001; // deg (angular radius — see lib header)
  // The y0/y1 anchors are compared at line 172 against
  // `focusView.getSolidAngle()`, which `ParticleSet.java:809`
  // computes as `(radius/distance)/fovFactor` — angular-radius
  // semantics despite the misleading method name.
  it("near-anchor distance is 1.31 pc (Gaia rx0)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_ANCHOR_PC).toBe(1.31);
  });

  it("far-anchor distance is 2805.0 pc (Gaia rx1)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.FAR_ANCHOR_PC).toBe(2805.0);
  });

  it("near-anchor target is 1.0° angular radius (Gaia y0)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_RADIUS_DEG).toBe(1.0);
  });

  it("far-anchor target is 0.001° angular radius (Gaia y1)", () => {
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_RADIUS_DEG).toBe(0.001);
  });

  it("anchor radians match deg×π/180 conversion", () => {
    expect(STELLAR_FLIGHT_ANCHORS.NEAR_TARGET_RADIUS_RAD).toBeCloseTo(
      DEG_TO_RAD,
      12
    );
    expect(STELLAR_FLIGHT_ANCHORS.FAR_TARGET_RADIUS_RAD).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("Atlas mesh-spawn floor is 5× STELLAR_MESH_ENTER_RAD", () => {
    expect(STELLAR_FLIGHT_ANCHORS.ATLAS_MIN_ANGULAR_RADIUS_RAD).toBe(
      STELLAR_MESH_ENTER_RAD * 5
    );
    // 5e-3 rad angular radius == 0.286° angular radius. Same value
    // the pre-M2.5 CameraController used as the fixed
    // `targetSolidAngle` (the value was always angular radius —
    // the misleading "solidAngle" name notwithstanding).
    expect(STELLAR_FLIGHT_ANCHORS.ATLAS_MIN_ANGULAR_RADIUS_RAD).toBeCloseTo(
      5e-3,
      12
    );
  });
});

describe("computeGaiaTargetAngularRadiusRad", () => {
  it("returns near-target ANGULAR RADIUS for distance below near-anchor", () => {
    expect(computeGaiaTargetAngularRadiusRad(0)).toBeCloseTo(DEG_TO_RAD, 12);
    expect(computeGaiaTargetAngularRadiusRad(0.5)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns near-target at exactly the near anchor", () => {
    expect(computeGaiaTargetAngularRadiusRad(1.31)).toBeCloseTo(DEG_TO_RAD, 12);
  });

  it("returns far-target at exactly the far anchor", () => {
    expect(computeGaiaTargetAngularRadiusRad(2805.0)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("clamps to far-target above the far anchor", () => {
    expect(computeGaiaTargetAngularRadiusRad(5000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
    expect(computeGaiaTargetAngularRadiusRad(50_000)).toBeCloseTo(
      0.001 * DEG_TO_RAD,
      12
    );
  });

  it("interpolates linearly between anchors", () => {
    const mid = (1.31 + 2805.0) * 0.5;
    const expectedHalf = (DEG_TO_RAD + 0.001 * DEG_TO_RAD) * 0.5;
    expect(computeGaiaTargetAngularRadiusRad(mid)).toBeCloseTo(expectedHalf, 8);
  });

  it("named-pc angular-radius values from the Gaia lerp", () => {
    // Pinned to detect any drift in the formula. Values are the
    // direct lerp y(d) = y0 + (y1-y0) × (d - rx0) / (rx1 - rx0)
    // expressed in degrees, then converted to radians.
    expect(computeGaiaTargetAngularRadiusRad(2.6)).toBeCloseTo(
      0.9995 * DEG_TO_RAD,
      4
    );
    expect(computeGaiaTargetAngularRadiusRad(100)).toBeCloseTo(
      0.965 * DEG_TO_RAD,
      3
    );
    expect(computeGaiaTargetAngularRadiusRad(1000)).toBeCloseTo(
      0.644 * DEG_TO_RAD,
      3
    );
    expect(computeGaiaTargetAngularRadiusRad(1200)).toBeCloseTo(
      0.573 * DEG_TO_RAD,
      3
    );
  });

  it("returns near-target for NaN (defensive — unknown distance)", () => {
    expect(computeGaiaTargetAngularRadiusRad(Number.NaN)).toBe(DEG_TO_RAD);
  });

  it("returns FAR-target for +Infinity (Codex 2026-05-05 P3)", () => {
    // Pre-Codex draft mapped all non-finite to NEAR via a single
    // !Number.isFinite() branch. +Infinity belongs at the far
    // anchor: an "infinitely far" star semantically sits at the
    // smallest target, not the largest.
    expect(computeGaiaTargetAngularRadiusRad(Number.POSITIVE_INFINITY)).toBe(
      0.001 * DEG_TO_RAD
    );
  });

  it("returns near-target for -Infinity (defensive — nonsensical distance)", () => {
    expect(computeGaiaTargetAngularRadiusRad(Number.NEGATIVE_INFINITY)).toBe(
      DEG_TO_RAD
    );
  });

  it("monotonically decreases between the anchors", () => {
    let prev = computeGaiaTargetAngularRadiusRad(1.31);
    for (let pc = 10; pc <= 2800; pc += 50) {
      const cur = computeGaiaTargetAngularRadiusRad(pc);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe("computeAtlasFlightTarget — Atlas mesh-spawn clamp", () => {
  it("near-anchor (Gaia 1° angular radius) does NOT clamp", () => {
    // Sirius-like distance. Gaia's 1° angular radius = 1.745e-2 rad,
    // well above the 5e-3 rad mesh-spawn floor.
    const target = computeAtlasFlightTarget(2.64);
    expect(target.clampedByAtlasFloor).toBe(false);
    expect(target.angularRadiusRad).toBeGreaterThan(5e-3);
    // Modulo tiny lerp pull toward far-target at 2.64 pc.
    expect(target.angularRadiusRad).toBeGreaterThan(0.99 * DEG_TO_RAD);
    expect(target.angularRadiusRad).toBeLessThan(DEG_TO_RAD);
  });

  it("at ~2003 pc, Gaia angular radius equals the Atlas floor", () => {
    // Post-Codex-round-3 crossover. Solving the lerp for y = 0.2865°
    // (which is 5e-3 rad): t = (1 - 0.2865)/(1 - 0.001) ≈ 0.7141 →
    // d ≈ 1.31 + 0.7141 × (2805 - 1.31) ≈ 2003 pc. Below this
    // distance, Gaia dominates; beyond it, Atlas floor takes over.
    const target = computeAtlasFlightTarget(2003);
    expect(target.angularRadiusRad).toBeCloseTo(5e-3, 4);
  });

  it("far-anchor (Gaia 0.001° angular radius) DOES clamp to mesh-spawn floor", () => {
    // Gaia's 0.001° angular radius = 1.745e-5 rad — far below the
    // STELLAR_MESH_ENTER_RAD (1e-3) gate and the 5e-3 floor we use.
    // Without the clamp, the procedural mesh would never spawn.
    const target = computeAtlasFlightTarget(2805.0);
    expect(target.clampedByAtlasFloor).toBe(true);
    expect(target.angularRadiusRad).toBe(5e-3);
  });

  it("beyond far-anchor stays clamped", () => {
    const target = computeAtlasFlightTarget(50_000);
    expect(target.clampedByAtlasFloor).toBe(true);
    expect(target.angularRadiusRad).toBe(5e-3);
  });

  it("close star (1 pc, below near-anchor) does not clamp", () => {
    // Gaia clamps to 1° angular radius = 1.745e-2 rad, well above
    // the Atlas floor.
    const target = computeAtlasFlightTarget(1.0);
    expect(target.clampedByAtlasFloor).toBe(false);
    expect(target.angularRadiusRad).toBeCloseTo(DEG_TO_RAD, 8);
  });

  it("clampedByAtlasFloor flips at ~2003 pc crossover", () => {
    // Below crossover: not clamped. Above: clamped.
    expect(computeAtlasFlightTarget(1900).clampedByAtlasFloor).toBe(false);
    expect(computeAtlasFlightTarget(2100).clampedByAtlasFloor).toBe(true);
  });

  it("at 1200 pc, Gaia angular radius is 2× the Atlas floor (no clamp)", () => {
    // Post-Codex-round-3 sanity pin. Pre-fix this distance was the
    // crossover (because the old code halved Gaia's curve before
    // comparing against the floor). Post-fix Gaia returns 0.573°
    // angular radius = 1e-2 rad, which is 2× the 5e-3 floor — far
    // from the boundary. This pin guards against accidentally
    // re-introducing the halving step.
    const target = computeAtlasFlightTarget(1200);
    expect(target.clampedByAtlasFloor).toBe(false);
    expect(target.angularRadiusRad).toBeCloseTo(0.573 * DEG_TO_RAD, 3);
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
  it("matches Gaia's radius / tan(angularRadius) formula", () => {
    const radius = 100;
    const angularRadius = 0.05; // rad
    const expected = radius / Math.tan(angularRadius);
    expect(computeFlightTargetDistance(radius, angularRadius)).toBeCloseTo(
      expected,
      10
    );
  });

  it("Sun at 1° ANGULAR RADIUS lands at ~266 wu", () => {
    // Sun radius = 4.654 wu. distance = 4.654 / tan(1°) ≈ 266.5 wu
    // (post-Codex-round-3 — the pre-fix `tan(0.5°)` formula gave
    // ~533 wu, which was the 2× regression).
    const dist = computeFlightTargetDistance(
      SUN_RADIUS_WORLD_UNITS,
      DEG_TO_RAD
    );
    expect(dist).toBeGreaterThan(265);
    expect(dist).toBeLessThan(268);
  });

  it("smaller angular radius → larger distance (monotonic)", () => {
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

  it("Sirius (R≈1.711 R_sun, d≈2.64 pc) → ~456 wu, NOT clamped (Codex round-3)", () => {
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS; // ~7.964 wu
    const result = computeAtlasFlightLanding(radiusWu, 2.64);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    // Lerp pulls angular radius barely below 1° at 2.64 pc; landing
    // distance ≈ 7.964 / tan(0.9995°) ≈ 456.3 wu.
    // Pre-Codex-round-3 hotfix this pinned at ~913 wu (2× regression
    // from treating Gaia's curve as full angle and halving it).
    expect(result.distanceWu).toBeGreaterThan(454);
    expect(result.distanceWu).toBeLessThan(458);
  });

  it("Betelgeuse (R≈887 R_sun, d≈197.8 pc) → ~254,000 wu, NOT clamped", () => {
    const radiusWu = 887 * SUN_RADIUS_WORLD_UNITS; // ~4128 wu
    const result = computeAtlasFlightLanding(radiusWu, 197.8);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    // angular radius ≈ 0.930°, distance ≈ 4128 / tan(0.930°) ≈ 254,300 wu.
    expect(result.distanceWu).toBeGreaterThan(252_000);
    expect(result.distanceWu).toBeLessThan(257_000);
  });

  it("Proxima (R≈0.15 R_sun, d≈1.30 pc) → ~40 wu, NOT clamped", () => {
    const radiusWu = 0.15 * SUN_RADIUS_WORLD_UNITS; // ~0.698 wu
    const result = computeAtlasFlightLanding(radiusWu, 1.3);
    expect(result.target.clampedByAtlasFloor).toBe(false);
    // 40 wu lands above the 10 wu absolute floor, so the angle-
    // driven term dominates here. distance = 0.698/tan(1°) ≈ 40 wu.
    expect(result.distanceWu).toBeGreaterThan(39);
    expect(result.distanceWu).toBeLessThan(41);
  });

  it("white-dwarf-class star (R≈0.0465 wu, d=100 pc) → 10 wu absolute floor (Codex 2026-05-05 P2)", () => {
    // Without the absolute floor restored from pre-M2.5, the
    // angle-driven term puts this star at ~2.8 wu — below the
    // 10 wu safety guard the original CameraController used.
    // Pin the restored floor.
    const whiteDwarfWu = 0.01 * SUN_RADIUS_WORLD_UNITS; // ~0.0465 wu
    const result = computeAtlasFlightLanding(whiteDwarfWu, 100);
    expect(result.distanceWu).toBe(ATLAS_MIN_LANDING_DISTANCE_WU);
    expect(result.distanceWu).toBe(10);
  });

  it("ATLAS_MIN_LANDING_DISTANCE_WU is 10 wu (mirrors pre-M2.5 absolute floor)", () => {
    expect(ATLAS_MIN_LANDING_DISTANCE_WU).toBe(10);
  });

  it("Sun-like dwarf at far anchor (d=2805 pc) lands per Atlas floor", () => {
    // With the clamp, this lands at the Atlas floor (5e-3 rad
    // angular radius): distance = 4.654 / tan(0.005 rad) ≈ 930.8 wu —
    // same as pre-M2.5's "fixed 5×ENTER" landing.
    const result = computeAtlasFlightLanding(SUN_RADIUS_WORLD_UNITS, 2805);
    expect(result.target.clampedByAtlasFloor).toBe(true);
    expect(result.distanceWu).toBeGreaterThan(925);
    expect(result.distanceWu).toBeLessThan(940);
  });

  it("regression vs Atlas pre-M2.5 fixed 5×ENTER baseline (Codex round-3)", () => {
    // Atlas pre-M2.5 used `STELLAR_MESH_ENTER_RAD * 5 = 5e-3 rad`
    // as the angular RADIUS target, ignoring distance. Our M2.5
    // (post-Codex-round-3) lands CLOSER for stars below ~2003 pc
    // (Gaia adaptive dominates) and IDENTICAL for stars beyond
    // (clamp dominates).
    const radiusWu = 1.711 * SUN_RADIUS_WORLD_UNITS; // Sirius
    const m25 = computeAtlasFlightLanding(radiusWu, 2.64);

    // Pre-M2.5 baseline: fixed 5e-3 rad angular radius, ignoring
    // distance.
    const preM25AngularRadius = STELLAR_MESH_ENTER_RAD * 5; // 5e-3 rad
    const preM25Distance = computeFlightTargetDistance(
      radiusWu,
      preM25AngularRadius
    );

    // Sirius post-M2.5 lands closer than pre-M2.5.
    expect(m25.distanceWu).toBeLessThan(preM25Distance);
    // Ratio (Codex-round-3 corrected expectation): ~3.5×. The
    // pre-Codex-round-3 hotfix pinned this at ~1.74× because of the
    // halving bug; that mid-state was wrong even though the test
    // matched the buggy code.
    const ratio = preM25Distance / m25.distanceWu;
    expect(ratio).toBeGreaterThan(3.4);
    expect(ratio).toBeLessThan(3.6);
  });

  it("far star (3000 pc, beyond Gaia far-anchor) matches pre-M2.5 baseline exactly", () => {
    // The clamp ensures behavior is byte-equivalent to pre-M2.5
    // for distant stars — no regression of the mesh-spawn gate.
    const radiusWu = SUN_RADIUS_WORLD_UNITS;
    const m25 = computeAtlasFlightLanding(radiusWu, 3000);
    const preM25AngularRadius = STELLAR_MESH_ENTER_RAD * 5;
    const preM25Distance = computeFlightTargetDistance(
      radiusWu,
      preM25AngularRadius
    );
    expect(m25.distanceWu).toBeCloseTo(preM25Distance, 6);
    expect(m25.target.clampedByAtlasFloor).toBe(true);
  });
});
