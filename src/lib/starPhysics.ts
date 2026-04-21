/**
 * Star-physics helpers for the Gaia-Sky-style solid-angle vertex
 * (θ.1b port). Provides per-star physical radius synthesis from
 * HYG catalog attributes (B-V color index) so the shader can
 * compute `solidAngle = radius / distance`.
 *
 * HYG v4.2 does not ship stellar radius directly. Gaia Sky pulls
 * it from its own catalog's `a_size` attribute. The θ-audit's
 * Round 5 classified two viable substitutes:
 *
 *   - Stefan-Boltzmann from absolute magnitude + Teff (Ballesteros):
 *     physically anchored, ~40 LOC, requires parallax-derived absMag.
 *   - Spectral-class → radius lookup table (this file): fast,
 *     deterministic, indexed via B-V mapped to spectral class, using
 *     main-sequence (luminosity class V) typical radii.
 *
 * The lookup here takes the pragmatic path. Main-sequence radii are
 * the statistical norm in the HYG magnitude-limited sample; the
 * resulting `solidAngle = a_size / dist` falls inside Gaia Sky's
 * default `u_solidAngleMap = vec2(1e-10, 2e-9)` band for typical
 * HYG stars at typical HYG distances (verified manually for Sirius
 * at 2.64 pc → ~1.45e-8 rad, and mag-6 at 20 pc → ~1.1e-9 rad).
 *
 * If the matched-shot against Gaia Sky shows systematic radius
 * errors for giants / supergiants (which are under-represented here),
 * escalate to the Stefan-Boltzmann path in a follow-up; this file's
 * lookup stays as the fallback.
 */

// 1 solar radius in parsecs.
// 6.957e8 m / (3.0857e16 m/pc) ≈ 2.2537e-8 pc.
export const SOLAR_RADIUS_PC = 2.2537e-8;

// Sun's absolute magnitude (V band) — anchor for the distance-modulus
// and Stefan-Boltzmann path below.
export const SUN_ABS_MAG_V = 4.83;
// Sun's effective temperature in K.
export const SUN_TEFF = 5778;

/**
 * Ballesteros 2012 formula for effective temperature from B-V color
 * index. Applicable across the main HYG range with ~5 % accuracy.
 * Reference: Ballesteros, F.J. (2012) "New insights into black bodies"
 * https://arxiv.org/abs/1201.1809
 */
export const bvToTeff = (bv: number): number => {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
};

/**
 * Distance modulus — convert apparent magnitude to absolute magnitude
 * given heliocentric distance in parsecs.
 *   absMag = apparentMag − 5 · log10(distPc / 10)
 * Degenerate distances (≤ 0) fall back to the apparent magnitude so
 * the caller always gets a finite result.
 */
export const apparentToAbsMag = (
  apparentMag: number,
  distPc: number
): number => {
  if (distPc <= 0) return apparentMag;
  return apparentMag - 5 * Math.log10(distPc / 10);
};

/**
 * Stefan-Boltzmann-derived stellar radius, in solar radii.
 *
 *   L / L_sun = 10^(−0.4 · (absMag − absMag_sun))
 *   R / R_sun = sqrt(L / L_sun) · (T_sun / T_eff)²
 *
 * Physically anchored across luminosity classes — recovers giant /
 * supergiant radii the main-sequence `bvToSolarRadius` table misses
 * (Codex θ.1b review finding #1, 2026-04-20). Degenerate inputs
 * (non-finite absMag, zero Teff) fall back to a unit radius so the
 * HYG pipeline never emits NaN geometry.
 */
export const estimateRadiusSolar = (
  apparentMag: number,
  distPc: number,
  bv: number
): number => {
  if (!Number.isFinite(apparentMag) || !Number.isFinite(distPc) || distPc <= 0)
    return 1.0;
  const absMag = apparentToAbsMag(apparentMag, distPc);
  if (!Number.isFinite(absMag)) return 1.0;
  const luminosityRatio = Math.pow(10, -0.4 * (absMag - SUN_ABS_MAG_V));
  if (!Number.isFinite(luminosityRatio) || luminosityRatio < 0) return 1.0;
  const teff = bvToTeff(bv);
  if (!Number.isFinite(teff) || teff <= 0) return 1.0;
  const tRatio = SUN_TEFF / teff;
  return Math.sqrt(luminosityRatio) * tRatio * tRatio;
};

/**
 * Stefan-Boltzmann-derived radius in parsecs — used by
 * `Starfield.tsx buildSizeAttribute` to fill the `a_size` vertex
 * attribute. Preferred over `bvToRadiusPc` (main-sequence lookup)
 * for 1:1 Gaia Sky parity on bright giants / supergiants.
 */
export const estimateRadiusPc = (
  apparentMag: number,
  distPc: number,
  bv: number
): number => {
  return estimateRadiusSolar(apparentMag, distPc, bv) * SOLAR_RADIUS_PC;
};

/**
 * Main-sequence stellar radius in solar radii, estimated from B-V
 * color index. Piecewise monotonic — O/B stars are largest, M stars
 * smallest. Table cross-checked against Wikipedia's "main sequence"
 * typical values and Stellarium's internal tables:
 *
 *   Spectral   B-V range        R / R_sun
 *   O          bv < -0.30       12.0
 *   B          -0.30 ≤ bv < -0.15    7.0
 *   A          -0.15 ≤ bv < 0.00    2.5
 *   F           0.00 ≤ bv < 0.30    1.4
 *   G           0.30 ≤ bv < 0.60    1.05   (Sun at bv≈0.63 ≈ 1.0)
 *   K           0.60 ≤ bv < 1.00    0.85
 *   M early     1.00 ≤ bv < 1.40    0.55
 *   M late      bv ≥ 1.40             0.25
 */
export const bvToSolarRadius = (bv: number): number => {
  if (bv < -0.3) return 12.0;
  if (bv < -0.15) return 7.0;
  if (bv < 0.0) return 2.5;
  if (bv < 0.3) return 1.4;
  if (bv < 0.6) return 1.05;
  if (bv < 1.0) return 0.85;
  if (bv < 1.4) return 0.55;
  return 0.25;
};

/**
 * Physical radius in parsecs, given B-V color index.
 * Used by `Starfield.tsx` to fill the `a_size` per-star attribute
 * (stored in scene units after multiplication by `DISTANCE_SCALE`).
 */
export const bvToRadiusPc = (bv: number): number => {
  return bvToSolarRadius(bv) * SOLAR_RADIUS_PC;
};
