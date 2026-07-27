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
import { isAnalyticalSatellite } from "./orbital/analytical/satellites";

/**
 * Where the Sun stands overhead, checked against JPL Horizons across 200 years.
 *
 * **Why this file exists.** Every other test in the orbital suite answers "is
 * the body in the right PLACE". None answered "is it FACING the right way", so
 * W6 shipped transcribed IAU rotation constants with a human being asked to
 * judge a terminator by eye as the only check. That is not a gate: a wrong W₀
 * renders as a perfectly plausible planet, and 0.06° of longitude — Earth's
 * residual here — is about 7 km at its equator.
 *
 * Coverage is **127 fixtures across 30 bodies**: the Sun-lit hemisphere of
 * every planet, the Moon, the eighteen analytical satellites, Triton, Pluto
 * and Charon. Stage A shipped it for the planets alone; stage B only had to
 * add fixtures, because the suite globs whatever is on disk.
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
 * Latitude, after the figure difference is taken out.
 *
 * Horizons reports **planetodetic** sub-observer latitude; this model produces
 * **planetocentric**. On a sphere they are the same number, which is why the
 * planets sailed through when only they had fixtures. On Phobos they differ by
 * **20°** — its axes are 13.0 × 11.4 × 9.1 km — and W6 stage B briefly read
 * that as a mistranscribed pole. It is not: converting the model value with
 * the body's own polar flattening reproduces JPL to **0.000° for Miranda** and
 * 0.14° for Mimas, i.e. exactly, for every body whose figure is a spheroid.
 *
 * So the conversion is done rather than tolerated (which also *tightens*
 * Saturn, whose disclosed ~1.1° gap was this effect). What survives it is
 * triaxiality — a spheroid conversion cannot know that Deimos's equator is an
 * ellipse — and that residual is bounded per body by {@link triaxialSpreadDeg}
 * from the same published axes. Nothing here is tuned to a measured residual.
 */
const MAX_LAT_ERROR_DEG = 1.5;

/**
 * Published triaxial radii (a ≥ b ≥ c, km) for every body in this fixture set
 * whose figure is far enough from a sphere to move the comparison.
 *
 * Source: `BODY<n>_RADII` in NAIF `pck00011.tpc` — the same kernel the
 * rotational elements come from, read by
 * `scripts/derive-iau-orientation.js --radii`.
 *
 * Emitted verbatim by that script's `--radii` mode, which skips anything
 * spherical to within 1e-4 — so this is the complete set, not a judgement
 * call about which bodies matter. Hand-picking it missed Iapetus, which is
 * 4.5% flattened. Absence still means "treat as a sphere", which can only
 * make a bound tighter, so the failure mode of an omission is a loud test
 * rather than a silently permissive one.
 */
const BODY_AXES: Record<string, readonly [number, number, number]> = {
  mercury: [2440.53, 2440.53, 2438.26],
  earth: [6378.1366, 6378.1366, 6356.7519],
  phobos: [13, 11.4, 9.1],
  deimos: [7.8, 6, 5.1],
  mars: [3396.19, 3396.19, 3376.2],
  io: [1829.4, 1819.4, 1815.7],
  europa: [1562.6, 1560.3, 1559.5],
  jupiter: [71492, 71492, 66854],
  mimas: [207.8, 196.7, 190.6],
  enceladus: [256.6, 251.4, 248.3],
  tethys: [538.4, 528.3, 526.3],
  dione: [563.4, 561.3, 559.6],
  rhea: [765, 763.1, 762.4],
  titan: [2575.15, 2574.78, 2574.47],
  iapetus: [745.7, 745.7, 712.1],
  saturn: [60268, 60268, 54364],
  ariel: [581.1, 577.9, 577.7],
  miranda: [240.4, 234.2, 232.9],
  uranus: [25559, 25559, 24973],
  neptune: [24764, 24764, 24341],
};

/** Planetocentric → planetodetic latitude on the body's own spheroid. */
function planetodeticLatDeg(bodyId: string, centricLatDeg: number): number {
  const axes = BODY_AXES[bodyId];
  if (!axes) return centricLatDeg;
  const squash = (axes[2] / axes[0]) ** 2;
  return (
    (Math.atan(Math.tan((centricLatDeg * Math.PI) / 180) / squash) * 180) /
    Math.PI
  );
}

/**
 * How far a triaxial equator can push the planetodetic latitude away from what
 * the spheroid conversion above predicts.
 *
 * Same closed form as the polar term, applied to b/a, and evaluated where it
 * peaks (45°). Zero for every body with a circular equator — which is all of
 * them except the Martian moons and the small Saturnians — so this widens
 * nothing that does not physically need it.
 */
function triaxialSpreadDeg(bodyId: string): number {
  const axes = BODY_AXES[bodyId];
  if (!axes) return 0;
  return (Math.atan(1 / (axes[1] / axes[0]) ** 2) * 180) / Math.PI - 45;
}

/**
 * The instant the analytical satellite elements are osculating at, and the
 * window `src/lib/orbital/analytical/satellites.ts` states them good for
 * ("the worst ±1-year angular error is 5.2°").
 */
const SATELLITE_ELEMENT_EPOCH = new Date("2025-01-01T00:00:00Z");
const SATELLITE_ELEMENT_VALIDITY_MS = 366 * 86_400_000;

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

/**
 * The floor a **stale satellite position** puts under the longitude check.
 *
 * A satellite's sub-solar point depends on where the Sun is *from the
 * satellite*, so putting the satellite on the wrong side of its parent rotates
 * that direction by the angle its orbit subtends from the Sun. The analytical
 * elements are two-body and osculating at 2025-01-01; a quarter-century out,
 * the phase is simply gone, so at those epochs this — not the pole — sets the
 * accuracy.
 *
 * Callisto is the case that forced it: 0.184° at 2000-01-01, and 0.030° at
 * 2025. Its orbit subtends 0.29° from the Sun. The allowance is `2a/d`,
 * because a wrong phase can displace the body by a full diameter, and it is
 * computed from the model's own vectors rather than from a table.
 *
 * Inside the elements' stated validity window this returns 0: the phase is
 * pinned there, so the tight bound is physically earned and stays.
 */
function stalePositionAllowanceDeg(fixture: SubSolarFixture): number {
  // Keyed on the PROVIDER, not on having a parent. The Moon is a satellite but
  // is served by ELP-MPP02, which is valid over millennia — granting it this
  // allowance at its 2000-01-01 fixture would hand a perfectly good ephemeris a
  // 0.29° discount it has not earned, and quietly blind the bound there.
  if (!isAnalyticalSatellite(fixture.bodyId)) return 0;
  const body = BODIES_BY_ID.get(fixture.bodyId);
  if (!body?.parentId) return 0;

  const at = new Date(fixture.date);
  const age = Math.abs(at.getTime() - SATELLITE_ELEMENT_EPOCH.getTime());
  if (age <= SATELLITE_ELEMENT_VALIDITY_MS) return 0;

  const satellite = resolveHeliocentricPositionAU(fixture.bodyId, at);
  const parent = resolveHeliocentricPositionAU(body.parentId, at);
  const orbitRadiusAU = satellite.distanceTo(parent);

  return (Math.asin((2 * orbitRadiusAU) / satellite.length()) * 180) / Math.PI;
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
      const modelLat = planetodeticLatDeg(fixture.bodyId, model.latDeg);
      const latError = modelLat - fixture.subSolarLatDeg;
      const extrapolated = new Date(fixture.date) > OBSERVED_DELTA_T_UNTIL;

      const lonBound =
        (extrapolated ? MAX_LON_ERROR_EXTRAPOLATED_DEG : MAX_LON_ERROR_DEG) +
        stalePositionAllowanceDeg(fixture);

      expect(
        Math.abs(lonError),
        `${fixture.bodyId} sub-solar longitude: model ${model.lonDeg.toFixed(4)}°E vs JPL ${jplEast.toFixed(4)}°E ` +
          `(reported ${fixture.subSolarLonDeg.toFixed(4)}° ${fixture.longitudeSense}, frame ${fixture.targetFrame}) — Δ ${lonError.toFixed(4)}°, bound ${lonBound.toFixed(4)}°`
      ).toBeLessThan(lonBound);

      expect(
        Math.abs(latError),
        `${fixture.bodyId} sub-solar latitude: model ${modelLat.toFixed(4)}° planetodetic ` +
          `(${model.latDeg.toFixed(4)}° planetocentric) vs JPL ${fixture.subSolarLatDeg.toFixed(4)}° (Δ ${latError.toFixed(4)}°)`
      ).toBeLessThan(MAX_LAT_ERROR_DEG + triaxialSpreadDeg(fixture.bodyId));
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

  /**
   * A satellite far from its element epoch cannot vote, for the same reason it
   * gets a looser longitude bound: its own orbital phase has drifted, and that
   * drift is not a clock. Mimas is the case — 0.016° of orbit-subtended angle
   * at 2000-01-01 is 3.6 s of Mimas rotation, three times the agreement this
   * suite asserts, so including it would have read as "a per-body constant is
   * wrong" when nothing about Mimas's rotation is.
   *
   * The threshold is the suite's own agreement bound rather than a new number:
   * a body may vote only if its irreducible position uncertainty is smaller
   * than the disagreement being tested for.
   */
  const positionNoiseSeconds = (fixture: SubSolarFixture) =>
    (stalePositionAllowanceDeg(fixture) /
      Math.abs(spinRateDegPerDay(fixture.bodyId))) *
    86400;

  const byDate = new Map<string, SubSolarFixture[]>();
  for (const fixture of FIXTURES) {
    if (fixture.bodyId === "earth") continue;
    if (!resolvesClock(fixture.bodyId)) continue;
    const list = byDate.get(fixture.date) ?? [];
    list.push(fixture);
    byDate.set(fixture.date, list);
  }

  for (const [date, candidates] of byDate) {
    if (candidates.length < 2) continue;

    it(`${date} — every body implies the same clock`, () => {
      // Applied here rather than while grouping: it needs the orbital engine,
      // which `beforeAll` has not booted at collection time.
      const fixtures = candidates.filter(
        (f) => positionNoiseSeconds(f) < MAX_CLOCK_DISAGREEMENT_SECONDS
      );
      if (fixtures.length < 2) return;

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
