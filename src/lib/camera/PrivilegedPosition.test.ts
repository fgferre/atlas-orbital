import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PrivilegedPosition } from "./PrivilegedPosition";

const createCamera = (aspect = 16 / 9) =>
  new THREE.PerspectiveCamera(45, aspect, 0.1, 10_000_000);

describe("PrivilegedPosition.calculateContextAwareDirection", () => {
  it("matches solar-aligned framing when no parent body is provided", () => {
    const target = new THREE.Vector3(12, 0, 0);
    const sun = new THREE.Vector3(0, 0, 0);

    const solarDirection = PrivilegedPosition.calculateSolarAlignedDirection(
      target,
      sun
    );
    const contextDirection = PrivilegedPosition.calculateContextAwareDirection(
      target,
      sun
    );

    expect(contextDirection.distanceTo(solarDirection)).toBeCloseTo(0);
  });

  it("leans the framing away from a nearby parent body", () => {
    const target = new THREE.Vector3(12, 0, 0);
    const sun = new THREE.Vector3(0, 0, 0);
    const parent = new THREE.Vector3(11, 0, 0);
    const awayFromParent = target.clone().sub(parent).normalize();

    const solarDirection = PrivilegedPosition.calculateSolarAlignedDirection(
      target,
      sun
    );
    const contextDirection = PrivilegedPosition.calculateContextAwareDirection(
      target,
      sun,
      parent
    );

    expect(contextDirection.length()).toBeCloseTo(1);
    expect(contextDirection.dot(awayFromParent)).toBeGreaterThan(
      solarDirection.dot(awayFromParent)
    );
  });

  it("never frames a body from its unlit side", () => {
    // Ambient is 0.0 in every visual preset, so a camera past the terminator
    // shows solid black rather than a dim body — focusing a moon used to land
    // on the night side of 11 of them, Iapetus included, which reads as a
    // texture that failed to load. The parent-framing bias may lean the shot
    // away from the parent, but never out of the light.
    const sun = new THREE.Vector3(0, 0, 0);
    const target = new THREE.Vector3(12, 0, 0);
    const litDirection = target.clone().sub(sun).normalize().negate();

    // Sweep the parent all the way around the target, including the
    // pathological case where "away from parent" points straight at the sun.
    for (let step = 0; step < 24; step += 1) {
      const angle = (step / 24) * Math.PI * 2;
      const parent = target
        .clone()
        .add(new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)));

      const direction = PrivilegedPosition.calculateContextAwareDirection(
        target,
        sun,
        parent
      );

      expect(direction.length()).toBeCloseTo(1);
      expect(direction.dot(litDirection)).toBeGreaterThan(0);
    }
  });
});

describe("PrivilegedPosition.calculateViewportAwareDistance", () => {
  it("matches the legacy distance when the full viewport is usable", () => {
    const camera = createCamera();
    const legacyDistance = PrivilegedPosition.calculateIdealDistance(
      100,
      camera,
      1.2
    );
    const viewportAwareDistance =
      PrivilegedPosition.calculateViewportAwareDistance(
        100,
        camera,
        1440,
        900,
        { width: 1440, height: 900 },
        1.2
      );

    expect(viewportAwareDistance).toBeCloseTo(legacyDistance, 6);
  });

  it("backs the camera away when the usable viewport narrows", () => {
    const camera = createCamera();
    const fullViewportDistance =
      PrivilegedPosition.calculateViewportAwareDistance(
        100,
        camera,
        1440,
        900,
        { width: 1440, height: 900 },
        1.2
      );
    const constrainedViewportDistance =
      PrivilegedPosition.calculateViewportAwareDistance(
        100,
        camera,
        1440,
        900,
        { width: 760, height: 680 },
        1.2
      );

    expect(constrainedViewportDistance).toBeGreaterThan(fullViewportDistance);
  });
});

describe("PrivilegedPosition.applyViewportComposition", () => {
  it("moves the camera left when the usable viewport center shifts right", () => {
    const camera = createCamera();
    const originalCameraPos = new THREE.Vector3(0, 0, 1000);
    const composedCameraPos = PrivilegedPosition.applyViewportComposition({
      targetPos: new THREE.Vector3(0, 0, 0),
      cameraPos: originalCameraPos,
      camera,
      viewportWidth: 1200,
      viewportHeight: 800,
      compositionOffsetXPx: 120,
      compositionOffsetYPx: 0,
    });

    expect(composedCameraPos.x).toBeLessThan(originalCameraPos.x);
    expect(composedCameraPos.y).toBeCloseTo(originalCameraPos.y, 6);
    expect(composedCameraPos.z).toBeCloseTo(originalCameraPos.z, 6);
  });

  it("returns the same position when no composition offset is needed", () => {
    const camera = createCamera();
    const originalCameraPos = new THREE.Vector3(0, 0, 1000);
    const composedCameraPos = PrivilegedPosition.applyViewportComposition({
      targetPos: new THREE.Vector3(0, 0, 0),
      cameraPos: originalCameraPos,
      camera,
      viewportWidth: 1200,
      viewportHeight: 800,
      compositionOffsetXPx: 0,
      compositionOffsetYPx: 0,
    });

    expect(composedCameraPos).toBe(originalCameraPos);
  });
});
