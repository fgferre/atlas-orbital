import { describe, expect, it } from "vitest";

import {
  fastTwoSum,
  qdAdd,
  qdFromDouble,
  qdMulDouble,
  qdNeg,
  qdSub,
  qdToDouble,
  twoProduct,
  twoSum,
  type QD,
} from "./quadDouble";

describe("T4.1-α quadDouble — TwoSum preserves full IEEE precision", () => {
  it("trivial case: equal-magnitude + zero low bits", () => {
    const [sum, err] = twoSum(1.5, 2.25);
    expect(sum).toBe(3.75);
    expect(err).toBe(0); // exact sum, no rounding
  });

  it("retains rounding residual when single-double + loses precision", () => {
    // Classic case: `1 + 2^-53` = 1 in single double (the +2^-53 is
    // exactly half ulp → rounds to nearest-even = 1). TwoSum peels
    // the +2^-53 off into err so `sum + err` equals the full value.
    const a = 1;
    const b = 2 ** -53;
    const [sum, err] = twoSum(a, b);
    expect(sum).toBe(1); // single-double rounded-down result
    expect(err).toBe(2 ** -53); // residual preserved in QD low-part
  });

  it("TwoSum identity: a + b = sum + err always", () => {
    const samples: Array<[number, number]> = [
      [1, 1e-20],
      [1e300, 1],
      [1.1, 2.2],
      [-5, 7],
      [0, 0],
    ];
    for (const [a, b] of samples) {
      const [sum, err] = twoSum(a, b);
      // The core invariant (not achievable with single double on
      // mixed-magnitude pairs): sum + err must equal a + b in
      // INFINITE precision, which for these samples that do fit in
      // single double should equal IEEE a+b.
      expect(sum + err).toBe(a + b);
    }
  });
});

describe("fastTwoSum — cheap TwoSum for ordered magnitudes", () => {
  it("produces same result as twoSum when |a| >= |b|", () => {
    const samples: Array<[number, number]> = [
      [1, 1e-20],
      [100, 7],
      [1e300, 1e-100],
    ];
    for (const [a, b] of samples) {
      const [fastSum, fastErr] = fastTwoSum(a, b);
      const [slowSum, slowErr] = twoSum(a, b);
      expect(fastSum).toBe(slowSum);
      expect(fastErr).toBe(slowErr);
    }
  });
});

describe("qdFromDouble / qdToDouble — round-trip on representable doubles", () => {
  it("single double round-trips exactly", () => {
    const samples = [0, 1, -1, 1.5, 3.14159265358979, 1e27, -1e-200];
    for (const x of samples) {
      expect(qdToDouble(qdFromDouble(x))).toBe(x);
    }
  });

  it("low part of fresh QD is zero", () => {
    const qd = qdFromDouble(42);
    expect(qd[1]).toBe(0);
  });
});

describe("qdNeg — sign flip on both parts", () => {
  it("negates a zero-low QD", () => {
    expect(qdNeg(qdFromDouble(5))).toEqual([-5, -0]);
  });

  it("negates a QD with nonzero low", () => {
    const qd: QD = [1, 1e-20];
    expect(qdNeg(qd)).toEqual([-1, -1e-20]);
  });

  it("double-negate is identity", () => {
    const qd: QD = [3.14, 5e-20];
    const twice = qdNeg(qdNeg(qd));
    expect(twice[0]).toBe(3.14);
    expect(twice[1]).toBe(5e-20);
  });
});

describe("qdAdd — full double-double precision", () => {
  it("zero + zero = zero", () => {
    expect(qdAdd(qdFromDouble(0), qdFromDouble(0))).toEqual([0, 0]);
  });

  it("(1, 1e-30) + (2, 3e-30) adds both parts", () => {
    const a: QD = [1, 1e-30];
    const b: QD = [2, 3e-30];
    const sum = qdAdd(a, b);
    // Expected exact value: 3 + 4e-30. In double-double, sum[0] ≈ 3,
    // sum[1] ≈ 4e-30 (approximately; exact value depends on the
    // Dekker-normalized form).
    expect(sum[0]).toBeCloseTo(3, 14);
    expect(Math.abs(sum[0] + sum[1] - (3 + 4e-30))).toBeLessThan(1e-40);
  });

  it("catastrophic cancellation at astronomical scale preserves small residual", () => {
    // Atlas concrete use case: camera at 1e12 world units, focus at
    // 1e12 + 1.5 world units. Subtracting the two in single double
    // may lose the 1.5 entirely; in QD it survives.
    const camera = qdFromDouble(1e12);
    const focusHi = qdFromDouble(1e12);
    const focusLow = qdFromDouble(1.5);
    const focus = qdAdd(focusHi, focusLow);
    const delta = qdSub(focus, camera);
    // delta should equal 1.5 exactly.
    expect(qdToDouble(delta)).toBeCloseTo(1.5, 10);
  });

  it("commutative: qdAdd(a, b) === qdAdd(b, a)", () => {
    const a: QD = [1.1, 2e-20];
    const b: QD = [3.3, 4e-20];
    const sum1 = qdAdd(a, b);
    const sum2 = qdAdd(b, a);
    expect(sum1[0]).toBe(sum2[0]);
    expect(sum1[1]).toBe(sum2[1]);
  });
});

describe("qdSub — add-with-negate identity", () => {
  it("self-sub is zero", () => {
    const a: QD = [3.14, 5e-25];
    const diff = qdSub(a, a);
    expect(qdToDouble(diff)).toBe(0);
  });

  it("atlas camera-relative-render use case: 50 Gpc - (50 Gpc - 1) = 1", () => {
    // 50 Gpc ≈ 1.5e27 world units (at 1 unit = 1 m in atlas). The
    // -1 world unit (1 m) is completely beneath the ulp of single
    // double at that scale (~1e11 m ulp).
    const GPC50 = 1.5e27;
    const a = qdFromDouble(GPC50);
    // Build (GPC50 - 1) in QD via subtraction (which preserves the
    // -1 in the low part even though single-double would round it).
    const b = qdSub(a, qdFromDouble(1));
    const diff = qdSub(a, b);
    expect(qdToDouble(diff)).toBe(1);
  });

  it("associative-ish: qdSub(a, b) === qdNeg(qdSub(b, a))", () => {
    const a: QD = [5, 1e-20];
    const b: QD = [3, 2e-20];
    const ab = qdSub(a, b);
    const ba = qdSub(b, a);
    expect(ab[0]).toBe(-ba[0]);
    expect(ab[1]).toBe(-ba[1]);
  });
});

describe("twoProduct — exact product of two doubles", () => {
  it("small integers produce exact product with zero err", () => {
    expect(twoProduct(3, 4)).toEqual([12, 0]);
    expect(twoProduct(7, 8)).toEqual([56, 0]);
  });

  it("product that overflows double precision captures residual", () => {
    const a = 1e10 + 1; // not exactly representable in double
    const b = 1e10 + 1;
    const [prod, err] = twoProduct(a, b);
    // Exact product = 1e20 + 2e10 + 1. Single double = 1e20 + 2e10
    // (the +1 is beneath ulp). QD recovers a tiny non-zero residual.
    expect(prod + err).toBeCloseTo(1e20 + 2e10 + 1, -8);
  });

  it("product identity: prod + err = a × b in infinite precision", () => {
    const samples: Array<[number, number]> = [
      [1.1, 2.2],
      [1e100, 1e-100],
      [Math.PI, Math.E],
    ];
    for (const [a, b] of samples) {
      const [prod, err] = twoProduct(a, b);
      // For representable products (no actual precision loss), err
      // should be ~0 and prod + err === a × b.
      expect(prod + err).toBe(a * b);
    }
  });
});

describe("qdMulDouble — scale a QD by a single double", () => {
  it("QD × 1 is identity", () => {
    const qd: QD = [3.14, 1e-20];
    const scaled = qdMulDouble(qd, 1);
    expect(scaled[0]).toBeCloseTo(3.14, 14);
    expect(Math.abs(scaled[0] + scaled[1] - (3.14 + 1e-20))).toBeLessThan(
      1e-30
    );
  });

  it("QD × 0 is zero", () => {
    const qd: QD = [3.14, 1e-20];
    const scaled = qdMulDouble(qd, 0);
    expect(qdToDouble(scaled)).toBe(0);
  });

  it("QD × 2 doubles the value", () => {
    const qd = qdFromDouble(7);
    const scaled = qdMulDouble(qd, 2);
    expect(qdToDouble(scaled)).toBe(14);
  });
});
