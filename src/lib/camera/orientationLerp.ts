import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";

/**
 * T6.4-M2.5 round-6 R6-A — orientation-only lerp extracted from
 * `StellarFlightTransition`'s target channel.
 *
 * Round-6 swaps the HYG fly-to position channel from a duration-
 * driven `logisticSigmoid` lerp (`StellarFlightTransition`) to the
 * gate-driven physics integrator (`HygPhysicsFlight`). The
 * orientation channel is preserved as-is from M2.5 / round-5b:
 * a logistic-sigmoid lerp of `controls.target` with Gaia's scripted-
 * transition factor=17 default (`CameraModule.java:680`). The two
 * channels run in parallel with independent durations / completion
 * conditions, same handshake the M2.5 §S3 review specified.
 *
 * Why a separate class instead of reusing `StellarFlightTransition`?
 *   1. **Single Responsibility** — once round-6 takes over the
 *      position channel, threading orientation-only state through
 *      the two-channel class would require ignoring half its API.
 *   2. **Forward-compat for tour features** — `StellarFlightTransition`
 *      stays in the codebase for future scripted/cinematic tours
 *      (per Round-6 acceptance §5). Keeping it as a 2-channel
 *      class makes the tour use case unambiguous.
 *
 * Cancel-vs-complete semantics mirrors `StellarFlightTransition`
 * verbatim (Codex 2026-05-05 P2): `cancel()` freezes the current
 * eased target and returns it WITHOUT firing `onComplete`, so the
 * S5 interrupt path (`OrbitControls "start"`) doesn't trigger
 * `flyingRef.isFlying = false` side-effects intended for natural
 * arrivals.
 */

export interface OrientationLerpSpec {
  /** Current OrbitControls target. */
  startTarget: THREE.Vector3;
  /** Star world position (where the camera should look at end). */
  endTarget: THREE.Vector3;
  /** Lerp duration, ms. */
  durationMs: number;
  /** Default: `CameraTransition.logisticSigmoid` (factor=12). For
   *  HYG flights, callers should pass factor=17 explicitly to match
   *  Gaia's scripted-orientation pacing
   *  (`CameraModule.java:680`). `setupCameraHyg` does this. */
  easing?: (t: number) => number;
  /** Fires on natural completion (alpha=1). NOT fired by `cancel()`. */
  onComplete?: () => void;
}

export interface OrientationLerpFrame {
  /** Current interpolated OrbitControls target. */
  target: THREE.Vector3;
  /** True when the lerp has completed (raw alpha ≥ 1). */
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

export class OrientationLerp {
  private active = false;
  private startTimeMs = 0;
  private spec: Required<Omit<OrientationLerpSpec, "onComplete">> & {
    onComplete?: () => void;
  } = {
    startTarget: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    durationMs: 0,
    easing: DEFAULT_EASING,
  };
  private readonly outTarget = new THREE.Vector3();

  start(spec: OrientationLerpSpec): void {
    this.spec.startTarget.copy(spec.startTarget);
    this.spec.endTarget.copy(spec.endTarget);
    this.spec.durationMs = Math.max(spec.durationMs, 0);
    this.spec.easing = spec.easing ?? DEFAULT_EASING;
    this.spec.onComplete = spec.onComplete;
    this.startTimeMs = performance.now();
    this.active = true;
  }

  /** Side-effect-free frame compute. Shared by `update()` (which
   *  may fire `onComplete`) and `cancel()` (which never does). */
  private computeFrame(): OrientationLerpFrame {
    const elapsed = performance.now() - this.startTimeMs;
    const alphaRaw =
      this.spec.durationMs > 0 ? clamp01(elapsed / this.spec.durationMs) : 1;
    const alpha = this.spec.easing(alphaRaw);
    lerpVec3(this.outTarget, this.spec.startTarget, this.spec.endTarget, alpha);
    return { target: this.outTarget, done: alphaRaw >= 1 };
  }

  /** Per-frame consumer. Returns `null` when inactive. */
  update(): OrientationLerpFrame | null {
    if (!this.active) return null;
    const frame = this.computeFrame();
    if (frame.done) {
      this.active = false;
      this.spec.onComplete?.();
    }
    return frame;
  }

  /** Freeze at current alpha and return the intermediate target.
   *  Does NOT fire `onComplete` (cancellation ≠ completion). */
  cancel(): { target: THREE.Vector3 } | null {
    if (!this.active) return null;
    const frame = this.computeFrame();
    this.active = false;
    return { target: frame.target };
  }

  get isActive(): boolean {
    return this.active;
  }
}
