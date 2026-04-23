import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  computeCFPos,
  computeProjectionSegments,
  computeYLineEndpoints,
  computeZXLineEndpoints,
  createGridProjectionSegments,
} from "./gridProjection";

// Source citations under /tmp/gaiasky/core/src/gaiasky/scene/system/update/
// GridRecUpdater.java unless otherwise noted.

const IDENTITY = new THREE.Matrix4().identity();
const close = (actual: number, expected: number, tol = 1e-10): boolean =>
  Math.abs(actual - expected) < tol;
const expectVec = (
  v: THREE.Vector3,
  x: number,
  y: number,
  z: number,
  tol = 1e-10
) => {
  expect(close(v.x, x, tol)).toBe(true);
  expect(close(v.y, y, tol)).toBe(true);
  expect(close(v.z, z, tol)).toBe(true);
};

describe("computeCFPos — GridRecUpdater.java:171-178", () => {
  it("identity transform: cPos equals camera world pos, fPos equals focus - camera", () => {
    const cam = new THREE.Vector3(100, 50, 200);
    const focus = new THREE.Vector3(300, 80, 400);
    const cLocal = new THREE.Vector3();
    const fLocal = new THREE.Vector3();

    computeCFPos(cam, focus, IDENTITY, cLocal, fLocal);

    expectVec(cLocal, 100, 50, 200);
    // fPos = focus_local - cPos = focus - cam under identity
    expectVec(fLocal, 200, 30, 200);
  });

  it("rotated grid matrix: cPos is camera in grid-local frame", () => {
    // Grid rotated 90° around Y (so local-X maps to world-Z and
    // local-Z maps to world-(-X)). Inverse rotates world → local.
    const gridMat = new THREE.Matrix4().makeRotationY(Math.PI / 2);
    const cam = new THREE.Vector3(1, 0, 0); // world +X
    const focus = new THREE.Vector3(0, 0, 1); // world +Z
    const cLocal = new THREE.Vector3();
    const fLocal = new THREE.Vector3();

    computeCFPos(cam, focus, gridMat, cLocal, fLocal);

    // Inverse of Ry(+π/2) applied to world (1,0,0) → local (0, 0, 1).
    expectVec(cLocal, 0, 0, 1, 1e-9);
    // Inverse of Ry(+π/2) applied to world (0,0,1) → local (-1, 0, 0).
    // Then fPos = focus_local - cPos = (-1, 0, 0) - (0, 0, 1) = (-1, 0, -1).
    expectVec(fLocal, -1, 0, -1, 1e-9);
  });

  it("fPos = focus_local - cPos — subtraction order matches Gaia line 177 `v3b.put(fPos).sub(cPos)`", () => {
    // Gaia's pattern: fPos gets the raw transformed focus position
    // FIRST, then cPos gets subtracted. If we accidentally did
    // `(cPos - focus)` we'd get the opposite sign.
    const cam = new THREE.Vector3(10, 20, 30);
    const focus = new THREE.Vector3(40, 60, 80);
    const cLocal = new THREE.Vector3();
    const fLocal = new THREE.Vector3();

    computeCFPos(cam, focus, IDENTITY, cLocal, fLocal);

    // fPos should point FROM camera TO focus: (30, 40, 50).
    expectVec(fLocal, 30, 40, 50);
  });
});

describe("computeZXLineEndpoints — GridRecUpdater.java:180-189", () => {
  it("identity matrix: a = -cPos, b = (fPos.x, -cPos.y, fPos.z)", () => {
    // Pure grid-local coord test with inv = identity (no back-to-
    // world step). Pins the raw endpoint formulas at lines 182-183.
    const cPos = new THREE.Vector3(5, 7, 9);
    const fPos = new THREE.Vector3(100, 50, 200);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    computeZXLineEndpoints(cPos, fPos, IDENTITY, a, b);

    // a.set(-cPos.x, -cPos.y, -cPos.z) at line 182.
    expectVec(a, -5, -7, -9);
    // b.set(fPos.x, -cPos.y, fPos.z) at line 183.
    expectVec(b, 100, -7, 200);
  });

  it("both endpoints share y = -cPos.y (line is horizontal in grid-local)", () => {
    const cPos = new THREE.Vector3(3, 4, 5);
    const fPos = new THREE.Vector3(10, 20, 30);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    computeZXLineEndpoints(cPos, fPos, IDENTITY, a, b);

    expect(a.y).toBe(-cPos.y);
    expect(b.y).toBe(-cPos.y);
  });

  it("applies the world matrix back to world-space at the end (line 186 `a.mul(inv)`)", () => {
    // Grid rotated 90° around X (atlas ecliptic-mode mount).
    const gridMat = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    const cPos = new THREE.Vector3(0, 1, 0);
    const fPos = new THREE.Vector3(0, 0, 0);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    computeZXLineEndpoints(cPos, fPos, gridMat, a, b);

    // Pre-matrix: a = (0, -1, 0). After Rx(90°): y → z, z → -y,
    // so (0, -1, 0) → (0, 0, -1).
    expectVec(a, 0, 0, -1, 1e-9);
    // Pre-matrix: b = (0, -1, 0). Same transform → (0, 0, -1).
    expectVec(b, 0, 0, -1, 1e-9);
  });
});

describe("computeYLineEndpoints — GridRecUpdater.java:191-200", () => {
  it("identity matrix: a = (fPos.x, -cPos.y, fPos.z), b = fPos", () => {
    const cPos = new THREE.Vector3(2, 3, 4);
    const fPos = new THREE.Vector3(10, 20, 30);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    computeYLineEndpoints(cPos, fPos, IDENTITY, a, b);

    // a = (fPos.x, -cPos.y, fPos.z) — line 193.
    expectVec(a, 10, -3, 30);
    // b = (fPos.x, fPos.y, fPos.z) — line 194.
    expectVec(b, 10, 20, 30);
  });

  it("Y-line's A endpoint equals ZX-line's B endpoint (continuous L-polyline at the corner)", () => {
    const cPos = new THREE.Vector3(2, 3, 4);
    const fPos = new THREE.Vector3(10, 20, 30);
    const zxA = new THREE.Vector3();
    const zxB = new THREE.Vector3();
    const yA = new THREE.Vector3();
    const yB = new THREE.Vector3();

    computeZXLineEndpoints(cPos, fPos, IDENTITY, zxA, zxB);
    computeYLineEndpoints(cPos, fPos, IDENTITY, yA, yB);

    // The two segments share the corner (fPos.x, -cPos.y, fPos.z)
    // — `zxB` and `yA` should be literally equal.
    expect(yA.x).toBe(zxB.x);
    expect(yA.y).toBe(zxB.y);
    expect(yA.z).toBe(zxB.z);
  });

  it("Y-line is purely vertical in grid-local (only y-component changes between A and B)", () => {
    const cPos = new THREE.Vector3(2, 3, 4);
    const fPos = new THREE.Vector3(10, 20, 30);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();

    computeYLineEndpoints(cPos, fPos, IDENTITY, a, b);

    expect(b.x).toBe(a.x);
    expect(b.z).toBe(a.z);
    expect(b.y).not.toBe(a.y);
  });
});

describe("computeProjectionSegments — end-to-end driver", () => {
  it("populates all four output vectors from a single call", () => {
    const cam = new THREE.Vector3(0, 10, 0);
    const focus = new THREE.Vector3(100, 5, 200);
    const out = createGridProjectionSegments();

    computeProjectionSegments(cam, focus, IDENTITY, out);

    // Under identity: cPos=(0,10,0), fPos=(100,-5,200)
    // zxA = -cPos = (0,-10,0)
    // zxB = (fPos.x, -cPos.y, fPos.z) = (100,-10,200)
    // yA = zxB = (100,-10,200)
    // yB = fPos = (100,-5,200)
    expectVec(out.zxA, 0, -10, 0);
    expectVec(out.zxB, 100, -10, 200);
    expectVec(out.yA, 100, -10, 200);
    expectVec(out.yB, 100, -5, 200);
  });

  it("reuses the same output vectors across repeat calls (no fresh Vector3 allocated)", () => {
    const cam = new THREE.Vector3(0, 0, 0);
    const focus = new THREE.Vector3(1, 1, 1);
    const out = createGridProjectionSegments();
    const zxARef = out.zxA;
    const zxBRef = out.zxB;
    const yARef = out.yA;
    const yBRef = out.yB;

    computeProjectionSegments(cam, focus, IDENTITY, out);
    computeProjectionSegments(cam, focus, IDENTITY, out);

    // Same instances — hot-path allocator hygiene (M4).
    expect(out.zxA).toBe(zxARef);
    expect(out.zxB).toBe(zxBRef);
    expect(out.yA).toBe(yARef);
    expect(out.yB).toBe(yBRef);
  });

  it("yB always lands at the focus's world position under any grid matrix", () => {
    // Geometric invariant: after the full pipeline, the yB endpoint
    // is where the L-polyline terminates, which must equal the
    // focus's world position regardless of how the grid is rotated.
    // Verified by: yB (pre-world) = fPos (which is focus_local -
    // cPos). After applyMatrix4(gridMat) it becomes
    // gridMat * (focus_local - cPos) = focus_world - cam_world when
    // the grid matrix's linear part is orthogonal... no, that's
    // wrong. Let me restate: we apply the FORWARD matrix to a
    // vector IN LOCAL SPACE to get world. fPos_local =
    // gridMatInv * focus - gridMatInv * cam. Then
    // gridMat * fPos_local = gridMat * gridMatInv * focus -
    // gridMat * gridMatInv * cam = focus - cam.
    // So yB = focus - cam in world space. (Line starts at camera's
    // world origin and ends at focus's world position minus camera.)
    const cam = new THREE.Vector3(50, 20, 30);
    const focus = new THREE.Vector3(200, 80, 150);
    const gridMat = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    const out = createGridProjectionSegments();

    computeProjectionSegments(cam, focus, gridMat, out);

    // yB = focus - cam
    expectVec(out.yB, focus.x - cam.x, focus.y - cam.y, focus.z - cam.z, 1e-9);
  });

  it("zxA always lands at the world origin minus camera pos (the grid-center vector)", () => {
    // By the same algebra: zxA_local = -cPos, so
    // gridMat * zxA_local = gridMat * (-gridMatInv * cam)
    //                    = -cam. So zxA_world = -cam.
    const cam = new THREE.Vector3(50, 20, 30);
    const focus = new THREE.Vector3(200, 80, 150);
    const gridMat = new THREE.Matrix4().makeRotationZ(Math.PI / 3);
    const out = createGridProjectionSegments();

    computeProjectionSegments(cam, focus, gridMat, out);

    expectVec(out.zxA, -cam.x, -cam.y, -cam.z, 1e-9);
  });
});

describe("createGridProjectionSegments — fresh scratch-cache factory", () => {
  it("returns four distinct Vector3 instances", () => {
    const out = createGridProjectionSegments();
    expect(out.zxA).toBeInstanceOf(THREE.Vector3);
    expect(out.zxB).toBeInstanceOf(THREE.Vector3);
    expect(out.yA).toBeInstanceOf(THREE.Vector3);
    expect(out.yB).toBeInstanceOf(THREE.Vector3);
    expect(out.zxA).not.toBe(out.zxB);
    expect(out.yA).not.toBe(out.yB);
    expect(out.zxA).not.toBe(out.yA);
  });

  it("returns independent instances across calls (no singleton aliasing)", () => {
    const a = createGridProjectionSegments();
    const b = createGridProjectionSegments();
    expect(a.zxA).not.toBe(b.zxA);
    expect(a.yB).not.toBe(b.yB);
  });
});
