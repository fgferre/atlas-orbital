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
 * **Plan B (design note, NOT implemented here)**: if user smoke
 * reveals that legacy × bias structurally fails for hot stars
 * (e.g. Sirius never blue-dominant at typical b without laser
 * explosion at high b), the fallback would be `blend(legacy × bias,
 * blackbody × b × brightness, weight(|tEff − 5778|))`. The
 * blackbody-linear curve gives proper blue-white identity for hot
 * stars without per-channel exponent blowup. We deliberately do
 * NOT ship Plan B helpers as dead code — when smoke proves Plan A
 * insufficient, add them then. Cleaner to reintroduce than to
 * maintain unused public surface (per AGENTS.md cleanup rule).
 *
 * **Defaults are placeholders pending empirical calibration.** The
 * `gamma=1, floor=0.12, ceiling=3.0` baseline guarantees Sun byte-
 * identical pre-M4 (by construction) but gives only mild class
 * differentiation. The Sirius/Betelgeuse/Proxima pin tests below
 * verify the math direction (relative chroma shift), NOT perceptual
 * adequacy. Real calibration awaits brightness-distribution
 * measurement via debug shader if the smoke reveals problems.
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
 * Initial values are CONSERVATIVE PLACEHOLDERS chosen to:
 *   - Guarantee Sun byte-identical pre-M4 (trivial — bias = 1 at
 *     gamma=1 when classColor matches the solar reference).
 *   - Give a mild class chroma shift in the math direction (Sirius
 *     bluer than Sun, Betelgeuse / Proxima redder), without
 *     attempting to match any particular perceptual target.
 *
 * They are NOT calibrated against an empirical brightness-distribution
 * measurement — calibration awaits real-browser smoke. If smoke proves
 * structural failure of Plan A (e.g. Sirius reads red-dominant across
 * the typical surface b range, or some channel laser-explodes at HDR
 * core), the next step is to either tune these knobs or implement the
 * Plan B blend described in the module header.
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
