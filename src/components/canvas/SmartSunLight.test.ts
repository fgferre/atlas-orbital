import { describe, expect, it } from "vitest";
import * as THREE from "three";

import { resolveSmartSunLightFrame } from "./smartSunLightFrame";

describe("resolveSmartSunLightFrame", () => {
  it("keeps the directional light aligned with the solar direction", () => {
    const targetPosition = new THREE.Vector3(300, 400, 500);
    const frame = resolveSmartSunLightFrame({
      targetPosition,
      shadowExtent: 40,
    });

    const lightToTargetDirection = targetPosition
      .clone()
      .sub(frame.lightPosition)
      .normalize();

    expect(
      lightToTargetDirection.distanceTo(targetPosition.clone().normalize())
    ).toBeLessThan(1e-9);
  });

  it("expands the shadow frame for larger focused systems", () => {
    const targetPosition = new THREE.Vector3(1000, 0, 0);
    const smallFrame = resolveSmartSunLightFrame({
      targetPosition,
      shadowExtent: 12,
    });
    const largeFrame = resolveSmartSunLightFrame({
      targetPosition,
      shadowExtent: 180,
    });

    expect(largeFrame.shadowBounds.right).toBeGreaterThan(
      smallFrame.shadowBounds.right
    );
    expect(largeFrame.shadowBounds.far).toBeGreaterThan(
      smallFrame.shadowBounds.far
    );
    expect(targetPosition.distanceTo(largeFrame.lightPosition)).toBeGreaterThan(
      targetPosition.distanceTo(smallFrame.lightPosition)
    );
  });

  it("does not inflate tiny realistic bodies to a 1-unit shadow extent floor", () => {
    const targetPosition = new THREE.Vector3(1000, 0, 0);
    const frame = resolveSmartSunLightFrame({
      targetPosition,
      shadowExtent: 0.0426,
    });

    expect(frame.shadowBounds.right).toBeLessThan(0.1);
    expect(targetPosition.distanceTo(frame.lightPosition)).toBeCloseTo(10, 8);
  });
});
