/**
 * Pure-TypeScript mirror of the LightGlow math, used by unit tests
 * and any future non-shader callers. Keep these in lockstep with the
 * GLSL in `LightGlowEffect.ts`.
 *
 * Source: `/tmp/gaiasky/assets/shader/postprocess/lightglow.frag.glsl`.
 */

export interface PolarMaskParams {
  /** `uv - lightCenter` scaled to the halo texture UV (Gaia's `glow_tc`). */
  uv: readonly [number, number];
  /** `u_time` — runtime seconds. */
  time: number;
  /** Override mask floor. Default `0.55`. */
  minVal?: number;
}

/**
 * `polarMask(uv, time)` from `lightglow.frag.glsl:57`. Returns a
 * scalar in `[minVal, 1.0]`.
 */
export const polarMask = ({
  uv,
  time,
  minVal = 0.55,
}: PolarMaskParams): number => {
  const px = uv[0] * 2.0 - 1.0;
  const py = uv[1] * 2.0 - 1.0;
  const r = Math.sqrt(px * px + py * py);
  // Gaia's `normalize(p)`: if p is the zero vector, GLSL's normalize
  // returns 0 — avoid NaN on the centre fragment.
  const invLen = r === 0 ? 0 : 1 / r;
  const dx = px * invLen;
  const dy = py * invLen;

  let angular =
    0.5 +
    0.25 * Math.sin(dx * 12.0 + time * 2.0) +
    0.2 * Math.cos(dy * 37.0 - time * 1.3) +
    0.1 * Math.sin((dx + dy) * 59.0 + time * 1.6);

  angular = (angular + 1.0) * 0.5;
  angular = minVal + (1.0 - minVal) * angular;

  const smoothEdge0 = 0.85;
  const smoothEdge1 = 1.0;
  const s = Math.min(
    1,
    Math.max(0, (1.0 - r - smoothEdge0) / (smoothEdge1 - smoothEdge0))
  );
  const center = s * s * (3 - 2 * s);

  return Math.min(1.0, Math.max(minVal, angular + center));
};

/**
 * Halo size in UV units, per light. Gaia formula at
 * `lightglow.frag.glsl:83`:
 *   viewAngle = min(0.0001, u_lightViewAngles[li])
 *   size      = u_textureScale * min(1.6, viewAngle * 5e5) * lum
 *
 * Note the `min(0.0001, viewAngle)` — Gaia Sky clamps the input view
 * angle to a MAXIMUM of 1e-4 rad. That means any light larger than
 * ~1e-4 rad (most local stars seen head-on at low zoom) saturates
 * the clamp at 0.0001, yielding a cap-size halo `size = textureScale
 * * min(1.6, 50) * lum = 1.6 * textureScale * lum`.
 */
export const haloSize = (
  textureScale: number,
  viewAngle: number,
  lum: number
): number => {
  const clampedAngle = Math.min(0.0001, viewAngle);
  return textureScale * Math.min(1.6, clampedAngle * 5.0e5) * lum;
};

export interface ArchimedesSamplePoint {
  /** Horizontal offset (pre aspect-correction). */
  fxVal: number;
  /** Vertical offset. */
  fyVal: number;
  /** Parameter `t` at this sample. */
  t: number;
}

/**
 * Generates the Archimedean spiral samples Gaia uses to scan for
 * bright pixels around each light. `fx(t, a) = a·t·cos(t)`,
 * `fy(t, a) = a·t·sin(t)`, t ∈ [0, 3π].
 */
export const archimedesSpiralSamples = (
  spiralScale: number,
  nSamples: number
): ArchimedesSamplePoint[] => {
  const dt = (3.0 * Math.PI) / nSamples;
  const out: ArchimedesSamplePoint[] = [];
  for (let i = 0; i < nSamples; i++) {
    const t = dt * i;
    out.push({
      fxVal: spiralScale * t * Math.cos(t),
      fyVal: spiralScale * t * Math.sin(t),
      t,
    });
  }
  return out;
};
