import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { resolveHeliocentricDistanceAU } from "../orbital";
import { initializeOrbitalEngine } from "../orbital/setup";
import {
  DEFAULT_SUNLIGHT_ASSIST_POLICY,
  SOLAR_IRRADIANCE_MAX_AU,
  SOLAR_IRRADIANCE_MIN_AU,
  SUNLIGHT_ASSIST_EXPONENT,
  SUNLIGHT_UNMAPPED_CEILING,
  getSunlightAssistPolicy,
  resolveAssistGain,
  resolveBodySunlightScalar,
  resolveFusedSunlightScalar,
  setSunlightAssistPolicy,
  setSunlightToneMappingMounted,
  solarIrradianceAtAU,
} from "./solarIrradiance";

/** Inside every analytical provider's validity window. */
const TEST_DATE = new Date("2026-01-01T00:00:00Z");

afterEach(() => {
  // Both are mutable singletons (exposureRegistry idiom); a test that flips
  // one must not leak into the next.
  setSunlightAssistPolicy(DEFAULT_SUNLIGHT_ASSIST_POLICY);
  setSunlightToneMappingMounted(false);
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
  it("ships 'assisted' as the default policy", () => {
    // Owner product decision (handoff §1.3), shipped in the same change as
    // the fidelity badge that discloses it.
    expect(DEFAULT_SUNLIGHT_ASSIST_POLICY).toBe("assisted");
    expect(getSunlightAssistPolicy()).toBe("assisted");
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
        toneMapped: true,
      })
    ).toBeCloseTo(1 / 900, 9);
  });

  it("honours a live policy change through the singleton", () => {
    setSunlightAssistPolicy("real");
    setSunlightToneMappingMounted(true);
    expect(
      resolveFusedSunlightScalar({ heliocentricDistanceAU: 0.31 })
    ).toBeCloseTo(10.4058, 3);
  });
});

describe("'assisted' — the shipped curve", () => {
  const fusedAt = (au: number) =>
    resolveFusedSunlightScalar({
      heliocentricDistanceAU: au,
      policy: "assisted",
      toneMapped: true,
    });

  it("compresses the Solar System's range to something a display can show", () => {
    // The two numbers the wave file and the Credits entry both quote. If the
    // exponent moves, these move with it — deliberately, since they are the
    // whole justification for the value chosen.
    expect(fusedAt(0.31)).toBeCloseTo(2.27, 2); // Mercury, real 10.4×
    expect(fusedAt(30)).toBeCloseTo(1 / 10.8, 3); // Neptune, real 1/900
    // ~9400:1 of real dynamic range becomes ~25:1.
    expect(fusedAt(0.31) / fusedAt(30)).toBeLessThan(30);
  });

  it("leaves the anchor untouched", () => {
    // 1^σ = 1 for any σ, so Earth's tuned look is the fixed point of all
    // three positions — the property that makes this a redistribution.
    expect(fusedAt(1)).toBe(1);
  });

  it("preserves the true ORDERING of brightness — the honesty property", () => {
    // This is what separates 'assisted' from 'compensated': a monotone
    // transform of E still answers "which of these two is better lit, and is
    // this world getting brighter or dimmer right now" correctly. Equalized
    // answers both questions wrong by construction.
    const distances = [0.31, 0.72, 1, 1.52, 5.2, 9.6, 19.2, 30, 500];
    for (let i = 1; i < distances.length; i += 1) {
      expect(fusedAt(distances[i]!)).toBeLessThan(fusedAt(distances[i - 1]!));
    }
  });

  it("is exactly E^SIGMA, not an approximation of one", () => {
    for (const d of [0.31, 1, 5.2, 30]) {
      const e = solarIrradianceAtAU(d);
      expect(fusedAt(d)).toBeCloseTo(Math.pow(e, SUNLIGHT_ASSIST_EXPONENT), 12);
    }
  });
});

describe("unmapped tone-mapping ceiling", () => {
  // handoff §6 checklist item 4: a gain ≠ 1 needs a mounted operator OR a cap
  // below the bloom threshold. Without an operator there is no shoulder, so
  // anything above 1.0 hard-clips AND crosses Bloom's luminanceThreshold=1.0
  // contract into a halo.
  it("caps above-unity scalars when no operator is mounted", () => {
    expect(
      resolveFusedSunlightScalar({
        heliocentricDistanceAU: 0.31,
        policy: "assisted",
        toneMapped: false,
      })
    ).toBe(SUNLIGHT_UNMAPPED_CEILING);
    // 'real' overshoots far harder and is capped by the same rule — the guard
    // is about what the display can represent, not about which position is
    // selected.
    expect(
      resolveFusedSunlightScalar({
        heliocentricDistanceAU: 0.31,
        policy: "real",
        toneMapped: false,
      })
    ).toBe(SUNLIGHT_UNMAPPED_CEILING);
  });

  it("never touches values at or below unity", () => {
    // The cap must not become a floor: the outer system is the whole reason
    // the feature exists, and every one of those bodies sits below 1.0.
    for (const [au, policy] of [
      [30, "assisted"],
      [30, "real"],
      [1, "assisted"],
      [5.2, "real"],
    ] as const) {
      expect(
        resolveFusedSunlightScalar({
          heliocentricDistanceAU: au,
          policy,
          toneMapped: false,
        })
      ).toBe(
        resolveFusedSunlightScalar({
          heliocentricDistanceAU: au,
          policy,
          toneMapped: true,
        })
      );
    }
  });

  it("reads the live mount flag by default", () => {
    setSunlightToneMappingMounted(true);
    expect(
      resolveFusedSunlightScalar({
        heliocentricDistanceAU: 0.31,
        policy: "assisted",
      })
    ).toBeGreaterThan(SUNLIGHT_UNMAPPED_CEILING);
  });
});

describe("per-body scalars across the catalogue", () => {
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
      const fused = resolveBodySunlightScalar(
        id,
        TEST_DATE,
        "compensated",
        true
      );
      expect(fused).toBeCloseTo(1, 12);
      // What actually reaches the GPU: a float32 uniform. `E × (1/E)` can
      // land one float64 ulp off 1, which rounds to exactly 1.0f.
      expect(Math.fround(fused)).toBe(1);
    }
  });

  it("is EXACTLY the irradiance under 'real' — all-off ≡ neutral", () => {
    // handoff §6 checklist item 10: the unassisted mode is pinned by test,
    // not by UI copy. `resolveAssistGain(_, "real")` returns the literal 1,
    // so the fused scalar is the irradiance bit-for-bit — no `toBeCloseTo`,
    // because "we multiply by something very near 1" is a different and
    // weaker claim than "we do not touch it".
    for (const id of SAMPLE_BODY_IDS) {
      const fused = resolveBodySunlightScalar(id, TEST_DATE, "real", true);
      const irradiance = solarIrradianceAtAU(
        resolveHeliocentricDistanceAU(id, TEST_DATE)
      );
      expect(fused).toBe(irradiance);
    }
  });

  it("would NOT be 1.0 under 'real' — the plumbing is live, just neutral", () => {
    // Guards the contract from the far side: a resolver that returned 1.0
    // regardless of policy would pass the compensated test while being inert.
    const mercury = resolveBodySunlightScalar(
      "mercury",
      TEST_DATE,
      "real",
      true
    );
    const neptune = resolveBodySunlightScalar(
      "neptune",
      TEST_DATE,
      "real",
      true
    );

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
    const europa = resolveBodySunlightScalar("europa", TEST_DATE, "real", true);
    const jupiter = resolveBodySunlightScalar(
      "jupiter",
      TEST_DATE,
      "real",
      true
    );
    expect(europa / jupiter).toBeCloseTo(1, 2);
  });
});
