/**
 * Per-star sizing helpers for the Gaia-Sky-style solid-angle vertex
 * (θ.1b port). Provides the `a_size` attribute that feeds
 * `solidAngle = a_size / dist` in `star.group.quad.vertex.glsl`.
 *
 * **Key semantic (Opus audit, 2026-04-21): `a_size` is NOT a physical
 * stellar radius.** Gaia Sky's own source is explicit:
 *
 *   `AstroUtils.absoluteMagnitudeToPseudoSize` JavaDoc:
 *   > "The pseudo-size of this star... has no physical meaning and has
 *   > no relation to the actual physical size of the star."
 *
 * The value is a rendering-only pseudo-size derived from absolute
 * magnitude / pseudo-luminosity:
 *
 *   pseudoL = 10^(-0.4 · absMag)
 *   size    = sqrt(pseudoL) · 0.15  (parsecs, pre-render)
 *
 * Crucially, the formula uses `sqrt(L)` WITHOUT the Stefan-Boltzmann
 * `/T²` correction, so cool red supergiants (Betelgeuse, Arcturus)
 * stay comparable to bright hot dwarfs (Sirius, Vega) instead of
 * dwarfing them. An earlier θ.1b implementation (2026-04-20) ported
 * Stefan-Boltzmann physical radii and shipped a test asserting
 * Betelgeuse > Sirius — both were wrong relative to Gaia Sky, and
 * produced the visual artifact the user flagged (Betelgeuse larger
 * than the Sun on screen).
 *
 * Full pipeline (Gaia Sky source, verified 2026-04-21):
 *   1. `BinaryPointDataProvider.java:262` — on catalog load if no
 *      extra size column: `sizePc = absoluteMagnitudeToPseudoSize(absMag)`
 *   2. `StarSetInstancedRenderer.java:143` — into vertex buffer:
 *      `a_size = particle.size() × Constants.STAR_SIZE_FACTOR × sizeFactor`
 *      (STAR_SIZE_FACTOR = 1.31526e-6, sizeFactor is an app-level tuning knob)
 *   3. `star.group.quad.vertex.glsl:100` — in the shader:
 *      `solidAngle = a_size / dist`
 *
 * HYG v4.2 carries apparent magnitude and parallax-derived distance,
 * so the atlas port computes `absMag` via distance modulus per star
 * and pipes it through the pseudo-size formula.
 */

/**
 * Gaia Sky's `Constants.STAR_SIZE_FACTOR` — a unit-conversion
 * multiplier applied per-vertex when `a_size` is written into the
 * instance attribute buffer (`StarSetInstancedRenderer.java:143`).
 * Source-verified: `Constants.java:51`.
 */
export const STAR_SIZE_FACTOR = 1.31526e-6;

/**
 * Gaia Sky's pseudo-size coefficient. Literal `0.15` in
 * `AstroUtils.absoluteMagnitudeToPseudoSize` — the pre-render factor
 * that scales `sqrt(pseudoL)` from dimensionless to parsecs before
 * `STAR_SIZE_FACTOR` converts to the final render-space magnitude.
 */
export const GAIA_PSEUDO_SIZE_COEFFICIENT_PC = 0.15;

/**
 * Distance modulus — convert apparent magnitude to absolute magnitude
 * given heliocentric distance in parsecs.
 *   absMag = apparentMag − 5 · log10(distPc / 10)
 * Degenerate distances (≤ 0) fall back to the apparent magnitude so
 * the caller always gets a finite result (matches Gaia Sky's
 * `AstroUtils.apparentToAbsoluteMagnitude` guard).
 */
export const apparentToAbsMag = (
  apparentMag: number,
  distPc: number
): number => {
  if (!Number.isFinite(apparentMag)) return apparentMag;
  if (distPc <= 0) return apparentMag;
  return apparentMag - 5 * Math.log10(distPc / 10);
};

/**
 * Gaia Sky `AstroUtils.absoluteMagnitudeToPseudoSize` — exact port.
 * Returns pseudo-size in parsecs (unit name mirrors the
 * `BinaryPointDataProvider.java:262` local `double sizePc = ...`).
 *
 * Java source (`AstroUtils.java:470`):
 * ```java
 * double pseudoL = FastMath.pow(10, -0.4 * absMag);
 * double sizeFactor = Nature.PC_TO_M * Constants.ORIGINAL_M_TO_U * 0.15;
 * return FastMath.min(Math.pow(pseudoL, 0.5) * sizeFactor, 1e10)
 *        * Constants.DISTANCE_SCALE_FACTOR;
 * ```
 *
 * The Java version returns internal units (meters × ORIGINAL_M_TO_U).
 * The TS port factors out the unit conversion so the caller can
 * apply the atlas's own `DISTANCE_SCALE` (1 pc → scene units) at the
 * buffer-write site, keeping the result in parsecs here.
 *
 * Per-star numeric sanity check (cross-verified against Gaia Sky
 * runtime by the Opus audit, 2026-04-21):
 *   - Sirius   (apparentMag=−1.46, dist=2.64 pc → absMag≈+1.44) →
 *     sqrt(10^(−0.576))·0.15 ≈ 0.0774 pc
 *   - Betelgeuse (apparentMag=0.42, dist=168 pc → absMag≈−5.71) →
 *     sqrt(10^(+2.284))·0.15 ≈ 2.083 pc
 *
 * Both divided by their respective distances (solidAngle = size/dist):
 *   - Sirius solidAngle ≈ 2.93e-2 rad (→ clamps to 3.0e-8 per
 *     u_solidAngle upper bound in the shader, so renders at ceiling)
 *   - Betelgeuse solidAngle ≈ 1.24e-2 rad (→ also clamps)
 *
 * Both SATURATE at the upper clamp, but the pre-clamp ordering matches
 * Gaia Sky (Sirius > Betel), and more importantly the typical HYG
 * star at mag 5+ falls inside the `[1e-10, 2e-9]` band where the
 * opacity-lint mapping gives meaningful fade.
 */
export const absoluteMagnitudeToPseudoSize = (absMag: number): number => {
  if (!Number.isFinite(absMag)) return 0;
  const pseudoL = Math.pow(10, -0.4 * absMag);
  const sizePc = Math.sqrt(pseudoL) * GAIA_PSEUDO_SIZE_COEFFICIENT_PC;
  // Gaia Sky clamps at 1e10 internal units (post sizeFactor multiply).
  // In parsec-space with the 0.15 coefficient stripped, that's an
  // absurd ceiling; `Number.isFinite` catches degenerate absMag
  // inputs upstream, so we mirror the `min(... , 1e10)` literal for
  // strict 1:1 parity even if it rarely fires in practice.
  return Math.min(sizePc, 1e10);
};

/**
 * Convenience helper for the HYG pipeline: takes apparent magnitude
 * + heliocentric distance in parsecs (both shipped in the binary
 * catalog) and returns the Gaia-Sky-style pseudo-size in parsecs.
 * Used by `Starfield.tsx buildSizeAttribute` — one call per star at
 * geometry-build time.
 */
export const pseudoSizeFromApparentMag = (
  apparentMag: number,
  distPc: number
): number => {
  const absMag = apparentToAbsMag(apparentMag, distPc);
  return absoluteMagnitudeToPseudoSize(absMag);
};
