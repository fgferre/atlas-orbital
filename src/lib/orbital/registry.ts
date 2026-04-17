/**
 * Orbital Registry
 *
 * Maps celestial bodies to their respective analytical ephemeris models.
 * Based on the implementation plan, this defines which provider should be
 * used for each body in the solar system.
 *
 * Model Assignments (per plan):
 * - VSOP2013: Mercury, Venus, Earth, Mars
 * - TOP2013: Jupiter, Saturn, Uranus, Neptune, Pluto
 * - ELP2000-MPP02: Moon
 * - MARSSAT: Phobos, Deimos
 * - L1: Io, Europa, Ganymede, Callisto
 * - TASS17: Mimas, Enceladus, Tethys, Dione, Rhea, Titan, Iapetus
 * - GUST86: Miranda, Ariel, Umbriel, Titania, Oberon
 * - EPHASTER: Ceres, Pallas, Vesta (1900-2050)
 * - Kepler Fallback: Triton, Charon, Hygiea, Haumea, Makemake, Eris, etc.
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
  ephaster: {
    startYear: 1900,
    endYear: 2050,
    note: "EPHASTER asteroid ephemerides valid 1900-2050",
  },
  vsop2013: {
    startYear: -4000,
    endYear: 8000,
    note: "VSOP2013 long-term planetary ephemeris",
  },
  top2013: {
    startYear: -4000,
    endYear: 8000,
    note: "TOP2013 long-term outer planet ephemeris",
  },
  elp2000: {
    startYear: -4000,
    endYear: 8000,
    note: "ELP2000-82b lunar ephemeris",
  },
};

/**
 * Orbital metadata registry for all supported bodies
 */
export const ORBITAL_METADATA_REGISTRY: Record<string, BodyOrbitalMetadata> = {
  // === SUN (reference point) ===
  sun: {
    primaryModel: "VSOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "Solar system barycenter reference",
  },

  // === INNER PLANETS (VSOP2013) ===
  mercury: {
    primaryModel: "VSOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop2013,
    notes: "VSOP2013 for high precision 4000 BCE - 8000 CE",
  },
  venus: {
    primaryModel: "VSOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop2013,
    notes: "VSOP2013 for high precision 4000 BCE - 8000 CE",
  },
  earth: {
    primaryModel: "VSOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop2013,
    notes: "VSOP2013 for high precision 4000 BCE - 8000 CE",
  },
  mars: {
    primaryModel: "VSOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.vsop2013,
    notes: "VSOP2013 for high precision 4000 BCE - 8000 CE",
  },

  // === OUTER PLANETS (TOP2013) ===
  jupiter: {
    primaryModel: "TOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.top2013,
    notes: "TOP2013 optimized for outer planets",
  },
  saturn: {
    primaryModel: "TOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.top2013,
    notes: "TOP2013 optimized for outer planets",
  },
  uranus: {
    primaryModel: "TOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.top2013,
    notes: "TOP2013 optimized for outer planets",
  },
  neptune: {
    primaryModel: "TOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.top2013,
    notes: "TOP2013 optimized for outer planets",
  },
  pluto: {
    primaryModel: "TOP2013",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.top2013,
    notes: "TOP2013 includes Pluto with perturbations",
  },

  // === MOON (ELP2000-MPP02) ===
  moon: {
    primaryModel: "ELP2000",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.elp2000,
    notes: "ELP2000-82b lunar theory with high precision",
  },

  // === MARTIAN SATELLITES (MARSSAT) ===
  phobos: {
    primaryModel: "MARSSAT",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "MARSSAT for Martian satellites",
  },
  deimos: {
    primaryModel: "MARSSAT",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "MARSSAT for Martian satellites",
  },

  // === GALILEAN MOONS (L1) ===
  io: {
    primaryModel: "L1",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "L1 theory for Galilean satellites",
  },
  europa: {
    primaryModel: "L1",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "L1 theory for Galilean satellites",
  },
  ganymede: {
    primaryModel: "L1",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "L1 theory for Galilean satellites",
  },
  callisto: {
    primaryModel: "L1",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "L1 theory for Galilean satellites",
  },

  // === MAJOR SATURN SATELLITES (TASS17) ===
  mimas: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  enceladus: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  tethys: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  dione: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  rhea: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  titan: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },
  iapetus: {
    primaryModel: "TASS17",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "TASS17 for Saturnian satellites",
  },

  // === MAJOR URANUS SATELLITES (GUST86) ===
  miranda: {
    primaryModel: "GUST86",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "GUST86 for Uranian satellites",
  },
  ariel: {
    primaryModel: "GUST86",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "GUST86 for Uranian satellites",
  },
  umbriel: {
    primaryModel: "GUST86",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "GUST86 for Uranian satellites",
  },
  titania: {
    primaryModel: "GUST86",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "GUST86 for Uranian satellites",
  },
  oberon: {
    primaryModel: "GUST86",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    notes: "GUST86 for Uranian satellites",
  },

  // === MAIN BELT ASTEROIDS (EPHASTER) ===
  ceres: {
    primaryModel: "EPHASTER",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.ephaster,
    notes: "EPHASTER asteroid ephemeris",
  },
  pallas: {
    primaryModel: "EPHASTER",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.ephaster,
    notes: "EPHASTER asteroid ephemeris",
  },
  vesta: {
    primaryModel: "EPHASTER",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.ephaster,
    notes: "EPHASTER asteroid ephemeris",
  },

  // === FALLBACK BODIES (Kepler only) ===
  triton: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no analytical theory available",
  },
  charon: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no analytical theory available",
  },
  hygiea: {
    primaryModel: "Kepler",
    primaryProvider: "kepler",
    fallbackProvider: "kepler",
    notes: "Keplerian elements - no analytical theory available",
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
 * @param bodyId Body identifier
 * @returns Metadata or null if not registered
 */
export function getOrbitalMetadata(bodyId: string): BodyOrbitalMetadata | null {
  return ORBITAL_METADATA_REGISTRY[bodyId] ?? null;
}

/**
 * Check if a body has analytical ephemeris support
 * @param bodyId Body identifier
 * @returns true if primary model is not Kepler
 */
export function hasAnalyticalEphemeris(bodyId: string): boolean {
  const metadata = getOrbitalMetadata(bodyId);
  return metadata !== null && metadata.primaryModel !== "Kepler";
}

/**
 * Get list of bodies supported by a specific model
 * @param model Analytical model type
 * @returns Array of body IDs
 */
export function getBodiesByModel(model: AnalyticalModel): string[] {
  return Object.entries(ORBITAL_METADATA_REGISTRY)
    .filter(([, metadata]) => metadata.primaryModel === model)
    .map(([bodyId]) => bodyId);
}

/**
 * Check if a date is within the validity range for a body
 * @param bodyId Body identifier
 * @param date JavaScript Date
 * @returns true if within validity range or no range specified
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
 * @returns Array of body identifiers
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
 * Bodies that are Kepler-only (no analytical theory)
 */
export const KEPLER_ONLY_BODIES = Object.entries(ORBITAL_METADATA_REGISTRY)
  .filter(([, metadata]) => metadata.primaryModel === "Kepler")
  .map(([bodyId]) => bodyId);
