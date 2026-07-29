import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { initializeOrbitalEngine } from "../orbital/setup";
import {
  DEFAULT_SUNLIGHT_ASSIST_POLICY,
  SOLAR_IRRADIANCE_MAX_AU,
  SOLAR_IRRADIANCE_MIN_AU,
  getSunlightAssistPolicy,
  resolveAssistGain,
  resolveBodySunlightScalar,
  resolveFusedSunlightScalar,
  setSunlightAssistPolicy,
  solarIrradianceAtAU,
} from "./solarIrradiance";

/** Inside every analytical provider's validity window. */
const TEST_DATE = new Date("2026-01-01T00:00:00Z");

afterEach(() => {
  // The policy is a mutable singleton (exposureRegistry idiom); a test that
  // flips it must not leak into the next one.
  setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY);
});

describe("solarIrradianceAtAU", () => {
  it("is 1.0 at the anchor distance, exactly", () => {
    // The anchor is PROVISIONAL (handoff §5.3 — "what does 0 EV mean" is
    // open). What is pinned here is only that Earth's 1 AU reads as the
    // reference, so this wave is a redistribution and not a global
    // brightness edit. When §5.3 closes, this expectation moves WITH the
    // constant, deliberately.
    expect(solarIrradianceAtAU(1)).toBe(1);
  });

  it("follows the inverse square across the Solar System's span", () => {
    // Mercury near perihelion and Neptune, the two ends the plan calls out.
    expect(solarIrradianceAtAU(0.31)).toBeCloseTo(10.4058, 3);
    expect(solarIrradianceAtAU(30)).toBeCloseTo(1 / 900, 9);
  });

  it("quarters for every doubling, at any distance", () => {
    // The property, not three sampled points: this is what makes it a law
    // rather than a lookup table.
    for (const d of [0.4, 1, 5.2, 9.6, 19.2]) {
      expect(solarIrradianceAtAU(2 * d)).toBeCloseTo(
        solarIrradianceAtAU(d) / 4,
        12
      );
    }
  });

  it("clamps instead of dividing by zero at the Sun's own distance", () => {
    // `resolveHeliocentricDistanceAU("sun", …)` is exactly 0 and the Sun IS
    // in the catalog, so an unclamped 1/d² is reachable, not theoretical.
    expect(Number.isFinite(solarIrradianceAtAU(0))).toBe(true);
    expect(solarIrradianceAtAU(0)).toBe(
      solarIrradianceAtAU(SOLAR_IRRADIANCE_MIN_AU)
    );
  });

  it("returns neutral rather than NaN for a non-finite input", () => {
    // A NaN in the uniform paints the body black with no error anywhere —
    // the worst possible failure mode for a photometric term.
    expect(solarIrradianceAtAU(Number.NaN)).toBe(1);
    expect(solarIrradianceAtAU(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("cannot be fed a render-space distance and answer plausibly", () => {
    // The API takes a number, so the TYPE cannot distinguish ephemeris AU
    // from a scene-graph distance; the structural guarantee is that the
    // render path only reaches this through `resolveBodySunlightScalar`,
    // which takes (bodyId, date). The clamp is the second line of defence:
    // Atlas's didactic space compresses to a 3200-unit cap, so a
    // world-coordinate caller lands on the far bound — visibly, uniformly
    // black — rather than on a wrong-but-believable brightness.
    const didacticCapDistance = 3200;
    expect(didacticCapDistance).toBeGreaterThan(SOLAR_IRRADIANCE_MAX_AU);
    expect(solarIrradianceAtAU(didacticCapDistance)).toBe(
      solarIrradianceAtAU(SOLAR_IRRADIANCE_MAX_AU)
    );
  });
});

describe("assist gain fusion", () => {
  it("ships 'compensated' as the default policy", () => {
    // The badge + assist-control agent flips this together with the
    // disclosure UI. Until then, real irradiance is plumbed but not claimed.
    expect(DEFAULT_SUNLIGHT_ASSIST_POLICY).toBe("compensated");
    expect(getSunlightAssistPolicy()).toBe("compensated");
  });

  it("compensates exactly — the gain is the inverse of the irradiance", () => {
    for (const d of [0.31, 1, 5.2, 30, 500]) {
      const e = solarIrradianceAtAU(d);
      expect(resolveAssistGain(e, "compensated")).toBeCloseTo(1 / e, 12);
      expect(resolveAssistGain(e, "real")).toBe(1);
    }
  });

  it("passes the irradiance straight through under 'real'", () => {
    expect(
      resolveFusedSunlightScalar({
        heliocentricDistanceAU: 30,
        policy: "real",
      })
    ).toBeCloseTo(1 / 900, 9);
  });

  it("honours a live policy change through the singleton", () => {
    setSunlightAssistPolicy("real");
    expect(
      resolveFusedSunlightScalar({ heliocentricDistanceAU: 0.31 })
    ).toBeCloseTo(10.4058, 3);
  });
});

describe("visual no-op contract (today's default)", () => {
  beforeAll(() => {
    initializeOrbitalEngine();
  });

  // One per distance regime, plus a satellite (parent-composed heliocentric
  // distance) and a TNO two orders of magnitude out.
  const SAMPLE_BODY_IDS = [
    "mercury",
    "earth",
    "moon",
    "mars",
    "jupiter",
    "europa",
    "neptune",
    "eris",
  ];

  it("fuses to 1.0 for every body under 'compensated'", () => {
    for (const id of SAMPLE_BODY_IDS) {
      const fused = resolveBodySunlightScalar(id, TEST_DATE, "compensated");
      expect(fused).toBeCloseTo(1, 12);
      // What actually reaches the GPU: a float32 uniform. `E × (1/E)` can
      // land one float64 ulp off 1, which rounds to exactly 1.0f — this is
      // the assert that backs the "bit-identical frame" claim the e2e pixel
      // baseline checks.
      expect(Math.fround(fused)).toBe(1);
    }
  });

  it("would NOT be 1.0 under 'real' — the plumbing is live, just neutral", () => {
    // Guards the contract from the far side: a resolver that returned 1.0
    // regardless of policy would pass the test above while being inert.
    const mercury = resolveBodySunlightScalar("mercury", TEST_DATE, "real");
    const neptune = resolveBodySunlightScalar("neptune", TEST_DATE, "real");

    // Mercury's own orbit spans 0.3077–0.4663 AU → 4.6× to 10.6×.
    expect(mercury).toBeGreaterThan(4.5);
    expect(mercury).toBeLessThan(10.7);
    // Neptune ≈ 30 AU → ≈ 1/900.
    expect(neptune).toBeCloseTo(1 / 900, 4);
    // ...and the ratio between them is the ~10⁴ the single `decay = 0`
    // point light currently flattens to 1.
    expect(mercury / neptune).toBeGreaterThan(4_000);
  });

  it("takes the heliocentric distance from the ephemeris, not from an orbit's semi-major axis", () => {
    // Europa's `orbit.a` is ~0.0045 AU (to Jupiter). If the resolver read
    // that instead of composing the parent chain, its irradiance would come
    // out ~10⁶× too high — the exact bug the heliocentric composer exists
    // to prevent.
    const europa = resolveBodySunlightScalar("europa", TEST_DATE, "real");
    const jupiter = resolveBodySunlightScalar("jupiter", TEST_DATE, "real");
    expect(europa / jupiter).toBeCloseTo(1, 2);
  });
});
