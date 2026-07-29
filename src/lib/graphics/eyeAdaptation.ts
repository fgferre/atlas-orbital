/**
 * Eye-adaptation math (1d) — the pure half of `EyeAdaptationBridge`.
 *
 * The bridge component is imperative WebGL glue: it force-enables the
 * composer's adaptive-luminance passes and pulls their 1×1 result back
 * to the CPU. Everything it then *decides* (when to sample, how a
 * luminance byte becomes an exposure scalar, how that scalar moves
 * between samples) lives here so it is testable without an R3F tree.
 *
 * ## Why the sampling cadence exists at all (perf contract)
 *
 * `WebGLRenderer.readRenderTargetPixels` is a synchronous `glReadPixels`
 * into a client array (`three/src/renderers/WebGLRenderer.js`). Calling
 * it once per frame forces the driver to drain every queued GL command
 * before it can answer — the CPU stops until the GPU is fully caught up,
 * so the frame's CPU work and GPU work stop overlapping and frame time
 * becomes `cpu + gpu` instead of `max(cpu, gpu)`. On real hardware that
 * is the difference between 60 fps and ~30 fps for a scene where both
 * halves are comparably busy, and it was measurable as "the app got
 * heavy" the moment 1d shipped.
 *
 * The signal does not need per-frame resolution. The library's own
 * adaptive-luminance shader integrates
 * `adapted = l0 + (l1 - l0) * (1 - exp(-dt * tau))` with `tau = 1.0`
 * (`postprocessing@6.38.0` `adaptive-luminance.frag`), i.e. a ~1 second
 * time constant, and that integration keeps running on the GPU every
 * frame regardless of how often we look at it. Sampling a 1 s
 * exponential at {@link EYE_ADAPTATION_SAMPLE_INTERVAL_MS} is
 * perceptually identical to sampling it 60×/s — so the bridge reads it
 * at ~4 Hz, asynchronously, and interpolates between samples on the CPU
 * (see {@link stepExposureTowards}) so the throttle cannot show up as a
 * staircase.
 */

import { STAR_DISPLAY_BLACK_POINT } from "../starfieldShaderMath";

/**
 * Scene-luminance readback cadence, in milliseconds.
 *
 * 250 ms = 4 samples/second. Against the GPU pass's ~1 s adaptation
 * time constant, a sample lands every quarter time-constant: the
 * reconstructed curve is visually indistinguishable from the per-frame
 * one, while the number of GPU→CPU sync points drops by ~15× at 60 fps.
 */
export const EYE_ADAPTATION_SAMPLE_INTERVAL_MS = 250;

/**
 * Target scene luminance AND the exposure floor — the same constant the
 * starfield shader math calibrates the display black point against
 * (`starfieldShaderMath.ts`, 0.165 linear, pre-tonemap) and the same
 * value passed to `<ToneMapping minLuminance>` so the GPU-side sample
 * and this JS-side mapping share one floor.
 */
export const EYE_ADAPTATION_TARGET = STAR_DISPLAY_BLACK_POINT;

/** Neutral exposure — the brightest the adaptation is ever allowed to go. */
export const EYE_ADAPTATION_CEILING = 1.0;

/**
 * CPU smoothing time constant, in seconds, for the exposure scalar
 * between readbacks.
 *
 * Deliberately short relative to the GPU pass's ~1 s adaptation: this is
 * a de-stepper for the 4 Hz sample grid, not a second adaptation stage.
 * At 0.15 s it removes >90 % of a sample-to-sample step within one
 * interval, so the perceived adaptation speed still belongs to the
 * library's tau.
 */
const EYE_ADAPTATION_SMOOTHING_TAU_S = 0.15;

/** Below this delta the smoother snaps, so it stops writing forever. */
const EYE_ADAPTATION_SETTLE_EPSILON = 1e-4;

/**
 * three.js's standard depth-packing unpack (`unpackRGBAToDepth` /
 * `UnpackFactors4` in `packing.glsl.js`), reimplemented for a CPU-side
 * `Uint8Array` since there is no public API to sample a shader's
 * RGBA8-packed float from JS. The adaptive-luminance pass writes its
 * value with the matching `packDepthToRGBA`, which is why this is a dot
 * product and not a plain grayscale byte read.
 * `UnpackDownscale = 255/256`; `PackFactors = [1, 256, 256², 256³]`.
 */
const UNPACK_FACTORS: readonly [number, number, number, number] = [
  255 / 256,
  255 / 256 / 256,
  255 / 256 / 65536,
  1 / 16777216,
];

/** Decode one RGBA8 texel written by `packDepthToRGBA` into `[0, 1]`. */
export const unpackLuminanceFromRGBA8 = (bytes: ArrayLike<number>): number =>
  (bytes[0] / 255) * UNPACK_FACTORS[0] +
  (bytes[1] / 255) * UNPACK_FACTORS[1] +
  (bytes[2] / 255) * UNPACK_FACTORS[2] +
  (bytes[3] / 255) * UNPACK_FACTORS[3];

/**
 * Is another readback due?
 *
 * Pure so the ~4 Hz perf contract above is assertable without a
 * renderer. Callers must additionally skip while a read is still in
 * flight — overlapping reads would race on the shared pixel buffer.
 */
export const isLuminanceSampleDue = (
  nowMs: number,
  lastSampleMs: number
): boolean => nowMs - lastSampleMs >= EYE_ADAPTATION_SAMPLE_INTERVAL_MS;

/**
 * Map a sampled scene luminance to the exposure scalar the registry
 * carries into `gl.toneMappingExposure`.
 *
 * `exposure = TARGET / max(luminance, TARGET)`. The luminance write is
 * itself clamped to ≤ 1.0 (the library's luminance target is
 * `UnsignedByteType`, so WebGL clamps any HDR fragment before storing
 * it), so `luminance ∈ [TARGET, 1]` and the result lands in
 * `[TARGET, 1]` as a direct consequence: a near-empty starfield frame —
 * the overwhelming common case — stays at neutral 1.0, byte-identical
 * to the pre-1d picture, and the most a blown-out frame can be dimmed
 * to is the display's own black point. Dimming past that would only
 * crush more content to black for no perceptual gain. The explicit
 * clamps below are defensive (first frame, or a future library change),
 * not the primary bound.
 */
export const exposureFromAdaptedLuminance = (rawLuminance: number): number => {
  if (!Number.isFinite(rawLuminance)) return EYE_ADAPTATION_CEILING;
  const luminance = Math.max(rawLuminance, EYE_ADAPTATION_TARGET);
  return Math.min(
    EYE_ADAPTATION_CEILING,
    Math.max(EYE_ADAPTATION_TARGET, EYE_ADAPTATION_TARGET / luminance)
  );
};

/**
 * Advance the live exposure one frame toward the last sampled target.
 *
 * Frame-rate independent exponential approach — never overshoots
 * (`blend ∈ (0, 1]` for any positive delta), and snaps once the
 * remaining error is imperceptible so a settled scene stops writing.
 */
export const stepExposureTowards = (
  current: number,
  target: number,
  deltaSeconds: number
): number => {
  if (current === target) return target;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  const blend = 1 - Math.exp(-deltaSeconds / EYE_ADAPTATION_SMOOTHING_TAU_S);
  const next = current + (target - current) * blend;
  return Math.abs(target - next) <= EYE_ADAPTATION_SETTLE_EPSILON
    ? target
    : next;
};
