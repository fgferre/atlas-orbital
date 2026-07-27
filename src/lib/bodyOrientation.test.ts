import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  computeBodyPoleQuaternion,
  computeSpinAngleRad,
  resolveIauOrientation,
} from "./bodyOrientation";
import { SOLAR_SYSTEM_BODIES } from "../data/celestialBodies";
import type { CelestialBody } from "./astrophysics";
import {
  OBLIQUITY_J2000_RAD,
  threeJs2Ecliptic,
} from "./orbital/analytical/coordUtils";
import {
  dateToJD,
  dateToTDB,
  greenwichMeanSiderealTimeDeg,
  J2000_JD,
} from "./orbital/time";

const body = (id: string): CelestialBody => {
  const found = SOLAR_SYSTEM_BODIES.find((b) => b.id === id);
  if (!found) throw new Error(`no such body: ${id}`);
  return found;
};

const COS_E = Math.cos(OBLIQUITY_J2000_RAD);
const SIN_E = Math.sin(OBLIQUITY_J2000_RAD);

/** Right ascension (degrees, ICRF) of a vector expressed in **scene** space. */
function sceneVectorToRaDeg(v: THREE.Vector3): number {
  const ecl = threeJs2Ecliptic(v);
  // Inverse of `equatorial2Ecliptic`; only this file needs it, so it is not
  // exported from coordUtils until a second caller appears.
  const x = ecl.x;
  const y = ecl.y * COS_E - ecl.z * SIN_E;
  const ra = (Math.atan2(y, x) * 180) / Math.PI;
  return ra < 0 ? ra + 360 : ra;
}

/**
 * Where Earth's prime meridian actually points, read out of the rendered
 * orientation rather than out of the constant that produced it.
 *
 * This deliberately walks the whole scene-side path — `raDecToEclipticUnit`,
 * the astro→Y-up remap, `makeBasis`, and the spin applied as
 * `rotation.y` — so a sign error or an axis permutation anywhere in it shows
 * up here. Reading W back from the record would test nothing.
 */
function primeMeridianRaDeg(b: CelestialBody, jdTDB: number): number {
  const pole = computeBodyPoleQuaternion(b, jdTDB);
  const spin = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    computeSpinAngleRad(b, jdTDB)
  );
  const dir = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(spin)
    .applyQuaternion(pole);
  return sceneVectorToRaDeg(dir);
}

function signedDeltaDeg(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

describe("Earth's spin against Greenwich mean sidereal time", () => {
  // J2000.0 as an instant: JD 2451545.0 is TT, so the matching UT is earlier
  // by ΔT. This is the only input the gate takes that is not derived by the
  // code under test.
  const J2000_DELTA_T_SECONDS = 63.83;
  const jdUT_J2000 = J2000_JD - J2000_DELTA_T_SECONDS / 86400;

  /**
   * **The step-1 gate.** GMST comes from the IERS/IAU Earth-rotation
   * convention and shares no constant with Archinal's tables, so this
   * falsifies a transcribed W₀ instead of confirming it.
   *
   * It runs at J2000.0 and not at a 2026 date, which corrects the wave file.
   * The drafted 2026 form cannot pass at 0.1° for a *correct* model: GMST is
   * referred to the **mean equinox of date** while IAU W is referred to the
   * **ICRF**, and precession in right ascension separates the two by 0.34° by
   * 2026. Closing that would mean importing an IAU 2006 precession polynomial
   * — a fresh block of unsourced constants inside the wave whose entire risk
   * is unsourced constants. At J2000 the two frames coincide by construction,
   * the tolerance stays load-bearing (see the two wrong-pairing tests below),
   * and Ẇ is checked separately against the GMST rate.
   *
   * The measured residual is ~0.047°: the IAU Earth model is deliberately
   * coarse, not a transcription error.
   */
  it("puts the prime meridian within 0.1° of GMST at J2000.0", () => {
    const pmRa = primeMeridianRaDeg(body("earth"), J2000_JD);
    const gmst = greenwichMeanSiderealTimeDeg(jdUT_J2000);
    expect(Math.abs(signedDeltaDeg(pmRa, gmst))).toBeLessThan(0.1);
  });

  /**
   * The two tests below are why the 0.1° tolerance must not be widened.
   * ΔT is 0.27° of Earth rotation at J2000 and grows to ~0.30° by 2026, so a
   * 0.5° tolerance would accept both of the wrong time-scale pairings that
   * this gate exists to reject.
   */
  it("rejects GMST evaluated on a TDB date instead of UT", () => {
    const pmRa = primeMeridianRaDeg(body("earth"), J2000_JD);
    const wrong = greenwichMeanSiderealTimeDeg(J2000_JD);
    expect(Math.abs(signedDeltaDeg(pmRa, wrong))).toBeGreaterThan(0.1);
  });

  it("rejects a spin driven by a raw UT day count instead of TDB", () => {
    const pmRa = primeMeridianRaDeg(body("earth"), jdUT_J2000);
    const gmst = greenwichMeanSiderealTimeDeg(jdUT_J2000);
    expect(Math.abs(signedDeltaDeg(pmRa, gmst))).toBeGreaterThan(0.1);
  });

  /**
   * The rate, which a single-epoch check cannot see. Earth's IAU Ẇ is an
   * ICRF-referenced rotation rate and GMST's linear coefficient is the same
   * rate plus precession in RA (~3.5e-5°/day), so the two must agree to well
   * inside 1e-4°/day. A transposed digit anywhere in the first six places of
   * 360.9856235 breaks this.
   */
  it("spins at the sidereal rate GMST independently implies", () => {
    const earth = body("earth");
    const perDay =
      ((computeSpinAngleRad(earth, J2000_JD + 1) -
        computeSpinAngleRad(earth, J2000_JD)) *
        180) /
      Math.PI;
    const gmstPerDay =
      greenwichMeanSiderealTimeDeg(J2000_JD + 1) -
      greenwichMeanSiderealTimeDeg(J2000_JD) +
      360;
    expect(Math.abs(perDay - gmstPerDay)).toBeLessThan(1e-4);
  });

  it("is driven by UT for GMST and TDB for the spin, from one Date", () => {
    // Guards the wiring the render path uses, not just the maths above:
    // `dateToJD` and `dateToTDB` must stay on opposite sides of this gate.
    const date = new Date("2026-03-20T12:00:00Z");
    expect(dateToTDB(date) - dateToJD(date)).toBeGreaterThan(60 / 86400);
  });
});

describe("the pole basis", () => {
  it("points a body's local +Y along its IAU spin axis", () => {
    const earth = body("earth");
    const q = computeBodyPoleQuaternion(earth, J2000_JD);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // Earth's pole is the ICRF pole at J2000, so its declination is 90°.
    const ecl = threeJs2Ecliptic(up);
    const decRad = Math.asin(ecl.y * SIN_E + ecl.z * COS_E);
    expect((decRad * 180) / Math.PI).toBeCloseTo(90, 3);
  });

  it("is orthonormal and right-handed for every body that has a pole", () => {
    for (const b of SOLAR_SYSTEM_BODIES) {
      if (!b.iauOrientation && b.poleRA === undefined) continue;
      const m = new THREE.Matrix4().makeRotationFromQuaternion(
        computeBodyPoleQuaternion(b, J2000_JD)
      );
      expect(m.determinant()).toBeCloseTo(1, 9);
    }
  });
});

describe("transcription cross-checks that bypass the transcribed value", () => {
  /**
   * Mars and Neptune are the only two bodies here whose periodic terms are
   * large enough to see, and both were carrying a rounded pole in this catalog
   * from an unrelated source before this wave. Reproducing those numbers from
   * the secular terms **plus** the periodic ones confirms the sin/cos
   * convention independently — a swapped convention shifts Mars's declination
   * by 3.1° and Neptune's by 1.0°, neither of which could pass.
   */
  it("reproduces the pole values the catalog previously carried", () => {
    const marsRa = 317.68;
    const marsDec = 52.89;
    const neptuneDec = 42.95;

    const mars = resolveIauOrientation(body("mars").iauOrientation!, J2000_JD);
    const neptune = resolveIauOrientation(
      body("neptune").iauOrientation!,
      J2000_JD
    );

    const raDec = (poleEcl: readonly [number, number, number]) => {
      const [x, y, z] = poleEcl;
      const equY = y * COS_E - z * SIN_E;
      const equZ = y * SIN_E + z * COS_E;
      let ra = (Math.atan2(equY, x) * 180) / Math.PI;
      if (ra < 0) ra += 360;
      return { ra, dec: (Math.asin(equZ) * 180) / Math.PI };
    };

    expect(raDec(mars.poleEcl).ra).toBeCloseTo(marsRa, 1);
    expect(raDec(mars.poleEcl).dec).toBeCloseTo(marsDec, 1);
    expect(raDec(neptune.poleEcl).dec).toBeCloseTo(neptuneDec, 1);
  });
});

describe("the spin angle is unwrapped", () => {
  /**
   * NEW-2. The cloud deck is drawn at `spin × 1.03`; on a wrapped angle that
   * multiply lands a 10.8° discontinuity at every wrap, which is the
   * once-per-day snap this wave removes. Sampling across a wrap boundary is
   * the cheapest thing that fails if someone reintroduces a `% 360`.
   */
  it("grows monotonically across a full turn, so a rate multiply is smooth", () => {
    const earth = body("earth");
    const samples = Array.from({ length: 64 }, (_, i) =>
      computeSpinAngleRad(earth, J2000_JD + i / 32)
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }
    const cloud = samples.map((s) => s * 1.03);
    const steps = cloud.slice(1).map((c, i) => c - cloud[i]);
    const max = Math.max(...steps);
    const min = Math.min(...steps);
    expect(max - min).toBeLessThan(1e-9);
  });

  it("runs backwards for a retrograde rotator", () => {
    expect(computeSpinAngleRad(body("venus"), J2000_JD + 1)).toBeLessThan(
      computeSpinAngleRad(body("venus"), J2000_JD)
    );
  });
});

/**
 * The map has to land where the model says it does.
 *
 * `subSolarPoint.test.ts` proves the orientation against JPL, but it proves it
 * about the *geometry* — a mirrored or 90°-rotated texture would sail through
 * all 74 of those assertions while drawing the terminator across the wrong
 * continents. Two separate links close that gap, and they need different
 * treatment:
 *
 * 1. **Mesh → axis.** Which way `SphereGeometry` runs its u coordinate. This is
 *    a three.js implementation detail that a version bump can silently flip, so
 *    it is asserted here rather than trusted.
 * 2. **Texture → longitude.** Whether the shipped map puts longitude 0 at
 *    u = 0.5. That is a property of the image file, not of any code, so it
 *    cannot be unit-tested here without a JPEG decoder. Verified out-of-band on
 *    2026-07-27, in two steps.
 *
 *    First by inspection of `8k_earth_daymap.jpg` — the file Earth's record
 *    actually points at — which is a standard NASA equirectangular plate with
 *    Greenwich on the centre column: Britain immediately left of centre, the
 *    Gulf of Guinea on it, New Zealand at the right edge, Alaska at the left.
 *
 *    Then every other Earth texture was cross-correlated against it (edge
 *    structure, 256×128 grid, best horizontal shift). All the ones carrying
 *    geography align at **shift 0**: `8k_earth_nightmap` 0.896, `2k_earth`
 *    0.997, `2k_earth_nightmap` 0.895, `boot_earth_daymap` 0.996 — so the city
 *    lights and the boot frame land on the same continents the daymap draws.
 *    The normal and roughness maps peak one grid cell off (±1.4°) but beat
 *    shift 0 by only 0.1%, i.e. the correlation is flat at the peak: aligned to
 *    the resolution of the check. Clouds are excluded by construction — a cloud
 *    plate has no continental structure to correlate — so for those the only
 *    claim is the 2:1 equirectangular framing, which holds for all twelve.
 *
 *    **A new Earth map must be re-checked the same way**; nothing in the suite
 *    will catch a re-projected replacement.
 */
describe("the texture meridian lines up with the model's meridian", () => {
  it("puts SphereGeometry's u = 0.5 seam on local +X", () => {
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const position = geometry.attributes.position;
    const uv = geometry.attributes.uv;

    const equatorVertexNearest = (u: number) => {
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < uv.count; i++) {
        const d = Math.abs(uv.getX(i) - u) + Math.abs(uv.getY(i) - 0.5);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      return new THREE.Vector3(
        position.getX(best),
        position.getY(best),
        position.getZ(best)
      );
    };

    // The leading minus on `vertex.x` in SphereGeometry's builder is what makes
    // this mapping, and it is the whole reason no per-texture seam-offset field
    // exists: the equirectangular convention (longitude 0 at u = 0.5) and the
    // mesh convention (u = 0.5 at +X) already agree, so the residual is zero by
    // construction rather than by a tuned constant.
    expect(equatorVertexNearest(0.5).x).toBeCloseTo(1, 6);

    // And u increases the same way the spin does: `rotation.y = W` applies
    // R_y(+W), which carries +X toward −Z. u = 0.75 sitting on −Z is what makes
    // increasing W equal increasing east longitude rather than decreasing it.
    expect(equatorVertexNearest(0.75).z).toBeCloseTo(-1, 6);
    expect(equatorVertexNearest(0.25).z).toBeCloseTo(1, 6);
    expect(equatorVertexNearest(0).x).toBeCloseTo(-1, 6);

    geometry.dispose();
  });
});
