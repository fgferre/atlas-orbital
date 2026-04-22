import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { intersectRingPlane, sunInObjectSpace } from "./ringShadowMath";

// These tests pin the T1.2 frame-alignment fix in Planet.tsx /
// usePlanetMaterials.ts. Pre-fix, `uSunPosition` was initialized to
// (0,0,0) and never updated, so the ring-shadow ray/plane intersection
// silently mixed world-space sun with object-space surface points.
// The mix only coincides when the planet's model matrix is identity;
// Saturn's 26.73° axial tilt and orbital translation both break it.
describe("sunInObjectSpace", () => {
  it("identity matrix returns (0,0,0) — explains why the bug was hidden pre-fix", () => {
    const sun = sunInObjectSpace(new THREE.Matrix4());
    expect(sun.x).toBeCloseTo(0, 6);
    expect(sun.y).toBeCloseTo(0, 6);
    expect(sun.z).toBeCloseTo(0, 6);
  });

  it("pure rotation leaves world-origin at object-origin (both are rotation-invariant)", () => {
    const tilt = new THREE.Matrix4().makeRotationZ(
      THREE.MathUtils.degToRad(26.73)
    );
    const sun = sunInObjectSpace(tilt);
    expect(sun.x).toBeCloseTo(0, 6);
    expect(sun.y).toBeCloseTo(0, 6);
    expect(sun.z).toBeCloseTo(0, 6);
  });

  it("Saturn-like tilt+translation produces non-zero object-space sun vector", () => {
    // Mirror the transform chain at Planet.tsx:282 — a translation to
    // the planet's orbital position followed by the axial-tilt rotation.
    const translate = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const tilt = new THREE.Matrix4().makeRotationZ(
      THREE.MathUtils.degToRad(26.73)
    );
    const world = new THREE.Matrix4().multiplyMatrices(translate, tilt);
    const sun = sunInObjectSpace(world);
    // Inverse applied to world-origin: R_z(-26.73°) · T(-10,0,0) · (0,0,0)
    //   = R_z(-26.73°) · (-10, 0, 0)
    //   = (-10 cos26.73°, +10 sin26.73°, 0)
    const rad = THREE.MathUtils.degToRad(26.73);
    expect(sun.x).toBeCloseTo(-10 * Math.cos(rad), 4);
    expect(sun.y).toBeCloseTo(10 * Math.sin(rad), 4);
    expect(sun.z).toBeCloseTo(0, 6);
  });
});

describe("intersectRingPlane", () => {
  it("computes hit radius and annulus membership for a canonical lit surface", () => {
    // Surface point at (0, 0.5, 0) in planet-local space; sun offset
    // such that the ray toward the sun pierces y=0 at x=1.0.
    const origin = new THREE.Vector3(0, 0.5, 0);
    const sunLocal = new THREE.Vector3(2.0, -0.5, 0);
    const hit = intersectRingPlane(origin, sunLocal, 0.5, 2.0);
    // dir ∝ (2, -1, 0); |dir| = √5; t = -0.5 / (-1/√5) = 0.5√5
    expect(hit.t).toBeCloseTo(0.5 * Math.sqrt(5), 4);
    expect(hit.radius).toBeCloseTo(1.0, 4);
    expect(hit.hits).toBe(true);
  });

  it("ray parallel to ring plane yields no intersection", () => {
    const origin = new THREE.Vector3(0, 0.5, 0);
    const sunLocal = new THREE.Vector3(1, 0.5, 0); // same y → dir.y = 0
    const hit = intersectRingPlane(origin, sunLocal, 0.5, 2.0);
    expect(hit.hits).toBe(false);
    expect(Number.isNaN(hit.t)).toBe(true);
  });

  it("T1.2 regression: tilt+translation vs identity produce different shadow radii for the same surface point", () => {
    const surfacePoint = new THREE.Vector3(0.3, 0.8, 0.3);
    const innerR = 1.2;
    const outerR = 5.0;

    // Case A — pre-fix code path (sun stays at uniform init value (0,0,0)).
    const hitA = intersectRingPlane(
      surfacePoint,
      new THREE.Vector3(0, 0, 0),
      innerR,
      outerR
    );

    // Case B — post-fix: sun transformed through Saturn-like matrix.
    const translate = new THREE.Matrix4().makeTranslation(10, 0, 0);
    const tilt = new THREE.Matrix4().makeRotationZ(
      THREE.MathUtils.degToRad(26.73)
    );
    const world = new THREE.Matrix4().multiplyMatrices(translate, tilt);
    const sunLocal = sunInObjectSpace(world);
    const hitB = intersectRingPlane(surfacePoint, sunLocal, innerR, outerR);

    // Different sun vectors must yield different ray/plane intersections.
    // This is the whole point of the fix: on a tilted + translated
    // planet, the ring shadow must not collapse to the identity answer.
    expect(hitB.radius).not.toBeCloseTo(hitA.radius, 2);
  });
});
