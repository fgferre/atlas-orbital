import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";

/**
 * T6.4-M2.5 S3 — two-channel HYG fly-to transition.
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
 *     frame. See `tasks/waves/T6.4-visual-recovery.md §M2.5 S4`
 *     for the OrbitControls coordination rationale (option 2).
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
  /** Default: `CameraTransition.logisticSigmoid` (factor 12). */
  posEasing?: (t: number) => number;
  /** Default: `CameraTransition.logisticSigmoid` (factor 12). */
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

  /** Per-frame consumer. Returns `null` when the transition is
   *  inactive (i.e. between `cancel()` / completion and the next
   *  `start()`). */
  update(): StellarFlightFrame | null {
    if (!this.active) return null;

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

    if (done) {
      this.active = false;
      this.spec.onComplete?.();
    }

    return {
      position: this.outPosition,
      target: this.outTarget,
      done,
    };
  }

  /** Freeze both channels at the current alpha and return the
   *  intermediate state. The transition becomes inactive. The
   *  controller reads the returned values to update OrbitControls
   *  cleanly without snap-back. Returns `null` if there's nothing
   *  to cancel (transition not active). */
  cancel(): {
    position: THREE.Vector3;
    target: THREE.Vector3;
  } | null {
    if (!this.active) return null;

    // Run one final update tick so the output reflects "right
    // now"; reuse the per-frame logic.
    const frame = this.update();
    this.active = false;
    if (!frame) return null;
    return { position: frame.position, target: frame.target };
  }

  get isActive(): boolean {
    return this.active;
  }
}
