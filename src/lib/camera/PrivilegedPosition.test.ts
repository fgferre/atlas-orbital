import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { PrivilegedPosition } from "./PrivilegedPosition";

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
});
