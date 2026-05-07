/**
 * T6.4-M4 fix — class-aware brightness-to-color transfer.
 *
 * Replaces the M4 `mix(white, classColor, smoothstep(b, whitePoint))`
 * formula in `proceduralSunShaders.ts`. The M4 formula produced a
 * mathematically washed-out Sun because at typical surface brightness
 * (`b ∈ [2, 4]`) it gave near-white output (e.g. b=2 → (1.2, 1.077,
 * 0.991)) while the pre-M4 stylized curve at the same b gave deep
 * orange (1.2, 0.48, 0.077). Per the post-audit consensus, the right
 * structural fix is:
 *
 *   1. Preserve the pre-M4 per-channel exponent CURVE shape:
 *        R = b × brightness
 *        G = b² × tintBase × brightness
 *        B = b⁴ × tintBase³ × brightness
 *      This is the source of atlas's signature granulation contrast —
 *      the b² and b⁴ damping factors give multi-channel noise variance
 *      (not just luminance) which reads as visible surface detail.
 *
 *   2. Generalize per-class via CLASS-RELATIVE BIAS (not pow(classColor, N)
 *      directly, which couldn't preserve the Sun byte-identical):
 *        ratio = classColor / SOLAR_CLASS_COLOR
 *        bias = clamp(pow(ratio, gamma), floor, ceiling)
 *      For the Sun (classColor = SOLAR_CLASS_COLOR), ratio = (1,1,1) so
 *      bias = (1,1,1) and the legacy curve renders byte-identical.
 *
 *   3. Material-specific tintBase (sphere = 0.2, glow = 0.4) preserves
 *      the pre-M4 architectural separation between surface and corona.
 *      Both materials share the same classBias because spectral identity
 *      is one signal.
 *
 * Pure-TS module (no Three.js / shader dependencies) so the math is
 * unit-testable end-to-end before the shader change. The shader will
 * mirror this exactly via `legacyCurve` + `classRelativeBias` GLSL
 * helpers, with the same floor/ceiling clamps and same gamma.
 *
 * **Plan B (ACTIVATED 2026-05-07 after smoke evidence)**: the
 * legacy × bias path on its own can't give hot stars blue-white
 * identity — the legacy curve's `b⁴ × tint³` damping (≈ 0.0048 for
 * Sun-tuned tint=0.2) collapses blue at typical surface b
 * regardless of how we tune `classBias.b`. Codex smoke
 * (2026-05-07) confirmed Sirius (A0V, 9940 K) reading
 * orange-yellow under Plan A defaults despite the panel showing
 * the correct spectral class.
 *
 * Plan B addresses this by blending a blackbody-LINEAR curve
 * (`classColor × b × brightness` — no per-channel exponent) into
 * the result, gated on temperature distance from solar. Sun and
 * cool stars get `weight=0` (pure legacy; Sun byte-identical
 * preserved, Atlas-style red preserved for cool stars); hot stars
 * (`tEff > 7500 K`) ramp toward `weight=1` (pure blackbody-linear,
 * proper blue-white). The asymmetric activation is intentional:
 * the legacy curve's red-bias is a feature for warm/cool stars
 * but a bug for hot stars. See `PLAN_B_TEFF_THRESHOLD_K`,
 * `PLAN_B_TEFF_RAMP_K`, `planBWeight`, `blackbodyLinearCurve`,
 * `applyTransferWithPlanB` below.
 */

/**
 * Solar reference linear-RGB at T_eff = 5778 K. Pinned numerically so
 * the Sun-byte-identical guarantee doesn't depend on
 * `blackbodyRgbFromTemperature(5778)` returning an exact value (the
 * Helland fit is approximate). Matches `SUN_DEFAULT_VISUAL_PROFILE.classColor`.
 */
export const SOLAR_CLASS_COLOR: readonly [number, number, number] = [
  1.0, 0.891, 0.796,
] as const;

/**
 * Calibration knobs (atlas-opinion). `gamma=1` means bias = ratio
 * directly (most conservative — preserves Sun and gives mild class
 * differentiation). Higher gamma amplifies class identity at the cost
 * of HDR explosion on hot/cool extremes. `floor` prevents zero-channel
 * collapse for cool stars; `ceiling` prevents laser-blue for hot stars.
 *
 * Initial values for Plan A:
 *   - Guarantee Sun byte-identical pre-M4 (trivial — bias = 1 at
 *     gamma=1 when classColor matches the solar reference).
 *   - Give a mild class chroma shift in the math direction
 *     (Betelgeuse / Proxima redder than Sun without losing
 *     Atlas-style stylization). Hot stars are NOT calibrated via
 *     these knobs — they're handled by Plan B blend instead
 *     (see `applyTransferWithPlanB` and `planBWeight` below).
 */
export const DEFAULT_CLASS_BIAS_GAMMA = 1.0;
export const DEFAULT_CLASS_BIAS_FLOOR = 0.12;
export const DEFAULT_CLASS_BIAS_CEILING = 3.0;

/**
 * Pre-M4 atlas surface curve, factored for general `tintBase`.
 *
 * Pre-M4 hardcoded `uTint = 0.2` for the surface and `uTint = 0.4`
 * for the glow. The implicit shader formula `(vec3(b·t, (b·t)², (b·t)⁴)
 * / t) × brightness` simplifies to `(b, b²·t, b⁴·t³) × brightness`.
 * This function returns that triple for any `(b, tintBase, brightness)`.
 *
 * For the Sun surface (`tintBase=0.2`, `brightness=0.6`) at `b=1`:
 *   → (0.6, 0.12, 0.0048)
 * Matches the pre-M4 byte-identical baseline.
 */
export function legacyCurve(
  b: number,
  tintBase: number,
  brightness: number
): [number, number, number] {
  const tintSq = tintBase * tintBase;
  const tintCu = tintSq * tintBase;
  return [
    b * brightness,
    b * b * tintBase * brightness,
    b * b * b * b * tintCu * brightness,
  ];
}

/**
 * Class-relative bias: `clamp(pow(classColor / SOLAR_CLASS_COLOR,
 * gamma), floor, ceiling)`.
 *
 * For the Sun (`classColor = SOLAR_CLASS_COLOR`), every channel ratio
 * is 1 so `bias = (1, 1, 1)` regardless of gamma — the legacy curve
 * passes through unchanged. For other stars, the bias amplifies the
 * channel where classColor exceeds solar (e.g. blue for Sirius) and
 * attenuates where it falls below (e.g. blue for cool stars).
 *
 * `gamma` controls the strength of class identity:
 *   - gamma=1 (default): mild differentiation, safe for HDR.
 *   - gamma>1: stronger identity but risks laser-channel blowup at
 *     high b due to the b⁴ blue term in legacyCurve.
 *
 * `floor` clamps below to prevent dim-channel collapse (cool stars
 * losing blue entirely → flat monochromatic).
 * `ceiling` clamps above to prevent neon-channel explosion (hot stars
 * boosting blue beyond what bloom can absorb gracefully).
 */
export function classRelativeBias(
  classColor: readonly [number, number, number],
  gamma: number = DEFAULT_CLASS_BIAS_GAMMA,
  floor: number = DEFAULT_CLASS_BIAS_FLOOR,
  ceiling: number = DEFAULT_CLASS_BIAS_CEILING
): [number, number, number] {
  const r = clampPow(
    classColor[0] / SOLAR_CLASS_COLOR[0],
    gamma,
    floor,
    ceiling
  );
  const g = clampPow(
    classColor[1] / SOLAR_CLASS_COLOR[1],
    gamma,
    floor,
    ceiling
  );
  const b = clampPow(
    classColor[2] / SOLAR_CLASS_COLOR[2],
    gamma,
    floor,
    ceiling
  );
  return [r, g, b];
}

const clampPow = (
  ratio: number,
  gamma: number,
  floor: number,
  ceiling: number
): number => {
  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : floor;
  return Math.max(floor, Math.min(ceiling, Math.pow(safeRatio, gamma)));
};

/**
 * Combined transfer: `legacyCurve × classRelativeBias`. This is the
 * function the sphere + glow fragment shaders mirror exactly (with
 * material-specific `tintBase` + `brightness`).
 */
export function applyClassColorTransfer(
  b: number,
  tintBase: number,
  brightness: number,
  classColor: readonly [number, number, number],
  gamma: number = DEFAULT_CLASS_BIAS_GAMMA,
  floor: number = DEFAULT_CLASS_BIAS_FLOOR,
  ceiling: number = DEFAULT_CLASS_BIAS_CEILING
): [number, number, number] {
  const curve = legacyCurve(b, tintBase, brightness);
  const bias = classRelativeBias(classColor, gamma, floor, ceiling);
  return [curve[0] * bias[0], curve[1] * bias[1], curve[2] * bias[2]];
}

// ─── Plan B (activated 2026-05-07) ────────────────────────────────

/**
 * T6.4-M5 post-audit: Plan B activated for hot stars after Codex
 * smoke confirmed Sirius (A0V, 9940 K) renders orange-yellow with
 * Plan A defaults (gamma=1) — the legacy curve's `b⁴ × tint³` damping
 * collapses blue at typical surface b regardless of class bias.
 *
 * The structural fix is to BLEND in a blackbody-linear curve for
 * stars far from solar tEff. The blend is gated on temperature
 * distance from solar so that:
 *   - Sun (5778 K) gets weight = 0 → pure legacy (byte-identical
 *     pre-M4 preserved by construction).
 *   - Cool stars (Betelgeuse 3500 K, Proxima 3050 K) also get
 *     weight = 0 → pure legacy preserves Atlas-style red
 *     stylization. The legacy b⁴ damping isn't a problem for them
 *     because their classColor.b is already very low.
 *   - Hot stars (Sirius 9940 K, Vega 9600 K, Rigel 12000 K) get
 *     weight rising toward 1 → blackbody-linear takes over,
 *     producing proper blue-white identity at all b.
 *
 * The asymmetric activation (only hot stars) is intentional: the
 * legacy curve's red-bias is a feature for warm/cool stars (Atlas
 * stylization) but a bug for hot stars (Sirius can't be blue). Plan
 * B fixes the bug without disturbing the feature.
 */
export const PLAN_B_TEFF_THRESHOLD_K = 7500;
export const PLAN_B_TEFF_RAMP_K = 2500;

/**
 * Plan B blend weight as a function of effective temperature.
 * Returns 0 at or below `PLAN_B_TEFF_THRESHOLD_K` (Sun + cool
 * stars), ramps linearly to 1 over `PLAN_B_TEFF_RAMP_K` Kelvin
 * above the threshold (Sirius/Vega/Rigel territory).
 */
export function planBWeight(tEffKelvin: number): number {
  if (!Number.isFinite(tEffKelvin)) return 0;
  const above = tEffKelvin - PLAN_B_TEFF_THRESHOLD_K;
  if (above <= 0) return 0;
  return Math.min(1, above / PLAN_B_TEFF_RAMP_K);
}

/**
 * Plan B baseline curve — pure blackbody-linear chromaticity
 * scaled by brightness. No per-channel exponents, no damping.
 * For Sirius classColor=(0.59, 0.70, 1.0) at b=2:
 *   (0.59, 0.70, 1.0) × 2 × 0.6 = (0.71, 0.84, 1.2)
 * Properly blue-dominant at low b without the legacy curve's
 * b⁴ damping fighting it.
 */
export function blackbodyLinearCurve(
  b: number,
  classColor: readonly [number, number, number],
  brightness: number
): [number, number, number] {
  return [
    classColor[0] * b * brightness,
    classColor[1] * b * brightness,
    classColor[2] * b * brightness,
  ];
}

/**
 * Plan A + Plan B blend: pure-TS mirror of the shader-side blend.
 * The shader takes `uPlanBWeight` as a uniform (CPU-side derived
 * from tEff once per focus change) and computes the same blend
 * inline.
 */
export function applyTransferWithPlanB(
  b: number,
  tintBase: number,
  brightness: number,
  classColor: readonly [number, number, number],
  tEffKelvin: number,
  gamma: number = DEFAULT_CLASS_BIAS_GAMMA,
  floor: number = DEFAULT_CLASS_BIAS_FLOOR,
  ceiling: number = DEFAULT_CLASS_BIAS_CEILING
): [number, number, number] {
  const planA = applyClassColorTransfer(
    b,
    tintBase,
    brightness,
    classColor,
    gamma,
    floor,
    ceiling
  );
  const w = planBWeight(tEffKelvin);
  if (w === 0) return planA;
  const planB = blackbodyLinearCurve(b, classColor, brightness);
  return [
    planA[0] * (1 - w) + planB[0] * w,
    planA[1] * (1 - w) + planB[1] * w,
    planA[2] * (1 - w) + planB[2] * w,
  ];
}
