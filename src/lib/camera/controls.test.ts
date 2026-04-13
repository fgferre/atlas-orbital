import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  ORBIT_MOUSE_BUTTONS,
  calculateAdaptiveZoomSpeed,
  createFocusTrackingState,
  resolveFocusTrackingFrame,
} from "./controls";

describe("camera controls calibration", () => {
  it("keeps adaptive zoom precise near the target and bounded in deep space", () => {
    const nearSpeed = calculateAdaptiveZoomSpeed(10, 10);
    const overviewSpeed = calculateAdaptiveZoomSpeed(1_746, 10);
    const deepSpaceSpeed = calculateAdaptiveZoomSpeed(1e12, 10);

    expect(nearSpeed).toBeCloseTo(0.45);
    expect(overviewSpeed).toBeGreaterThan(nearSpeed);
    expect(overviewSpeed).toBeLessThan(1.3);
    expect(deepSpaceSpeed).toBeCloseTo(2.4);
  });

  it("scales zoom relative to the current focus distance instead of absolute size", () => {
    const closeToLargeBody = calculateAdaptiveZoomSpeed(2_000, 1_000);
    const farFromLargeBody = calculateAdaptiveZoomSpeed(2_000_000, 1_000);

    expect(closeToLargeBody).toBeLessThan(0.6);
    expect(farFromLargeBody).toBeGreaterThan(closeToLargeBody);
  });

  it("maps both right and middle drag to view translation while preserving left rotate", () => {
    expect(ORBIT_MOUSE_BUTTONS.LEFT).toBe(THREE.MOUSE.ROTATE);
    expect(ORBIT_MOUSE_BUTTONS.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(ORBIT_MOUSE_BUTTONS.RIGHT).toBe(THREE.MOUSE.PAN);
  });

  it("preserves user pan offset while keeping the camera following a moving focus", () => {
    const state = createFocusTrackingState();
    const initialFrame = resolveFocusTrackingFrame({
      currentTarget: new THREE.Vector3(10, 0, 0),
      focusWorldPos: new THREE.Vector3(10, 0, 0),
      state,
    });

    expect(initialFrame.nextTarget.toArray()).toEqual([10, 0, 0]);
    expect(initialFrame.cameraDelta.toArray()).toEqual([0, 0, 0]);

    const bodyMovedFrame = resolveFocusTrackingFrame({
      currentTarget: initialFrame.nextTarget,
      focusWorldPos: new THREE.Vector3(12, 0, 0),
      state,
    });

    expect(bodyMovedFrame.nextTarget.toArray()).toEqual([12, 0, 0]);
    expect(bodyMovedFrame.cameraDelta.toArray()).toEqual([2, 0, 0]);

    const userPannedFrame = resolveFocusTrackingFrame({
      currentTarget: new THREE.Vector3(15, 1, 0),
      focusWorldPos: new THREE.Vector3(12, 0, 0),
      state,
    });

    expect(userPannedFrame.nextTarget.toArray()).toEqual([15, 1, 0]);
    expect(userPannedFrame.cameraDelta.toArray()).toEqual([0, 0, 0]);

    const focusMovedAfterPan = resolveFocusTrackingFrame({
      currentTarget: userPannedFrame.nextTarget,
      focusWorldPos: new THREE.Vector3(13, 0, 0),
      state,
    });

    expect(focusMovedAfterPan.nextTarget.toArray()).toEqual([16, 1, 0]);
    expect(focusMovedAfterPan.cameraDelta.toArray()).toEqual([1, 0, 0]);
  });
});
