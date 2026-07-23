/**
 * Orbital Registry
 *
 * Maps celestial bodies to the analytical provider that actually runs for them.
 *
 * Model labels are what really executes in the browser (Path A from PLAN.md):
 * - VSOP87D: Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus, Neptune
 * - Pluto-Meeus: Pluto (Meeus Ch. 37)
 * - ELP-MPP02-trunc: Moon
 * - MartianSatOsculating2Body: Phobos, Deimos (2020-2030 validity)
 * - GalileanOsculating2Body: Io, Europa, Ganymede, Callisto (2020-2030 validity)
 * - SaturnianOsculating2Body: Mimas, Enceladus, Tethys, Dione, Rhea, Titan,
 *   Iapetus (2020-2030 validity)
 * - UranianOsculating2Body: Miranda, Ariel, Umbriel, Titania, Oberon
 *   (2020-2030 validity)
 * - AsteroidOsculating: Ceres, Pallas, Vesta (2000-2050 validity)
 * - Kepler: all remaining bodies without a maintained analytical theory
 *
 * The satellite/asteroid labels say "osculating" rather than "mean elements":
 * the blocks in `analytical/satellites.ts` and `analytical/asteroids.ts` are
 * osculating elements inverted from single Horizons state vectors at epoch
 * 2025-01-01, then propagated with a plain two-body Kepler step. No secular
 * or periodic perturbation terms are evaluated at runtime.
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
  // Pure two-body Kepler from the 2025-01-01 osculating block — no secular
  // terms of any kind (see `analytical/asteroids.ts`). The only out-of-sample
  // check available is the ceres-1890-01-01 Horizons fixture: 7.40° angular /
  // 1.2% radial error at epoch −135 yr. Interpolating that anchor against the
  // ±1 yr residual (0.004°) gives roughly dt^1.5 growth, so the window is
  // narrowed to epoch ±25 yr where the extrapolated error stays under ~1°.
  // Anything wider was never measured and must not be advertised.
  asteroid: {
    startYear: 2000,
    endYear: 2050,
    note: "Two-body Kepler from 2025-01-01 osculating elements; ~0.01° near epoch, extrapolated to ~1° at the 2000/2050 edges (only far-epoch check: 7.4° at 1890)",
  },
  // Satellites: same two-body treatment, but i/Ω/ω are frozen at epoch so
  // nodal and apsidal precession accumulate on top of the phase error.
  //
  // Measured span is epoch ±1 yr ONLY (Horizons fixtures at 2025-07-01 and
  // 2026-01-01); the per-family degree figures below are that measurement and
  // nothing more. The 2020-2030 window is epoch ±5 yr, chosen to bracket the
  // "refresh the fixture epoch every few years" cadence documented in
  // `analytical/satellites.ts` — the error near its edges is *extrapolated*,
  // not measured, and is expected to reach the ten-degree scale. Crossing the
  // window makes `engine.ts` route the body to the coarse Kepler fallback.
  //
  // CAVEAT: every mean motion except Phobos' and Mimas' was fitted in-sample
  // against those same two fixtures, so the figures below are a
  // goodness-of-fit, not an independent accuracy measurement. Treat them as
  // an optimistic floor, not as validated accuracy.
  martianSat: {
    startYear: 2020,
    endYear: 2030,
    note: "Two-body Kepler from 2025-01-01 osculating elements; ≤2.0° measured over epoch ±1 yr (worst: Phobos), unvalidated beyond",
  },
  galilean: {
    startYear: 2020,
    endYear: 2030,
    note: "Two-body Kepler from 2025-01-01 osculating elements; ≤0.6° measured over epoch ±1 yr (worst: Io), unvalidated beyond",
  },
  saturnian: {
    startYear: 2020,
    endYear: 2030,
    note: "Two-body Kepler from 2025-01-01 osculating elements; ≤2.7° measured over epoch ±1 yr (worst: Mimas), unvalidated beyond",
  },
  uranian: {
    startYear: 2020,
    endYear: 2030,
    note: "Two-body Kepler from 2025-01-01 osculating elements; ≤1.3° measured over epoch ±1 yr (worst: Miranda), unvalidated beyond",
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

  // === MARTIAN SATELLITES (osculating elements, J2000 ecliptic) ===
  phobos: {
    primaryModel: "MartianSatOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.martianSat,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  deimos: {
    primaryModel: "MartianSatOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.martianSat,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },

  // === GALILEAN MOONS (osculating elements, J2000 ecliptic) ===
  io: {
    primaryModel: "GalileanOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.galilean,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  europa: {
    primaryModel: "GalileanOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.galilean,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  ganymede: {
    primaryModel: "GalileanOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.galilean,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  callisto: {
    primaryModel: "GalileanOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.galilean,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },

  // === MAJOR SATURN SATELLITES (osculating elements, J2000 ecliptic) ===
  mimas: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  enceladus: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  tethys: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  dione: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  rhea: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  titan: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  iapetus: {
    primaryModel: "SaturnianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.saturnian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },

  // === MAJOR URANUS SATELLITES (osculating elements, J2000 ecliptic) ===
  miranda: {
    primaryModel: "UranianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.uranian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  ariel: {
    primaryModel: "UranianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.uranian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  umbriel: {
    primaryModel: "UranianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.uranian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  titania: {
    primaryModel: "UranianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.uranian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  oberon: {
    primaryModel: "UranianOsculating2Body",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.uranian,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },

  // === MAIN BELT ASTEROIDS (osculating, 2000-2050 window) ===
  ceres: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  pallas: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
  },
  vesta: {
    primaryModel: "AsteroidOsculating",
    primaryProvider: "ephem",
    fallbackProvider: "kepler",
    validityRange: VALIDITY_RANGES.asteroid,
    notes:
      "Horizons-derived osculating elements at 2025-01-01, two-body Kepler propagation",
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
