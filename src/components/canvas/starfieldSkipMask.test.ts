/**
 * T6.0 — pinned tests for the per-instance `skipMask` attribute on
 * the Starfield instanced geometry. Pure helper-level coverage; the
 * GLSL-side suppression behaviour is verified via runtime smoke
 * (the L26 multi-frame readPixels invariant in the kickoff prompt
 * step 10).
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildSkipMaskAttribute } from "./starfieldSkipMask";

describe("buildSkipMaskAttribute", () => {
  it("returns a Float32Array of the requested length", () => {
    const arr = buildSkipMaskAttribute(10);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(10);
  });

  it("default-zero invariant — every entry starts at 0 (renders as today)", () => {
    const arr = buildSkipMaskAttribute(100);
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBe(0);
    }
  });

  it("supports per-index mutation (T6.3 will toggle slots)", () => {
    const arr = buildSkipMaskAttribute(5);
    arr[2] = 1;
    expect(arr[0]).toBe(0);
    expect(arr[1]).toBe(0);
    expect(arr[2]).toBe(1);
    expect(arr[3]).toBe(0);
    expect(arr[4]).toBe(0);
  });

  it("returns distinct buffers per call (no shared state)", () => {
    const a = buildSkipMaskAttribute(4);
    const b = buildSkipMaskAttribute(4);
    a[0] = 1;
    expect(b[0]).toBe(0);
  });

  it("handles empty / zero-count input cleanly", () => {
    const arr = buildSkipMaskAttribute(0);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(0);
  });
});

describe("InstancedBufferAttribute integration", () => {
  it("wraps the skipMask buffer as a 1-component instanced attribute", () => {
    const count = 8;
    const buf = buildSkipMaskAttribute(count);
    const attr = new THREE.InstancedBufferAttribute(buf, 1);

    expect(attr.array).toBe(buf);
    expect(attr.itemSize).toBe(1);
    expect(attr.count).toBe(count);
    // `needsUpdate` is a write-only setter on BufferAttribute (it
    // increments `version`). Pin the version-bump contract instead:
    // T6.3 will write `attr.needsUpdate = true` after mutating a
    // slot, which bumps `version` and forces re-upload.
    const versionBefore = attr.version;
    attr.needsUpdate = true;
    expect(attr.version).toBe(versionBefore + 1);
  });

  it("mutating the underlying buffer is observable through the attribute view", () => {
    const buf = buildSkipMaskAttribute(4);
    const attr = new THREE.InstancedBufferAttribute(buf, 1);
    buf[2] = 1;
    expect(attr.array[2]).toBe(1);
  });
});
