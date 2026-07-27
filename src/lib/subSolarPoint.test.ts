import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  computeBodyPoleQuaternion,
  computeSpinAngleRad,
  resolveBodyIauOrientation,
} from "./bodyOrientation";
import { BODIES_BY_ID } from "../data/celestialBodies";
import { initializeOrbitalEngine } from "./orbital/setup";
import { resolveHeliocentricPositionAU } from "./orbital/heliocentric";
import { dateToTDB } from "./orbital/time";

import earth2025 from "../test/fixtures/horizons/subsolar-earth-2025-01-01T000000Z.json";
import earth2026 from "../test/fixtures/horizons/subsolar-earth-2026-01-01T000000Z.json";
import earthEquinox from "../test/fixtures/horizons/subsolar-earth-2026-03-20T120000Z.json";
import jupiter2025 from "../test/fixtures/horizons/subsolar-jupiter-2025-01-01T000000Z.json";
import jupiter2026 from "../test/fixtures/horizons/subsolar-jupiter-2026-01-01T000000Z.json";
import jupiterMar from "../test/fixtures/horizons/subsolar-jupiter-2026-03-20T120000Z.json";
import mars2025 from "../test/fixtures/horizons/subsolar-mars-2025-01-01T000000Z.json";
import mars2026 from "../test/fixtures/horizons/subsolar-mars-2026-01-01T000000Z.json";
import marsMar from "../test/fixtures/horizons/subsolar-mars-2026-03-20T120000Z.json";
import mercury2025 from "../test/fixtures/horizons/subsolar-mercury-2025-01-01T000000Z.json";
import mercury2026 from "../test/fixtures/horizons/subsolar-mercury-2026-01-01T000000Z.json";
import mercuryMar from "../test/fixtures/horizons/subsolar-mercury-2026-03-20T120000Z.json";
import neptune2025 from "../test/fixtures/horizons/subsolar-neptune-2025-01-01T000000Z.json";
import neptune2026 from "../test/fixtures/horizons/subsolar-neptune-2026-01-01T000000Z.json";
import neptuneMar from "../test/fixtures/horizons/subsolar-neptune-2026-03-20T120000Z.json";
import saturn2025 from "../test/fixtures/horizons/subsolar-saturn-2025-01-01T000000Z.json";
import saturn2026 from "../test/fixtures/horizons/subsolar-saturn-2026-01-01T000000Z.json";
import saturnMar from "../test/fixtures/horizons/subsolar-saturn-2026-03-20T120000Z.json";
import uranus2025 from "../test/fixtures/horizons/subsolar-uranus-2025-01-01T000000Z.json";
import uranus2026 from "../test/fixtures/horizons/subsolar-uranus-2026-01-01T000000Z.json";
import uranusMar from "../test/fixtures/horizons/subsolar-uranus-2026-03-20T120000Z.json";
import venus2025 from "../test/fixtures/horizons/subsolar-venus-2025-01-01T000000Z.json";
import venus2026 from "../test/fixtures/horizons/subsolar-venus-2026-01-01T000000Z.json";
import venusMar from "../test/fixtures/horizons/subsolar-venus-2026-03-20T120000Z.json";

/**
 * Where the Sun stands overhead, checked against JPL Horizons.
 *
 * **Why this file exists.** Every other test in the orbital suite answers "is
 * the body in the right PLACE". None answered "is it FACING the right way", so
 * W6 shipped ~29 transcribed IAU rotation constants with a human being asked to
 * judge a terminator by eye as the only check. That is not a gate: a wrong W₀
 * renders as a perfectly plausible planet, and 0.06° of longitude — the actual
 * residual measured below — is about 7 km at Earth's equator. Nobody sees that
 * in a screenshot. This replaces the eyeball with an oracle.
 *
 * **What makes it independent.** The sub-solar point is a pure orientation
 * quantity: it moves if and only if the pole, W₀, Ẇ or the time scale is wrong.
 * JPL evaluates the same IAU model this catalog transcribes, but from JPL's own
 * copy of the numbers — so this falsifies *this repo's transcription*, which is
 * the named risk of the wave, rather than confirming it. And it crosses every
 * layer in one shot: ephemeris position, the ecliptic→scene remap, the
 * `makeBasis` pole frame, the spin, and TDB-vs-UT.
 *
 * **Light time is modelled, not fudged.** Horizons reports the sub-solar point
 * as it was when the light left, so the model is evaluated at
 * `t − lightTimeSeconds`. Earth turns 2.08° during those 8.3 minutes; ignoring
 * that would swamp everything measured here.
 *
 * **Measured longitude residuals**, max |Δ| over three epochs spanning
 * 2025-01 to 2026-03, in degrees:
 *
 *     mercury 0.011   venus 0.0002   earth 0.061   mars 0.024
 *     jupiter 0.056   saturn 0.055   uranus 0.034   neptune 0.037
 *
 * Earth is the loosest, and that is expected rather than a defect: Horizons
 * drives Earth with ITRF93 — full precession, nutation, polar motion, UT1 —
 * while the catalog ships the IAU/WGCCRE Earth expression, which its own report
 * calls approximate. Earth's 0.0605° is constant to four decimals across all
 * three epochs, i.e. a model offset and not drift. Every other body is checked
 * against the very model it transcribes, so those residuals are transcription
 * accuracy and nothing else.
 *
 * Regenerate the fixtures with:
 *   HORIZONS_MODE=subpoint node scripts/generate-horizons-fixtures.js
 */

const FIXTURES = [
  mercury2025,
  mercury2026,
  mercuryMar,
  venus2025,
  venus2026,
  venusMar,
  earth2025,
  earth2026,
  earthEquinox,
  mars2025,
  mars2026,
  marsMar,
  jupiter2025,
  jupiter2026,
  jupiterMar,
  saturn2025,
  saturn2026,
  saturnMar,
  uranus2025,
  uranus2026,
  uranusMar,
  neptune2025,
  neptune2026,
  neptuneMar,
];

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * One bound for every body rather than eight tuned ones. The largest measured
 * residual is 0.061°, and the defect class this exists to catch — a mistyped
 * digit in a transcribed constant, a swapped time scale, a flipped axis — moves
 * the sub-solar point by tenths of a degree at minimum. The negative-control
 * suite at the bottom pins that claim instead of leaving it asserted.
 */
const MAX_LON_ERROR_DEG = 0.1;

/**
 * Latitude is a **coarse** guard and is labelled as one. Horizons reports
 * planetodetic sub-observer latitude while this model produces planetocentric,
 * and the two differ by the body's flattening — negligible for Mercury and
 * Venus, but ~1.1° for Saturn. Converting would mean pulling each body's
 * flattening into the comparison and testing that too. Longitude already
 * carries the whole spin signal and cannot be right if the pole is wrong, so
 * latitude here only has to catch a grossly misplaced pole, which moves it by
 * tens of degrees.
 */
const MAX_LAT_ERROR_DEG = 1.5;

/** ΔT in 2026, i.e. the size of the error a UT-driven spin would make. */
const DELTA_T_SECONDS_2026 = 72;

/** Sub-solar body-fixed east longitude and latitude, from the app's own chain. */
function modelSubSolar(bodyId: string, at: Date) {
  const body = BODIES_BY_ID.get(bodyId);
  if (!body) throw new Error(`unknown body ${bodyId}`);

  const jdTDB = dateToTDB(at);

  // The Sun sits at the world origin, so the direction to it is the negated
  // heliocentric position. Scale mode never enters: this is a direction, and
  // `resolveHeliocentricPositionAU` is the physical-AU chain that deliberately
  // bypasses the didactic remap.
  const sunDir = resolveHeliocentricPositionAU(bodyId, at).negate().normalize();

  // body-fixed → scene is (pole basis) ∘ (spin about the pole), so the inverse
  // takes a scene direction into body-fixed coordinates.
  const toScene = computeBodyPoleQuaternion(body, jdTDB).multiply(
    new THREE.Quaternion().setFromAxisAngle(
      Y_AXIS,
      computeSpinAngleRad(body, jdTDB)
    )
  );
  const inBody = sunDir.applyQuaternion(toScene.invert());

  // Local +X is the prime meridian and R_y(+θ) carries +X toward −Z, which is
  // the direction of increasing east longitude.
  let lon = (Math.atan2(-inBody.z, inBody.x) * 180) / Math.PI;
  if (lon < 0) lon += 360;

  return { lonDeg: lon, latDeg: (Math.asin(inBody.y) * 180) / Math.PI };
}

function signedDeltaDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

/**
 * Horizons' longitude in **east** degrees, whichever sense it reported in.
 *
 * This is not bookkeeping — it is the trap this file nearly shipped past. IAU
 * planetographic longitude runs WEST for prograde rotators and EAST for
 * retrograde ones, with Earth, the Moon and the Sun conventionally EAST. Mars
 * first came back "wrong" by 162°, 39° and 47° at three epochs, which looks
 * exactly like a bad spin rate; it was a sign. The tells were that model + JPL
 * summed to 359.98° every time, and that latitude already matched.
 *
 * A hard-coded rule would still have been wrong: Venus and Uranus are
 * retrograde, so they report EAST like Earth does. The generator therefore
 * reads the sense out of Horizons' own header (`{West-longitude positive}`) and
 * stores it per fixture, and nothing here guesses.
 */
function eastLongitudeDeg(fixture: {
  subSolarLonDeg: number;
  longitudeSense: string;
}): number {
  return fixture.longitudeSense === "west"
    ? (360 - fixture.subSolarLonDeg) % 360
    : fixture.subSolarLonDeg;
}

function retardedInstant(fixture: { date: string; lightTimeSeconds: number }) {
  return new Date(
    new Date(fixture.date).getTime() - fixture.lightTimeSeconds * 1000
  );
}

beforeAll(() => {
  initializeOrbitalEngine();
});

describe("sub-solar point vs JPL Horizons", () => {
  for (const fixture of FIXTURES) {
    it(`${fixture.bodyId} at ${fixture.date}`, () => {
      const model = modelSubSolar(fixture.bodyId, retardedInstant(fixture));

      const jplEast = eastLongitudeDeg(fixture);
      const lonError = signedDeltaDeg(model.lonDeg, jplEast);
      const latError = model.latDeg - fixture.subSolarLatDeg;

      expect(
        Math.abs(lonError),
        `${fixture.bodyId} sub-solar longitude: model ${model.lonDeg.toFixed(4)}°E vs JPL ${jplEast.toFixed(4)}°E ` +
          `(reported ${fixture.subSolarLonDeg.toFixed(4)}° ${fixture.longitudeSense}, frame ${fixture.targetFrame}) — Δ ${lonError.toFixed(4)}°`
      ).toBeLessThan(MAX_LON_ERROR_DEG);

      expect(
        Math.abs(latError),
        `${fixture.bodyId} sub-solar latitude: model ${model.latDeg.toFixed(4)}° vs JPL ${fixture.subSolarLatDeg.toFixed(4)}° (Δ ${latError.toFixed(4)}°)`
      ).toBeLessThan(MAX_LAT_ERROR_DEG);
    });
  }
});

/**
 * The negative control, and the reason the suite above is a gate rather than a
 * coincidence. Passing tests prove *some* orientation reproduces JPL; they do
 * not prove the check is sensitive to the thing most likely to be wrong.
 *
 * Driving the spin from a raw UT day count instead of TDB is that thing: it is
 * a one-character mistake, it is invisible to every other test in this repo,
 * and it is the failure the wave's risk section names. Shifting the epoch by ΔT
 * must push every fast rotator clean out of the bound.
 */
describe("the bound is sensitive to a UT-instead-of-TDB spin", () => {
  for (const fixture of FIXTURES) {
    const orientation = resolveBodyIauOrientation(
      BODIES_BY_ID.get(fixture.bodyId)!
    );
    const shiftDeg =
      (Math.abs(orientation!.spinRateDegPerDay) * DELTA_T_SECONDS_2026) / 86400;

    // Mercury and Venus turn too slowly for ΔT to matter — 0.005° and 0.001°
    // respectively — so they cannot discriminate a time-scale error, and are
    // skipped rather than asserted against a bound they would pass for the
    // wrong reason. They still carry full weight in the suite above, where they
    // pin W₀ and the pole to 0.011° and 0.0002°.
    //
    // The 2× margin is what a *cancellation* needs: the shifted error is
    // |shift ∓ residual|, so a body must move by more than the bound plus its
    // own residual before the control means anything. At 2× the worst case is
    // 0.2 − 0.061 = 0.139°, still outside the bound. This keeps Mars (0.292°),
    // which a 3× guard would have excluded despite it discriminating fine.
    if (shiftDeg < 2 * MAX_LON_ERROR_DEG) continue;

    it(`${fixture.bodyId} at ${fixture.date}`, () => {
      const wrong = modelSubSolar(
        fixture.bodyId,
        new Date(
          retardedInstant(fixture).getTime() + DELTA_T_SECONDS_2026 * 1000
        )
      );
      const wrongError = Math.abs(
        signedDeltaDeg(wrong.lonDeg, eastLongitudeDeg(fixture))
      );

      expect(
        wrongError,
        `${fixture.bodyId}: a UT-driven spin is off by only ${wrongError.toFixed(4)}°, so this fixture cannot catch it`
      ).toBeGreaterThan(MAX_LON_ERROR_DEG);
    });
  }
});
