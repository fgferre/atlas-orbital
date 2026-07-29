import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveHeliocentricDistanceAU } from "../orbital";
import { initializeOrbitalEngine } from "../orbital/setup";
import {
  AUTO_EXPOSURE_RAMP_TAU_S,
  resolveAnalyticalExposure,
  resolveAnchorDistanceAU,
  resolveFocusExposure,
  stepExposureLogTowards,
} from "./autoExposure";
import { SCENE_EXPOSURE_MAX } from "./exposureRegistry";
import {
  DEFAULT_SUNLIGHT_ASSIST_POLICY,
  SOLAR_IRRADIANCE_ANCHOR_AU,
  setSunlightAssistPolicy,
  setSunlightToneMappingMounted,
  resolveBodySunlightScalar,
} from "./solarIrradiance";

/** Inside every analytical provider's validity window. */
const TEST_DATE = new Date("2026-01-01T00:00:00Z");

const SAMPLE_BODY_IDS = [
  "mercury",
  "earth",
  "moon",
  "mars",
  "jupiter",
  "europa",
  "saturn",
  "neptune",
  "pluto",
  "eris",
];

beforeAll(() => {
  initializeOrbitalEngine();
});

afterEach(() => {
  setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY);
  setSunlightToneMappingMounted(false);
});

describe("the anchor invariant — the focused body lands at reference", () => {
  it("exposure × the body's own fused scalar is exactly 1, in every policy", () => {
    // THE claim of Onda 2.4, and the reason the anchor calls the same
    // resolver the materials call instead of re-deriving 1/r². If these
    // two ever drift, the focused body stops landing at reference and the
    // black-disc defect comes back for whatever body the drift covers.
    for (const policy of ["compensated", "assisted", "real"] as const) {
      for (const id of SAMPLE_BODY_IDS) {
        const fused = resolveBodySunlightScalar(id, TEST_DATE, policy, true);
        const exposure = resolveFocusExposure(id, TEST_DATE, policy, true);
        expect(fused * exposure).toBeCloseTo(1, 9);
      }
    }
  });
});

describe("resolveFocusExposure — the pinned positions", () => {
  it("is exactly 1 for every body under 'compensated'", () => {
    // `compensated` fuses to 1 everywhere, so its reciprocal is 1
    // everywhere: the equalized picture is byte-identical to the pre-2.4
    // look, anchor included.
    for (const id of SAMPLE_BODY_IDS) {
      const exposure = resolveFocusExposure(id, TEST_DATE, "compensated", true);
      expect(exposure).toBeCloseTo(1, 12);
      // What actually reaches the GPU: `gl.toneMappingExposure`, a float32
      // uniform. `1 / (E × (1/E))` can land one float64 ulp off 1, which
      // rounds to exactly 1.0f — the same convention `solarIrradiance.test.ts`
      // uses for the fused scalar this is the reciprocal of.
      expect(Math.fround(exposure)).toBe(1);
    }
  });

  it("Saturn in 'real' asks for ~89× — the owner's pitch-black disc", () => {
    // Saturn receives ~1.1 % of Earth's irradiance. Under the old fixed
    // 1 AU exposure that rendered as an invisible disc; the anchor is the
    // reciprocal, i.e. the exposure an observer AT Saturn is adapted to.
    const exposure = resolveFocusExposure("saturn", TEST_DATE, "real", true);
    const d = resolveHeliocentricDistanceAU("saturn", TEST_DATE);
    // Closed form: exposure ≡ d² in AU under `real`.
    expect(exposure).toBeCloseTo(d * d, 6);
    // Saturn's orbit spans 9.0–10.1 AU on this date range → 81–102.
    expect(exposure).toBeGreaterThan(81);
    expect(exposure).toBeLessThan(102);
  });

  it("Neptune in 'assisted' asks for ~10.8× — the compressed counterpart", () => {
    const exposure = resolveFocusExposure(
      "neptune",
      TEST_DATE,
      "assisted",
      true
    );
    expect(exposure).toBeCloseTo(10.8, 1);
  });

  it("Neptune in 'real' asks for ~900× — far past the pre-2.4 ceiling of 16", () => {
    const exposure = resolveFocusExposure("neptune", TEST_DATE, "real", true);
    expect(exposure).toBeGreaterThan(880);
    expect(exposure).toBeLessThan(930);
    expect(exposure).toBeLessThanOrEqual(SCENE_EXPOSURE_MAX);
  });

  it("preserves the true brightness ORDERING as an exposure ordering", () => {
    // Farther subject ⇒ more exposure, monotonically. A resolver that
    // inverted or flattened this would still pass the invariant test above.
    const order = ["mercury", "earth", "mars", "jupiter", "saturn", "neptune"];
    const exposures = order.map((id) =>
      resolveFocusExposure(id, TEST_DATE, "real", true)
    );
    for (let i = 1; i < exposures.length; i++) {
      expect(exposures[i]).toBeGreaterThan(exposures[i - 1]!);
    }
  });
});

describe("resolveAnchorDistanceAU — what counts as a subject", () => {
  it("no focus reads the 1 AU reference ⇒ exposure exactly 1 in every policy", () => {
    // The boot frame. Pinned in every policy because the e2e pixel
    // baseline asserts the boot frame did not move.
    for (const focus of [null, undefined]) {
      expect(resolveAnchorDistanceAU(focus, TEST_DATE)).toBe(
        SOLAR_IRRADIANCE_ANCHOR_AU
      );
      for (const policy of ["compensated", "assisted", "real"] as const) {
        expect(resolveFocusExposure(focus, TEST_DATE, policy, true)).toBe(1);
      }
    }
  });

  it("the Sun is not a subject — it does not RECEIVE sunlight", () => {
    // Its heliocentric distance is 0; `solarIrradianceAtAU` clamps that to
    // 0.05 AU purely as a division-by-zero guard for the material path.
    // Reading that guard as an anchor would darken the whole scene 400× on
    // `focusHome()` and would promote a defensive bound to a photometric
    // claim.
    expect(resolveAnchorDistanceAU("sun", TEST_DATE)).toBe(
      SOLAR_IRRADIANCE_ANCHOR_AU
    );
    expect(resolveFocusExposure("sun", TEST_DATE, "real", true)).toBe(1);
  });

  it("a HYG star focus id reads the reference instead of throwing", () => {
    // `resolveHeliocentricDistanceAU` throws on unknown ids by design; HYG
    // focus arrives as `hyg:<index>` and must not reach it.
    expect(resolveAnchorDistanceAU("hyg:12345", TEST_DATE)).toBe(
      SOLAR_IRRADIANCE_ANCHOR_AU
    );
    expect(resolveFocusExposure("hyg:12345", TEST_DATE, "real", true)).toBe(1);
  });

  it("a moon anchors on its heliocentric distance, not its parent-centered orbit", () => {
    // Europa's `orbit.a` is ~0.0045 AU (to Jupiter). Reading that would ask
    // for an exposure ~10⁻⁵ of Jupiter's instead of the same one.
    const europa = resolveFocusExposure("europa", TEST_DATE, "real", true);
    const jupiter = resolveFocusExposure("jupiter", TEST_DATE, "real", true);
    expect(europa / jupiter).toBeCloseTo(1, 2);
  });
});

describe("resolveAnalyticalExposure — bounds and degenerate inputs", () => {
  it("never leaves the registry's representable range", () => {
    for (const d of [1e-9, 0.01, 1, 1e4, 1e9]) {
      const exposure = resolveAnalyticalExposure({
        heliocentricDistanceAU: d,
        policy: "real",
        toneMapped: true,
      });
      expect(exposure).toBeGreaterThan(0);
      expect(exposure).toBeLessThanOrEqual(SCENE_EXPOSURE_MAX);
    }
  });

  it("returns neutral rather than NaN for a non-finite distance", () => {
    expect(
      resolveAnalyticalExposure({
        heliocentricDistanceAU: Number.NaN,
        policy: "real",
        toneMapped: true,
      })
    ).toBe(1);
  });
});

describe("stepExposureLogTowards — the log-space ramp", () => {
  it("interpolates in stops, not in linear luminance", () => {
    // The whole point. Halfway through the ramp between 1 and 1024 (10
    // stops) the LINEAR midpoint is 512.5 and the STOP midpoint is 32; a
    // linear lerp would spend ~97 % of the ramp inside the last stop, i.e.
    // read as a hard cut followed by a crawl.
    const tau = 1;
    // blend = 1 - e^-Δ/τ = 0.5 ⇒ Δ = τ·ln2
    const halfBlendDelta = Math.LN2 * tau;
    const mid = stepExposureLogTowards(1, 1024, halfBlendDelta, tau);
    expect(mid).toBeCloseTo(32, 6);
  });

  it("is monotone toward the target and never overshoots, either direction", () => {
    const legs: readonly (readonly [number, number])[] = [
      [1, 906],
      [906, 1],
    ];
    for (const [from, to] of legs) {
      let value = from;
      // 1000 frames at 60 fps ≈ 16.7 s ≈ 11 τ — comfortably past the settle
      // epsilon, so the loop also proves the ramp terminates exactly.
      for (let i = 0; i < 1000; i++) {
        const next = stepExposureLogTowards(value, to, 1 / 60);
        if (to > from) {
          expect(next).toBeGreaterThanOrEqual(value);
          expect(next).toBeLessThanOrEqual(to);
        } else {
          expect(next).toBeLessThanOrEqual(value);
          expect(next).toBeGreaterThanOrEqual(to);
        }
        value = next;
      }
      expect(value).toBe(to);
    }
  });

  it("is continuous: a vanishing frame moves it a vanishing amount", () => {
    const from = 1;
    const to = 906;
    let previous = from;
    for (const delta of [1e-6, 1e-4, 1e-2]) {
      const next = stepExposureLogTowards(from, to, delta);
      expect(next).toBeGreaterThan(previous);
      previous = next;
    }
    expect(stepExposureLogTowards(from, to, 1e-9)).toBeCloseTo(from, 6);
  });

  it("is frame-rate independent: two half-frames ≈ one whole frame", () => {
    const whole = stepExposureLogTowards(1, 906, 0.1);
    const half = stepExposureLogTowards(
      stepExposureLogTowards(1, 906, 0.05),
      906,
      0.05
    );
    expect(Math.log2(half)).toBeCloseTo(Math.log2(whole), 6);
  });

  it("settles exactly on the target so a static scene stops writing", () => {
    // 6τ covers >99.7 % of the approach; the settle epsilon closes the rest.
    const settled = stepExposureLogTowards(
      1,
      906,
      AUTO_EXPOSURE_RAMP_TAU_S * 20
    );
    expect(settled).toBe(906);
    expect(stepExposureLogTowards(906, 906, 1 / 60)).toBe(906);
  });

  it("holds still on a non-positive or non-finite delta", () => {
    expect(stepExposureLogTowards(4, 906, 0)).toBe(4);
    expect(stepExposureLogTowards(4, 906, -1)).toBe(4);
    expect(stepExposureLogTowards(4, 906, Number.NaN)).toBe(4);
  });

  it("recovers to the target instead of propagating log2 of a non-positive", () => {
    expect(stepExposureLogTowards(0, 906, 1 / 60)).toBe(906);
    expect(stepExposureLogTowards(Number.NaN, 906, 1 / 60)).toBe(906);
    expect(stepExposureLogTowards(4, Number.NaN, 1 / 60)).toBe(4);
  });

  it("covers most of the ramp inside a curated-body fly-to", () => {
    // `CameraController.tsx` clamps the fly-to to [1500, 4000] ms. τ = 1.5 s
    // ⇒ 63 % of the stops by the end of the shortest flight, >93 % by the
    // end of the longest — the exposure lands with the camera rather than
    // leading or trailing it.
    const stopsTo = Math.log2(906);
    const shortFlight = Math.log2(stepExposureLogTowards(1, 906, 1.5));
    const longFlight = Math.log2(stepExposureLogTowards(1, 906, 4.0));
    expect(shortFlight / stopsTo).toBeCloseTo(0.632, 2);
    expect(longFlight / stopsTo).toBeGreaterThan(0.93);
  });
});
