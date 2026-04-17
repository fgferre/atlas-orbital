/**
 * Parent-centered satellite provider using ecliptic-J2000 osculating elements.
 *
 * Scope covers the analytical families called out in PLAN.md:
 *   - Martian: Phobos, Deimos
 *   - Galilean: Io, Europa, Ganymede, Callisto
 *   - Major Saturnian: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
 *   - Major Uranian: Miranda, Ariel, Umbriel, Titania, Oberon
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
 * Mean motion `nDegPerDay` is derived from μ_parent and `aAU` at runtime so
 * the pair stays self-consistent with Kepler III.
 *
 * Accuracy:
 *   - All bodies match their Horizons fixture within sub-degree at the
 *     reference epoch 2025-01-01 (two-body Kepler; no secular perturbations
 *     like J2 / resonance / tidal drag are modelled).
 *   - Short-period moons (Io, Phobos, Deimos, Mimas, Miranda) lose tens of
 *     degrees of mean-anomaly phase per year of propagation. They stay
 *     geometrically plausible on the orbit plane but the instantaneous
 *     position should not be used as a scientific reference over multi-year
 *     spans without a refreshed epoch. See `tasks/lessons.md` L9 for the
 *     documented drift rates and the roadmap for periodic epoch refresh.
 *   - Long-period moons (Titan, Callisto, Iapetus, Titania, Oberon) hold
 *     below a few degrees over ±1 year.
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
    },
  },
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
    },
  },

  // --- Galilean ---
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },

  // --- Major Saturnian ---
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },

  // --- Major Uranian ---
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
    },
  },
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
    },
  },
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
    },
  },
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
    },
  },
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

/** Mean motion in deg/day from μ_parent and the semi-major axis. */
function meanMotionDegPerDay(aAU: number, mu: number): number {
  return (Math.sqrt(mu / (aAU * aAU * aAU)) * 180) / Math.PI;
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

  const nDegPerDay = meanMotionDegPerDay(elements.aAU, mu);
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
 * shape (a, e, i, Ω, ω, n) is fixed by the fixture-derived block above;
 * only the mean anomaly M advances with time. Returning these lets the
 * engine draw an orbit line that matches the plane and apsides of the
 * live analytical position instead of the placeholder Kepler fallback.
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

  const nDegPerDay = meanMotionDegPerDay(elements.aAU, mu);
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
