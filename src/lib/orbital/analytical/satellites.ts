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
 * `src/test/fixtures/horizons/<body>-2020-01-01.json` through the standard
 * two-body RV→COE algorithm using μ_parent from `MU_PARENT`. The pipeline
 * is deterministic and reproducible: rerunning the script against the same
 * fixture always yields the same values.
 *
 * Mean motion `nDegPerDay` is derived from μ_parent and `aAU` at runtime so
 * the pair stays self-consistent with Kepler III.
 *
 * Accuracy:
 *   - All bodies match their Horizons fixture within sub-degree at the
 *     reference epoch 2020-01-01 (two-body Kepler; no secular perturbations
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

// 2020-01-01T00:00:00Z in TDB Julian Date. The engine evaluates analytical
// positions at `jdTDB`, not at raw UT JD, so the epoch we tag elements with
// must also be in TDB to keep `dt = jdTDB - epochJD` at zero when a request
// lands on the fixture instant. Emitted by `dateToTDB` in `time.ts` (Delta-T
// ≈ 74 s + periodic TDB-TT term). Mismatched scale moves Phobos ~1° at epoch.
const EPOCH_2020_JD = 2458849.500861648;

/**
 * Ecliptic-J2000 osculating elements, parent-centered, all at epoch
 * 2020-01-01. Every block below was emitted by
 * `scripts/derive-elements-from-fixtures.js` against the corresponding
 * Horizons fixture on disk. Regenerating is a one-line command.
 */
const SATELLITES: Record<string, SatelliteEntry> = {
  // --- Martian ---
  phobos: {
    parent: "mars",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.000062688,
      e: 0.015043,
      iDeg: 25.63365,
      OmegaDeg: 82.651628,
      omegaDeg: 285.280124,
      M0Deg: 97.208171,
    },
  },
  deimos: {
    parent: "mars",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.000156816,
      e: 0.000176,
      iDeg: 24.998656,
      OmegaDeg: 79.060562,
      omegaDeg: 345.519644,
      M0Deg: 241.185453,
    },
  },

  // --- Galilean ---
  io: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.002820643,
      e: 0.004267,
      iDeg: 2.253804,
      OmegaDeg: 338.160715,
      omegaDeg: 60.335329,
      M0Deg: 284.952157,
    },
  },
  europa: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.00448603,
      e: 0.00925,
      iDeg: 2.622879,
      OmegaDeg: 332.42381,
      omegaDeg: 254.685888,
      M0Deg: 317.325902,
    },
  },
  ganymede: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.007155512,
      e: 0.002053,
      iDeg: 2.30648,
      OmegaDeg: 340.358644,
      omegaDeg: 6.39674,
      M0Deg: 218.2966,
    },
  },
  callisto: {
    parent: "jupiter",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.01258608,
      e: 0.007221,
      iDeg: 1.964832,
      OmegaDeg: 336.896567,
      omegaDeg: 27.90612,
      M0Deg: 320.335477,
    },
  },

  // --- Major Saturnian ---
  mimas: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.001243068,
      e: 0.017863,
      iDeg: 29.39174,
      OmegaDeg: 171.234508,
      omegaDeg: 218.894306,
      M0Deg: 140.778471,
    },
  },
  enceladus: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.001593301,
      e: 0.00605,
      iDeg: 28.041406,
      OmegaDeg: 169.530605,
      omegaDeg: 86.066369,
      M0Deg: 21.645723,
    },
  },
  tethys: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.001971289,
      e: 0.000935,
      iDeg: 27.159428,
      OmegaDeg: 168.16169,
      omegaDeg: 265.737445,
      M0Deg: 358.797507,
    },
  },
  dione: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.002523776,
      e: 0.002602,
      iDeg: 28.076076,
      OmegaDeg: 169.523729,
      omegaDeg: 77.167206,
      M0Deg: 16.788064,
    },
  },
  rhea: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.003523684,
      e: 0.000728,
      iDeg: 27.908353,
      OmegaDeg: 170.161506,
      omegaDeg: 165.700238,
      M0Deg: 181.961875,
    },
  },
  titan: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.008168201,
      e: 0.028607,
      iDeg: 27.698067,
      OmegaDeg: 169.071342,
      omegaDeg: 174.628206,
      M0Deg: 186.925996,
    },
  },
  iapetus: {
    parent: "saturn",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.023808253,
      e: 0.027781,
      iDeg: 17.080331,
      OmegaDeg: 138.851649,
      omegaDeg: 231.202578,
      M0Deg: 234.760168,
    },
  },

  // --- Major Uranian ---
  miranda: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.00086807,
      e: 0.001306,
      iDeg: 100.493766,
      OmegaDeg: 171.148358,
      omegaDeg: 289.765151,
      M0Deg: 302.709332,
    },
  },
  ariel: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.001276293,
      e: 0.000687,
      iDeg: 97.71654,
      OmegaDeg: 167.640684,
      omegaDeg: 165.252772,
      M0Deg: 95.919046,
    },
  },
  umbriel: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.001777834,
      e: 0.003958,
      iDeg: 97.692745,
      OmegaDeg: 167.710268,
      omegaDeg: 46.574399,
      M0Deg: 53.376705,
    },
  },
  titania: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.002916098,
      e: 0.002131,
      iDeg: 97.775888,
      OmegaDeg: 167.631763,
      omegaDeg: 272.007578,
      M0Deg: 15.915121,
    },
  },
  oberon: {
    parent: "uranus",
    elements: {
      epochJD: EPOCH_2020_JD,
      aAU: 0.0039005,
      e: 0.002316,
      iDeg: 97.905315,
      OmegaDeg: 167.721721,
      omegaDeg: 171.951602,
      M0Deg: 14.126712,
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

  // Mean motion from Kepler III keeps n and a self-consistent.
  const nDegPerDay =
    (Math.sqrt(mu / (elements.aAU * elements.aAU * elements.aAU)) * 180) /
    Math.PI;

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
