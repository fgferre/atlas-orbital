/**
 * Unified soft fade for the CONCENTRIC AU DISTANCE-RING grid
 * (`GridRecursive.tsx` rings + spokes and `GridDecadeLabel.tsx` labels),
 * 2026-06-18.
 *
 * **One coherent fade value in [0,1].** The whole grid rises and falls as
 * a single element. Both components multiply their material opacity by the
 * SAME fade value, computed from the SAME store state on the SAME frame —
 * so they stay in lockstep without a shared React context or per-frame
 * Zustand writes. Each component owns a tiny {@link GridFadeState} ref and
 * advances it per frame with {@link stepGridFade}; the inputs are pure
 * store reads, so the two states converge identically.
 *
 * **Target logic (pure, idempotent).** The fade lerps toward a TARGET each
 * frame rather than running a fixed timeline, so rapid toggling can never
 * glitch (re-entering the same target is a no-op):
 *
 *  1. INITIAL — the grid starts hidden (fade 0) and rises once the
 *     scene-ready latch (`isSceneReady`) is set AND the intro camera fly-in
 *     is not actively running (`isIntroAnimating === false`). Suppressing
 *     only WHILE the intro animates keeps the grid out of the 1e12→1e3
 *     cinematic transit (where the rings would smear across the whole sky)
 *     without requiring the intro to ever *complete*: gating on the
 *     completion flag (`hasPlayedIntroAnimation`) was rejected because that
 *     flag never flips when the intro is skipped/interrupted or never
 *     starts (verified at runtime 2026-06-18 — it stayed false on a normal
 *     boot), which would leave the grid permanently invisible. `isSceneReady`
 *     is a one-way latch and `isIntroAnimating` is false whenever the camera
 *     is settled, so this gate always resolves to visible at rest.
 *  2. TOGGLE — `target = (ready && showGrid) ? 1 : 0`; the Layers "Grid"
 *     switch soft-fades over {@link FADE_TIME_CONSTANT_S}.
 *  3. SCALE-MODE CHANGE — a FADE-THROUGH: when `scaleMode` flips, the rings
 *     re-scale to the new mode. We force the target to 0 for a short dip
 *     window ({@link SCALE_DIP_DURATION_S}) so the re-scale happens under
 *     cover of the fade, then release back to the toggle target.
 *  4. prefers-reduced-motion — SNAP to the target instantly (no lerp).
 *
 * The fade value, the lerp, and the dip bookkeeping are all pure and unit
 * tested in `gridFade.test.ts`; the components only own the mutable ref and
 * the per-frame `stepGridFade` call.
 */

import type { ScaleMode } from "../../lib/astrophysics";

/**
 * Time constant (seconds) for the exponential approach to the target —
 * the fade reaches ~95 % of the way in ~3 × this. Sized so a toggle reads
 * as a soft ~0.3-0.5 s fade rather than an instant pop.
 */
export const FADE_TIME_CONSTANT_S = 0.12;

/**
 * How long (seconds) the scale-mode FADE-THROUGH holds the grid at fade 0
 * while the rings re-scale to the new mode. Long enough that the re-scale
 * is fully hidden, short enough to feel like a quick blink. The total
 * visible dip is this hold plus the fade-out + fade-in ramps around it.
 */
export const SCALE_DIP_DURATION_S = 0.18;

/**
 * Inputs to the pure target computation — all plain store reads. Kept as a
 * flat record so the target is a trivially testable pure function of state.
 */
export interface GridFadeInputs {
  /** The scene-ready latch (`store.isSceneReady`). */
  sceneReady: boolean;
  /**
   * The intro fly-in active flag (`store.isIntroAnimating`). The grid stays
   * hidden WHILE the cinematic intro is animating (so it doesn't smear
   * across the 1e12→1e3 transit) and reveals the instant the camera is
   * settled — without depending on an intro-completed flag that may never
   * flip (see the module header for why that gate was rejected).
   */
  introActive: boolean;
  /** The master Grid toggle (`store.showEclipticGrid`). */
  showGrid: boolean;
}

/**
 * The base fade target in [0,1] from store state, ignoring the transient
 * scale-mode dip. 1 only when the scene is ready, the intro is not actively
 * animating, AND the grid toggle is on; 0 otherwise. Pure + idempotent.
 */
export const computeGridFadeTarget = (inputs: GridFadeInputs): number =>
  inputs.sceneReady && !inputs.introActive && inputs.showGrid ? 1 : 0;

/** Per-component mutable fade state. One per component instance. */
export interface GridFadeState {
  /** Current fade value in [0,1]. Starts hidden. */
  value: number;
  /** Last `scaleMode` observed, to detect a change → start a dip. */
  lastScaleMode: ScaleMode | null;
  /** Seconds remaining in the active scale-mode dip (0 = no dip). */
  dipRemainingS: number;
}

/** Fresh fade state — hidden, no dip, no observed mode yet. */
export const createGridFadeState = (): GridFadeState => ({
  value: 0,
  lastScaleMode: null,
  dipRemainingS: 0,
});

/**
 * Exponential smoothing step toward `target`, framerate-independent. With
 * `dt` in seconds and time constant `tau`, the per-frame blend factor is
 * `1 - exp(-dt / tau)` — monotonic, never overshoots, and clamps into
 * [0,1]. Exposed for direct unit testing of the lerp path.
 *
 * @param current the current value.
 * @param target the value to approach (assumed already in [0,1]).
 * @param dt frame delta in seconds.
 * @param tau time constant in seconds (defaults to {@link FADE_TIME_CONSTANT_S}).
 */
export const approachGridFade = (
  current: number,
  target: number,
  dt: number,
  tau = FADE_TIME_CONSTANT_S
): number => {
  if (!Number.isFinite(dt) || dt <= 0 || tau <= 0) {
    // Degenerate frame delta → hold (a stalled/zero dt must not snap).
    return clamp01(current);
  }
  const alpha = 1 - Math.exp(-dt / tau);
  const next = current + (target - current) * alpha;
  return clamp01(next);
};

const clamp01 = (v: number): number => {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
};

/**
 * Advance a {@link GridFadeState} one frame and return the new fade value.
 * MUTATES `state` in place (it is a per-component ref). Pure aside from
 * that mutation: identical inputs produce identical state transitions.
 *
 * Order of operations:
 *  1. Detect a `scaleMode` change vs the last observed mode → arm the dip
 *     (skipped on the very first frame, when `lastScaleMode` is null, so
 *     boot doesn't dip).
 *  2. The effective target is 0 while a dip is active, else the base
 *     target from {@link computeGridFadeTarget}.
 *  3. SNAP to the effective target when `reducedMotion`; otherwise
 *     exponentially approach it.
 *
 * @param state per-component mutable fade state (mutated).
 * @param inputs store reads driving the base target.
 * @param scaleMode the live scale mode (drives the fade-through dip).
 * @param dt frame delta in seconds.
 * @param reducedMotion when true, snap instead of fading.
 * @returns the updated fade value (also written to `state.value`).
 */
export const stepGridFade = (
  state: GridFadeState,
  inputs: GridFadeInputs,
  scaleMode: ScaleMode,
  dt: number,
  reducedMotion: boolean
): number => {
  // (1) Scale-mode change → arm the fade-through dip. Skip on first frame.
  if (state.lastScaleMode !== null && state.lastScaleMode !== scaleMode) {
    state.dipRemainingS = SCALE_DIP_DURATION_S;
  }
  state.lastScaleMode = scaleMode;

  const dipActive = state.dipRemainingS > 0;
  if (dipActive && Number.isFinite(dt) && dt > 0) {
    state.dipRemainingS = Math.max(0, state.dipRemainingS - dt);
  }

  // (2) Effective target: 0 while dipping, else the base toggle target.
  const baseTarget = computeGridFadeTarget(inputs);
  const effectiveTarget = dipActive ? 0 : baseTarget;

  // (3) Snap (reduced motion) or exponentially approach.
  state.value = reducedMotion
    ? clamp01(effectiveTarget)
    : approachGridFade(state.value, effectiveTarget, dt);

  return state.value;
};

/**
 * OPTIONAL flourish — radial reveal. When enabled, the initial fade-in
 * staggers each ring's opacity by its radius so the grid blooms outward
 * from the Sun. Gated behind this single constant so it can be toggled off
 * cleanly. Off by default: the unified fade already reads as a clean,
 * coherent reveal, and a per-ring radial stagger risks looking busy
 * against the minimal/premium single-accent style — kept available but
 * dark. See {@link radialRevealFactor}.
 */
export const GRID_RADIAL_REVEAL_ENABLED = false;

/**
 * Per-ring radial-reveal multiplier in [0,1]. With the reveal disabled
 * (default) this is always 1 (no-op). When enabled, rings nearer the Sun
 * reach full opacity earlier in the fade-in: a ring's local fade is the
 * global fade remapped so the outermost ring lags by up to
 * `staggerSpan` of the [0,1] fade range.
 *
 * @param fade the global grid fade value in [0,1].
 * @param ringIndex this ring's index in the (radius-sorted) set.
 * @param ringCount total rings in the set.
 * @param staggerSpan fraction of the fade range spent staggering (0..1).
 */
export const radialRevealFactor = (
  fade: number,
  ringIndex: number,
  ringCount: number,
  staggerSpan = 0.5
): number => {
  if (!GRID_RADIAL_REVEAL_ENABLED) return 1;
  if (ringCount <= 1) return clamp01(fade);
  const t = ringIndex / (ringCount - 1); // 0 = innermost, 1 = outermost
  const delay = t * staggerSpan;
  const span = 1 - staggerSpan;
  if (span <= 0) return clamp01(fade);
  return clamp01((fade - delay) / span);
};
