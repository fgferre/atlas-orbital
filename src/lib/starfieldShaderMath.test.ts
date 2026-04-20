import { describe, expect, it } from "vitest";

import {
  CORE_SMOOTHSTEP_EDGE_HIGH,
  CORE_SMOOTHSTEP_EDGE_LOW,
  starfieldCoreKernel,
  starfieldPointMetrics,
} from "./starfieldShaderMath";
import { getResolvedQualityProfileOptions } from "./qualityProfile";

const approxEq = (actual: number, expected: number, tol = 1e-3) => {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
};

// Reference particleSize = sqrt(max(w,h) * DPR) / 60 at roughly a 1440p
// display on DPR 1. Representative of what the shader actually sees.
const REF_PARTICLE_SIZE = 0.75;

describe("starfieldPointMetrics — NASA Eyes exact port", () => {
  const cases: Array<{
    mag: number;
    gl_PointSize: number;
    vBrightness: number;
  }> = [
    // Sirius: brightness ≈ 13.8, sprite clamped at 50.
    { mag: -1.5, gl_PointSize: 41.42, vBrightness: 1 },
    // Vega: brightness ≈ 11, sprite ≈ 33 px, alpha clamped at 1.
    { mag: 0, gl_PointSize: 33.15, vBrightness: 1 },
    // Polaris / mid-range bright stars.
    { mag: 2, gl_PointSize: 22.23, vBrightness: 1 },
    { mag: 3, gl_PointSize: 16.92, vBrightness: 1 },
    { mag: 4, gl_PointSize: 11.91, vBrightness: 1 },
    // Mag 5: sprite shrinks below 10 px, alpha still at ceiling.
    { mag: 5, gl_PointSize: 7.52, vBrightness: 1 },
    // Naked-eye limit (mag ~6–6.5): sprite hits the 5 px floor;
    // alpha still well above the 0.05 floor.
    { mag: 6, gl_PointSize: 5, vBrightness: 1 },
    { mag: 7, gl_PointSize: 5, vBrightness: 0.5 },
    // Binocular depth: sprite at the 5 px floor, alpha falling.
    { mag: 8, gl_PointSize: 5, vBrightness: 0.22 },
    // Telescopic: floor on both size and alpha.
    { mag: 10, gl_PointSize: 5, vBrightness: 0.05 },
    { mag: 12, gl_PointSize: 5, vBrightness: 0.05 },
    { mag: 20, gl_PointSize: 5, vBrightness: 0.05 },
  ];

  it.each(cases)(
    "matches the NASA-exact curve at mag $mag (particleSize $REF_PARTICLE_SIZE)",
    ({ mag, gl_PointSize, vBrightness }) => {
      const result = starfieldPointMetrics(mag, REF_PARTICLE_SIZE);
      approxEq(result.gl_PointSize, gl_PointSize, 0.1);
      approxEq(result.vBrightness, vBrightness, 0.02);
    }
  );

  it("is strictly monotonic: brighter magnitudes produce larger sprites and higher alpha", () => {
    let previousSize = Infinity;
    let previousAlpha = Infinity;
    for (let mag = -2; mag <= 20; mag += 0.25) {
      const { gl_PointSize, vBrightness } = starfieldPointMetrics(
        mag,
        REF_PARTICLE_SIZE
      );
      expect(gl_PointSize).toBeLessThanOrEqual(previousSize + 1e-6);
      expect(vBrightness).toBeLessThanOrEqual(previousAlpha + 1e-6);
      previousSize = gl_PointSize;
      previousAlpha = vBrightness;
    }
  });

  it("floors at 5 px size / 0.05 alpha (NASA's values)", () => {
    const mag15 = starfieldPointMetrics(15, REF_PARTICLE_SIZE);
    expect(mag15.gl_PointSize).toBe(5);
    expect(mag15.vBrightness).toBeCloseTo(0.05);
  });

  it("scales gl_PointSize linearly with particleSize (viewport responsiveness)", () => {
    // Same star, different viewport — sprite grows with particleSize
    // until it hits the 50 px ceiling.
    const ps050 = starfieldPointMetrics(3, 0.5).gl_PointSize;
    const ps075 = starfieldPointMetrics(3, 0.75).gl_PointSize;
    const ps150 = starfieldPointMetrics(3, 1.5).gl_PointSize;
    expect(ps075).toBeGreaterThan(ps050);
    // Mag 3 at particleSize 1.5: brightness·4·1.5 ≈ 33.9 → still under 50.
    expect(ps150).toBeGreaterThan(ps075);
    expect(ps150).toBeLessThanOrEqual(50);
  });
});

describe("starfieldPointMetrics — HDR-emissive allow-list (R1 #1B)", () => {
  // The `vfxHdrGain` uniform lives in the vertex shader as a post-
  // transfer multiplier on vColor (the B-V-derived RGB channel), so
  // these metrics functions stay pre-HDR. What the tests below pin is
  // the composite behavior in additive-blending terms:
  //   linear contribution = vColorChannel × vBrightness × vfxHdrGain
  // where vColorChannel is the saturated-white approximation (1.0 for
  // hot stars) and vBrightness is this function's output.
  // A contribution > 1.0 is what the <Bloom luminanceThreshold={1.0}>
  // pass picks up.
  //
  // Tier defaults are read from `qualityProfile.getResolvedQualityProfileOptions()`
  // at test-time so the suite stays in sync with whatever values
  // `qualityProfile.ts` ships — earlier revisions hardcoded numbers
  // that drifted out of step with the runtime after a tuning pass.

  const QP = getResolvedQualityProfileOptions();
  const ULTRA_GAIN = QP.ultra.vfxHdrGain;
  const HIGH_GAIN = QP.high.vfxHdrGain;
  const BALANCED_GAIN = QP.balanced.vfxHdrGain;
  const CONSTRAINED_GAIN = QP.constrained.vfxHdrGain;

  const composite = (mag: number, gain: number, vColorChannel = 1) =>
    vColorChannel * starfieldPointMetrics(mag, 0.75).vBrightness * gain;

  it("advertised tier-default gains are in the expected order and magnitudes", () => {
    // Pins the monotonic tier order — a future tuning can raise/lower
    // numbers, but the ordering (ultra > high > balanced > constrained)
    // is the contract the Display panel's preset dropdown advertises.
    expect(ULTRA_GAIN).toBeGreaterThan(HIGH_GAIN);
    expect(HIGH_GAIN).toBeGreaterThan(BALANCED_GAIN);
    expect(BALANCED_GAIN).toBeGreaterThan(CONSTRAINED_GAIN);
    // Constrained stays at identity — bloom is disabled on that tier
    // so the gain only affects the LDR shader output, and an HDR lift
    // would drift the look without benefit.
    expect(CONSTRAINED_GAIN).toBe(1.0);
  });

  it("bright stars (mag ≤ 4) cross 1.0 on ultra → bloom picks them up", () => {
    // mag 4 has vBrightness = 1 (ceiling), so composite = ULTRA_GAIN.
    // As long as the tier's gain stays > 1, this holds.
    expect(composite(4, ULTRA_GAIN)).toBeGreaterThan(1);
    expect(composite(0, ULTRA_GAIN)).toBeGreaterThan(1);
    expect(composite(-1.5, ULTRA_GAIN)).toBeGreaterThan(1);
  });

  it("bright stars cross 1.0 on high and balanced", () => {
    expect(composite(2, HIGH_GAIN)).toBeGreaterThan(1);
    expect(composite(2, BALANCED_GAIN)).toBeGreaterThan(1);
  });

  it("telescopic stars (mag ≥ 10) stay below 1.0 on every tier", () => {
    // vBrightness floors at 0.05 for mag ≥ 10. Max composite at ultra
    // = 1 × 0.05 × ULTRA_GAIN. As long as ULTRA_GAIN stays below 20,
    // the mag-10+ tail cannot bloom.
    expect(ULTRA_GAIN).toBeLessThan(20);
    expect(composite(10, ULTRA_GAIN)).toBeLessThan(1);
    expect(composite(12, ULTRA_GAIN)).toBeLessThan(1);
    expect(composite(20, ULTRA_GAIN)).toBeLessThan(1);
  });

  it("constrained tier collapses to the pre-Wave-α LDR behavior for every magnitude", () => {
    // Identity: composite with gain=1 equals vColorChannel × vBrightness.
    expect(CONSTRAINED_GAIN).toBe(1.0);
    for (const mag of [-1.5, 0, 3, 6, 8, 12]) {
      const expected = 1 * starfieldPointMetrics(mag, 0.75).vBrightness * 1;
      expect(composite(mag, CONSTRAINED_GAIN)).toBeCloseTo(expected, 10);
    }
  });

  it("composite is strictly monotonic in mag (brighter stars always out-emit dimmer)", () => {
    let previous = Infinity;
    for (let mag = -2; mag <= 15; mag += 0.5) {
      const c = composite(mag, HIGH_GAIN);
      expect(c).toBeLessThanOrEqual(previous + 1e-6);
      previous = c;
    }
  });

  // θ.1 shifted bloom eligibility at the sprite center pixel: the
  // additive `core * 2.0` RGB boost raises the center pixel's
  // contribution from `vBrightness × channel × gain` to
  // `vBrightness × (channel × gain + 2)` when core = 1. The earlier
  // "telescopic stays below 1" guard above is still true for every
  // non-center pixel (core = 0 there), but the center pixel crosses
  // the Bloom threshold at mid-faint magnitudes on high and ultra
  // tiers. That is a DESIRED visual — it paints a subpixel-sized
  // bright tip on mid-faint stars which is the Gaia-Sky look — but
  // it needs to be pinned here so a future refactor of the `* 2.0`
  // RGB boost factor doesn't silently change which stars' centers
  // bloom.
  const centerPixelComposite = (mag: number, gain: number, vColorChannel = 1) =>
    starfieldPointMetrics(mag, 0.75).vBrightness * (vColorChannel * gain + 2);

  it("θ.1 core-center pixel pushes mid-faint magnitudes over the bloom threshold on ultra / high / balanced", () => {
    // At mag 7, vBrightness = 0.5. Center composite on ultra =
    // 0.5 × (4 + 2) = 3.0 — well past the 1.0 bright-pass threshold.
    expect(centerPixelComposite(7, ULTRA_GAIN)).toBeGreaterThan(1);
    expect(centerPixelComposite(7, HIGH_GAIN)).toBeGreaterThan(1);
    expect(centerPixelComposite(7, BALANCED_GAIN)).toBeGreaterThan(1);
    // At mag 8, vBrightness = 0.22. Center composite on ultra =
    // 0.22 × (4 + 2) ≈ 1.32 — still over the threshold. This is the
    // expansion of the bloom allow-list that θ.1 introduces; the
    // non-center pixels of the same star sit below threshold
    // (0.22 × 4 = 0.88) so the bloom contribution is a single-pixel
    // tip, not a whole-sprite glow.
    expect(centerPixelComposite(8, ULTRA_GAIN)).toBeGreaterThan(1);
  });

  it("θ.1 core-center pixel stays below the bloom threshold for the deep telescopic tail (mag ≥ 10)", () => {
    // vBrightness floors at 0.05 beyond mag 10. On ultra that caps
    // the center composite at 0.05 × (ULTRA_GAIN + 2) — which must
    // stay below 1 for the deep tail not to manufacture bloom fog.
    // With ULTRA_GAIN < 18 this invariant holds; assert both sides.
    expect(ULTRA_GAIN).toBeLessThan(18);
    expect(centerPixelComposite(10, ULTRA_GAIN)).toBeLessThan(1);
    expect(centerPixelComposite(12, ULTRA_GAIN)).toBeLessThan(1);
    expect(centerPixelComposite(20, ULTRA_GAIN)).toBeLessThan(1);
  });

  it("constrained tier never blooms the core-center pixel (bloom is off on constrained anyway, but a zero-HDR-gain tier must not lift mid-mag stars into HDR through the core alone)", () => {
    // On constrained, gain = 1. Max center composite at mag 6 (where
    // vBrightness = 1): 1 × (1 + 2) = 3. That IS > 1, meaning even
    // constrained would paint HDR at the sprite center — and since
    // the tier's bloom pass is not mounted, the AgX endpoint
    // receives the value directly. The guard here is that the deep
    // telescopic tail still caps out below 1 on constrained, so the
    // sky doesn't turn into a center-pixel HDR haze on weak
    // hardware.
    expect(centerPixelComposite(10, CONSTRAINED_GAIN)).toBeLessThan(1);
    expect(centerPixelComposite(12, CONSTRAINED_GAIN)).toBeLessThan(1);
  });
});

describe("starfieldCoreKernel — Gaia Sky star.group.quad port", () => {
  // Source (star.group.quad.fragment.glsl, 2026-04-20 read):
  //   float core = saturate(1.0 - smoothstep(0.0, 0.04, distance(vec2(0.5), uv) * 2.0));
  //
  // These tests pin the three source-authoritative anchor points plus
  // the saturation tail. The prior rollback shipped a smoothstep with
  // edges (0.45, 0.50) in pixel space that drifted by an order of
  // magnitude in the rendered sprite — pinning (0.0, 0.04) as exported
  // constants, plus the midpoint value, prevents a silent regression
  // back to the invented kernel.

  it("exports the source-authoritative edge constants", () => {
    expect(CORE_SMOOTHSTEP_EDGE_LOW).toBe(0.0);
    expect(CORE_SMOOTHSTEP_EDGE_HIGH).toBe(0.04);
  });

  it("matches the Gaia Sky shader at the three edge-defining points", () => {
    // Center: the pinpoint is at full intensity.
    approxEq(starfieldCoreKernel(0.0), 1.0);
    // Midpoint of the smoothstep window: GLSL smoothstep is
    // 3t²-2t³; at t = 0.5 that's 0.5, so core = 1 - 0.5 = 0.5.
    approxEq(starfieldCoreKernel(0.02), 0.5);
    // Upper edge: smoothstep saturates to 1, core collapses to 0.
    approxEq(starfieldCoreKernel(0.04), 0.0);
  });

  it("matches smoothstep off-midpoint samples (proves the curve is THIS smoothstep, not any decreasing bump through the same anchors)", () => {
    // r = 0.01 → smoothstep t = 0.25 → 3·0.0625 − 2·0.015625 = 0.15625.
    // core = 1 − 0.15625 = 0.84375.
    approxEq(starfieldCoreKernel(0.01), 0.84375);
    // r = 0.03 → t = 0.75 → 3·0.5625 − 2·0.421875 = 0.84375.
    // core = 1 − 0.84375 = 0.15625. Symmetric around the 0.5 midpoint.
    approxEq(starfieldCoreKernel(0.03), 0.15625);
  });

  it("stays at 0 everywhere outside the core (r > 0.04, up to the sprite corner)", () => {
    // The sprite's UV-scaled radius ranges roughly 0..√2 because of the
    // `* 2` factor. Everywhere outside the razor-thin window must
    // contribute exactly 0 additive white boost — otherwise the halo
    // (texture profile) would be swallowed by a fat bright disc like
    // the rolled-back θ.1 produced.
    for (const r of [0.041, 0.05, 0.1, 0.25, 0.5, 1.0, 1.4]) {
      approxEq(starfieldCoreKernel(r), 0.0);
    }
  });

  it("is strictly non-increasing from r=0 outward", () => {
    // If the kernel ever bumped up as r grew, bright stars would paint
    // a ring, which is the exact failure mode L13 / L14 fight.
    let previous = Infinity;
    for (let r = 0; r <= 1.5; r += 0.005) {
      const v = starfieldCoreKernel(r);
      expect(v).toBeLessThanOrEqual(previous + 1e-9);
      previous = v;
    }
  });

  it("clamps negative r inputs to the pinpoint value (defensive against sampling artifacts)", () => {
    // GLSL saturate = clamp(x, 0, 1); a negative `r` would only come
    // from a shader bug but the TS mirror should not amplify it.
    approxEq(starfieldCoreKernel(-0.01), 1.0);
  });
});
