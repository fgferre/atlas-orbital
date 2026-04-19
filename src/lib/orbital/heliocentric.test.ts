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

  it("an unknown body id collapses to the origin instead of throwing", () => {
    const p = resolveHeliocentricPositionAU(
      "this-body-does-not-exist",
      TEST_DATE
    );
    expect(p.length()).toBe(0);
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
});
