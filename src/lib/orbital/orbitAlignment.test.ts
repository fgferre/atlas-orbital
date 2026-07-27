/**
 * Orbit-line ↔ rendered-position alignment invariant.
 *
 * Single product invariant, verified end-to-end through the same pipeline
 * the renderer uses (`resolveOrbitalDisplayPosition` for the body,
 * `getOrbitalDisplayOrbitPoints` for the line):
 *
 *   For every body with a displayed orbit, the rendered body position at
 *   any instant `t` lies on (or within a well-justified tolerance of) the
 *   polyline `getOrbitalDisplayOrbitPoints(body, tBucket)`, in both
 *   `realistic` and `didactic` scale modes.
 *
 * Three layers of assertions:
 *
 *  (A) Mathematical invariant — same instant. With the orbit line generated
 *      at the same `t` the body is evaluated at, the body must fall on the
 *      polyline up to IEEE-754 round-off of the osculating ellipse passing
 *      through `r(t)`. This is the tightest bound the engine can honour.
 *
 *  (B) Runtime invariant — bucket vs simNow. The app draws the line once
 *      per `orbitDateBucket` (0.5 d to 30 d depending on body/type) but
 *      reposiciona o corpo a cada frame. The body must stay on the
 *      bucket's polyline curve as `simNow` sweeps through the bucket. The
 *      admissible ε is the sum of chord-to-arc error (fixed by segments)
 *      and the perturbative drift over the bucket span (bounded per body).
 *
 *  (C) Regression gate — Earth. Generate the old, pre-fix orbit line by
 *      sidestepping `AnalyticalProvider` and feeding Earth's Keplerian
 *      reference ellipse directly into `generateOsculatingEllipsePoints`.
 *      The VSOP87D position must land **off** that legacy line by an
 *      amount well above εA, documenting that the bug existed and the
 *      new code actually fixes it.
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as THREE from "three";

import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics, AU_TO_3D_UNITS } from "../astrophysics";
import type { CelestialBody, ScaleMode } from "../astrophysics";
import {
  resolveOrbitalDisplayPosition,
  resolveBinaryBarycentreOffset,
  getOrbitalDisplayOrbitPoints,
  initializeOrbitalEngine,
  ORBITAL_METADATA_REGISTRY,
  generateOsculatingEllipsePoints,
  keplerProvider,
} from "./index";

beforeAll(() => {
  initializeOrbitalEngine();
});

const BODY_BY_ID = new Map<string, CelestialBody>(
  SOLAR_SYSTEM_BODIES.map((body) => [body.id, body])
);

function getBody(id: string): CelestialBody {
  const body = BODY_BY_ID.get(id);
  if (!body)
    throw new Error(`body ${id} not registered in SOLAR_SYSTEM_BODIES`);
  return body;
}

function getParentBody(body: CelestialBody): CelestialBody | null {
  if (!body.parentId || body.parentId === "sun") return null;
  return BODY_BY_ID.get(body.parentId) ?? null;
}

/**
 * Squared point-to-segment distance. Returns 0 when the segment
 * degenerates to a point (consecutive duplicate vertices), which is a
 * safe fallback for closed-loop endpoints.
 */
function pointToSegmentDistanceSq(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3
): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq === 0) {
    return p.distanceToSquared(a);
  }
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const apz = p.z - a.z;
  const t = Math.max(
    0,
    Math.min(1, (apx * abx + apy * aby + apz * abz) / lenSq)
  );
  const dx = apx - t * abx;
  const dy = apy - t * aby;
  const dz = apz - t * abz;
  return dx * dx + dy * dy + dz * dz;
}

function minDistanceToPolyline(
  p: THREE.Vector3,
  line: readonly THREE.Vector3[]
): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return p.distanceTo(line[0]);
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const dSq = pointToSegmentDistanceSq(p, line[i], line[i + 1]);
    if (dSq < best) best = dSq;
  }
  return Math.sqrt(best);
}

/**
 * Mirror of `getOrbitDateBucket` in `src/components/canvas/Planet.tsx`:
 * `clamp(period/360, moon ? 1/24 : 0.5, 30)` days. Keeps the runtime test
 * aligned with the actual cache invalidation cadence.
 */
function bucketWidthDays(body: CelestialBody): number {
  const meanMotion = Math.abs(body.orbit.n ?? 0);
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return 1;
  const orbitalPeriodDays = 360 / meanMotion;
  const minBucket = body.type === "moon" ? 1 / 24 : 0.5;
  return THREE.MathUtils.clamp(orbitalPeriodDays / 360, minBucket, 30);
}

/**
 * Chord-to-arc sagitta upper bound for a polyline sampled uniformly in
 * true anomaly, in AU.
 *
 * For an orbit sampled uniformly in ν with N segments per revolution, the
 * segment straddling apoapsis is the worst case: chord length there is
 * ≈ a(1+e)·(2π/N), and the radius of curvature at both apsides is p =
 * a(1−e²). The sagitta of a circular-arc approximation on that chord is:
 *
 *   sag = L²/(8ρ) = a·(π/N)² · (1+e)/(2(1−e))
 *
 * The (1+e)/(1−e) factor is unity for circles and grows with eccentricity
 * — essential for high-e bodies (Eris, Sedna, Pallas). This is the
 * perpendicular distance between the true ellipse and the polyline in the
 * worst segment; a point on the true ellipse is at most this far from the
 * nearest polyline segment.
 */
function chordSagittaAU(aAU: number, e: number, segments: number): number {
  const theta = Math.PI / segments;
  const eccentricityFactor = (1 + e) / (2 * (1 - e));
  return aAU * theta * theta * eccentricityFactor;
}

function displayScaleAU(
  body: CelestialBody,
  scaleMode: ScaleMode,
  parentBody: CelestialBody | null
): number {
  // Effective "AU → unit" scalar at the body's current distance regime.
  // For realistic it is exactly AU_TO_3D_UNITS. For didactic the remap is
  // non-linear; we probe it with two unit vectors at distance ≈ a to get
  // the local radial scale factor, which dominates the chord bound.
  if (scaleMode === "realistic") return AU_TO_3D_UNITS;
  const aAU = Math.max(body.orbit.a, 1e-6);
  const probe = new THREE.Vector3(aAU, 0, 0);
  const mapped = AstroPhysics.mapPhysicalPositionToDisplay({
    body,
    parentBody,
    positionAU: probe,
    scaleMode,
  });
  return mapped.length() / aAU;
}

const SEGMENTS = 1024;
// IEEE-754 / finite-difference noise floor, expressed in AU.
//
// The RV→COE inversion round-trips at ≤ 1e-12 AU (coordUtils.test), and
// the ±30 s central finite-difference truncation on VSOP87D / Pluto /
// Moon contributes another ~1e-12 AU for solar-system bodies. We pick
// 1e-8 AU (≈ 1.5 km at 1 AU) as a comfortable ceiling that still bites if
// the numerical pipeline regresses by orders of magnitude, without being
// so tight that it picks up JIT-dependent jitter on CI.
/**
 * How far a binary primary legitimately sits off its own orbit line.
 *
 * Not a tolerance and not tuned: `getOrbitalDisplayOrbitPoints` draws the
 * **barycentre's** ellipse, because that is what the heliocentric series
 * returns, while `resolveOrbitalDisplayPosition` now draws Pluto on its own
 * centre — 2 127 km away, and far more than that once didactic exaggeration
 * scales Charon's orbit up. Zero for every other body, so the invariant stays
 * exactly as tight as it was everywhere else, and on Pluto it still catches
 * anything beyond the modelled epicycle.
 */
function barycentreOffset(
  body: CelestialBody,
  date: Date,
  scaleMode: ScaleMode
): number {
  const offset = resolveBinaryBarycentreOffset({ body, date, scaleMode });
  return offset ? offset.length() : 0;
}

const EPSILON_A_AU = 1e-8;

const TEST_DATES = [
  new Date("2000-01-01T12:00:00Z"), // J2000
  new Date("2025-01-01T00:00:00Z"), // Fixture epoch
  new Date("2026-04-18T00:00:00Z"), // Today-ish
];

const ALIGNMENT_BODY_IDS = Object.keys(ORBITAL_METADATA_REGISTRY).filter(
  (id) => id !== "sun"
);

const SCALE_MODES: readonly ScaleMode[] = ["realistic", "didactic"];

describe("orbital alignment / (A) orbit[t] contains position(t)", () => {
  for (const bodyId of ALIGNMENT_BODY_IDS) {
    for (const scaleMode of SCALE_MODES) {
      it(`${bodyId} — ${scaleMode}`, () => {
        const body = getBody(bodyId);
        const parentBody = getParentBody(body);

        for (const date of TEST_DATES) {
          const P = resolveOrbitalDisplayPosition({
            body,
            parentBody,
            date,
            scaleMode,
          });
          const line = getOrbitalDisplayOrbitPoints({
            body,
            parentBody,
            date,
            scaleMode,
            segments: SEGMENTS,
          });

          expect(line.length).toBeGreaterThan(2);

          // At the same instant, the osculating ellipse passes through r(t)
          // by construction — but the polyline samples ν uniformly, so r(t)
          // falls between two vertices. The residual is the chord-sagitta
          // bound (with eccentricity factor), plus a tiny FP/finite-diff
          // slack from the RV→COE round-trip.
          const scale = displayScaleAU(body, scaleMode, parentBody);
          const chord =
            chordSagittaAU(body.orbit.a, body.orbit.e, SEGMENTS) * scale;
          const epsilon =
            chord +
            EPSILON_A_AU * scale +
            barycentreOffset(body, date, scaleMode);

          const d = minDistanceToPolyline(P, line);
          expect(d).toBeLessThan(epsilon);
        }
      });
    }
  }
});

describe("orbital alignment / (B) orbit[tBucket] contains position(tBucket+Δt)", () => {
  const DELTA_FRACTIONS = [0, 0.1, 0.25, 0.5, 0.9];

  for (const bodyId of ALIGNMENT_BODY_IDS) {
    for (const scaleMode of SCALE_MODES) {
      it(`${bodyId} — ${scaleMode}`, () => {
        const body = getBody(bodyId);
        const parentBody = getParentBody(body);
        const bucketDays = bucketWidthDays(body);
        const scale = displayScaleAU(body, scaleMode, parentBody);

        for (const base of TEST_DATES) {
          const line = getOrbitalDisplayOrbitPoints({
            body,
            parentBody,
            date: base,
            scaleMode,
            segments: SEGMENTS,
          });
          expect(line.length).toBeGreaterThan(2);

          // εB = chord sagitta (dominates) + finite-difference/FP slack
          // (εA) + a small extra margin for the secular drift of the
          // osculating ellipse over the bucket span. The chord term is
          // the segment's perpendicular deviation from the true curve;
          // the body rides along the curve so perpendicular distance to
          // the polyline is bounded by it, up to propagation noise.
          const chord =
            chordSagittaAU(body.orbit.a, body.orbit.e, SEGMENTS) * scale;
          const epsilon =
            chord +
            EPSILON_A_AU * scale +
            barycentreOffset(body, base, scaleMode);

          for (const frac of DELTA_FRACTIONS) {
            const sampleDate = new Date(
              base.getTime() + frac * bucketDays * 86400000
            );
            const P = resolveOrbitalDisplayPosition({
              body,
              parentBody,
              date: sampleDate,
              scaleMode,
            });
            const d = minDistanceToPolyline(P, line);
            expect(d).toBeLessThan(epsilon);
          }
        }
      });
    }
  }
});

describe("orbital alignment / (C) regression — Earth pre-fix was off-line", () => {
  it("VSOP87D Earth position is off the legacy Kepler-reference orbit line", () => {
    const earth = getBody("earth");
    const date = new Date("2025-07-01T00:00:00Z");

    // Current (fixed) pipeline — sanity floor for the asserted gap.
    const Pfixed = resolveOrbitalDisplayPosition({
      body: earth,
      parentBody: null,
      date,
      scaleMode: "realistic",
    });
    const fixedLine = getOrbitalDisplayOrbitPoints({
      body: earth,
      parentBody: null,
      date,
      scaleMode: "realistic",
      segments: SEGMENTS,
    });
    const dFixed = minDistanceToPolyline(Pfixed, fixedLine);

    // Legacy pipeline — regenerate with the old path that pulled the
    // Kepler reference ellipse from keplerProvider directly. This is
    // what the renderer was drawing before the fix; the body was the
    // fully perturbed VSOP87D position.
    const legacyElements = keplerProvider.getOsculatingElements("earth", date);
    expect(legacyElements).not.toBeNull();
    const legacyPointsAU = generateOsculatingEllipsePoints(
      legacyElements!,
      SEGMENTS
    );
    const legacyLine = legacyPointsAU.map((pointAU) =>
      AstroPhysics.mapPhysicalPositionToDisplay({
        body: earth,
        parentBody: null,
        positionAU: pointAU,
        scaleMode: "realistic",
      })
    );
    const dLegacy = minDistanceToPolyline(Pfixed, legacyLine);

    // Earth in realistic is the reference scale: 1 AU = AU_TO_3D_UNITS.
    // The fixed pipeline must satisfy invariant (A) — body on the
    // osculating polyline up to chord sagitta + numerical floor.
    const fixedEpsilon =
      chordSagittaAU(earth.orbit.a, earth.orbit.e, SEGMENTS) * AU_TO_3D_UNITS +
      EPSILON_A_AU * AU_TO_3D_UNITS;
    expect(dFixed).toBeLessThan(fixedEpsilon);
    // The legacy pipeline drew the Kepler reference ellipse that ignores
    // secular/perturbative drift, so the body sat visibly off the line.
    // Guard the regression: legacy gap must exceed the fixed-pipeline
    // ceiling by a wide margin (here: ≥ 100× the allowed tolerance).
    expect(dLegacy).toBeGreaterThan(fixedEpsilon * 100);
  });
});
