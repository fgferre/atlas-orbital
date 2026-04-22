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

/**
 * NDC → UV for the COMPLEX lens-flare driver.
 *
 * Gaia's shader `lensflare.frag.glsl:176-178` reads `v_texCoords - 0.5`
 * where `v_texCoords` is the texture UV in `[0, 1]` with origin at the
 * bottom-left (standard GL texture convention). Gaia's CPU driver
 * pushes `light_pos` in the same UV space (see
 * `LensFlareFilter.java:55-61`).
 *
 * Three.js's `Vector3.project(camera)` yields NDC in `[-1, 1]` with
 * `y = -1` at the BOTTOM (right-handed, matching GL). Map to UV:
 *   uv.x = (ndc.x + 1) / 2
 *   uv.y = (ndc.y + 1) / 2
 * Both axes use the same sign convention; no Y flip (overlays that
 * render HTML on top use top-left pixel origin and need flip — shaders
 * don't).
 */
export interface NdcToUvResult {
  /** UV in [0, 1] bottom-left origin; NaN if input was off-screen. */
  uv: readonly [number, number];
  /** True iff NDC lies inside the frustum clip volume. */
  onScreen: boolean;
}

export const ndcToLensFlareUv = (
  ndc: readonly [number, number, number]
): NdcToUvResult => {
  const onScreen =
    ndc[0] >= -1 &&
    ndc[0] <= 1 &&
    ndc[1] >= -1 &&
    ndc[1] <= 1 &&
    ndc[2] >= -1 &&
    ndc[2] <= 1;
  return {
    uv: [(ndc[0] + 1) * 0.5, (ndc[1] + 1) * 0.5],
    onScreen,
  };
};

/**
 * Gaia's solid-angle → intensity-alpha ramp from
 * `MainPostProcessor.java:643-655`:
 *
 *   lensFlareAngle0 = 1e-6   // end of fade-in (full alpha)
 *   lensFlareAngle1 = 0.5e-7 // start of fade-in (zero alpha)
 *   if angle > angle1:       nLightsFlare++, alpha = 1
 *   if angle < angle0:       alpha = lint(angle, angle1, angle0, 0, 1)
 *   else (angle >= angle0):  alpha = 1
 *   otherwise (angle < angle1): light not pushed
 *
 * Atlas rarely operates at these angular scales (the Sun viewed from
 * Earth subtends ~5.97e-5 sr, well above angle0), but the linstep is
 * the source-of-truth for the fade window and must be preserved for
 * 1:1 parity whenever a distant star would theoretically drive the
 * flare at interstellar scales.
 */
export const LENS_FLARE_FULL_ALPHA_ANGLE = 1e-6;
export const LENS_FLARE_ZERO_ALPHA_ANGLE = 0.5e-7;

export const computeLightIntensityAlpha = (angle: number): number => {
  if (angle <= LENS_FLARE_ZERO_ALPHA_ANGLE) return 0;
  if (angle >= LENS_FLARE_FULL_ALPHA_ANGLE) return 1;
  return (
    (angle - LENS_FLARE_ZERO_ALPHA_ANGLE) /
    (LENS_FLARE_FULL_ALPHA_ANGLE - LENS_FLARE_ZERO_ALPHA_ANGLE)
  );
};

/**
 * 6-sample Archimedean spiral positions used by the shader's
 * occlusion luma check at `lensflare.frag.glsl:186-194`. Exposed as
 * CPU math for test-pinning the constants that drive the sampler
 * positions (`a = 0.01`, `dt = 3π / N_SAMPLES` with N_SAMPLES=6).
 * The shader samples at `[light_pos + vec2(0.5) + vec2(fx(t,a)/ar, fy(t,a))]`
 * for `t in [0, dt, 2dt, ...]`.
 */
export const LENS_FLARE_SPIRAL_AMPLITUDE_REF = 0.01;
export const LENS_FLARE_SPIRAL_N_SAMPLES_REF = 6;
export const LENS_FLARE_SPIRAL_STEP_RADIANS_REF =
  (3.0 * Math.PI) / LENS_FLARE_SPIRAL_N_SAMPLES_REF;

export const lensFlareSpiralSamplePositions = (
  aspectRatio: number
): Array<readonly [number, number]> => {
  const out: Array<readonly [number, number]> = [];
  const a = LENS_FLARE_SPIRAL_AMPLITUDE_REF;
  const dt = LENS_FLARE_SPIRAL_STEP_RADIANS_REF;
  for (let i = 0; i < LENS_FLARE_SPIRAL_N_SAMPLES_REF; i++) {
    const t = i * dt;
    out.push([(a * t * Math.cos(t)) / aspectRatio, a * t * Math.sin(t)]);
  }
  return out;
};
