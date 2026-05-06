import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import { AimLerp, type AimLerpSpec } from "./aimLerp";

/**
 * T6.4-M2.5 round-6 (post R6-H aim-lerp rewrite, 2026-05-06) —
 * tests for `AimLerp`. Validates: (1) target stays at the actual
 * camera-to-star distance ahead of camera at all times (never
 * crosses, never degenerates); (2) initial frame produces target
 * along `initialAimDir`; (3) final frame produces target at the
 * star's world position; (4) cancel() deactivates without firing
 * `onComplete`; (5) per-frame endpoint recompute (camera moves →
 * lerp endpoint shifts smoothly).
 */

const linear = (t: number): number => t;

const makeSpec = (overrides: Partial<AimLerpSpec> = {}): AimLerpSpec => ({
  startCameraPos: new THREE.Vector3(0, 0, 0),
  startTarget: new THREE.Vector3(0, 0, -1), // looking toward -z
  starWorldPos: new THREE.Vector3(100, 0, 0), // star is at +x
  durationMs: 200,
  easing: linear,
  ...overrides,
});

describe("AimLerp — lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null before start()", () => {
    const a = new AimLerp();
    expect(a.update(new THREE.Vector3())).toBeNull();
    expect(a.isActive).toBe(false);
  });

  it("becomes active after start()", () => {
    const a = new AimLerp();
    a.start(makeSpec());
    expect(a.isActive).toBe(true);
  });

  it("returns initial-aim target at t=0", () => {
    const a = new AimLerp();
    a.start(makeSpec());
    const f = a.update(new THREE.Vector3(0, 0, 0));
    expect(f).not.toBeNull();
    // initialAimDir = (startTarget - startCameraPos).normalized = (0,0,-1).
    // distanceToStar = 100. So target = (0,0,0) + (0,0,-1)*100 = (0,0,-100).
    expect(f!.target.x).toBeCloseTo(0, 5);
    expect(f!.target.y).toBeCloseTo(0, 5);
    expect(f!.target.z).toBeCloseTo(-100, 5);
    expect(f!.done).toBe(false);
  });

  it("returns star world position at t=durationMs (linear easing)", () => {
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 200 }));
    vi.advanceTimersByTime(200);
    const f = a.update(new THREE.Vector3(0, 0, 0));
    expect(f).not.toBeNull();
    // alpha=1 → aimDir = currentAimToStar = (1,0,0).
    // target = (0,0,0) + (1,0,0)*100 = (100,0,0) = starWorldPos.
    expect(f!.target.x).toBeCloseTo(100, 5);
    expect(f!.target.y).toBeCloseTo(0, 5);
    expect(f!.target.z).toBeCloseTo(0, 5);
    expect(f!.done).toBe(true);
    expect(a.isActive).toBe(false);
  });

  it("zero durationMs completes on first update", () => {
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 0 }));
    const f = a.update(new THREE.Vector3(0, 0, 0));
    expect(f!.done).toBe(true);
    expect(f!.target.x).toBeCloseTo(100, 5);
  });
});

describe("AimLerp — geometric invariants", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("target is always at distance >= eps from camera (never crosses)", () => {
    // Camera moves toward star while the lerp progresses. The
    // earlier OrientationLerp had the target lerp from origin to
    // star while camera also moved toward star — at some moment,
    // target == camera (degeneracy + visual flip). AimLerp keeps
    // target at the actual camera-to-star distance ahead of
    // camera in the aim direction, so it should never cross.
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 500 }));
    const cameraPos = new THREE.Vector3(0, 0, 0);
    const star = new THREE.Vector3(100, 0, 0);
    let minDistance = Infinity;
    for (let i = 0; i <= 50; i++) {
      vi.advanceTimersByTime(10);
      // Camera moves toward star at constant speed.
      cameraPos.set(2 * i, 0, 0);
      const f = a.update(cameraPos);
      if (!f) break;
      const dist = f.target.distanceTo(cameraPos);
      if (dist < minDistance) minDistance = dist;
      // While active and camera hasn't reached star: target should
      // be NON-zero distance from camera (the actual camera-to-star
      // distance, since aim points toward star + we apply it as
      // distance-along-aim).
      if (cameraPos.x < star.x) {
        expect(dist).toBeGreaterThan(1);
      }
    }
    expect(minDistance).toBeGreaterThan(0);
  });

  it("target = starWorldPos exactly when camera reaches star at alpha=1", () => {
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 100 }));
    vi.advanceTimersByTime(100);
    const cameraNearStar = new THREE.Vector3(99, 0, 0);
    const f = a.update(cameraNearStar);
    expect(f!.target.x).toBeCloseTo(100, 5);
  });

  it("aim direction smoothly slerps from initial to dir-to-star", () => {
    // 90° sweep: initial dir = (0,1,0), star at (1,0,0).
    const a = new AimLerp();
    a.start(
      makeSpec({
        startTarget: new THREE.Vector3(0, 1, 0), // looking up
        starWorldPos: new THREE.Vector3(1, 0, 0), // star to right
        durationMs: 100,
      })
    );
    vi.advanceTimersByTime(50); // halfway
    const f = a.update(new THREE.Vector3(0, 0, 0));
    // At t=0.5, slerp midpoint between (0,1,0) and (1,0,0) is
    // approximately (sin(45°), sin(45°), 0) = (0.707, 0.707, 0).
    // With distance 1, target = (0.707, 0.707, 0).
    expect(f!.target.x).toBeCloseTo(0.707, 2);
    expect(f!.target.y).toBeCloseTo(0.707, 2);
    expect(f!.target.z).toBeCloseTo(0, 5);
  });

  it("handles 180° sweep without degeneracy", () => {
    // initial = (1,0,0), final = (-1,0,0). Slerp should pick a
    // perpendicular intermediate axis and rotate by π × t.
    const a = new AimLerp();
    a.start(
      makeSpec({
        startCameraPos: new THREE.Vector3(0, 0, 0),
        startTarget: new THREE.Vector3(1, 0, 0),
        starWorldPos: new THREE.Vector3(-1, 0, 0),
        durationMs: 100,
      })
    );
    vi.advanceTimersByTime(50);
    const f = a.update(new THREE.Vector3(0, 0, 0));
    // Halfway through 180° rotation should be perpendicular to
    // both endpoints. Length-1 with x ≈ 0.
    const len = Math.sqrt(
      f!.target.x * f!.target.x +
        f!.target.y * f!.target.y +
        f!.target.z * f!.target.z
    );
    expect(Math.abs(f!.target.x)).toBeLessThan(0.1);
    expect(len).toBeCloseTo(1, 2);
  });

  it("endpoint recomputes per frame as camera moves", () => {
    // Camera starts at origin looking at +x; star is at (10,0,0).
    // Move camera laterally to (0,5,0). The current dir-to-star
    // shifts; the slerp endpoint follows.
    const a = new AimLerp();
    a.start(
      makeSpec({
        startCameraPos: new THREE.Vector3(0, 0, 0),
        startTarget: new THREE.Vector3(10, 0, 0), // initial aim same as star dir
        starWorldPos: new THREE.Vector3(10, 0, 0),
        durationMs: 100,
      })
    );
    vi.advanceTimersByTime(100); // alpha=1 already
    // Camera moved laterally to (0, 5, 0). dir-to-star is now
    // (10, -5, 0).normalized() ≈ (0.894, -0.447, 0). Distance
    // = sqrt(125) ≈ 11.18. Target = camera + dir × distance =
    // (10, 0, 0) — the star itself.
    const f = a.update(new THREE.Vector3(0, 5, 0));
    expect(f!.target.x).toBeCloseTo(10, 4);
    expect(f!.target.y).toBeCloseTo(0, 4);
  });
});

describe("AimLerp — onComplete + cancel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires onComplete on natural completion", () => {
    const onComplete = vi.fn();
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 100, onComplete }));
    vi.advanceTimersByTime(100);
    a.update(new THREE.Vector3());
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onComplete when cancelled before completion", () => {
    const onComplete = vi.fn();
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 1000, onComplete }));
    vi.advanceTimersByTime(500);
    a.cancel();
    expect(onComplete).not.toHaveBeenCalled();
    expect(a.isActive).toBe(false);
  });

  it("does NOT fire onComplete when cancelled after duration elapsed", () => {
    const onComplete = vi.fn();
    const a = new AimLerp();
    a.start(makeSpec({ durationMs: 100, onComplete }));
    vi.advanceTimersByTime(200);
    a.cancel();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancel on inactive is a no-op", () => {
    const a = new AimLerp();
    expect(() => a.cancel()).not.toThrow();
    expect(a.isActive).toBe(false);
  });
});

describe("AimLerp — degenerate inputs", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to dir-to-star when startTarget == startCameraPos", () => {
    const a = new AimLerp();
    a.start(
      makeSpec({
        startCameraPos: new THREE.Vector3(0, 0, 0),
        startTarget: new THREE.Vector3(0, 0, 0), // degenerate
        starWorldPos: new THREE.Vector3(10, 0, 0),
        durationMs: 100,
      })
    );
    const f = a.update(new THREE.Vector3(0, 0, 0));
    // Initial aim falls back to dir-to-star = (1,0,0). Target
    // at distance 10 along that = (10, 0, 0).
    expect(f!.target.x).toBeCloseTo(10, 4);
  });

  it("handles camera coinciding with star without crash", () => {
    const a = new AimLerp();
    a.start(makeSpec());
    const f = a.update(new THREE.Vector3(100, 0, 0)); // == starWorldPos
    expect(f).not.toBeNull();
    expect(Number.isFinite(f!.target.x)).toBe(true);
    expect(Number.isFinite(f!.target.y)).toBe(true);
    expect(Number.isFinite(f!.target.z)).toBe(true);
  });
});
