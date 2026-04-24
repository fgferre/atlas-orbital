import { describe, expect, it } from "vitest";

import {
  VECTOR3Q_ZERO,
  vector3QAdd,
  vector3QCpy,
  vector3QFromDoubles,
  vector3QLenDouble,
  vector3QScl,
  vector3QSub,
  vector3QToDoubles,
} from "./vector3Q";

describe("T4.1-α Vector3Q — constructor + double round-trip", () => {
  it("vector3QFromDoubles preserves input components", () => {
    const v = vector3QFromDoubles(1, 2, 3);
    expect(vector3QToDoubles(v)).toEqual([1, 2, 3]);
  });

  it("VECTOR3Q_ZERO equals origin", () => {
    expect(vector3QToDoubles(VECTOR3Q_ZERO)).toEqual([0, 0, 0]);
  });

  it("astronomical-scale round-trip preserves doubles", () => {
    const v = vector3QFromDoubles(1.5e27, -1e20, 1e9);
    expect(vector3QToDoubles(v)).toEqual([1.5e27, -1e20, 1e9]);
  });
});

describe("vector3QAdd — componentwise add", () => {
  it("adds simple vectors", () => {
    const a = vector3QFromDoubles(1, 2, 3);
    const b = vector3QFromDoubles(10, 20, 30);
    expect(vector3QToDoubles(vector3QAdd(a, b))).toEqual([11, 22, 33]);
  });

  it("zero is identity", () => {
    const a = vector3QFromDoubles(1.5, -2.5, 3.5);
    expect(vector3QToDoubles(vector3QAdd(a, VECTOR3Q_ZERO))).toEqual([
      1.5, -2.5, 3.5,
    ]);
  });
});

describe("vector3QSub — critical-path camera-relative subtract", () => {
  it("simple subtract", () => {
    const a = vector3QFromDoubles(10, 20, 30);
    const b = vector3QFromDoubles(1, 2, 3);
    expect(vector3QToDoubles(vector3QSub(a, b))).toEqual([9, 18, 27]);
  });

  it("self-sub is zero", () => {
    const a = vector3QFromDoubles(1e20, 1.5e27, -5);
    expect(vector3QToDoubles(vector3QSub(a, a))).toEqual([0, 0, 0]);
  });

  it("50 Gpc camera scale: worldPos - cameraPos preserves sub-meter precision", () => {
    // Atlas concrete camera-relative use case. Camera at
    // (1.5e27, 0, 0) — edge of MAX_ALLOWED_DISTANCE. Focus body 1.5
    // meters "to the right" of the camera. Single-double would lose
    // the 1.5 entirely (ulp ~1e11 at 1.5e27); QD preserves it.
    const CAM_SCALE = 1.5e27;
    const camera = vector3QFromDoubles(CAM_SCALE, 0, 0);
    // Construct the focus via vector3QAdd so the 1.5 survives in
    // the QD low-part of the x component.
    const offset = vector3QFromDoubles(1.5, 0, 0);
    const focus = vector3QAdd(camera, offset);
    const delta = vector3QSub(focus, camera);
    expect(vector3QToDoubles(delta)[0]).toBeCloseTo(1.5, 10);
    expect(vector3QToDoubles(delta)[1]).toBe(0);
    expect(vector3QToDoubles(delta)[2]).toBe(0);
  });

  it("directional symmetry: a - b = -(b - a) componentwise", () => {
    const a = vector3QFromDoubles(5, 10, 15);
    const b = vector3QFromDoubles(2, 4, 6);
    const ab = vector3QToDoubles(vector3QSub(a, b));
    const ba = vector3QToDoubles(vector3QSub(b, a));
    expect(ab[0]).toBe(-ba[0]);
    expect(ab[1]).toBe(-ba[1]);
    expect(ab[2]).toBe(-ba[2]);
  });
});

describe("vector3QScl — scale by double", () => {
  it("scale by 1 is identity", () => {
    const v = vector3QFromDoubles(1.5, 2.5, 3.5);
    expect(vector3QToDoubles(vector3QScl(v, 1))).toEqual([1.5, 2.5, 3.5]);
  });

  it("scale by 0 is zero", () => {
    const v = vector3QFromDoubles(1e20, 1e10, 5);
    expect(vector3QToDoubles(vector3QScl(v, 0))).toEqual([0, 0, 0]);
  });

  it("scale by 2 doubles each component", () => {
    const v = vector3QFromDoubles(3, 4, 5);
    expect(vector3QToDoubles(vector3QScl(v, 2))).toEqual([6, 8, 10]);
  });

  it("scale by -1 negates each component", () => {
    const v = vector3QFromDoubles(1, -2, 3);
    const [x, y, z] = vector3QToDoubles(vector3QScl(v, -1));
    expect(x).toBe(-1);
    expect(y).toBe(2);
    expect(z).toBe(-3);
  });
});

describe("vector3QLenDouble — length in double precision", () => {
  it("unit x-axis vector has length 1", () => {
    expect(vector3QLenDouble(vector3QFromDoubles(1, 0, 0))).toBe(1);
  });

  it("3-4-5 right triangle: len(3, 4, 0) = 5", () => {
    expect(vector3QLenDouble(vector3QFromDoubles(3, 4, 0))).toBe(5);
  });

  it("3D Pythagoras: len(2, 3, 6) = 7", () => {
    expect(vector3QLenDouble(vector3QFromDoubles(2, 3, 6))).toBe(7);
  });

  it("50 Gpc scale length", () => {
    const GPC50 = 1.5e27;
    const len = vector3QLenDouble(vector3QFromDoubles(GPC50, 0, 0));
    expect(len).toBeCloseTo(GPC50, -10); // sub-1e17-m precision at GPC scale
  });
});

describe("vector3QCpy — copy constructor", () => {
  it("copies values", () => {
    const v = vector3QFromDoubles(1.1, 2.2, 3.3);
    const c = vector3QCpy(v);
    expect(vector3QToDoubles(c)).toEqual([1.1, 2.2, 3.3]);
  });

  it("produces an independent vector (not the same reference)", () => {
    const v = vector3QFromDoubles(1, 2, 3);
    const c = vector3QCpy(v);
    expect(c).not.toBe(v);
  });
});
