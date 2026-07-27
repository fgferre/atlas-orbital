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

/**
 * Where the Sun stands overhead, checked against JPL Horizons across 200 years.
 *
 * **Why this file exists.** Every other test in the orbital suite answers "is
 * the body in the right PLACE". None answered "is it FACING the right way", so
 * W6 shipped ~29 transcribed IAU rotation constants with a human being asked to
 * judge a terminator by eye as the only check. That is not a gate: a wrong W₀
 * renders as a perfectly plausible planet, and 0.06° of longitude — the actual
 * residual measured here — is about 7 km at Earth's equator.
 *
 * **What makes it independent.** The sub-solar point is a pure orientation
 * quantity: it moves if and only if the pole, W₀, Ẇ or the time scale is wrong.
 * JPL evaluates the same IAU model this catalog transcribes, but from JPL's own
 * copy of the numbers — so this falsifies *this repo's transcription*, which is
 * the named risk of the wave, rather than confirming it. And it crosses every
 * layer in one shot: ephemeris position, the ecliptic→scene remap, the
 * `makeBasis` pole frame, the spin, and TDB-vs-UT.
 *
 * **Light time is modelled, not fudged.** Horizons reports the point as it was
 * when the light left, so the model is evaluated at `t − lightTimeSeconds`.
 * Earth turns 2.08° during those 8.3 minutes.
 *
 * ## Does it stay right over time?
 *
 * Three epochs 15 months apart cannot answer that — a rate error is invisible
 * over 15 months and ruinous over 50 years — so Earth, Mars and Jupiter carry
 * fixtures at 1900, 1950, 2000, 2050 and 2100. Measured longitude residuals:
 *
 *              1900     1950     2000     2025     2050     2100
 *     mars     0.004   -0.001    0.002   -0.021   -0.096   -0.541
 *     jupiter  0.012    0.001    0.006   -0.048   -0.233   -1.342
 *
 * The growth is real, and it is **not** a bad Ẇ. Divide each residual by that
 * body's own spin rate and it becomes a clock offset, and the two bodies then
 * agree to better than a second at every epoch:
 *
 *              1900     1950     2000     2025     2050     2100
 *     mars     +0.9s    -0.1s    +0.4s    -5.3s   -23.7s  -133.3s
 *     jupiter  +1.2s    +0.1s    +0.6s    -4.8s   -23.1s  -133.2s
 *
 * A per-body transcription error cannot do that: two independent constants
 * would have to be wrong by amounts that just happen to be proportional to two
 * unrelated spin rates. A shared time-scale difference does exactly this. That
 * is the {@link describe} block at the bottom, and it is the strongest claim in
 * the file — it holds at 2100 where the two longitudes differ by 0.8°.
 *
 * **What the shared offset is.** Adding it back to the app's own ΔT gives JPL's
 * effective ΔT: 69.5 s at 2025, 69.7 s at 2050, 69.5 s at 2100. Horizons
 * **freezes** ΔT beyond the observed record; the app extrapolates with
 * Espenak-Meeus (202.8 s at 2100). Neither is wrong — Earth's future rotation is
 * physically unknowable — so this is a disclosed divergence between two
 * defensible models, not a defect to "fix" toward JPL.
 *
 * One real sub-finding worth its own line: at 2025 the shared offset is already
 * −5 s, i.e. Espenak-Meeus over-predicts today's ΔT (74.5 s against an actual
 * ~69.5 s), because Earth's rotation sped up after that polynomial was fitted.
 * It costs 0.02° of Earth rotation, below every bound here, and is recorded so
 * nobody re-derives it.
 *
 * Regenerate the fixtures with:
 *   HORIZONS_MODE=subpoint node scripts/generate-horizons-fixtures.js
 */

interface SubSolarFixture {
  bodyId: string;
  date: string;
  targetFrame: string;
  longitudeSense: string;
  subSolarLonDeg: number;
  subSolarLatDeg: number;
  lightTimeSeconds: number;
}

/**
 * Every sub-solar fixture on disk, picked up by glob so adding an epoch or a
 * body is a script run rather than an edit here.
 */
const FIXTURES = (
  Object.values(
    import.meta.glob("../test/fixtures/horizons/subsolar-*.json", {
      eager: true,
    })
  ) as Array<{ default: SubSolarFixture }>
)
  .map((module) => module.default)
  .sort(
    (a, b) => a.bodyId.localeCompare(b.bodyId) || a.date.localeCompare(b.date)
  );

const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * The last date at which ΔT is measured rather than extrapolated. Before it,
 * the app and JPL are describing the same clock and the bound is the true
 * accuracy of the transcription. After it, the two clocks legitimately part
 * company — see the file header.
 */
const OBSERVED_DELTA_T_UNTIL = new Date("2027-01-01T00:00:00Z");

/**
 * Inside the observed-ΔT era: one bound for every body rather than eight tuned
 * ones. The largest residual there is 0.061° (Earth), and the defect class this
 * exists to catch — a mistyped digit, a swapped time scale, a flipped axis —
 * moves the sub-solar point by tenths of a degree at minimum. The negative
 * control at the bottom pins that claim rather than leaving it asserted.
 */
const MAX_LON_ERROR_DEG = 0.1;

/**
 * Outside it, the bound only has to be tight enough to catch a broken model
 * while tolerating the ΔT divergence, whose worst case in this fixture set is
 * Jupiter's 1.34° at 2100. A genuine transcription error is caught anyway by
 * the clock-consistency suite, which stays tight at every epoch.
 */
const MAX_LON_ERROR_EXTRAPOLATED_DEG = 2.0;

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
function eastLongitudeDeg(fixture: SubSolarFixture): number {
  return fixture.longitudeSense === "west"
    ? (360 - fixture.subSolarLonDeg) % 360
    : fixture.subSolarLonDeg;
}

function retardedInstant(fixture: SubSolarFixture): Date {
  return new Date(
    new Date(fixture.date).getTime() - fixture.lightTimeSeconds * 1000
  );
}

function longitudeErrorDeg(fixture: SubSolarFixture): number {
  return signedDeltaDeg(
    modelSubSolar(fixture.bodyId, retardedInstant(fixture)).lonDeg,
    eastLongitudeDeg(fixture)
  );
}

function spinRateDegPerDay(bodyId: string): number {
  const orientation = resolveBodyIauOrientation(BODIES_BY_ID.get(bodyId)!);
  if (!orientation) throw new Error(`${bodyId} has no rotation solution`);
  return orientation.spinRateDegPerDay;
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
      const extrapolated = new Date(fixture.date) > OBSERVED_DELTA_T_UNTIL;

      expect(
        Math.abs(lonError),
        `${fixture.bodyId} sub-solar longitude: model ${model.lonDeg.toFixed(4)}°E vs JPL ${jplEast.toFixed(4)}°E ` +
          `(reported ${fixture.subSolarLonDeg.toFixed(4)}° ${fixture.longitudeSense}, frame ${fixture.targetFrame}) — Δ ${lonError.toFixed(4)}°`
      ).toBeLessThan(
        extrapolated ? MAX_LON_ERROR_EXTRAPOLATED_DEG : MAX_LON_ERROR_DEG
      );

      expect(
        Math.abs(latError),
        `${fixture.bodyId} sub-solar latitude: model ${model.latDeg.toFixed(4)}° vs JPL ${fixture.subSolarLatDeg.toFixed(4)}° (Δ ${latError.toFixed(4)}°)`
      ).toBeLessThan(MAX_LAT_ERROR_DEG);
    });
  }
});

/**
 * The residual is a shared clock, not a per-body error.
 *
 * This is what makes the growing 2050/2100 residuals interpretable instead of
 * alarming. Each body's longitude error divided by its own spin rate is the
 * clock offset that would explain it; if the constants were mistranscribed,
 * those numbers would be unrelated, because Mars and Jupiter turn at 351 and
 * 871°/day and share nothing else. They agree to under a second at every epoch
 * from 1900 to 2100.
 *
 * So this suite is the one that would actually catch a bad W₀ or Ẇ at a far
 * epoch, and it stays tight exactly where the longitude bound has to loosen.
 *
 * **Earth is deliberately excluded.** Horizons drives Earth with ITRF93 rather
 * than the IAU expression, so Earth's residual carries a second, unrelated
 * model gap (~+19 s equivalent) on top of the clock offset. Including it would
 * force a tolerance loose enough to be meaningless.
 *
 * **Slow rotators are excluded too, and the rule is derived rather than
 * listed.** Converting a longitude to a clock divides by the spin rate, so a
 * body that takes 59 days to turn once cannot resolve seconds: Mercury's
 * perfectly good 0.010° residual becomes an apparent 142 s, and Venus's
 * 0.0002° becomes 14 s. Neither is evidence of anything. A body earns a vote
 * here only if the longitude bound itself corresponds to less than 30 s of its
 * own rotation, which admits Mars (25 s) through Jupiter (10 s) and rejects
 * Mercury (1407 s) and Venus (5831 s).
 */
describe("the residual is a shared clock offset, not a per-body error", () => {
  const MAX_CLOCK_DISAGREEMENT_SECONDS = 2;
  const MIN_CLOCK_RESOLUTION_SECONDS = 30;

  const resolvesClock = (bodyId: string) =>
    (MAX_LON_ERROR_DEG / Math.abs(spinRateDegPerDay(bodyId))) * 86400 <
    MIN_CLOCK_RESOLUTION_SECONDS;

  const byDate = new Map<string, SubSolarFixture[]>();
  for (const fixture of FIXTURES) {
    if (fixture.bodyId === "earth") continue;
    if (!resolvesClock(fixture.bodyId)) continue;
    const list = byDate.get(fixture.date) ?? [];
    list.push(fixture);
    byDate.set(fixture.date, list);
  }

  for (const [date, fixtures] of byDate) {
    if (fixtures.length < 2) continue;

    it(`${date} — every body implies the same clock`, () => {
      const offsets = fixtures.map((fixture) => ({
        bodyId: fixture.bodyId,
        seconds:
          (longitudeErrorDeg(fixture) / spinRateDegPerDay(fixture.bodyId)) *
          86400,
      }));

      const seconds = offsets.map((o) => o.seconds);
      const spread = Math.max(...seconds) - Math.min(...seconds);

      expect(
        spread,
        `implied clock offsets disagree: ${offsets
          .map((o) => `${o.bodyId} ${o.seconds.toFixed(1)}s`)
          .join(
            ", "
          )} — a spread this large means a per-body constant is wrong, not that the clocks differ`
      ).toBeLessThan(MAX_CLOCK_DISAGREEMENT_SECONDS);
    });
  }
});

/**
 * The negative control, and the reason the suites above are gates rather than
 * coincidences. Passing tests prove *some* orientation reproduces JPL; they do
 * not prove the check is sensitive to the thing most likely to be wrong.
 *
 * Driving the spin from a raw UT day count instead of TDB is that thing: it is
 * a one-character mistake, it is invisible to every other test in this repo,
 * and it is the failure the wave's risk section names. Shifting the epoch by ΔT
 * must push each fast rotator out of the bound.
 */
describe("the bound is sensitive to a UT-instead-of-TDB spin", () => {
  for (const fixture of FIXTURES) {
    if (new Date(fixture.date) > OBSERVED_DELTA_T_UNTIL) continue;

    const shiftDeg =
      (Math.abs(spinRateDegPerDay(fixture.bodyId)) * DELTA_T_SECONDS_2026) /
      86400;

    // Mercury and Venus turn too slowly for ΔT to matter — 0.005° and 0.001°
    // respectively — so they cannot discriminate a time-scale error, and are
    // skipped rather than asserted against a bound they would pass for the
    // wrong reason. They still carry full weight in the first suite, where they
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
