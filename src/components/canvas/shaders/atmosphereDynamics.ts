/**
 * T5.1 — per-frame atmosphere uniform recompute.
 *
 * Gaia writes `fKrESun` + `fKmESun` + `fAlpha` + `nSamples` to the
 * atmosphere shader material EVERY frame inside
 * `updateAtmosphericScatteringParams`
 * (`/tmp/gaiasky/core/src/gaiasky/scene/record/AtmosphereComponent.java:240-288`).
 * The scattering coefficients get boosted when the camera descends
 * into the atmosphere — that's what produces the "atmosphere brightens
 * as you enter it" effect.
 *
 * **Source quote**
 * (`AtmosphereComponent.java:229-250`):
 * ```
 * float camHeight = (float) (aux3.len());
 * float m_ESun = m_eSun;
 * float camHeightGr = camHeight - m_fInnerRadius;
 * float atmFactor = (m_fAtmosphereHeight - camHeightGr) / m_fAtmosphereHeight;
 *
 * if (!ground && camHeightGr < m_fAtmosphereHeight) {
 *     // Camera inside atmosphere
 *     m_ESun += atmFactor * 100f;
 * }
 *
 * // These are here to get the desired effect inside the atmosphere
 * if (mat.has(AtmosphereAttribute.KrESun))
 *     ((AtmosphereAttribute) ...).value = m_Kr * m_ESun;
 * ...
 * ```
 *
 * **Atlas adaptation.** Atlas's atmosphere uniforms use the
 * normalized unit-sphere model-space where `fInnerRadius = 1.0` and
 * `fOuterRadius = outerRadiusRatio` (typically 1.025). The per-frame
 * `fCameraHeight` uniform (written by `Planet.tsx` useFrame) is the
 * camera position length in that same normalized space — a direct
 * stand-in for Gaia's `camHeight`. Atlas doesn't have a separate
 * "ground" shader path (Gaia renders atmosphere twice: once for the
 * sky shell, once for the ground-scattering tint), so the `ground`
 * parameter from the Gaia signature collapses to always-false (ESun
 * boost always applies when the camera is inside atmosphere).
 *
 * **T5.1 scope** (Silver tier per `feedback_divergence_aaa_ux.md`):
 * write all four uniforms per frame unconditionally to match Gaia's
 * write schedule 1:1. `fAlpha` + `nSamples` come from the config and
 * don't change across frames in atlas's current usage (Gaia's code
 * at line 285-288 writes them unconditionally too — in both engines
 * the values are constant, but the write happens every frame so the
 * schedule matches). Writing them lets atlas stay behaviourally
 * identical to Gaia if a future Gaia change makes them dynamic.
 */

import {
  GAIA_DEFAULT_ALPHA,
  GAIA_DEFAULT_E_SUN,
  GAIA_DEFAULT_OUTER_RADIUS_RATIO,
  GAIA_DEFAULT_SAMPLE_COUNT,
} from "./atmosphereShader";
import type { AtmosphereScatteringConfig } from "../../../lib/astrophysics";

/**
 * Additive boost applied to `m_ESun` when the camera is inside the
 * atmosphere. Gaia literal at `AtmosphereComponent.java:235`
 * (`m_ESun += atmFactor * 100f`).
 */
export const ATMOSPHERE_INSIDE_ESUN_BOOST = 100.0;

/**
 * Atlas's normalized inner-sphere radius. In Gaia's pipeline this
 * comes from `planetSize/2 * normFactor` where `normFactor = 2/planetSize`,
 * so `m_fInnerRadius = 1.0`. Atlas hardcodes the same normalized 1.0
 * in `buildAtmosphereUniforms` so keeping the literal here keeps the
 * source-of-truth centralised.
 */
export const ATMOSPHERE_INNER_RADIUS = 1.0;

/**
 * Pre-resolved atmosphere constants needed for the per-frame
 * recompute. Atmospheres re-resolve their config's optional fields
 * via the Gaia defaults at mount time; this shape holds the result
 * so `Planet.tsx` can compute per-frame uniforms without re-doing
 * the `??` chain each tick.
 */
export interface ResolvedAtmosphereDynamicConfig {
  /** Rayleigh scattering coefficient (config.kRayleigh). */
  kRayleigh: number;
  /** Mie scattering coefficient (config.kMie). */
  kMie: number;
  /** Base solar brightness (config.eSun ?? 10). */
  baseESun: number;
  /** Thickness of the atmosphere shell in normalized units. */
  atmosphereHeight: number;
  /** Alpha (config.alpha ?? 1.0). Typically constant across frames. */
  alpha: number;
  /** Sample count (config.sampleCount ?? 23). Typically constant across frames. */
  sampleCount: number;
}

/**
 * Resolve an `AtmosphereScatteringConfig` to the pre-defaulted,
 * flat-primitive shape the per-frame helper consumes. Mirror of the
 * `??` chain in `buildAtmosphereUniforms` — callers typically call
 * this once on component mount + cache the result in a ref, then
 * pass the ref to `computeDynamicAtmosphereUniforms` each frame.
 */
export const resolveAtmosphereDynamicConfig = (
  config: AtmosphereScatteringConfig
): ResolvedAtmosphereDynamicConfig => {
  const baseESun = config.eSun ?? GAIA_DEFAULT_E_SUN;
  const outerRadius =
    config.outerRadiusRatio ?? GAIA_DEFAULT_OUTER_RADIUS_RATIO;
  const alpha = config.alpha ?? GAIA_DEFAULT_ALPHA;
  const sampleCount = config.sampleCount ?? GAIA_DEFAULT_SAMPLE_COUNT;
  return {
    kRayleigh: config.kRayleigh,
    kMie: config.kMie,
    baseESun,
    atmosphereHeight: outerRadius - ATMOSPHERE_INNER_RADIUS,
    alpha,
    sampleCount,
  };
};

/**
 * Output of the per-frame recompute. Caller writes each field into
 * the corresponding atmosphere shader uniform.
 */
export interface DynamicAtmosphereUniforms {
  fKrESun: number;
  fKmESun: number;
  fAlpha: number;
  nSamples: number;
}

/**
 * Per-frame recompute of the atmosphere scattering uniforms Gaia
 * writes via `updateAtmosphericScatteringParams` — boosts `m_ESun`
 * when the camera is inside the atmosphere shell, then scales the
 * Rayleigh / Mie coefficients by the (possibly boosted) `m_ESun`.
 *
 * `cameraHeightNormalized` is the camera position length in the
 * atmosphere shader's normalized unit-sphere space (atlas writes
 * this to the `fCameraHeight` uniform each frame; same value
 * passed here).
 */
export const computeDynamicAtmosphereUniforms = (
  config: ResolvedAtmosphereDynamicConfig,
  cameraHeightNormalized: number
): DynamicAtmosphereUniforms => {
  const camHeightGr = cameraHeightNormalized - ATMOSPHERE_INNER_RADIUS;
  let eSun = config.baseESun;
  // Gaia guard: the boost only applies when the camera is inside the
  // atmosphere shell (`camHeightGr < atmosphereHeight`). Outside the
  // shell the base eSun stays unchanged so distant viewers see the
  // natural falloff, not the "inside glow" the boost is tuned for.
  if (camHeightGr < config.atmosphereHeight) {
    const atmFactor =
      (config.atmosphereHeight - camHeightGr) / config.atmosphereHeight;
    eSun += atmFactor * ATMOSPHERE_INSIDE_ESUN_BOOST;
  }
  return {
    fKrESun: config.kRayleigh * eSun,
    fKmESun: config.kMie * eSun,
    fAlpha: config.alpha,
    nSamples: config.sampleCount,
  };
};
