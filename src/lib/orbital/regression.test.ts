import { beforeAll, describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { orbitalEngine, initializeOrbitalEngine } from "./index";
import { getOrbitalMetadata } from "./registry";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";

/**
 * Numerical Regression Tests
 *
 * Compares orbital engine output against on-disk NASA JPL Horizons fixtures.
 * Fixtures are parent-centered and use the J2000 ecliptic frame so they are
 * directly comparable with Atlas' local orbital engine outputs.
 */

interface HorizonsFixture {
  bodyId: string;
  date: string;
  center: string;
  referenceFrame: string;
  source: string;
  position: {
    x: number;
    y: number;
    z: number;
    unit: string;
  };
  velocity: {
    x: number;
    y: number;
    z: number;
    unit: string;
  };
}

const FIXTURES_DIR = fileURLToPath(
  new URL("../../test/fixtures/horizons/", import.meta.url)
);
const REPRESENTATIVE_BODIES = [
  // Original 12 (checked at all Multi-Epoch Dates below)
  "mercury",
  "earth",
  "moon",
  "mars",
  "io",
  "titan",
  "oberon",
  "neptune",
  "pluto",
  "ceres",
  "vesta",
  "triton",
  // Phase-A additions: 15 satellites + 1 asteroid
  "europa",
  "ganymede",
  "callisto",
  "mimas",
  "enceladus",
  "tethys",
  "dione",
  "rhea",
  "iapetus",
  "miranda",
  "ariel",
  "umbriel",
  "titania",
  "phobos",
  "deimos",
  "pallas",
] as const;
const PREFERRED_BASELINE_DATE = "2025-01-01T00:00:00Z";

/**
 * Multi-epoch coverage is the full 28-body representative set. Keeping
 * these two constants as aliases is the cheapest invariant against a
 * recurrence of the 12-vs-28 drift that created the Phase 3 tail.
 */
const MULTI_EPOCH_BODIES = REPRESENTATIVE_BODIES;

/**
 * Three epochs for multi-epoch drift checks. Pinned to the same reference
 * epoch used by the analytical element blocks (2025-01-01), plus a
 * half-year and a full-year into the future so we watch the drift
 * envelope grow in the direction users will most often scrub.
 */
const MULTI_EPOCH_DATES = [
  "2025-01-01T00:00:00Z",
  "2025-07-01T00:00:00Z",
  "2026-01-01T00:00:00Z",
] as const;

/**
 * Per-family regression thresholds (Phase 4 targets from PLAN.md).
 *
 * The analytical provider is now active so these are enforced as real
 * numerical gates. Families that fall back to Kepler keep coarse bounds.
 */
const TOLERANCES: Record<
  string,
  { maxAngularErrorDeg: number; maxDistanceErrorRatio: number }
> = {
  // VSOP87D planets + Pluto-Meeus
  mercury: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  venus: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  earth: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  mars: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  jupiter: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  saturn: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  uranus: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  neptune: { maxAngularErrorDeg: 0.1, maxDistanceErrorRatio: 0.002 },
  pluto: { maxAngularErrorDeg: 0.2, maxDistanceErrorRatio: 0.005 },
  // ELP/MPP02-trunc Moon
  moon: { maxAngularErrorDeg: 0.2, maxDistanceErrorRatio: 0.005 },
  // All *Osculating2Body satellites and all AsteroidOsculating bodies are now
  // fixture-derived from Horizons at 2025-01-01 (see
  // scripts/derive-elements-from-fixtures.js and satellites.ts /
  // asteroids.ts). They match the fixture to sub-arcsecond at epoch, so we
  // hold them to the Phase-4 tight targets: < 0.5 deg angular, < 1%
  // distance. Multi-epoch drift is evaluated separately with wider bounds.
  io: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  europa: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  ganymede: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  callisto: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  mimas: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  enceladus: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  tethys: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  dione: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  rhea: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  titan: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  iapetus: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  miranda: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  ariel: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  umbriel: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  titania: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  oberon: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  phobos: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  deimos: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  ceres: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  pallas: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  vesta: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.01 },
  // Kepler-only bodies keep the original coarse envelope
  triton: { maxAngularErrorDeg: 150, maxDistanceErrorRatio: 0.6 },
} as const;

const KEPLER_COARSE_TOLERANCES = {
  maxAngularErrorDeg: 150,
  maxDistanceErrorRatio: 0.6,
} as const;

/**
 * Per-body tolerance overrides for multi-epoch (Priority B) tests.
 * Satellites still drift when propagated months away from the fixture epoch
 * because only the mean anomaly advances — the orientation elements stay
 * frozen and no resonance / J2 / tidal terms are modelled. These bounds
 * capture the real residual as a documented performance signal.
 *
 * Entries here *replace* (not stack with) the main TOLERANCES for the
 * multi-epoch describe block only.
 */
const MULTI_EPOCH_OVERRIDES: Partial<
  Record<string, { maxAngularErrorDeg: number; maxDistanceErrorRatio: number }>
> = {
  // Observed drifts from epoch 2025-01-01. The analytical satellites now
  // carry an explicit mean motion (`nDegPerDay` in satellites.ts) instead of
  // deriving one from the osculating semi-major axis via Kepler III, which
  // removed the dominant phase error (Phobos went from 165° to 2.0°). What
  // remains is unmodelled perturbation content: element orientation is
  // frozen at epoch, so nodal / apsidal precession and short-period terms
  // still accumulate.
  //
  // CAVEAT: the mean motions of every body except Mimas and Phobos were
  // fitted in-sample against these same two off-epoch fixtures, so the
  // residuals below are a goodness-of-fit, not an independent accuracy
  // measurement. The bounds still work as regression gates (they catch a
  // change in behaviour) but must not be read as validated accuracy.
  //
  // Worst |angular| / |distance| error across the three epochs, measured
  // 2026-07-23 through `orbitalEngine.calculatePosition`:
  //   phobos 1.954° / 3.11%   mimas    2.611° / 3.84%   miranda 1.292° / 0.03%
  //   tethys 0.934° / 0.12%   enceladus 0.874° / 0.45%  io      0.520° / 0.82%
  //   europa 0.393° / 1.69%   titania  0.213° / 0.09%   deimos  0.154° / 0.01%
  //   oberon 0.151° / 0.17%   ganymede 0.117° / 0.01%   iapetus 0.083° / 0.09%
  //   dione  0.077° / 0.07%   rhea     0.056° / 0.02%   umbriel 0.049° / 0.03%
  //   titan  0.015° / 0.02%   callisto 0.011° / 0.03%   ariel   0.008° / 0.00%
  //
  // Bounds are sized at roughly 1.3–2× the observed residual (never below a
  // 0.3° / 0.2% floor, which keeps the gates from tripping on rounding).

  // Martian
  phobos: { maxAngularErrorDeg: 2.5, maxDistanceErrorRatio: 0.04 },
  deimos: { maxAngularErrorDeg: 0.5, maxDistanceErrorRatio: 0.002 },

  // Galilean
  io: { maxAngularErrorDeg: 0.8, maxDistanceErrorRatio: 0.012 },
  europa: { maxAngularErrorDeg: 0.6, maxDistanceErrorRatio: 0.02 },
  ganymede: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  callisto: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },

  // Saturnian
  mimas: { maxAngularErrorDeg: 3.5, maxDistanceErrorRatio: 0.05 },
  enceladus: { maxAngularErrorDeg: 1.2, maxDistanceErrorRatio: 0.008 },
  tethys: { maxAngularErrorDeg: 1.3, maxDistanceErrorRatio: 0.003 },
  dione: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  rhea: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  titan: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  iapetus: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },

  // Uranian
  miranda: { maxAngularErrorDeg: 1.8, maxDistanceErrorRatio: 0.002 },
  ariel: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  umbriel: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.002 },
  titania: { maxAngularErrorDeg: 0.4, maxDistanceErrorRatio: 0.002 },
  oberon: { maxAngularErrorDeg: 0.3, maxDistanceErrorRatio: 0.004 },

  // Pallas (asteroid) sits comfortably within the 0.5°/1% family default —
  // no override needed.
};

const BODY_PARENT_BY_ID = new Map(
  SOLAR_SYSTEM_BODIES.map((body) => [body.id, body.parentId])
);

function loadAllFixtures(): HorizonsFixture[] {
  if (!existsSync(FIXTURES_DIR)) {
    return [];
  }

  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith(".json") && file !== "index.json")
    .map((file) =>
      JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8"))
    ) as HorizonsFixture[];
}

function findRepresentativeFixture(
  fixtures: HorizonsFixture[],
  bodyId: (typeof REPRESENTATIVE_BODIES)[number]
): HorizonsFixture | null {
  return (
    fixtures.find(
      (fixture) =>
        fixture.bodyId === bodyId && fixture.date === PREFERRED_BASELINE_DATE
    ) ??
    fixtures.find((fixture) => fixture.bodyId === bodyId) ??
    null
  );
}

function findFixtureAt(
  fixtures: HorizonsFixture[],
  bodyId: string,
  date: string
): HorizonsFixture | null {
  return fixtures.find((f) => f.bodyId === bodyId && f.date === date) ?? null;
}

function fixturePositionToEngineFrame(fixture: HorizonsFixture): THREE.Vector3 {
  return new THREE.Vector3(
    fixture.position.x,
    fixture.position.z,
    -fixture.position.y
  );
}

/**
 * Calculate angular separation between two position vectors
 * Returns angle in degrees
 */
function angularSeparation(pos1: THREE.Vector3, pos2: THREE.Vector3): number {
  const dot = pos1.dot(pos2);
  const mag1 = pos1.length();
  const mag2 = pos2.length();
  const cosAngle = dot / (mag1 * mag2);
  // Clamp to [-1, 1] to avoid numerical errors
  const clampedCos = Math.max(-1, Math.min(1, cosAngle));
  return (Math.acos(clampedCos) * 180) / Math.PI;
}

describe("Numerical Regression Tests vs Horizons", () => {
  const fixtures = loadAllFixtures();

  beforeAll(() => {
    initializeOrbitalEngine();
  });

  it("loads real Horizons fixtures from disk for every representative body", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(
      REPRESENTATIVE_BODIES.length
    );

    const missingBodies = REPRESENTATIVE_BODIES.filter(
      (bodyId) => !findRepresentativeFixture(fixtures, bodyId)
    );

    expect(missingBodies).toEqual([]);
  });

  it("uses authentic parent-centered ecliptic fixtures", () => {
    for (const bodyId of REPRESENTATIVE_BODIES) {
      const fixture = findRepresentativeFixture(fixtures, bodyId);
      expect(fixture).not.toBeNull();
      expect(fixture?.source).toContain("Horizons");
      expect(fixture?.referenceFrame).toBe("J2000_ECLIPTIC");
      expect(fixture?.position.unit).toBe("AU");
      expect(fixture?.velocity.unit).toBe("AU/day");
    }
  });

  describe("Position Consistency", () => {
    it("returns consistent positions for the same date", () => {
      const date = new Date("2020-06-15T12:00:00Z");

      const result1 = orbitalEngine.calculatePosition("earth", date);
      const result2 = orbitalEngine.calculatePosition("earth", date);

      expect(result1.position.x).toBe(result2.position.x);
      expect(result1.position.y).toBe(result2.position.y);
      expect(result1.position.z).toBe(result2.position.z);
    });

    it("returns different positions for different dates", () => {
      const date1 = new Date("2020-01-01T00:00:00Z");
      const date2 = new Date("2020-06-01T00:00:00Z");

      const result1 = orbitalEngine.calculatePosition("mars", date1);
      const result2 = orbitalEngine.calculatePosition("mars", date2);

      const dist = result1.position.distanceTo(result2.position);
      expect(dist).toBeGreaterThan(0.1);
    });
  });

  describe("Provenance Tracking", () => {
    it("reports the active analytical model for supported bodies", () => {
      const date = new Date("2020-01-01");
      const analyticalBodies = ["mercury", "earth", "moon", "titan"];

      for (const bodyId of analyticalBodies) {
        const provenance = orbitalEngine.getProvenance(bodyId, date);
        const metadata = getOrbitalMetadata(bodyId);

        expect(provenance.provider).toBe("ephem");
        expect(provenance.isFallback).toBe(false);
        if (metadata?.primaryModel) {
          expect(provenance.model).toBe(metadata.primaryModel);
        }
        expect(provenance.plannedModel).toBeUndefined();
      }
    });

    it("reports Kepler honestly for bodies without an analytical branch", () => {
      const date = new Date("2020-01-01");
      const keplerBodies = ["triton", "charon", "eris"];

      for (const bodyId of keplerBodies) {
        const provenance = orbitalEngine.getProvenance(bodyId, date);
        expect(provenance.provider).toBe("kepler");
        expect(provenance.model).toBe("Kepler");
        expect(provenance.isFallback).toBe(true);
      }
    });

    it("exposes the real analytical model on calculation results", () => {
      const date = new Date("2020-01-01");

      const mercury = orbitalEngine.calculatePosition("mercury", date);
      const jupiter = orbitalEngine.calculatePosition("jupiter", date);
      const moon = orbitalEngine.calculatePosition("moon", date);
      const ceres = orbitalEngine.calculatePosition("ceres", date);

      expect(mercury.model).toBe("VSOP87D");
      expect(jupiter.model).toBe("VSOP87D");
      expect(moon.model).toBe("ELP-MPP02-trunc");
      expect(ceres.model).toBe("AsteroidOsculating");
      expect(mercury.isFallback).toBe(false);
    });
  });

  describe("Representative Bodies", () => {
    for (const bodyId of REPRESENTATIVE_BODIES) {
      it(`keeps ${bodyId} within its family tolerance vs. Horizons`, () => {
        const fixture = findRepresentativeFixture(fixtures, bodyId);
        expect(fixture).not.toBeNull();

        if (!fixture) {
          return;
        }

        const result = orbitalEngine.calculatePosition(
          bodyId,
          new Date(fixture.date),
          BODY_PARENT_BY_ID.get(bodyId)
        );
        const expected = fixturePositionToEngineFrame(fixture);
        const angleError = angularSeparation(result.position, expected);
        const distanceError =
          Math.abs(result.distanceAU - expected.length()) / expected.length();

        const tol = TOLERANCES[bodyId] ?? KEPLER_COARSE_TOLERANCES;
        expect(angleError).toBeLessThan(tol.maxAngularErrorDeg);
        expect(distanceError).toBeLessThan(tol.maxDistanceErrorRatio);
      });
    }

    it("returns to approximately the same position after one Earth year", () => {
      const startDate = new Date("2020-01-01T00:00:00Z");
      const endDate = new Date("2021-01-01T00:00:00Z");

      const startPos = orbitalEngine.calculatePosition(
        "earth",
        startDate
      ).position;
      const endPos = orbitalEngine.calculatePosition("earth", endDate).position;

      const angleDiff = angularSeparation(startPos, endPos);
      expect(angleDiff).toBeLessThan(5.0);
    });
  });

  describe("Validity-Window Routing (Priority C)", () => {
    it("routes Ceres to Kepler fallback outside 2000–2050 validity window", () => {
      const outOfWindowDate = new Date("1890-01-01T00:00:00Z");
      const result = orbitalEngine.calculatePosition("ceres", outOfWindowDate);
      // The engine must fall back to Kepler for dates outside the asteroid window.
      expect(result.isFallback).toBe(true);
      expect(result.model).toBe("Kepler");
    });

    it("Ceres at 1890-01-01 has a valid Horizons fixture and falls within Kepler coarse distance", () => {
      const fixture = findFixtureAt(fixtures, "ceres", "1890-01-01T00:00:00Z");
      expect(fixture).not.toBeNull();

      if (!fixture) return;

      const result = orbitalEngine.calculatePosition(
        "ceres",
        new Date(fixture.date)
      );

      expect(result.isFallback).toBe(true);

      const expected = fixturePositionToEngineFrame(fixture);
      const distanceError =
        Math.abs(result.distanceAU - expected.length()) / expected.length();
      // Kepler fallback at 1890 can drift significantly — just verify it is in
      // the right solar-distance ballpark (within the coarse bound).
      expect(distanceError).toBeLessThan(
        KEPLER_COARSE_TOLERANCES.maxDistanceErrorRatio
      );
    });
  });

  describe("Multi-Epoch Drift (Priority B)", () => {
    it("has a fixture for every body × every epoch", () => {
      const missing: string[] = [];
      for (const bodyId of MULTI_EPOCH_BODIES) {
        for (const date of MULTI_EPOCH_DATES) {
          if (!findFixtureAt(fixtures, bodyId, date)) {
            missing.push(`${bodyId} @ ${date.split("T")[0]}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    for (const bodyId of MULTI_EPOCH_BODIES) {
      for (const date of MULTI_EPOCH_DATES) {
        it(`keeps ${bodyId} within tolerance at ${date.split("T")[0]}`, () => {
          const fixture = findFixtureAt(fixtures, bodyId, date);
          expect(fixture).not.toBeNull();

          if (!fixture) {
            return;
          }

          const result = orbitalEngine.calculatePosition(
            bodyId,
            new Date(fixture.date),
            BODY_PARENT_BY_ID.get(bodyId)
          );
          const expected = fixturePositionToEngineFrame(fixture);
          const angleError = angularSeparation(result.position, expected);
          const distanceError =
            Math.abs(result.distanceAU - expected.length()) / expected.length();

          // Multi-epoch overrides take precedence for bodies with known drift.
          const tol =
            MULTI_EPOCH_OVERRIDES[bodyId] ??
            TOLERANCES[bodyId] ??
            KEPLER_COARSE_TOLERANCES;
          expect(angleError).toBeLessThan(tol.maxAngularErrorDeg);
          expect(distanceError).toBeLessThan(tol.maxDistanceErrorRatio);
        });
      }
    }
  });
});
