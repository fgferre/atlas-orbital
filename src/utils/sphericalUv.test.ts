import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { ensureSphericalUvProjection } from "./sphericalUv";

describe("ensureSphericalUvProjection", () => {
  it("adds UVs and normals to geometry without them", () => {
    const geometry = new THREE.IcosahedronGeometry(1, 0);

    geometry.deleteAttribute("uv");
    geometry.deleteAttribute("normal");

    const projected = ensureSphericalUvProjection(geometry);
    const uv = projected.getAttribute("uv");
    const normal = projected.getAttribute("normal");

    expect(uv).toBeInstanceOf(THREE.BufferAttribute);
    expect(normal).toBeInstanceOf(THREE.BufferAttribute);
    expect(uv.count).toBe(projected.getAttribute("position").count);
    expect(normal.count).toBe(projected.getAttribute("position").count);

    for (let index = 0; index < uv.count; index++) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
    }
  });

  it("preserves an existing valid UV attribute", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 1, 1, 0, 0, 0, 1, 0], 3)
    );
    geometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2)
    );

    const originalUv = geometry.getAttribute("uv");
    const projected = ensureSphericalUvProjection(geometry);

    expect(projected.getAttribute("uv")).toBe(originalUv);
  });
});
