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
 * frame so no body-equatorial rotation is needed at runtime. Two element
 * sources are used:
 *
 *   1. Bodies validated against authoritative Horizons state vectors on disk
 *      (Io, Titan, Oberon today; easy to extend by dropping a fixture in
 *      `src/test/fixtures/horizons/`). Elements are osculating at epoch
 *      2020-01-01T00:00:00Z and were derived once by inverting the fixture
 *      state vector (r, v) with the standard two-body formulation using
 *      μ_parent from `MU_PARENT` below.
 *
 *   2. Bodies without a fixture use JPL SSD satellite mean elements
 *      (parent equator / Laplace-plane tables). The rotation into J2000
 *      ecliptic via the IAU-2015 pole orientation was performed once offline
 *      and baked into the element values below, so no runtime matrix is
 *      applied.
 *
 * Mean motion `nDegPerDay` is always computed from μ_parent and the semi-
 * major axis `aAU` so the pair stays self-consistent.
 *
 * Accuracy:
 *   - Fixture-derived bodies match Horizons to sub-degree within ±1 year of
 *     the 2020 epoch (two-body Kepler propagation; no J2 drift).
 *   - Rotated tabular bodies are visually plausible but can drift by a few
 *     degrees over the same window; they are explicitly outside the
 *     Phase-4 tight-tolerance regression.
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
  /** Whether these elements come from an authoritative Horizons fixture. */
  source: "fixture" | "rotated-tabular";
  elements: EclipticElements;
}

const J2000_JD = 2451545.0;
const EPOCH_2020_JD = 2458849.5; // 2020-01-01T00:00:00Z

/**
 * Ecliptic-J2000 osculating elements, parent-centered.
 *
 * Fixture-derived entries (io, titan, oberon) were produced by inverting
 * Horizons state vectors with a standard two-body formulation; they match
 * the fixtures within floating-point precision at the reference epoch.
 *
 * Rotated-tabular entries come from JPL SSD satellite mean-element tables
 * (parent equator / Laplace plane) transformed once into the J2000 ecliptic
 * using the IAU 2015 pole at J2000.
 */
const SATELLITES: Record<string, SatelliteEntry> = {
  // --- Fixture-validated ---
  io: {
    parent: "jupiter",
    source: "fixture",
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
  titan: {
    parent: "saturn",
    source: "fixture",
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
  oberon: {
    parent: "uranus",
    source: "fixture",
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

  // --- Rotated-tabular (epoch J2000.0) ---
  // Produced offline from JPL SSD mean elements on the parent equator
  // transformed to J2000 ecliptic via the IAU-2015 pole at J2000.
  phobos: {
    parent: "mars",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0000626747,
      e: 0.0151,
      iDeg: 26.129745,
      OmegaDeg: 84.929825,
      omegaDeg: 272.509013,
      M0Deg: 91.059,
    },
  },
  deimos: {
    parent: "mars",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0001568418,
      e: 0.00033,
      iDeg: 27.618985,
      OmegaDeg: 79.524552,
      omegaDeg: 232.248095,
      M0Deg: 325.329,
    },
  },
  europa: {
    parent: "jupiter",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0044860264,
      e: 0.0094,
      iDeg: 2.020416,
      OmegaDeg: 326.350394,
      omegaDeg: 339.948703,
      M0Deg: 171.016,
    },
  },
  ganymede: {
    parent: "jupiter",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0071551821,
      e: 0.0013,
      iDeg: 2.242026,
      OmegaDeg: 342.321729,
      omegaDeg: 271.881543,
      M0Deg: 317.54,
    },
  },
  callisto: {
    parent: "jupiter",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0125850722,
      e: 0.0074,
      iDeg: 2.365297,
      OmegaDeg: 334.780196,
      omegaDeg: 14.939247,
      M0Deg: 181.408,
    },
  },
  mimas: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0012402516,
      e: 0.0196,
      iDeg: 27.46749,
      OmegaDeg: 172.665555,
      omegaDeg: 124.761394,
      M0Deg: 255.312,
    },
  },
  enceladus: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0015912125,
      e: 0.0047,
      iDeg: 28.057561,
      OmegaDeg: 169.542842,
      omegaDeg: 265.147931,
      M0Deg: 197.047,
    },
  },
  tethys: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0019697607,
      e: 0.0001,
      iDeg: 28.458437,
      OmegaDeg: 167.388509,
      omegaDeg: 195.645654,
      M0Deg: 189.003,
    },
  },
  dione: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0025228634,
      e: 0.0022,
      iDeg: 28.034582,
      OmegaDeg: 169.573847,
      omegaDeg: 297.722564,
      M0Deg: 65.99,
    },
  },
  rhea: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.003523232,
      e: 0.001,
      iDeg: 28.063009,
      OmegaDeg: 168.824168,
      omegaDeg: 168.795144,
      M0Deg: 311.551,
    },
  },
  iapetus: {
    parent: "saturn",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0238026115,
      e: 0.0293,
      iDeg: 34.021182,
      OmegaDeg: 178.343233,
      omegaDeg: 309.492624,
      M0Deg: 356.029,
    },
  },
  miranda: {
    parent: "uranus",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0008683279,
      e: 0.0013,
      iDeg: 86.094597,
      OmegaDeg: 345.57325,
      omegaDeg: 40.018778,
      M0Deg: 311.33,
    },
  },
  ariel: {
    parent: "uranus",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0012760877,
      e: 0.0012,
      iDeg: 82.314585,
      OmegaDeg: 347.665752,
      omegaDeg: 142.79906,
      M0Deg: 39.481,
    },
  },
  umbriel: {
    parent: "uranus",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0017781002,
      e: 0.0039,
      iDeg: 82.378322,
      OmegaDeg: 347.727148,
      omegaDeg: 123.241874,
      M0Deg: 12.469,
    },
  },
  titania: {
    parent: "uranus",
    source: "rotated-tabular",
    elements: {
      epochJD: J2000_JD,
      aAU: 0.0029164854,
      e: 0.0011,
      iDeg: 82.257989,
      OmegaDeg: 347.72375,
      omegaDeg: 29.219247,
      M0Deg: 24.614,
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
