/**
 * Per-quality-tier FX budget for `ProceduralSun3D`.
 *
 * Lifted out of the component by W3/P-01. It used to be a private
 * `SUN_FX_PROFILES` const inside `ProceduralSun3D.tsx`, which meant the
 * numbers had no test surface at all — no spec file anywhere referenced
 * either the map or `cubeUpdateInterval`, so the perf regression P-01
 * describes could ship (and did) with every gate green. This module is
 * the seam that makes the schedule assertable.
 *
 * Companion to `stellarVisualProfile.ts`, which owns the *per-star*
 * visual identity. The split is deliberate and unchanged from T6.1:
 * these are **session-global quality-tier** choices (every star in the
 * scene at a given quality picks the same value), not stellar-class
 * choices.
 */

import type { ResolvedQualityName } from "./qualityProfile";

export type SunFXProfile = {
  cubeResolution: number;
  sphereSegments: number;
  raysLineCount: number;
  raysLineLength: number;
  flaresLineCount: number;
  flaresLineLength: number;
  /**
   * Frames between Perlin-cubemap bakes. See the non-monotonicity note
   * on `SUN_FX_PROFILES` below before "fixing" ultra > balanced.
   */
  cubeUpdateInterval: number;
  lowRes: boolean;
};

/**
 * **`cubeUpdateInterval` is deliberately non-monotonic** — 4 at ultra and
 * high, 2 at balanced, 3 at constrained. It is a frame *count*, not a
 * quality level, and the two top tiers bake at 512² against balanced's
 * 192², i.e. 7.1× the fragments per bake (6 faces × 512², each fragment
 * running 11 4D-simplex evaluations ≈ 17 M evaluations per bake). A
 * longer stride at the top keeps the amortised cost in the same band as
 * the cheaper tiers instead of paying the full 17 M every frame, which
 * is what shipped before W3/P-01.
 *
 * The stride is visually free: the noise's fourth axis advances
 * `elapsed * 0.1` and the surface samples it at `elapsed * 0.04`, so four
 * frames at 60 fps is ~0.0067 noise units of drift — far below the scale
 * at which granulation cells resolve.
 *
 * `cubeResolution` 512 at ultra/high is **not** part of P-01 and was left
 * alone: dropping it to 256 halves the texel budget but is a look change,
 * and W3 is a photometry wave, not a texture-budget wave.
 */
export const SUN_FX_PROFILES: Record<ResolvedQualityName, SunFXProfile> = {
  ultra: {
    cubeResolution: 512,
    sphereSegments: 64,
    raysLineCount: 4095,
    raysLineLength: 8,
    flaresLineCount: 2047,
    flaresLineLength: 16,
    cubeUpdateInterval: 4,
    lowRes: false,
  },
  high: {
    cubeResolution: 512,
    sphereSegments: 64,
    raysLineCount: 4095,
    raysLineLength: 8,
    flaresLineCount: 2047,
    flaresLineLength: 16,
    cubeUpdateInterval: 4,
    lowRes: false,
  },
  balanced: {
    cubeResolution: 192,
    sphereSegments: 56,
    raysLineCount: 1024,
    raysLineLength: 4,
    flaresLineCount: 640,
    flaresLineLength: 10,
    cubeUpdateInterval: 2,
    lowRes: true,
  },
  constrained: {
    cubeResolution: 128,
    sphereSegments: 48,
    raysLineCount: 512,
    raysLineLength: 4,
    flaresLineCount: 320,
    flaresLineLength: 8,
    cubeUpdateInterval: 3,
    lowRes: true,
  },
};

/**
 * Bake schedule predicate. `frameCount` is the **pre-increment** counter,
 * so frame 0 bakes on every tier — without that, `constrained` would show
 * an unbaked (black) cubemap for its first two frames after boot and
 * ultra/high for their first three, which is exactly the first thing a
 * learner sees.
 *
 * The caller must advance its counter *unconditionally*, above any
 * visibility early-return, so the phase survives a stretch of frames in
 * which the Sun was out of render range.
 */
export const shouldBakeCube = (
  frameCount: number,
  interval: number
): boolean => (interval > 1 ? frameCount % interval === 0 : true);
