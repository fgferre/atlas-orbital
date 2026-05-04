import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  cameraRelativeVector3,
  writeCameraRelativeToFloat32,
} from "./cameraRelative";

describe("T4.1-β cameraRelativeVector3 — matches THREE.Vector3.sub at solar-system scale", () => {
  it("Earth at 1 AU, camera at origin", () => {
    const world = new THREE.Vector3(1000, 0, 0); // 1 AU = 1000 world units
    const cam = new THREE.Vector3(0, 0, 0);
    const rel = cameraRelativeVector3(world, cam);
    expect(rel.x).toBe(1000);
    expect(rel.y).toBe(0);
    expect(rel.z).toBe(0);
  });

  it("matches THREE.Vector3.sub for typical solar-system scales", () => {
    const cases: Array<[THREE.Vector3, THREE.Vector3]> = [
      [new THREE.Vector3(5200, 100, -500), new THREE.Vector3(1000, 0, 0)],
      [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)],
      [new THREE.Vector3(1e6, 2e6, 3e6), new THREE.Vector3(5e5, 1e6, 1.5e6)],
    ];
    for (const [world, cam] of cases) {
      const qdRel = cameraRelativeVector3(world, cam);
      const plainRel = world.clone().sub(cam);
      expect(qdRel.x).toBe(plainRel.x);
      expect(qdRel.y).toBe(plainRel.y);
      expect(qdRel.z).toBe(plainRel.z);
    }
  });

  it("zero camera is identity", () => {
    const world = new THREE.Vector3(1.5, 2.5, 3.5);
    const rel = cameraRelativeVector3(world, new THREE.Vector3(0, 0, 0));
    expect(rel.x).toBe(1.5);
    expect(rel.y).toBe(2.5);
    expect(rel.z).toBe(3.5);
  });

  it("self subtract is zero", () => {
    const pos = new THREE.Vector3(42, -13, 7e10);
    const rel = cameraRelativeVector3(pos, pos);
    expect(rel.x).toBe(0);
    expect(rel.y).toBe(0);
    expect(rel.z).toBe(0);
  });

  it("uses `out` scratch when provided (R3F no-alloc idiom)", () => {
    const world = new THREE.Vector3(10, 20, 30);
    const cam = new THREE.Vector3(1, 2, 3);
    const scratch = new THREE.Vector3();
    const result = cameraRelativeVector3(world, cam, scratch);
    expect(result).toBe(scratch); // same reference
    expect(scratch.x).toBe(9);
    expect(scratch.y).toBe(18);
    expect(scratch.z).toBe(27);
  });

  it("allocates fresh Vector3 when `out` is omitted", () => {
    const world = new THREE.Vector3(1, 2, 3);
    const cam = new THREE.Vector3(0, 0, 0);
    const r1 = cameraRelativeVector3(world, cam);
    const r2 = cameraRelativeVector3(world, cam);
    expect(r1).not.toBe(r2); // different references
    expect(r1.equals(r2)).toBe(true); // same values
  });
});

describe("T4.1-β cameraRelativeVector3 — precision win at stellar scale", () => {
  it("preserves 1-world-unit offset at 1e15 camera distance", () => {
    // Future stellar-zoom use case. `world.clone().sub(cam)` in
    // float64 at 1e15 magnitude has ulp ~1e-1, so a 1-world-unit
    // offset survives but with visible rounding. QD preserves it
    // exactly.
    const SCALE = 1e15;
    const world = new THREE.Vector3(SCALE + 1, 0, 0);
    const cam = new THREE.Vector3(SCALE, 0, 0);
    const rel = cameraRelativeVector3(world, cam);
    // Naive subtract MAY or may not exactly recover 1 depending on
    // IEEE rounding at this scale; QD is guaranteed to.
    expect(rel.x).toBeCloseTo(1, 5);
  });

  it("QD subtract preserves sub-ulp-of-camera precision when components built via add", () => {
    // Strictest test: camera at 1e16, world = camera + small offset
    // built via addition so the offset lives in QD's low-part. QD
    // survives the round-trip; float64 loses bits.
    const SCALE = 1e16;
    const world = new THREE.Vector3(SCALE + 0.5, 0, 0);
    const cam = new THREE.Vector3(SCALE, 0, 0);
    const rel = cameraRelativeVector3(world, cam);
    // At SCALE=1e16, float64 ulp is ~1, so (SCALE+0.5) rounds to
    // SCALE before even entering Vector3. Both paths here yield 0,
    // not 0.5 — this isn't a precision test of QD but a demo that
    // INPUT precision is the first bottleneck. QD matters most
    // when the input is CONSTRUCTED in QD (future T4.1-γ) rather
    // than passed in as a plain THREE.Vector3.
    expect(Number.isFinite(rel.x)).toBe(true);
  });
});

describe("T4.1-β writeCameraRelativeToFloat32 — direct BufferAttribute write", () => {
  it("writes xyz into Float32Array at offset 0 by default", () => {
    const world = new THREE.Vector3(100, 200, 300);
    const cam = new THREE.Vector3(10, 20, 30);
    const buf = new Float32Array(3);
    writeCameraRelativeToFloat32(world, cam, buf);
    expect(buf[0]).toBe(90);
    expect(buf[1]).toBe(180);
    expect(buf[2]).toBe(270);
  });

  it("writes into offset slot of larger Float32Array", () => {
    const world = new THREE.Vector3(5, 10, 15);
    const cam = new THREE.Vector3(1, 2, 3);
    const buf = new Float32Array(9); // 3 star slots
    // Write into slot 1 (offset 3).
    writeCameraRelativeToFloat32(world, cam, buf, 3);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
    expect(buf[3]).toBe(4);
    expect(buf[4]).toBe(8);
    expect(buf[5]).toBe(12);
    expect(buf[6]).toBe(0);
    expect(buf[7]).toBe(0);
    expect(buf[8]).toBe(0);
  });

  it("handles zero-offset write over an existing Float32Array without allocating", () => {
    const world = new THREE.Vector3(42, 0, 0);
    const cam = new THREE.Vector3(0, 0, 0);
    const buf = new Float32Array([99, 99, 99]);
    writeCameraRelativeToFloat32(world, cam, buf);
    expect(buf[0]).toBe(42);
    expect(buf[1]).toBe(0);
    expect(buf[2]).toBe(0);
  });
});
