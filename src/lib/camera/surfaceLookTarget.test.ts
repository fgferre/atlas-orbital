import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  computeSurfaceLookTarget,
  SURFACE_LOOK_OFFSET_WORLD_UNITS,
} from "./surfaceLookTarget";

describe("surfaceLookTarget", () => {
  it("pins the offset constant at 1 world unit", () => {
    expect(SURFACE_LOOK_OFFSET_WORLD_UNITS).toBeCloseTo(1.0, 6);
  });

  describe("computeSurfaceLookTarget", () => {
    it("places target 1 unit along forward from camera (+X forward)", () => {
      const pos = new THREE.Vector3(100, 200, 300);
      const fwd = new THREE.Vector3(1, 0, 0);
      const result = computeSurfaceLookTarget(pos, fwd);
      expect(result.x).toBeCloseTo(101, 6);
      expect(result.y).toBeCloseTo(200, 6);
      expect(result.z).toBeCloseTo(300, 6);
    });

    it("places target 1 unit along forward from camera (-Z forward)", () => {
      // -Z is Three.js's canonical camera-forward direction.
      const pos = new THREE.Vector3(0, 0, 0);
      const fwd = new THREE.Vector3(0, 0, -1);
      const result = computeSurfaceLookTarget(pos, fwd);
      expect(result.x).toBeCloseTo(0, 6);
      expect(result.y).toBeCloseTo(0, 6);
      expect(result.z).toBeCloseTo(-1, 6);
    });

    it("preserves absolute camera position in the offset computation", () => {
      const pos = new THREE.Vector3(1_000_000, 0, 0);
      const fwd = new THREE.Vector3(0, 1, 0);
      const result = computeSurfaceLookTarget(pos, fwd);
      expect(result.x).toBeCloseTo(1_000_000, 6);
      expect(result.y).toBeCloseTo(1, 6);
      expect(result.z).toBeCloseTo(0, 6);
    });

    it("writes into the provided `out` vector without allocating", () => {
      const pos = new THREE.Vector3(10, 20, 30);
      const fwd = new THREE.Vector3(0, 0, -1);
      const out = new THREE.Vector3(99, 99, 99);
      const result = computeSurfaceLookTarget(pos, fwd, out);
      expect(result).toBe(out); // same reference
      expect(out.x).toBeCloseTo(10, 6);
      expect(out.y).toBeCloseTo(20, 6);
      expect(out.z).toBeCloseTo(29, 6);
    });

    it("does NOT mutate the input position or forward vectors", () => {
      const pos = new THREE.Vector3(5, 6, 7);
      const fwd = new THREE.Vector3(0, 0, -1);
      const posSnapshot = pos.clone();
      const fwdSnapshot = fwd.clone();
      computeSurfaceLookTarget(pos, fwd);
      expect(pos.equals(posSnapshot)).toBe(true);
      expect(fwd.equals(fwdSnapshot)).toBe(true);
    });

    it("handles a diagonal unit forward vector", () => {
      const pos = new THREE.Vector3(0, 0, 0);
      const fwd = new THREE.Vector3(1, 1, 1).normalize();
      const result = computeSurfaceLookTarget(pos, fwd);
      // Magnitude of result should equal SURFACE_LOOK_OFFSET_WORLD_UNITS
      // since pos is zero.
      expect(result.length()).toBeCloseTo(SURFACE_LOOK_OFFSET_WORLD_UNITS, 6);
    });
  });
});
