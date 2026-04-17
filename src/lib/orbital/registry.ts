/**
 * Orbital Registry
 *
 * Maps celestial bodies to the analytical provider that actually runs for them.
 *
 * Model labels are what really executes in the browser (Path A from PLAN.md):
 * - VSOP87D: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
 * - Pluto-Meeus: Pluto (Meeus Ch. 37)
 * - ELP-MPP02-trunc: Moon
 * - MartianSatMeanElements: Phobos, Deimos
 * - GalileanMeanElements: Io, Europa, Ganymede, Callisto
 * - SaturnianMeanElements: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
 * - UranianMeanElements: Miranda, Ariel, Umbriel, Titania, Oberon
 * - AsteroidOsculating: Ceres, Pallas, Vesta (1900-2050 validity)
 * - Kepler: all remaining bodies without a maintained analytical theory
 */

import type {
  BodyOrbitalMetadata,
  AnalyticalModel,
  ValidityRange,
} from "./types";

/**
 * Validity ranges for time-limited ephemerides
 */
export const VALIDITY_RANGES: Record<string, ValidityRange> = {
  asteroid: {
    startYear: 1900,
    endYear: 2050,
    note: "Asteroid osculating elements with secular drift are trusted 1900-2050",
  },
  vsop87: {
    startYear: -2000,
    endYear: 6000,
    note: "VSOP87D truncated series, arcsecond-level 2000 BCE - 6000 CE",
  },
  plutoMeeus: {
    startYear: 1885,
    endYear: 2099,
    note: "Meeus Ch. 37 Pluto theory valid 1885-2099",
  },
  elpMpp02: {
    startYear: -3000,
    endYear: 3000,
    note: "ELP/MPP02 truncated (few-arcsecond level over millennia)",
  },
};

/**
 * Orbital metadata registry for all supported bodies
 */
export const ORBITAL_METADATA_REGISTRY: Record<string, BodyOrbitalMetadata> = {
  // === SUN (reference point) ===
  sun: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "Solar system origin reference",
  },

  // === INNER PLANETS (VSOP87D) ===
  mercury: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  venus: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  earth: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  mars: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },

  // === OUTER PLANETS (VSOP87D) ===
  jupiter: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  saturn: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  uranus: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },
  neptune: {
    primaryModel: "VSOP87D",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop87,
    notes: "VSOP87D truncated planetary theory",
  },

  // === PLUTO (Meeus Ch. 37) ===
  pluto: {
    primaryModel: "Pluto-Meeus",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.plutoMeeus,
    notes: "Meeus Ch. 37 Pluto theory (J/S/P periodic terms)",
  },

  // === MOON (ELP/MPP02 truncated) ===
  moon: {
    primaryModel: "ELP-MPP02-trunc",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.elpMpp02,
    notes: "Truncated ELP/MPP02 lunar theory (arcsecond level)",
  },

  // === MARTIAN SATELLITES (mean elements, J2000 ecliptic) ===
  phobos: {
    primaryModel: "MartianSatMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  deimos: {
    primaryModel: "MartianSatMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },

  // === GALILEAN MOONS (mean elements, J2000 ecliptic) ===
  io: {
    primaryModel: "GalileanMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  europa: {
    primaryModel: "GalileanMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  ganymede: {
    primaryModel: "GalileanMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  callisto: {
    primaryModel: "GalileanMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },

  // === MAJOR SATURN SATELLITES (mean elements, J2000 ecliptic) ===
  mimas: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  enceladus: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  tethys: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  dione: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  rhea: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  titan: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  iapetus: {
    primaryModel: "SaturnianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },

  // === MAJOR URANUS SATELLITES (mean elements, J2000 ecliptic) ===
  miranda: {
    primaryModel: "UranianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  ariel: {
    primaryModel: "UranianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  umbriel: {
    primaryModel: "UranianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  titania: {
    primaryModel: "UranianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  oberon: {
    primaryModel: "UranianMeanElements",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },

  // === MAIN BELT ASTEROIDS (Osculating, 1900-2050 window) ===
  ceres: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  pallas: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },
  vesta: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2020-01-01, two-body Kepler propagation",
  },

  // === FALLBACK BODIES (Kepler only) ===
  triton: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no maintained analytical theory available",
  },
  charon: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no maintained analytical theory available",
  },
  hygiea: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no maintained analytical theory available",
  },
  haumea: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  makemake: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  eris: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  gonggong: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  quaoar: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  orcus: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  sedna: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - detached TNO",
  },
  salacia: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - TNO",
  },
  vanth: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - satellite",
  },
  weywot: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - satellite",
  },
};

/**
 * Get orbital metadata for a body
 */
export function getOrbitalMetadata(bodyId: string): BodyOrbitalMetadata | null {
  return ORBITAL_METADATA_REGISTRY[bodyId] ?? null;
}

/**
 * Check if a body has analytical ephemeris support
 */
export function hasAnalyticalEphemeris(bodyId: string): boolean {
  const metadata = getOrbitalMetadata(bodyId);
  return metadata !== null && metadata.primaryModel !== "Kepler";
}

/**
 * Get list of bodies that use a specific analytical model
 */
export function getBodiesByModel(model: AnalyticalModel): string[] {
  return Object.entries(ORBITAL_METADATA_REGISTRY)
    .filter(([, metadata]) => metadata.primaryModel === model)
    .map(([bodyId]) => bodyId);
}

/**
 * Check if a date is within the validity range for a body
 */
export function isWithinValidityRange(bodyId: string, date: Date): boolean {
  const metadata = getOrbitalMetadata(bodyId);
  if (!metadata?.validityRange) return true;

  const year = date.getUTCFullYear();
  return (
    year >= metadata.validityRange.startYear &&
    year <= metadata.validityRange.endYear
  );
}

/**
 * Get all registered body IDs
 */
export function getAllRegisteredBodies(): string[] {
  return Object.keys(ORBITAL_METADATA_REGISTRY);
}

/**
 * Bodies that should use analytical ephemerides when available
 */
export const ANALYTICAL_EPHEMERIS_BODIES = Object.entries(
  ORBITAL_METADATA_REGISTRY
)
  .filter(([, metadata]) => metadata.primaryModel !== "Kepler")
  .map(([bodyId]) => bodyId);

/**
 * Bodies that are Kepler-only (no analytical theory wired up)
 */
export const KEPLER_ONLY_BODIES = Object.entries(ORBITAL_METADATA_REGISTRY)
  .filter(([, metadata]) => metadata.primaryModel === "Kepler")
  .map(([bodyId]) => bodyId);
