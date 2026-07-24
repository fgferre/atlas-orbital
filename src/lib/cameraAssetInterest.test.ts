import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  HIDDEN_CAMERA_ASSET_INTEREST,
  isCameraAssetInterestPromotion,
  resolveCameraAssetInterest,
} from "./cameraAssetInterest";

const makeCamera = () => {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1_000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return camera;
};

const resolve = (
  worldPosition: THREE.Vector3,
  worldRadius = 1,
  focused = false
) =>
  resolveCameraAssetInterest({
    camera: makeCamera(),
    viewportWidth: 1_600,
    viewportHeight: 900,
    worldPosition,
    worldRadius,
    focused,
  });

describe("cameraAssetInterest", () => {
  it("classifies a sphere in the camera frustum as visible", () => {
    const interest = resolve(new THREE.Vector3(0, 0, 0));

    expect(interest.visibility).toBe("visible");
    expect(interest.projectedRadiusPx).toBeGreaterThan(70);
  });

  it("uses a prefetch band just outside the viewport", () => {
    const interest = resolve(new THREE.Vector3(11, 0, 0), 0.25);

    expect(interest.visibility).toBe("prefetch");
    expect(interest.salience).toBeLessThanOrEqual(0.2);
  });

  it("rejects bodies far outside or behind the camera", () => {
    expect(resolve(new THREE.Vector3(30, 0, 0))).toBe(
      HIDDEN_CAMERA_ASSET_INTEREST
    );
    expect(resolve(new THREE.Vector3(0, 0, 20))).toBe(
      HIDDEN_CAMERA_ASSET_INTEREST
    );
  });

  it("keeps the explicit focus relevant while the camera is travelling", () => {
    const interest = resolve(new THREE.Vector3(0, 0, 20), 1, true);

    expect(interest.visibility).toBe("visible");
    expect(interest.salience).toBeLessThan(1);
  });

  it("promotes immediately but identifies demotions for hysteresis", () => {
    const hidden = HIDDEN_CAMERA_ASSET_INTEREST;
    const visible = resolve(new THREE.Vector3(0, 0, 0));

    expect(isCameraAssetInterestPromotion(hidden, visible)).toBe(true);
    expect(isCameraAssetInterestPromotion(visible, hidden)).toBe(false);
  });
});
