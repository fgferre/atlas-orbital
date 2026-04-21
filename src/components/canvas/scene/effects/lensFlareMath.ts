/**
 * Pure-TypeScript mirrors of the θ.4 pseudo-lens-flare + lensdirt
 * math. Kept in lockstep with the GLSL in
 * `PseudoLensFlareEffect.ts` + `LensDirtEffect.ts`.
 *
 * Sources:
 * - `/tmp/gaiasky/assets/shader/postprocess/pseudolensflare.frag.glsl`
 * - `/tmp/gaiasky/assets/shader/postprocess/lensdirt.frag.glsl`
 * - `/tmp/gaiasky/assets/shader/postprocess/bias.frag.glsl` (inlined
 *   into pseudo-lens for the atlas port)
 */

export type Rgb = readonly [number, number, number];

export interface BiasedSampleParams {
  rgb: Rgb;
  bias: number;
}

/**
 * Inlined port of `bias.frag.glsl`:
 *   avg = (r + g + b) / 3
 *   if (avg + bias > 0) → vec3(1.0); else → vec3(0.0).
 *
 * Gaia emits BINARY white/black, not the raw rgb — so the downstream
 * ghost accumulation sees uniform unit-brightness samples wherever
 * the bias threshold passed, irrespective of the source pixel's
 * actual magnitude. Preserves 1:1 math with Gaia's multi-pass
 * pipeline (bias pre-pass + shader).
 */
export const biasedSample = ({ rgb, bias }: BiasedSampleParams): Rgb => {
  const avg = (rgb[0] + rgb[1] + rgb[2]) / 3;
  return avg + bias > 0 ? [1, 1, 1] : [0, 0, 0];
};

export interface ChapmanGhostWeightParams {
  /** Ghost index in [0, nGhosts). */
  i: number;
  /** Ghost-vector magnitude (= |vec2(0.5) - texcoord| × dispersal). */
  ghostVecMagnitude: number;
  /** Ghost direction angle (radians; used to project offset-to-centre). */
  ghostAngle: number;
  /** Inverted texcoord (`1 - uv`). */
  texcoord: readonly [number, number];
}

/**
 * Ghost weight math from `pseudolensflare.frag.glsl:42-46`:
 *   offset = fract(texcoord + ghostVec × i)
 *   w      = length(vec2(0.5) - offset) / length(vec2(0.5))
 *   w      = pow(1 - w, 2.0)
 * `length(vec2(0.5)) = sqrt(0.5) ≈ 0.707`. Inputs here are already
 * the precomputed ghost parameters so the weight can be pinned by
 * tests without a full 2-D lookup.
 */
export const ghostWeight = ({
  i,
  ghostVecMagnitude,
  ghostAngle,
  texcoord,
}: ChapmanGhostWeightParams): number => {
  const stepX = ghostVecMagnitude * Math.cos(ghostAngle) * i;
  const stepY = ghostVecMagnitude * Math.sin(ghostAngle) * i;
  const offx = fract(texcoord[0] + stepX);
  const offy = fract(texcoord[1] + stepY);
  const dx = 0.5 - offx;
  const dy = 0.5 - offy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const maxD = Math.sqrt(0.5);
  const normalized = d / maxD;
  const w = Math.pow(1 - normalized, 2);
  return Math.max(0, w);
};

const fract = (x: number): number => x - Math.floor(x);

export interface StarburstParams {
  /** UV in [0, 1] sent into lensdirt.frag.glsl:18. */
  uv: readonly [number, number];
  /** Starburst offset — atlas drives this from camera direction sum. */
  offset: number;
  /** Sampler function `texture(1D, [0..1]) → intensity`. */
  sampleStarburst: (t: number) => number;
}

/**
 * Starburst value per `lensdirt.frag.glsl:20-27`:
 *   centerVec = uv - 0.5
 *   d         = length(centerVec)
 *   radial    = centerVec.x / d       (guarded for d=0)
 *   s1        = tex(mod(abs(radial - offset), 1))
 *   s2        = tex(mod(abs(-radial + offset), 1))
 *   starburst = clamp(s1*s2 + (1 - smoothstep(0, 0.3, d)), 0, 1)
 */
export const starburstIntensity = ({
  uv,
  offset,
  sampleStarburst,
}: StarburstParams): number => {
  const centerX = uv[0] - 0.5;
  const centerY = uv[1] - 0.5;
  const d = Math.sqrt(centerX * centerX + centerY * centerY);
  const radial = d > 1e-6 ? centerX / d : 0;
  const s1 = sampleStarburst(mod(Math.abs(radial - offset), 1));
  const s2 = sampleStarburst(mod(Math.abs(-radial + offset), 1));
  const centerBoost = 1 - smoothstep(0, 0.3, d);
  const raw = s1 * s2 + centerBoost;
  return Math.min(1, Math.max(0, raw));
};

const mod = (x: number, m: number): number => {
  const r = x - Math.floor(x / m) * m;
  return r < 0 ? r + m : r;
};

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export interface LensDirtCompositeParams {
  base: Rgb;
  dirt: Rgb;
  starburst: number;
}

/**
 * Final lensdirt composite per `lensdirt.frag.glsl:29-31`:
 *   fragColor = clamp(base × (dirt × 3 + starburst), 0, 1)
 */
export const lensDirtComposite = ({
  base,
  dirt,
  starburst,
}: LensDirtCompositeParams): Rgb => {
  const scale = (c: number, d: number) =>
    Math.min(1, Math.max(0, c * (d * 3 + starburst)));
  return [
    scale(base[0], dirt[0]),
    scale(base[1], dirt[1]),
    scale(base[2], dirt[2]),
  ];
};

/**
 * Gaia's starburst drift: `cameraOffset = direction.x + direction.y +
 * direction.z` where direction is the unit forward vector. The
 * scalar is in `[-sqrt(3), +sqrt(3)]` — for a typical camera, values
 * around ±1 are common.
 */
export const starburstOffsetFromCameraDirection = (
  direction: readonly [number, number, number]
): number => direction[0] + direction[1] + direction[2];
