import { beforeAll, describe, expect, it } from "vitest";

import { initializeOrbitalEngine } from "./setup";
import {
  resolveHeliocentricDistanceAU,
  resolveHeliocentricPositionAU,
} from "./heliocentric";

// Fixed date for reproducible distances. Picked to sit inside the
// validity window of every analytical provider in the codebase so
// fallback chains don't kick in during the test.
const TEST_DATE = new Date("2026-01-01T00:00:00Z");

describe("resolveHeliocentricPositionAU", () => {
  beforeAll(() => {
    initializeOrbitalEngine();
  });

  it("the Sun sits at the heliocentric origin", () => {
    const p = resolveHeliocentricPositionAU("sun", TEST_DATE);
    expect(p.length()).toBe(0);
  });

  it("an unknown body id throws instead of masking to a fake origin", () => {
    // Silent-origin fallback would fabricate a physically plausible
    // value (same magnitude as the Sun special case) and hide the
    // caller's mistake. Loud failure is the contract.
    expect(() =>
      resolveHeliocentricPositionAU("this-body-does-not-exist", TEST_DATE)
    ).toThrow(/unknown body id/);
  });
});

describe("resolveHeliocentricDistanceAU — planets (parentless, already heliocentric)", () => {
  beforeAll(() => {
    initializeOrbitalEngine();
  });

  // Ranges bracket the body's aphelion/perihelion so the asserts stay
  // valid regardless of where in the orbit TEST_DATE lands. Generous
  // but still tight enough to catch a wrong answer (e.g. moon returning
  // parent-centered 0.0045 AU).
  it.each([
    ["mercury", 0.3, 0.5],
    ["earth", 0.98, 1.02],
    ["mars", 1.38, 1.67],
    ["jupiter", 4.95, 5.46],
    ["saturn", 9.0, 10.1],
    ["neptune", 29.7, 30.4],
    ["pluto", 29.5, 49.5],
  ])("%s heliocentric distance ∈ [%f, %f] AU", (id, lo, hi) => {
    const d = resolveHeliocentricDistanceAU(id, TEST_DATE);
    expect(d).toBeGreaterThan(lo);
    expect(d).toBeLessThan(hi);
  });
});

describe("resolveHeliocentricDistanceAU — satellites (parent composition)", () => {
  beforeAll(() => {
    initializeOrbitalEngine();
  });

  // The regression the test exists for: without parent composition,
  // these moons would collapse to their parent-centered a (fractions of
  // an AU) and classify as INNER_SYSTEM. Windows span parent aphelion ±
  // small moon-orbit offset so the assert is robust across TEST_DATE.
  it.each([
    ["moon", 0.97, 1.03], // Earth-bound; heliocentric ≈ 1 AU
    ["europa", 4.93, 5.48], // Jupiter-bound; heliocentric ≈ 5.2 AU
    ["titan", 8.95, 10.15], // Saturn-bound; heliocentric ≈ 9.5 AU
    ["triton", 29.6, 30.5], // Neptune-bound; heliocentric ≈ 30 AU
    ["charon", 29.4, 49.6], // Pluto-bound; heliocentric ≈ Pluto's
  ])(
    "%s heliocentric distance ∈ [%f, %f] AU (parent chain composed)",
    (id, lo, hi) => {
      const d = resolveHeliocentricDistanceAU(id, TEST_DATE);
      expect(d).toBeGreaterThan(lo);
      expect(d).toBeLessThan(hi);
    }
  );

  it("a moon is NEVER classified at its parent-centered distance", () => {
    // Europa's orbit.a is ~0.00449 AU to Jupiter. The classifier bug
    // this helper exists to fix would return ~0.0045; the composer
    // returns ~5.2. Guardrail: distance > 1 AU rules out the bug
    // even if the exact jovian longitude on TEST_DATE drifts.
    const d = resolveHeliocentricDistanceAU("europa", TEST_DATE);
    expect(d).toBeGreaterThan(1);
  });

  // The per-body range asserts above use windows wide enough to
  // bracket the body's heliocentric orbit across TEST_DATE. Those
  // windows are also wide enough to ACCEPT a regression where the
  // composer silently returned just the parent's heliocentric
  // position without adding the local orbit — Jupiter alone fits
  // inside Europa's [4.93, 5.48] range. The next three tests pin the
  // composition math tightly so that regression fails.
  it("Europa composer output minus Jupiter's heliocentric equals local jovicentric orbit", () => {
    const europaHelio = resolveHeliocentricPositionAU("europa", TEST_DATE);
    const jupiterHelio = resolveHeliocentricPositionAU("jupiter", TEST_DATE);
    const localOffset = europaHelio.clone().sub(jupiterHelio).length();
    // Europa's jovicentric semi-major axis is 0.00449 AU; e ≈ 0.009.
    // Instantaneous distance stays within ~1 % of that.
    expect(localOffset).toBeGreaterThan(0.0044);
    expect(localOffset).toBeLessThan(0.0046);
  });

  it("Moon composer output minus Earth's heliocentric equals local geocentric orbit", () => {
    const moonHelio = resolveHeliocentricPositionAU("moon", TEST_DATE);
    const earthHelio = resolveHeliocentricPositionAU("earth", TEST_DATE);
    const localOffset = moonHelio.clone().sub(earthHelio).length();
    // Moon's geocentric semi-major axis is 0.00257 AU; e ≈ 0.055.
    // Instantaneous distance 0.00243–0.00271.
    expect(localOffset).toBeGreaterThan(0.0024);
    expect(localOffset).toBeLessThan(0.0028);
  });

  it("composer output differs from parent alone by the local orbit (non-degenerate)", () => {
    // Direct scalar guard: if the composer regressed to just calling
    // itself on the parent, europa === jupiter and the diff would
    // collapse to zero.
    const europa = resolveHeliocentricDistanceAU("europa", TEST_DATE);
    const jupiter = resolveHeliocentricDistanceAU("jupiter", TEST_DATE);
    expect(Math.abs(europa - jupiter)).toBeGreaterThan(1e-5);
  });
});
