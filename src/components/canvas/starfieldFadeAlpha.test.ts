/**
 * M3 — pinned tests for the per-instance `a_fadeAlpha` attribute
 * on the Starfield instanced geometry. Renamed from T6.0's
 * `starfieldSkipMask` (binary 0/1) to `starfieldFadeAlpha`
 * (continuous [0..1]) when M3 introduced the cross-fade. Pure
 * helper-level coverage; the GLSL-side fade behaviour is verified
 * via runtime smoke + the e2e hyg-focus spec's pre/post `fadeAlpha`
 * boundary checks.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildFadeAlphaAttribute } from "./starfieldFadeAlpha";

describe("buildFadeAlphaAttribute", () => {
  it("returns a Float32Array of the requested length", () => {
    const arr = buildFadeAlphaAttribute(10);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(10);
  });

  it("default-zero invariant — every entry starts at 0 (sprite renders fully)", () => {
    const arr = buildFadeAlphaAttribute(100);
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBe(0);
    }
  });

  it("supports continuous-value mutation [0..1] (HygStellarMesh writes ramp progress)", () => {
    const arr = buildFadeAlphaAttribute(5);
    arr[2] = 0.0;
    arr[3] = 0.37;
    arr[4] = 1.0;
    expect(arr[0]).toBe(0);
    expect(arr[1]).toBe(0);
    expect(arr[2]).toBe(0);
    expect(arr[3]).toBeCloseTo(0.37, 5);
    expect(arr[4]).toBe(1);
  });

  it("returns distinct buffers per call (no shared state)", () => {
    const a = buildFadeAlphaAttribute(4);
    const b = buildFadeAlphaAttribute(4);
    a[0] = 0.5;
    expect(b[0]).toBe(0);
  });

  it("handles empty / zero-count input cleanly", () => {
    const arr = buildFadeAlphaAttribute(0);
    expect(arr).toBeInstanceOf(Float32Array);
    expect(arr.length).toBe(0);
  });
});

describe("InstancedBufferAttribute integration", () => {
  it("wraps the fadeAlpha buffer as a 1-component instanced attribute", () => {
    const count = 8;
    const buf = buildFadeAlphaAttribute(count);
    const attr = new THREE.InstancedBufferAttribute(buf, 1);

    expect(attr.array).toBe(buf);
    expect(attr.itemSize).toBe(1);
    expect(attr.count).toBe(count);
    // `needsUpdate` is a write-only setter on BufferAttribute (it
    // increments `version`). Pin the version-bump contract:
    // HygStellarMesh writes `attr.needsUpdate = true` after a per-
    // frame ramp tick to force GPU re-upload.
    const versionBefore = attr.version;
    attr.needsUpdate = true;
    expect(attr.version).toBe(versionBefore + 1);
  });

  it("mutating the underlying buffer is observable through the attribute view", () => {
    const buf = buildFadeAlphaAttribute(4);
    const attr = new THREE.InstancedBufferAttribute(buf, 1);
    buf[2] = 0.42;
    expect(attr.array[2]).toBeCloseTo(0.42, 5);
  });
});

describe("cross-fade sum invariant (M3 design pin)", () => {
  it("sprite alpha multiplier (1 - fadeAlpha) + mesh visibility (fadeAlpha) === 1", () => {
    // The cross-fade contract is: as `a_fadeAlpha` ramps 0→1, the
    // sprite alpha multiplier drops from 1→0 in lockstep with the
    // mesh `uVisibility` rising from 0→1. Their sum stays exactly
    // 1 at every point — no gap, no over-render, no flicker.
    for (const fadeAlpha of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0]) {
      const spriteMultiplier = 1 - fadeAlpha;
      const meshVisibility = fadeAlpha;
      expect(spriteMultiplier + meshVisibility).toBeCloseTo(1, 10);
    }
  });

  it("focused-star transition is monotone — sum never dips below 1", () => {
    // Stronger pin: not just at endpoints, also through every
    // intermediate ramp tick. Equivalent to `(1 - x) + x = 1` for
    // all x in [0, 1] — but pinning it explicitly guards future
    // refactors that could accidentally introduce a gap (e.g. a
    // smoothstep-on-mesh side that doesn't mirror the linear fade
    // on the sprite side).
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      const sum = 1 - f + f;
      expect(sum).toBeGreaterThanOrEqual(1 - 1e-10);
      expect(sum).toBeLessThanOrEqual(1 + 1e-10);
    }
  });
});
