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
] as const;
const PREFERRED_BASELINE_DATE = "2020-01-01T00:00:00Z";
const COARSE_KEPLER_TOLERANCES = {
  maxAngularErrorDeg: 150,
  maxDistanceErrorRatio: 0.6,
} as const;
const TIGHT_ANGLE_BODY_SET = new Set([
  "mercury",
  "earth",
  "mars",
  "neptune",
  "pluto",
  "vesta",
]);
const TIGHT_ANGLE_TOLERANCE_DEG = 65;

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
    it("reports Kepler honestly while the analytical provider remains a stub", () => {
      const date = new Date("2020-01-01");
      const testBodies = ["mercury", "earth", "moon", "titan", "triton"];

      for (const bodyId of testBodies) {
        const provenance = orbitalEngine.getProvenance(bodyId, date);
        const metadata = getOrbitalMetadata(bodyId);

        expect(provenance.provider).toBe("kepler");
        expect(provenance.model).toBe("Kepler");
        expect(provenance.isFallback).toBe(true);

        if (metadata?.primaryModel && metadata.primaryModel !== "Kepler") {
          expect(provenance.plannedModel).toBe(metadata.primaryModel);
        } else {
          expect(provenance.plannedModel).toBeUndefined();
        }
      }
    });

    it("keeps the raw calculation metadata available for planned analytical models", () => {
      const date = new Date("2020-01-01");

      const mercury = orbitalEngine.calculatePosition("mercury", date);
      const jupiter = orbitalEngine.calculatePosition("jupiter", date);
      const moon = orbitalEngine.calculatePosition("moon", date);

      expect(mercury.model).toBe("VSOP2013");
      expect(jupiter.model).toBe("TOP2013");
      expect(moon.model).toBe("ELP2000");
      expect(mercury.provenance).toContain("Kepler");
    });
  });

  describe("Representative Bodies", () => {
    for (const bodyId of REPRESENTATIVE_BODIES) {
      it(`keeps ${bodyId} within current Kepler fallback tolerances`, () => {
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

        expect(angleError).toBeLessThan(
          COARSE_KEPLER_TOLERANCES.maxAngularErrorDeg
        );
        expect(distanceError).toBeLessThan(
          COARSE_KEPLER_TOLERANCES.maxDistanceErrorRatio
        );

        if (TIGHT_ANGLE_BODY_SET.has(bodyId)) {
          expect(angleError).toBeLessThan(TIGHT_ANGLE_TOLERANCE_DEG);
        }
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
});
