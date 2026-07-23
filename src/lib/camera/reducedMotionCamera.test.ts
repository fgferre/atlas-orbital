import { describe, it, expect } from "vitest";
import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";
import {
  resolveCameraTransitionDurationMs,
  resolveSnapLandingPosition,
} from "./reducedMotionCamera";

/**
 * a11y N-4 (2026-07-23) — reduced motion must govern the camera.
 *
 * Pins the pure policy helpers plus the `CameraTransition` contract
 * they rely on (duration 0 → endpoint on the first update), mirroring
 * the way `components/canvas/gridFade.test.ts` pins the grid's snap.
 */

describe("resolveCameraTransitionDurationMs", () => {
  it("returns 0 for every fly-to duration under reduced motion", () => {
    // The three durations the curated-body path can produce:
    // layout reframe, scale-mode switch, distance-scaled fly-to.
    for (const base of [520, 800, 4000]) {
      expect(resolveCameraTransitionDurationMs(base, true)).toBe(0);
    }
  });

  it("passes the base duration through when motion is allowed", () => {
    expect(resolveCameraTransitionDurationMs(520, false)).toBe(520);
    expect(resolveCameraTransitionDurationMs(800, false)).toBe(800);
    expect(resolveCameraTransitionDurationMs(4000, false)).toBe(4000);
  });

  it("clamps non-finite / negative base durations to a snap", () => {
    expect(resolveCameraTransitionDurationMs(Number.NaN, false)).toBe(0);
    expect(
      resolveCameraTransitionDurationMs(Number.POSITIVE_INFINITY, false)
    ).toBe(0);
    expect(resolveCameraTransitionDurationMs(-1, false)).toBe(0);
  });
});

describe("CameraTransition under a zero duration", () => {
  it("lands on the endpoint at the first update (no NaN progress)", () => {
    const transition = new CameraTransition();
    const start = new THREE.Vector3(1000, 0, 0);
    const end = new THREE.Vector3(0, 0, 50);

    let completed = false;
    transition.start(start, end, new THREE.Vector3(), 0, () => {
      completed = true;
    });

    const pos = transition.update();
    expect(pos).not.toBeNull();
    expect(Number.isNaN(pos!.x)).toBe(false);
    expect(pos!.distanceTo(end)).toBeLessThan(1e-9);
    expect(completed).toBe(true);
    expect(transition.active).toBe(false);
  });

  it("reports progress 1 rather than NaN while still armed", () => {
    const transition = new CameraTransition();
    transition.start(
      new THREE.Vector3(10, 0, 0),
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(),
      0
    );
    expect(transition.progress).toBe(1);
  });

  it("still sweeps mid-flight for a normal duration (no regression)", () => {
    const transition = new CameraTransition();
    const start = new THREE.Vector3(1000, 0, 0);
    const end = new THREE.Vector3(0, 0, 50);
    transition.start(start, end, new THREE.Vector3(), 4000);

    const pos = transition.update();
    expect(pos).not.toBeNull();
    // Nowhere near the endpoint one tick into a 4 s transition.
    expect(pos!.distanceTo(end)).toBeGreaterThan(100);
    expect(transition.active).toBe(true);
  });
});

describe("resolveSnapLandingPosition", () => {
  const target = new THREE.Vector3(300, -400, 1200);

  it("lands exactly at the landing distance from the star", () => {
    const camera = new THREE.Vector3(1e9, 2e9, -3e9);
    const snapped = resolveSnapLandingPosition(camera, target, 42);
    expect(snapped.distanceTo(target)).toBeCloseTo(42, 9);
  });

  it("preserves the current approach bearing (distance-only change)", () => {
    const camera = new THREE.Vector3(1e9, 2e9, -3e9);
    const snapped = resolveSnapLandingPosition(camera, target, 42);

    const before = camera.clone().sub(target).normalize();
    const after = snapped.clone().sub(target).normalize();
    expect(before.angleTo(after)).toBeLessThan(1e-6);
  });

  it("does not mutate its inputs", () => {
    const camera = new THREE.Vector3(1e6, 0, 0);
    const targetCopy = target.clone();
    resolveSnapLandingPosition(camera, targetCopy, 42);
    expect(camera.x).toBe(1e6);
    expect(targetCopy.equals(target)).toBe(true);
  });

  it("falls back to +Z when the camera coincides with the star", () => {
    const snapped = resolveSnapLandingPosition(target.clone(), target, 10);
    expect(Number.isNaN(snapped.x)).toBe(false);
    expect(snapped.distanceTo(target)).toBeCloseTo(10, 9);
    expect(snapped.z).toBeCloseTo(target.z + 10, 9);
  });

  it("keeps the current pose when the landing distance is not finite", () => {
    const camera = new THREE.Vector3(7, 8, 9);
    const snapped = resolveSnapLandingPosition(camera, target, Number.NaN);
    expect(snapped.equals(camera)).toBe(true);
  });

  it("clamps a negative landing distance to the star itself", () => {
    const camera = new THREE.Vector3(1000, 0, 0);
    const snapped = resolveSnapLandingPosition(camera, target, -5);
    expect(snapped.distanceTo(target)).toBeCloseTo(0, 9);
  });
});
