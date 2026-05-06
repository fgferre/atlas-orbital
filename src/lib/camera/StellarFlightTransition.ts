import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";

/**
 * T6.4-M2.5 S3 — two-channel HYG fly-to transition (Gaia-informed,
 * OrbitControls-native approximation).
 *
 * Animates two state vectors with independent durations and
 * easings:
 *
 *   - **Position channel**: straight-line lerp `mix(startPos,
 *     endPos, posEasing(alpha))` from the current camera world
 *     position to the landing position computed by S1's
 *     `computeAtlasFlightLanding`. No Bézier, no sun-avoid
 *     control point — the prior `CameraTransition` did both,
 *     but at parsec scale they produced strange arcs.
 *
 *   - **Orientation channel**: `mix(startTarget, endTarget,
 *     oriEasing(alpha))` for the OrbitControls target. The
 *     camera's actual quaternion is then derived by
 *     `OrbitControls.update()` from
 *     `(camera.position, controls.target)`. We never touch the
 *     camera's quaternion directly — that would fight the
 *     controls, which re-derive orientation from `target` every
 *     frame.
 *
 * **Divergence from Gaia** (Codex round-3 P2 honest-comments,
 * 2026-05-05). Gaia Sky's free-camera transition slerps a full
 * orientation quaternion on the (dir, up) channel:
 *   `qd.set(startOrientation).slerp(endOrientation, ...)`
 *   `cam.setUp(qd.getUp(...)); cam.setDirection(qd.getDirection(...))`
 *  — see `gaiasky/script/v2/impl/CameraModule.java:1419-1424`. That
 * gives Gaia explicit control over both the look direction AND the
 * roll axis throughout the transition. Atlas does NOT replicate
 * that. We lerp `controls.target` and let `OrbitControls.update()`
 * derive the camera quaternion each frame. The derived orientation
 * is constrained to "look at controls.target" with `up ≈ camera.up`,
 * which is exactly what we want for HYG focus-click but is NOT the
 * same as Gaia's free quaternion slerp. The divergence is
 * deliberate (option 2 from `tasks/waves/T6.4-visual-recovery.md
 * §M2.5 S4`'s coordination strategy) — touching the camera's
 * quaternion directly would fight OrbitControls, which re-derives
 * orientation every frame from `(position, target)`.
 *
 * Each channel has its own duration; both start at `start()`,
 * each completes when its alpha reaches 1, and `update()`
 * reports `done: true` only when both have completed. `cancel()`
 * freezes both at the current alpha and returns the intermediate
 * state for S5's interrupt-friendly handoff (no snap-back, no
 * jump-forward).
 *
 * Default easing is `CameraTransition.logisticSigmoid` (S2);
 * callers can override per-channel.
 */

export interface StellarFlightSpec {
  /** Current camera world position. */
  startPos: THREE.Vector3;
  /** Landing world position (from
   *  `computeAtlasFlightLanding`). */
  endPos: THREE.Vector3;
  /** Current OrbitControls target. */
  startTarget: THREE.Vector3;
  /** Star world position (where the camera should look at end). */
  endTarget: THREE.Vector3;
  /** Position channel duration, ms. */
  posDurationMs: number;
  /** Orientation channel (target lerp) duration, ms. */
  oriDurationMs: number;
  /** Default: `CameraTransition.logisticSigmoid` (post-round-5
   *  default factor 60, Gaia's scripted-position pacing). */
  posEasing?: (t: number) => number;
  /** Default: `CameraTransition.logisticSigmoid` (post-round-5
   *  default factor 60). NOTE: Gaia's go_to_object scripted
   *  transition uses factor 17 for orientation (60 for position) —
   *  callers wanting Gaia parity should pass
   *  `(t) => CameraTransition.logisticSigmoid(t, 17)` explicitly.
   *  `CameraController.setupCameraHyg` does this. */
  oriEasing?: (t: number) => number;
  /** Fires when BOTH channels complete. */
  onComplete?: () => void;
}

export interface StellarFlightFrame {
  /** Current interpolated camera position. */
  position: THREE.Vector3;
  /** Current interpolated OrbitControls target. */
  target: THREE.Vector3;
  /** True when both channels have completed. */
  done: boolean;
}

const DEFAULT_EASING = (t: number): number =>
  CameraTransition.logisticSigmoid(t);

const lerpVec3 = (
  out: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number
): THREE.Vector3 => {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  out.z = a.z + (b.z - a.z) * t;
  return out;
};

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export class StellarFlightTransition {
  private active = false;
  private startTimeMs = 0;
  private spec: Required<Omit<StellarFlightSpec, "onComplete">> & {
    onComplete?: () => void;
  } = {
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    posDurationMs: 0,
    oriDurationMs: 0,
    posEasing: DEFAULT_EASING,
    oriEasing: DEFAULT_EASING,
  };
  /** Reusable output vectors so per-frame `update()` allocates
   *  nothing in the steady state. */
  private readonly outPosition = new THREE.Vector3();
  private readonly outTarget = new THREE.Vector3();

  start(spec: StellarFlightSpec): void {
    this.spec.startPos.copy(spec.startPos);
    this.spec.endPos.copy(spec.endPos);
    this.spec.startTarget.copy(spec.startTarget);
    this.spec.endTarget.copy(spec.endTarget);
    this.spec.posDurationMs = Math.max(spec.posDurationMs, 0);
    this.spec.oriDurationMs = Math.max(spec.oriDurationMs, 0);
    this.spec.posEasing = spec.posEasing ?? DEFAULT_EASING;
    this.spec.oriEasing = spec.oriEasing ?? DEFAULT_EASING;
    this.spec.onComplete = spec.onComplete;
    this.startTimeMs = performance.now();
    this.active = true;
  }

  /** Compute the current frame WITHOUT side effects (no
   *  `onComplete` fire, no active-flag flip). Shared by
   *  `update()` (which then optionally fires the callback) and
   *  `cancel()` (which must NOT fire it).
   *
   *  Codex 2026-05-05 P2 caught the original `cancel() →
   *  update()` delegation: when the user interrupts AFTER both
   *  durations have elapsed but BEFORE the next animation frame
   *  consumed completion, the interrupt path would run
   *  `onComplete` side-effects despite semantically NOT being a
   *  natural completion. Splitting frame sampling from the
   *  callback fixes that. */
  private computeFrame(): StellarFlightFrame {
    const elapsed = performance.now() - this.startTimeMs;

    const alphaPosRaw =
      this.spec.posDurationMs > 0
        ? clamp01(elapsed / this.spec.posDurationMs)
        : 1;
    const alphaOriRaw =
      this.spec.oriDurationMs > 0
        ? clamp01(elapsed / this.spec.oriDurationMs)
        : 1;

    const alphaPos = this.spec.posEasing(alphaPosRaw);
    const alphaOri = this.spec.oriEasing(alphaOriRaw);

    lerpVec3(this.outPosition, this.spec.startPos, this.spec.endPos, alphaPos);
    lerpVec3(
      this.outTarget,
      this.spec.startTarget,
      this.spec.endTarget,
      alphaOri
    );

    const done = alphaPosRaw >= 1 && alphaOriRaw >= 1;

    return {
      position: this.outPosition,
      target: this.outTarget,
      done,
    };
  }

  /** Per-frame consumer. Returns `null` when the transition is
   *  inactive (i.e. between `cancel()` / completion and the next
   *  `start()`). */
  update(): StellarFlightFrame | null {
    if (!this.active) return null;

    const frame = this.computeFrame();

    if (frame.done) {
      this.active = false;
      this.spec.onComplete?.();
    }

    return frame;
  }

  /** Freeze both channels at the current alpha and return the
   *  intermediate state. The transition becomes inactive. The
   *  controller reads the returned values to update OrbitControls
   *  cleanly without snap-back. Returns `null` if there's nothing
   *  to cancel (transition not active).
   *
   *  Does NOT fire `onComplete` even when the durations have
   *  already elapsed at the moment of cancel — by design,
   *  cancellation is semantically distinct from natural
   *  completion. The S5 interrupt handoff in `CameraController`
   *  expects no side-effects from this method beyond the
   *  returned state and the active-flag flip. */
  cancel(): {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null {
    if (!this.active) return null;
    const frame = this.computeFrame();
    this.active = false;
    return { position: frame.position, target: frame.target };
  }

  get isActive(): boolean {
    return this.active;
  }

  /**
   * Position-channel raw alpha (0..1, pre-easing). Returns 0 when
   * the transition is inactive. Originally drove the M2.5 S6
   * mesh-pre-warm signal (force-activate the procedural mesh once
   * raw alpha cleared 0.70). **Codex round-3 C-2 reverted that
   * force-activate** because the resulting skipMask=1 hid the
   * sprite while the mesh was still angularly small — exactly
   * the gap the M3 cross-fade is meant to bridge. The getter +
   * the singleton publisher in CameraController stay in place so
   * M3 can consume the channel as a continuous fade ramp instead
   * of a hard force-on. As of round-5 the default easing factor
   * is 60 (post-round-5), so the deceleration tail also lives at
   * raw alpha ≥ 0.70 (logisticSigmoid(0.70, 60) ≈ 0.9975).
   *
   * Intentionally raw (not eased): the threshold is a TIME-based
   * UX cue, not a SPACE-based one. Easing the value would couple
   * the threshold to the easing factor, which would break if the
   * easing changes.
   */
  get posProgressRaw(): number {
    if (!this.active) return 0;
    if (this.spec.posDurationMs <= 0) return 1;
    const elapsed = performance.now() - this.startTimeMs;
    return clamp01(elapsed / this.spec.posDurationMs);
  }
}
