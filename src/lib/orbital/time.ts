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
 * - VSOP2013 / ELP2000 time conventions
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

// Delta-T approximation coefficients (simplified model)
// For more precision, use lookup tables or IERS data
const DELTA_T_POLY_COEFFS = {
  // For years 2000-2050: polynomial approximation
  baseYear: 2000,
  // Delta-T in seconds = a + b*t + c*t^2 where t = years from 2000
  a: 64.0, // Base offset around year 2000
  b: 0.5, // Rate of change per year
  c: 0.001, // Acceleration term
};

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
 * Calculate approximate Delta-T (TT - UT1) in seconds
 * Uses a simplified polynomial model for 2000-2050
 * For higher precision, use IERS bulletins
 * @param date JavaScript Date
 * @returns Delta-T in seconds
 */
export function calculateDeltaT(date: Date): number {
  const year =
    date.getUTCFullYear() +
    (date.getUTCMonth() + 1) / 12 +
    date.getUTCDate() / 365.25;

  const t = year - DELTA_T_POLY_COEFFS.baseYear;

  // Polynomial approximation: Delta-T = a + b*t + c*t^2
  const deltaT =
    DELTA_T_POLY_COEFFS.a +
    DELTA_T_POLY_COEFFS.b * t +
    DELTA_T_POLY_COEFFS.c * t * t;

  return Math.max(30, Math.min(100, deltaT)); // Clamp to reasonable range
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
 * Get the time scale used by analytical ephemerides
 * Most modern ephemerides (VSOP2013, ELP2000-82b) use TDB internally
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
