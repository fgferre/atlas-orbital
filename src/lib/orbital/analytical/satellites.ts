/**
 * Parent-centered satellite provider using ecliptic-J2000 osculating elements.
 *
 * Scope covers the analytical families called out in PLAN.md:
 *   - Martian: Phobos, Deimos
 *   - Galilean: Io, Europa, Ganymede, Callisto
 *   - Major Saturnian: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
 *   - Major Uranian: Miranda, Ariel, Umbriel, Titania, Oberon
 *   - Neptunian: Triton        (added W6 stage B)
 *   - Pluto system: Charon     (added W6 stage B)
 *
 * All elements are expressed in the **J2000 mean ecliptic, parent-centered**
 * frame so no body-equatorial rotation is needed at runtime. Every entry
 * below was produced by `scripts/derive-elements-from-fixtures.js`, which
 * inverts the Horizons state vector (r, v) stored in
 * `src/test/fixtures/horizons/<body>-2025-01-01.json` through the standard
 * two-body RV→COE algorithm using μ_parent from `MU_PARENT`. The pipeline
 * is deterministic and reproducible: rerunning the script against the same
 * fixture always yields the same values.
 *
 * Mean motion is carried **explicitly** as `nDegPerDay` rather than derived
 * from `aAU` via Kepler III. The `aAU` above is an *osculating* semi-major
 * axis inverted from a single state vector; under the primary's J2 it
 * oscillates around the mean value, so imposing Kepler III on it yields a
 * mean motion that is wrong by enough to lose the phase entirely (Phobos
 * drifted 165° at +6 months). Deriving `n` from `a` was previously described
 * here as a self-consistency feature — it was a bug. See the per-entry
 * `nDegPerDay` comments for the provenance of each rate.
 *
 * Accuracy:
 *   - All bodies match their Horizons fixture within sub-degree at the
 *     reference epoch 2025-01-01 (two-body Kepler; no secular perturbations
 *     like J2 / resonance / tidal drag are modelled).
 *   - Away from the epoch the two-body phase error grows. Measured on both
 *     sides of the epoch (Horizons fixtures at 2024-01-01 / 2024-07-01 and
 *     2025-07-01 / 2026-01-01), the worst ±1-year angular error is 5.2°
 *     (Mimas), then 3.6° (Phobos), 1.6° (Europa), 1.3° (Miranda / Tethys);
 *     every other body stays under ~0.9°. The short-period resonant moons
 *     (Mimas, Phobos) are the intrinsic worst case — plain two-body Kepler
 *     cannot hold them over a full year. See regression.test.ts
 *     MULTI_EPOCH_OVERRIDES for the full per-body table.
 *   - Element *orientation* (i, Ω, ω) is still frozen at epoch, so nodal and
 *     apsidal precession accumulate. Plan to refresh the epoch periodically.
 */

import * as THREE from "three";
import type { OsculatingElements } from "../types";
import { elementsToCartesian, ecliptic2ThreeJs, mod2Pi } from "./coordUtils";

const D2R = Math.PI / 180;

// Standard gravitational parameters (AU^3/day^2) — k² × mass ratio.
const K2 = 0.01720209895 ** 2;
const MU_PARENT: Record<string, number> = {
  mars: 3.22715144e-7 * K2,
  jupiter: 9.54791915e-4 * K2,
  saturn: 2.8588567e-4 * K2,
  uranus: 4.366244e-5 * K2,
  // W6 stage B. `BODY<n>_GM / BODY10_GM` from NAIF `gm_de440.tpc`; the same
  // division reproduces the four ratios above, which came from an unrelated
  // source, to better than 1.5e-6 relative — the independent check standing
  // law 3 asks for. System values like the others, which matters unusually
  // much for Pluto because Charon is ~12% of its mass.
  neptune: 5.151383773e-5 * K2,
  pluto: 7.350478973e-9 * K2,
};

interface EclipticElements {
  /** Reference epoch as Julian Date (TDB). */
  epochJD: number;
  /** Semi-major axis (AU). */
  aAU: number;
  /** Eccentricity. */
  e: number;
  /** Inclination to J2000 ecliptic (deg). */
  iDeg: number;
  /** Longitude of ascending node on J2000 ecliptic (deg). */
  OmegaDeg: number;
  /** Argument of periapsis (deg). */
  omegaDeg: number;
  /** Mean anomaly at epoch (deg). */
  M0Deg: number;
  /**
   * Mean motion (deg/day). Optional: when absent the value falls back to
   * Kepler III from `aAU` + μ_parent, which is only correct for an
   * unperturbed two-body orbit. Every analytical satellite below supplies
   * it explicitly; the fallback exists for entries added without a
   * calibrated rate.
   *
   * Provenance is tagged per entry:
   *   - `pub`  — JPL SSD "Planetary Satellite Mean Orbital Parameters"
   *              (published mean motion, independent of this repo's data).
   *              SOURCE CAVEAT: JPL states that table is a summary of
   *              orbital properties and is *not intended for ephemeris
   *              computation*. We use only the mean motion from it — a
   *              long-term average rate — and pair it with a locally
   *              derived osculating element set, so this is a calibrated
   *              constant borrowed from a descriptive table, not an
   *              endorsement of the table as an ephemeris source.
   *   - `fix`  — fitted to the local Horizons fixtures by minimising the
   *              angular error at 2025-07-01 and 2026-01-01.
   *
   * LIMITATION (`fix` entries): those rates were tuned **in-sample** against
   * the same two fixture epochs the regression suite asserts on, so the
   * residuals quoted in `regression.test.ts` are a goodness-of-fit, not an
   * independent accuracy measurement. Treat them as calibrated constants,
   * not as measured ephemeris quantities. Mimas and Phobos are excluded from
   * fitting: their periods are short enough that the 6-month fixture spacing
   * aliases the phase (many integer revolutions fit equally well), so they
   * use the published rate.
   */
  nDegPerDay?: number;
}

interface SatelliteEntry {
  parent: keyof typeof MU_PARENT;
  elements: EclipticElements;
}

// 2025-01-01T00:00:00Z in TDB Julian Date. The engine evaluates analytical
// positions at `jdTDB`, not at raw UT JD, so the epoch we tag elements with
// must also be in TDB to keep `dt = jdTDB - epochJD` at zero when a request
// lands on the fixture instant. Emitted by `dateToTDB` in `time.ts` (Delta-T
// ≈ 77 s + periodic TDB-TT term). Mismatched scale moves Phobos ~1° at epoch.
//
// The epoch was shifted from 2020-01-01 in an earlier pass so short-period
// moons (Io, Phobos, Deimos, Mimas, Miranda) stay within Phase-4 tolerance
// at present-day simulation dates rather than accumulating years of
// two-body phase drift from a stale base. Plan to refresh this every few
// years.
const EPOCH_2025_JD = 2460676.5008931975;

/**
 * Ecliptic-J2000 osculating elements, parent-centered, all at epoch
 * 2025-01-01. Every block below was emitted by
 * `scripts/derive-elements-from-fixtures.js` against the corresponding
 * Horizons fixture on disk. Regenerating is a one-line command.
 */
const SATELLITES: Record<string, SatelliteEntry> = {
  // --- Martian ---
  // Phobos: P=0.32 d. Mars J2 + tidal-decay drift; multi-epoch envelope
  // 3.9° (worst observed 3.6°; see regression.test.ts MULTI_EPOCH_OVERRIDES).
  phobos: {
    parent: "mars",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.000062693,
      e: 0.015598,
      iDeg: 26.377682,
      OmegaDeg: 85.130902,
      omegaDeg: 356.427237,
      M0Deg: 343.483363,
      // pub: JPL SSD Planetary Satellite Mean Orbital Parameters.
      // Not fitted — the 6-month fixture spacing aliases a 0.32 d period.
      nDegPerDay: 1128.8446,
    },
  },
  // Deimos: P=1.26 d. Mars J2 drift; multi-epoch envelope 0.3°.
  deimos: {
    parent: "mars",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.000156818,
      e: 0.000264,
      iDeg: 24.261578,
      OmegaDeg: 80.746057,
      omegaDeg: 21.34648,
      M0Deg: 274.428678,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 285.161867,
    },
  },

  // --- Galilean ---
  // Io: P=1.77 d. Laplace resonance + Jupiter J2; envelope 1.1°.
  io: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.002820633,
      e: 0.004189,
      iDeg: 2.184263,
      OmegaDeg: 338.066972,
      omegaDeg: 162.539472,
      M0Deg: 77.16209,
      // pub: JPL SSD Planetary Satellite Mean Orbital Parameters.
      nDegPerDay: 203.489,
    },
  },
  // Europa: P=3.55 d. Laplace resonance + Jupiter J2; envelope 2.0°.
  europa: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.00448606,
      e: 0.009603,
      iDeg: 2.245018,
      OmegaDeg: 326.027753,
      omegaDeg: 348.485963,
      M0Deg: 41.525546,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 101.373519,
    },
  },
  // Ganymede: P=7.15 d. Laplace resonance + Jupiter J2; envelope 0.3°.
  ganymede: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.007155651,
      e: 0.001595,
      iDeg: 2.332721,
      OmegaDeg: 339.486914,
      omegaDeg: 0.37336,
      M0Deg: 355.419406,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 50.318096,
    },
  },
  // Callisto: P=16.69 d. Jupiter J2 + mutual Galilean perturbations
  // (not Laplace-locked); envelope 0.3°.
  callisto: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.012581724,
      e: 0.007335,
      iDeg: 1.949769,
      OmegaDeg: 336.755898,
      omegaDeg: 31.707226,
      M0Deg: 126.981443,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 21.570967,
    },
  },

  // --- Major Saturnian ---
  // Mimas: P=0.94 d. Tethys 2:4 mean-motion resonance; envelope 5.6°
  // (worst observed 5.2°; short-period resonant moon two-body cannot hold ±1 yr).
  mimas: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.001243267,
      e: 0.021819,
      iDeg: 29.618039,
      OmegaDeg: 169.879386,
      omegaDeg: 241.83177,
      M0Deg: 338.697262,
      // pub: JPL SSD Planetary Satellite Mean Orbital Parameters.
      // Not fitted — the 6-month fixture spacing aliases a 0.94 d period.
      nDegPerDay: 381.9945,
    },
  },
  // Enceladus: P=1.37 d. Dione 1:2 mean-motion resonance + tidal heating;
  // envelope 1.2°.
  enceladus: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.00159328,
      e: 0.004627,
      iDeg: 28.046968,
      OmegaDeg: 169.53623,
      omegaDeg: 321.387411,
      M0Deg: 277.657121,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 262.730539,
    },
  },
  // Tethys: P=1.89 d. Mimas 2:4 mean-motion resonance; envelope 1.6°.
  tethys: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.001971307,
      e: 0.000841,
      iDeg: 27.142823,
      OmegaDeg: 168.2125,
      omegaDeg: 202.806232,
      M0Deg: 346.972498,
      // pub: JPL SSD Planetary Satellite Mean Orbital Parameters.
      nDegPerDay: 190.6979,
    },
  },
  // Dione: P=2.74 d. Enceladus 1:2 mean-motion resonance; envelope 0.3°.
  dione: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.002523787,
      e: 0.002434,
      iDeg: 28.026006,
      OmegaDeg: 169.507282,
      omegaDeg: 229.097504,
      M0Deg: 59.177256,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 131.535095,
    },
  },
  // Rhea: P=4.52 d. Saturn J2 + Titan perturbation; envelope 0.3°.
  rhea: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.003523311,
      e: 0.000913,
      iDeg: 28.195345,
      OmegaDeg: 170.10546,
      omegaDeg: 171.554945,
      M0Deg: 329.872314,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 79.690026,
    },
  },
  // Titan: P=15.95 d. Solar perturbation + Hyperion 4:3 resonance;
  // envelope 0.3°.
  titan: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.008168275,
      e: 0.028823,
      iDeg: 27.711177,
      OmegaDeg: 169.071606,
      omegaDeg: 177.468183,
      M0Deg: 32.218395,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 22.576926,
    },
  },
  // Iapetus: P=79.32 d. Saturn J2 + transitional Laplace-plane dynamics;
  // envelope 0.3°.
  iapetus: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.023788429,
      e: 0.029245,
      iDeg: 17.029066,
      OmegaDeg: 138.884109,
      omegaDeg: 232.489429,
      M0Deg: 244.336165,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 4.53792,
    },
  },

  // --- Major Uranian ---
  // Miranda: P=1.41 d. Uranus J2 at small semi-major axis; envelope 1.6°.
  miranda: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.000868067,
      e: 0.001318,
      iDeg: 100.54251,
      OmegaDeg: 164.189564,
      omegaDeg: 35.950344,
      M0Deg: 33.930746,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 254.692738,
    },
  },
  // Ariel: P=2.52 d. Uranus J2; envelope 0.3°.
  ariel: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.001276303,
      e: 0.000328,
      iDeg: 97.712171,
      OmegaDeg: 167.661647,
      omegaDeg: 221.792544,
      M0Deg: 0.202294,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 142.835392,
    },
  },
  // Umbriel: P=4.14 d. Uranus J2; envelope 0.3°.
  umbriel: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.001777846,
      e: 0.004169,
      iDeg: 97.707769,
      OmegaDeg: 167.72243,
      omegaDeg: 59.15342,
      M0Deg: 350.206625,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 86.868919,
    },
  },
  // Titania: P=8.71 d. Uranus J2; envelope 0.4°.
  titania: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.002916309,
      e: 0.001193,
      iDeg: 97.765066,
      OmegaDeg: 167.640309,
      omegaDeg: 221.360305,
      M0Deg: 15.613765,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 41.35143,
    },
  },
  // Oberon: P=13.46 d. Uranus J2; envelope 0.4°.
  oberon: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.00389973,
      e: 0.001524,
      iDeg: 97.905434,
      OmegaDeg: 167.71179,
      omegaDeg: 224.365314,
      M0Deg: 214.738022,
      // fix: fitted in-sample to the 2025-07-01 / 2026-01-01 fixtures.
      nDegPerDay: 26.739978,
    },
  },

  // --- Neptunian ---
  // Triton: P=5.88 d, retrograde. Added in W6 stage B; before it, Triton was a
  // legacy Kepler child whose catalog `i = 156.8°` was measured against
  // NEPTUNE'S EQUATOR while its Ω was fabricated, so no scene-graph state
  // reproduced the true orbit pole (the disclosed envelope was ~150°). The
  // ecliptic inclination inverted from the Horizons vector is 129.17°.
  triton: {
    parent: "neptune",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.002371478,
      e: 0.000027,
      iDeg: 129.170264,
      OmegaDeg: 222.392859,
      omegaDeg: 340.984172,
      M0Deg: 29.625503,
      // pub: Triton is synchronously locked, so its orbital mean motion IS the
      // IAU prime-meridian rate |Ẇ| = 61.2572637°/day (`BODY801_PM` in
      // `pck00011.tpc`) — a published constant, not a fit. Cross-checked
      // against Kepler III on the osculating `a` above: 61.2544°/day, agreeing
      // to 4.6e-5 relative. Two unrelated routes, so this also *measures* the
      // lock rather than assuming it.
      nDegPerDay: 61.2572637,
    },
  },

  // --- Pluto system ---
  // Charon: P=6.39 d. Also new in W6 stage B, and the more consequential fix —
  // its legacy record carried `O: 0, w: 0, M0: 0` (fabricated) against a true
  // `n` of 56.36, i.e. 22.8° of orbital phase invented per year. That made the
  // mutual-lock check undecidable, which is exactly the setup where somebody
  // nudges a transcribed constant to make a smoke look right.
  charon: {
    parent: "pluto",
    elements: {
      epochJD: EPOCH_2025_JD,
      aAU: 0.00013098,
      e: 0.000096,
      // 112.89° to the ecliptic. Independent confirmation that this element
      // set is sane: Pluto's IAU pole (α₀ 132.993 / δ₀ −6.163) puts its
      // equator 112.8° from the ecliptic, and Charon orbits in that plane.
      // The old record's `i: 0` was that same fact expressed in an
      // undeclared frame.
      iDeg: 112.887853,
      OmegaDeg: 227.39293,
      omegaDeg: 154.718896,
      M0Deg: 41.025066,
      // pub: the Pluto-Charon lock is double-synchronous, so this is Pluto's
      // own IAU Ẇ (`BODY999_PM`, 56.3625225°/day). Kepler III on the
      // osculating `a` gives 56.3710°/day, agreeing to 1.5e-4.
      nDegPerDay: 56.3625225,
    },
  },
};

export const SATELLITE_IDS = Object.keys(SATELLITES);

export function isAnalyticalSatellite(bodyId: string): boolean {
  return bodyId in SATELLITES;
}

export function getSatelliteParent(bodyId: string): string | null {
  return SATELLITES[bodyId]?.parent ?? null;
}

/**
 * Kepler-III mean motion in deg/day from μ_parent and the semi-major axis.
 * Fallback only — `aAU` here is osculating, so this is systematically off
 * for a J2-perturbed satellite. Prefer `elements.nDegPerDay`.
 */
function meanMotionDegPerDay(aAU: number, mu: number): number {
  return (Math.sqrt(mu / (aAU * aAU * aAU)) * 180) / Math.PI;
}

/** Explicit mean motion when calibrated, Kepler III otherwise. */
function resolveMeanMotion(elements: EclipticElements, mu: number): number {
  return elements.nDegPerDay ?? meanMotionDegPerDay(elements.aAU, mu);
}

/**
 * Parent-centered satellite position in AU, expressed in the engine's
 * three.js frame (Y-up ecliptic).
 */
export function calculateSatellitePosition(
  bodyId: string,
  jdTDB: number
): THREE.Vector3 {
  const entry = SATELLITES[bodyId];
  if (!entry) {
    throw new Error(`No analytical satellite entry for ${bodyId}`);
  }
  const { parent, elements } = entry;
  const mu = MU_PARENT[parent];
  if (mu === undefined) {
    throw new Error(`No gravitational parameter for parent ${parent}`);
  }

  const nDegPerDay = resolveMeanMotion(elements, mu);
  const dt = jdTDB - elements.epochJD;
  const Mdeg = elements.M0Deg + nDegPerDay * dt;

  const rEcl = elementsToCartesian({
    aLinear: elements.aAU,
    e: elements.e,
    iRad: elements.iDeg * D2R,
    OmegaRad: mod2Pi(elements.OmegaDeg * D2R),
    omegaRad: mod2Pi(elements.omegaDeg * D2R),
    MRad: mod2Pi(Mdeg * D2R),
  });

  return ecliptic2ThreeJs(rEcl);
}

/**
 * Osculating elements for the analytical satellite at `jdTDB`. The ellipse
 * shape (a, e, i, Ω, ω) is fixed by the fixture-derived block above and `n`
 * by its calibrated `nDegPerDay`; only the mean anomaly M advances with
 * time. Returning these lets the engine draw an orbit line that matches
 * the plane and apsides of the live analytical position instead of the
 * placeholder Kepler fallback.
 */
export function getSatelliteOsculatingElements(
  bodyId: string,
  jdTDB: number
): OsculatingElements | null {
  const entry = SATELLITES[bodyId];
  if (!entry) return null;
  const { parent, elements } = entry;
  const mu = MU_PARENT[parent];
  if (mu === undefined) return null;

  const nDegPerDay = resolveMeanMotion(elements, mu);
  const dt = jdTDB - elements.epochJD;
  const mNow = (((elements.M0Deg + nDegPerDay * dt) % 360) + 360) % 360;

  return {
    a: elements.aAU,
    e: elements.e,
    i: elements.iDeg,
    O: elements.OmegaDeg,
    w: elements.omegaDeg,
    M: mNow,
    n: nDegPerDay,
    epoch: elements.epochJD,
  };
}
