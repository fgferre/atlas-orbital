import { describe, it, expect } from "vitest";

import { CameraTransition } from "./CameraTransition";

/**
 * T6.4-M2.5 S2 — tests for `CameraTransition.logisticSigmoid`.
 *
 * The other static easings (`easeOutQuint`, `easeOutQuart`,
 * `linear`, etc.) are pre-T6.4 production code; this file pins
 * only what M2.5 adds. If a future onda extends test coverage to
 * the older easings, append cases here.
 */

describe("CameraTransition.logisticSigmoid — endpoint behavior", () => {
  it("returns exactly 0 at t=0 (no start-stall)", () => {
    expect(CameraTransition.logisticSigmoid(0)).toBe(0);
  });

  it("returns exactly 1 at t=1 (no end-stall)", () => {
    expect(CameraTransition.logisticSigmoid(1)).toBe(1);
  });

  it("returns exactly 0.5 at t=0.5 (symmetric S-curve)", () => {
    expect(CameraTransition.logisticSigmoid(0.5)).toBeCloseTo(0.5, 12);
  });
});

describe("CameraTransition.logisticSigmoid — symmetry around 0.5", () => {
  it("f(t) + f(1-t) = 1 across the curve (point-symmetric)", () => {
    // Sigmoid is point-symmetric about (0.5, 0.5) by construction;
    // the affine-renormalization in our impl preserves that.
    for (const t of [0.1, 0.2, 0.25, 0.3, 0.4, 0.45]) {
      const a = CameraTransition.logisticSigmoid(t);
      const b = CameraTransition.logisticSigmoid(1 - t);
      expect(a + b).toBeCloseTo(1, 10);
    }
  });
});

describe("CameraTransition.logisticSigmoid — monotonic increasing", () => {
  it("strictly increases across [0, 1]", () => {
    let prev = CameraTransition.logisticSigmoid(0);
    for (let t = 0.05; t <= 1.0; t += 0.05) {
      const cur = CameraTransition.logisticSigmoid(t);
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
  });
});

describe("CameraTransition.logisticSigmoid — output bounds", () => {
  it("output stays in [0, 1] across the input range", () => {
    for (let t = 0; t <= 1.0; t += 0.01) {
      const v = CameraTransition.logisticSigmoid(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("CameraTransition.logisticSigmoid — S-curve character", () => {
  it("is faster than linear at midpoint (steeper than t=0.5)", () => {
    // Sample two points symmetric around 0.5: at t=0.4 the
    // sigmoid value should be < 0.4 (we're still in the slow
    // start), and at t=0.6 the value should be > 0.6 (we're past
    // the fast midpoint, decelerating into the soft landing).
    // The "fast in the middle" property is what gives the
    // cinematic feel.
    const lower = CameraTransition.logisticSigmoid(0.4);
    const upper = CameraTransition.logisticSigmoid(0.6);
    expect(lower).toBeLessThan(0.4);
    expect(upper).toBeGreaterThan(0.6);
    // The gap from 0.4→0.6 should be substantially larger than
    // 0.2 (the linear gap), confirming the steep-middle character.
    expect(upper - lower).toBeGreaterThan(0.4);
  });

  it("eases softly near t=0 (slow start)", () => {
    // At t=0.05 the value should be very close to 0 — the camera
    // ramps in gently, not snap-launching.
    const early = CameraTransition.logisticSigmoid(0.05);
    expect(early).toBeLessThan(0.05);
  });

  it("eases softly near t=1 (slow finish)", () => {
    // At t=0.95 the value should be close to 1 — the camera
    // settles in gently, not crash-landing.
    const late = CameraTransition.logisticSigmoid(0.95);
    expect(late).toBeGreaterThan(0.95);
  });
});

describe("CameraTransition.logisticSigmoid — factor parameter", () => {
  it("default factor=60 is steeper than factor=12", () => {
    // Higher factor = sharper S. Sample at t=0.4 (before the
    // midpoint inflection, where steeper curves sit lower). Atlas
    // defaults to Gaia's factor=60; the previous (round-5-removed)
    // factor=12 default felt like a jump for cross-scale fly-to.
    const f60 = CameraTransition.logisticSigmoid(0.4, 60);
    const f12 = CameraTransition.logisticSigmoid(0.4, 12);
    expect(f60).toBeLessThan(f12);
  });

  it("default factor (60) preserves endpoints exactly via affine clamp", () => {
    // Raw sigmoid at factor=60 sits at ~9e-14 from 0/1; without
    // the (sig(t)-sig(0))/(sig(1)-sig(0)) renorm in
    // logisticSigmoid, t=0/t=1 wouldn't pin to 0/1 exactly. This
    // pin guards against accidental simplification of the impl.
    expect(CameraTransition.logisticSigmoid(0)).toBe(0);
    expect(CameraTransition.logisticSigmoid(1)).toBe(1);
    // Same with the explicit default factor.
    expect(CameraTransition.logisticSigmoid(0, 60)).toBe(0);
    expect(CameraTransition.logisticSigmoid(1, 60)).toBe(1);
  });

  it("factor=60 produces visible stall plateaus at start/end (departure phase)", () => {
    // The Gaia default's value: ~30% of duration on each end is
    // near-zero motion, ~40% in the middle covers the bulk of the
    // trajectory. For cross-scale fly-to (e.g. solar-system →
    // interstellar) this gives a clear "departure → warp →
    // arrival" perception. At factor=60: t=0.3 sits near 0,
    // t=0.7 sits near 1 — the warp is concentrated in [0.3, 0.7].
    const earlyAtGaia = CameraTransition.logisticSigmoid(0.3, 60);
    const lateAtGaia = CameraTransition.logisticSigmoid(0.7, 60);
    expect(earlyAtGaia).toBeLessThan(0.005);
    expect(lateAtGaia).toBeGreaterThan(0.995);

    // Atlas's pre-round-5 atlas-opinion default of 12 sat much
    // closer to "moving smoothly through the curve" — but the
    // "smooth all-through" turned the cross-scale case into a
    // visual snap because the camera covered most of the
    // trajectory in the first second of a 4 s budget. User smoke
    // (2026-05-05) disconfirmed the 12 choice; Gaia's 60 reads as
    // intentional cinematic departure, not a stall.
    const earlyAtFactor12 = CameraTransition.logisticSigmoid(0.3, 12);
    const lateAtFactor12 = CameraTransition.logisticSigmoid(0.7, 12);
    expect(earlyAtFactor12).toBeGreaterThan(0.05);
    expect(lateAtFactor12).toBeLessThan(0.95);
  });
});

describe("CameraTransition.logisticSigmoid — Gaia source pin", () => {
  it("matches the pure-sigmoid formula 1 / (1 + exp(-k * (t - 0.5))) (with affine clamp)", () => {
    // Source: gaiasky/script/v2/impl/CameraModule.java:676 uses
    // "logisticsigmoid" with smoothFactor = 60.0. Per the
    // mapper definition (Gaia uses MathUtilsDouble's logistic),
    // the curve is `1 / (1 + exp(-k * (t - center)))`. We verify
    // our impl matches this pre-clamp.
    const k = 12;
    const center = 0.5;
    const t = 0.3;
    const rawSigmoid = 1 / (1 + Math.exp(-k * (t - center)));
    const a0 = 1 / (1 + Math.exp(-k * (0 - center)));
    const a1 = 1 / (1 + Math.exp(-k * (1 - center)));
    const expected = (rawSigmoid - a0) / (a1 - a0);
    expect(CameraTransition.logisticSigmoid(t, k)).toBeCloseTo(expected, 12);
  });
});
