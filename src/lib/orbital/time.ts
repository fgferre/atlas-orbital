/**
 * Time Utilities for Orbital Calculations
 *
 * Provides conversions between:
 * - UTC Date (JavaScript Date)
 * - JD (Julian Date) - UT
 * - TT (Terrestrial Time)
 * - TDB (Barycentric Dynamical Time) - used by analytical ephemerides
 * - JY2000 (Julian Years from J2000.0 epoch)
 *
 * References:
 * - IERS Conventions 2010
 * - NASA JPL Horizons documentation
 * - VSOP87 / ELP/MPP02 time conventions (both consume TDB)
 */

// J2000.0 epoch: 2000-01-01 12:00 TT
export const J2000_EPOCH = new Date("2000-01-01T12:00:00Z");

// Julian Date of J2000.0 epoch
export const J2000_JD = 2451545.0;

// Julian centuries per year
export const DAYS_PER_JULIAN_CENTURY = 36525.0;

// Julian years per day
export const JULIAN_YEARS_PER_DAY = 1 / 365.25;

// TT - TAI offset in seconds (32.184s constant offset)
export const TT_TAI_OFFSET_SECONDS = 32.184;

// Approximate TDB - TT offset max amplitude (~2ms)
export const TDB_TT_MAX_OFFSET_MS = 2;

/**
 * Delta-T (TT − UT1) polynomial set from Espenak & Meeus, *Five Millennium
 * Canon of Solar Eclipses* (NASA/TP–2006–214141), as published on the NASA
 * eclipse site. Valid −1999 … +3000 and extrapolating smoothly beyond, which
 * covers the whole window our providers announce in
 * `registry.ts` VALIDITY_RANGES (VSOP87 spans −2000 … +6000).
 *
 * Each row is `[upperYearExclusive, origin, divisor, ...coeffs]` and evaluates
 * as ΔT = Σ cₖ·tᵏ with t = (y − origin) / divisor. Rows are ordered; the first
 * whose upper bound exceeds `y` wins.
 *
 * ponytail: the reference's optional lunar-secular-acceleration correction
 * (−0.000012932·(y−1955)²) is omitted — it is a 0.4 % term at year 6000 and
 * only applies when pairing ΔT with an ṅ of −26 ″/cy² for eclipse canon work.
 */
const DELTA_T_BRANCHES: readonly (readonly number[])[] = [
  [-500, 1820, 100, -20, 0, 32],
  [
    500, 0, 100, 10583.6, -1014.41, 33.78311, -5.952053, -0.1798452,
    0.022174192, 0.0090316521,
  ],
  [
    1600, 1000, 100, 1574.2, -556.01, 71.23472, 0.319781, -0.8503463,
    -0.005050998, 0.0083572073,
  ],
  [1700, 1600, 1, 120, -0.9808, -0.01532, 1 / 7129],
  [1800, 1700, 1, 8.83, 0.1603, -0.0059285, 0.00013336, -1 / 1174000],
  [
    1860, 1800, 1, 13.72, -0.332447, 0.0068612, 0.0041116, -0.00037436,
    0.0000121272, -0.0000001699, 0.000000000875,
  ],
  [
    1900,
    1860,
    1,
    7.62,
    0.5737,
    -0.251754,
    0.01680668,
    -0.0004473624,
    1 / 233174,
  ],
  [1920, 1900, 1, -2.79, 1.494119, -0.0598939, 0.0061966, -0.000197],
  [1941, 1920, 1, 21.2, 0.84493, -0.0761, 0.0020936],
  [1961, 1950, 1, 29.07, 0.407, -1 / 233, 1 / 2547],
  [1986, 1975, 1, 45.45, 1.067, -1 / 260, -1 / 718],
  [
    2005, 2000, 1, 63.86, 0.3345, -0.060374, 0.0017275, 0.000651814,
    0.00002373599,
  ],
  [2050, 2000, 1, 62.92, 0.32217, 0.005589],
  // 2050 ≤ y < 2150: the reference's −20 + 32u² − 0.5628(2150 − y), expanded
  // onto the same u = (y − 1820)/100 basis so it fits the table form.
  [2150, 1820, 100, -205.72, 56.28, 32],
  [Infinity, 1820, 100, -20, 0, 32],
];

/**
 * Convert JavaScript Date to Julian Date (UT)
 * @param date JavaScript Date (UTC)
 * @returns Julian Date (days)
 */
export function dateToJD(date: Date): number {
  const msSinceJ2000 = date.getTime() - J2000_EPOCH.getTime();
  const daysSinceJ2000 = msSinceJ2000 / 86400000;
  return J2000_JD + daysSinceJ2000;
}

/**
 * Convert Julian Date (UT) to JavaScript Date
 * @param jd Julian Date (days)
 * @returns JavaScript Date (UTC)
 */
export function jdToDate(jd: number): Date {
  const daysSinceJ2000 = jd - J2000_JD;
  const msSinceJ2000 = daysSinceJ2000 * 86400000;
  return new Date(J2000_EPOCH.getTime() + msSinceJ2000);
}

/**
 * Calculate Delta-T (TT − UT1) in seconds.
 *
 * Espenak & Meeus polynomial set (see `DELTA_T_BRANCHES`). Accurate to a few
 * seconds over the historical record and continuous across the full window our
 * ephemeris providers claim, so scrubbing the Timeline to year 3000 no longer
 * silently pins ΔT at a clamped 100 s (real ΔT there is ≈ 4400 s ≈ 0.6° of
 * lunar orbital motion).
 *
 * Known approximation, disclosed rather than hidden: the 2005–2050 branch was
 * fitted in 2006 and slightly over-predicts present-day ΔT (≈ 75 s modelled vs
 * ≈ 69 s observed for 2026) because Earth's rotational slowdown stalled after
 * the fit. That residual is ~0.2 arcsec of planetary position — below anything
 * the scene can show. Live IERS bulletins would be the only way to do better.
 *
 * @param date JavaScript Date
 * @returns Delta-T in seconds
 */
export function calculateDeltaT(date: Date): number {
  // Decimal year per the reference's convention: y = year + (month − 0.5)/12.
  const year = date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12;

  const branch =
    DELTA_T_BRANCHES.find((b) => year < b[0]!) ??
    DELTA_T_BRANCHES[DELTA_T_BRANCHES.length - 1]!;

  const t = (year - branch[1]!) / branch[2]!;
  let deltaT = 0;
  for (let k = branch.length - 1; k >= 3; k--) {
    deltaT = deltaT * t + branch[k]!;
  }
  return deltaT;
}

/**
 * Convert Julian Date (UT) to Terrestrial Time (TT)
 * @param jdUT Julian Date (UT)
 * @param deltaT Delta-T in seconds (optional, will be estimated if not provided)
 * @returns Julian Date (TT)
 */
export function jdUTToTT(jdUT: number, deltaT?: number): number {
  const dt = deltaT !== undefined ? deltaT : calculateDeltaT(jdToDate(jdUT));
  return jdUT + dt / 86400;
}

/**
 * Convert Terrestrial Time (TT) to Julian Date (UT)
 * @param jdTT Julian Date (TT)
 * @param deltaT Delta-T in seconds (optional, will be estimated if not provided)
 * @returns Julian Date (UT)
 */
export function jdTTToUT(jdTT: number, deltaT?: number): number {
  const dt = deltaT !== undefined ? deltaT : calculateDeltaT(jdToDate(jdTT));
  return jdTT - dt / 86400;
}

/**
 * Approximate conversion from TT to TDB (Barycentric Dynamical Time)
 * Uses a simplified periodic model with ~2ms accuracy
 * Based on equation from Moyer (2003) and Irwin & Fukushima (1999)
 * @param jdTT Julian Date (TT)
 * @returns Julian Date (TDB)
 */
export function jdTTToTDB(jdTT: number): number {
  // Days from J2000.0
  const d = jdTT - J2000_JD;

  // Mean anomaly of Earth (radians)
  const g = (357.53 + 0.98560028 * d) * (Math.PI / 180);

  // TDB - TT in seconds (simplified model)
  // Maximum error ~2ms over 2000-2050
  const tdbMinusTT = 0.001658 * Math.sin(g) + 0.000014 * Math.sin(2 * g);

  return jdTT + tdbMinusTT / 86400;
}

/**
 * Convert TDB to TT
 * @param jdTDB Julian Date (TDB)
 * @returns Julian Date (TT)
 */
export function jdTDBToTT(jdTDB: number): number {
  // Iterative solution (converges quickly)
  let jdTT = jdTDB;
  for (let i = 0; i < 3; i++) {
    jdTT = jdTDB - (jdTTToTDB(jdTT) - jdTT);
  }
  return jdTT;
}

/**
 * Convert Date directly to TDB
 * @param date JavaScript Date (UTC)
 * @returns Julian Date (TDB)
 */
export function dateToTDB(date: Date): number {
  const jdUT = dateToJD(date);
  const jdTT = jdUTToTT(jdUT);
  return jdTTToTDB(jdTT);
}

/**
 * Convert TDB to Date
 * @param jdTDB Julian Date (TDB)
 * @returns JavaScript Date (UTC)
 */
export function tdbToDate(jdTDB: number): Date {
  const jdTT = jdTDBToTT(jdTDB);
  const jdUT = jdTTToUT(jdTT);
  return jdToDate(jdUT);
}

/**
 * Convert Julian Date to Julian Centuries from J2000.0
 * @param jd Julian Date
 * @returns Julian Centuries (36525 days per century)
 */
export function jdToJulianCenturies(jd: number): number {
  return (jd - J2000_JD) / DAYS_PER_JULIAN_CENTURY;
}

/**
 * Convert Julian Date to Julian Years from J2000.0
 * @param jd Julian Date
 * @returns Julian Years (365.25 days per year)
 */
export function jdToJulianYears(jd: number): number {
  return (jd - J2000_JD) * JULIAN_YEARS_PER_DAY;
}

/**
 * Convert Julian Years to Julian Date
 * @param jy2000 Julian Years from J2000.0
 * @returns Julian Date
 */
export function julianYearsToJD(jy2000: number): number {
  return J2000_JD + jy2000 / JULIAN_YEARS_PER_DAY;
}

/**
 * Convert Date to Julian Years from J2000.0
 * @param date JavaScript Date
 * @returns Julian Years
 */
export function dateToJulianYears(date: Date): number {
  return jdToJulianYears(dateToJD(date));
}

/**
 * Convert Julian Years to Date
 * @param jy2000 Julian Years from J2000.0
 * @returns JavaScript Date
 */
export function julianYearsToDate(jy2000: number): Date {
  return jdToDate(julianYearsToJD(jy2000));
}

/**
 * Get the time scale used by analytical ephemerides.
 * The live providers in this engine (VSOP87D, Pluto-Meeus, ELP/MPP02-trunc)
 * all consume TDB internally.
 * @param date JavaScript Date
 * @returns Julian Date in TDB
 */
export function getEphemerisTime(date: Date): number {
  return dateToTDB(date);
}

/**
 * Interface for comprehensive time conversion results
 */
export interface TimeConversionResult {
  date: Date;
  jdUT: number;
  jdTT: number;
  jdTDB: number;
  julianYears: number;
  julianCenturies: number;
  deltaT: number;
}

/**
 * Perform all common time conversions at once
 * @param date JavaScript Date
 * @returns Comprehensive time conversion result
 */
export function convertTime(date: Date): TimeConversionResult {
  const jdUT = dateToJD(date);
  const deltaT = calculateDeltaT(date);
  const jdTT = jdUT + deltaT / 86400;
  const jdTDB = jdTTToTDB(jdTT);

  return {
    date,
    jdUT,
    jdTT,
    jdTDB,
    julianYears: (jdUT - J2000_JD) * JULIAN_YEARS_PER_DAY,
    julianCenturies: (jdUT - J2000_JD) / DAYS_PER_JULIAN_CENTURY,
    deltaT,
  };
}
