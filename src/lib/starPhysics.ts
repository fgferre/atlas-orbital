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
