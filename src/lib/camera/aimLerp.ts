import * as THREE from "three";

import { CameraTransition } from "./CameraTransition";

/**
 * T6.4-M2.5 round-6 (post R6-H, 2026-05-06 user-smoke fix) — aim-
 * direction lerp for HYG fly-to orientation.
 *
 * **Why this replaces `OrientationLerp`** (Codex audit, 2026-05-06):
 * `OrientationLerp` interpolates `controls.target` ABSOLUTELY from
 * the previous focus's world position to the new star's world
 * position. Under Round-6's gate-driven physics, camera position
 * advances ~95 % of the trajectory in the first ~1 s — so for the
 * first several hundred ms, the lerped target sits BEHIND the
 * camera along the motion axis. OrbitControls then derives the
 * camera's orientation from `(camera.position, controls.target)`
 * and the camera ends up looking BACKWARD relative to its motion
 * direction. User-reported "marcha ré" perception (camera goes in
 * reverse before going forward).
 *
 * Worse: as the lerp progresses and camera also moves, the lerped
 * target's path can CROSS the camera's path — at the crossing
 * moment, `target - camera.position` becomes degenerate (length →
 * 0) and OrbitControls's orientation flips. User-reported "tela
 * muda para um quadro errado" perception.
 *
 * **Aim-lerp design** (Codex 2026-05-06 recommendation):
 * interpolate the AIM DIRECTION (a unit vector) instead of the
 * absolute target position. Each frame:
 *
 *   1. Compute `currentAimToStar = (starWorldPos - cameraPos)
 *      .normalized()` — the direction the camera SHOULD be looking
 *      to face the star from its current position.
 *   2. Slerp from `initialAimDir` (frozen at start) to
 *      `currentAimToStar`, eased by raw progress.
 *   3. Compute `aimTarget = cameraPos + aimDir × distanceToStar`
 *      — always at the actual star-distance ahead of the camera
 *      along the aim direction. Never crosses the camera, never
 *      degenerates.
 *
 * The lerp endpoint (`currentAimToStar`) is RECOMPUTED per frame
 * as the camera moves. For atlas's typical case (camera moves
 * along the camera-to-star axis), the endpoint is roughly stable.
 * For pathological motions perpendicular to the axis, the endpoint
 * shifts smoothly, which the slerp absorbs.
 *
 * Caller must ALSO call `camera.lookAt(aimTarget)` after writing
 * `controls.target = aimTarget` and `camera.position = ...`
 * to handle Drei OrbitControls' `useFrame` priority -1 (it runs
 * BEFORE the controller's priority-0 useFrame each frame, so
 * the camera quaternion would otherwise lag the position by one
 * frame). The explicit `lookAt` forces orientation in-sync with
 * position in the same frame.
 *
 * **Cancel semantics** match `OrientationLerp` / `HygPhysicsFlight`:
 * `cancel()` freezes at current eased aim, returns the frozen
 * `aimTarget`, and does NOT fire `onComplete`. The S5 interrupt
 * handoff (OrbitControls "start" handler) syncs `controls.target`
 * to that frozen value.
 */

export interface AimLerpSpec {
  /** Camera world position at the moment the lerp starts. Used
   *  with `controls.target` (passed implicitly via the start-time
   *  scope) to derive the initial aim direction. */
  startCameraPos: THREE.Vector3;
  /** OrbitControls target at the moment the lerp starts. Combined
   *  with `startCameraPos` to derive `initialAimDir = (startTarget -
   *  startCameraPos).normalized()`. */
  startTarget: THREE.Vector3;
  /** Star world position. The aim direction's lerp endpoint is
   *  recomputed each frame as `(starWorldPos - currentCameraPos)
   *  .normalized()` so the aim tracks the camera's actual motion. */
  starWorldPos: THREE.Vector3;
  /** Lerp duration, ms. */
  durationMs: number;
  /** Default: `CameraTransition.logisticSigmoid` (factor=12). For
   *  HYG flights, callers should pass factor=17 explicitly to
   *  match Gaia's scripted-orientation pacing
   *  (`CameraModule.java:680`). */
  easing?: (t: number) => number;
  /** Fires on natural completion (raw alpha=1). NOT fired by `cancel()`. */
  onComplete?: () => void;
}

export interface AimLerpFrame {
  /** Value to write to `controls.target` — always at distance >=
   *  numerically-safe from the camera, never crosses the camera
   *  along the motion axis. */
  target: THREE.Vector3;
  /** True when raw alpha reached 1. */
  done: boolean;
}

const DEFAULT_EASING = (t: number): number =>
  CameraTransition.logisticSigmoid(t);

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Slerp two unit vectors. Falls back to linear+normalize when
 *  the angle is tiny (< 0.001 rad) to avoid division by sin(0).
 *  Uses THREE.Quaternion.setFromUnitVectors → quaternion.slerp →
 *  applyQuaternion which is mathematically correct for any sweep
 *  including near-180° (where lerp+normalize would fail). */
const slerpDirections = (
  out: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  t: number,
  q: THREE.Quaternion,
  qPartial: THREE.Quaternion,
  qIdentity: THREE.Quaternion
): THREE.Vector3 => {
  const dot = Math.max(-1, Math.min(1, a.dot(b)));
  if (dot > 0.9999) {
    // Already aligned — no rotation needed.
    return out.copy(b);
  }
  if (dot < -0.9999) {
    // 180° opposite — slerp ill-defined; build an orthogonal
    // intermediate axis and rotate by t × π.
    // For atlas's HYG focus, this case is rare (would require
    // initial camera looking exactly opposite to the star).
    // Pick any perpendicular axis; X works unless `a` is along X.
    const axis =
      Math.abs(a.x) < 0.9
        ? out.set(1, 0, 0).cross(a).normalize()
        : out.set(0, 1, 0).cross(a).normalize();
    q.setFromAxisAngle(axis, Math.PI * t);
    return out.copy(a).applyQuaternion(q);
  }
  // General case: build a quaternion rotating a → b, slerp it
  // partially from identity at proportion t, apply to a.
  q.setFromUnitVectors(a, b);
  qPartial.copy(qIdentity).slerp(q, t);
  return out.copy(a).applyQuaternion(qPartial);
};

export class AimLerp {
  private active = false;
  private startTimeMs = 0;
  private durationMs = 0;
  private easing: (t: number) => number = DEFAULT_EASING;
  private onComplete?: () => void;
  private readonly initialAimDir = new THREE.Vector3();
  private readonly starWorldPos = new THREE.Vector3();

  /** Reusable scratch vectors so per-frame `update()` allocates
   *  nothing in the steady state. */
  private readonly tmpToStar = new THREE.Vector3();
  private readonly tmpAimDir = new THREE.Vector3();
  private readonly outTarget = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpQPartial = new THREE.Quaternion();
  private readonly qIdentity = new THREE.Quaternion(0, 0, 0, 1);

  start(spec: AimLerpSpec): void {
    // Initial aim direction: from camera toward existing target.
    // Defensive: degenerate (zero-length) inputs fall back to the
    // direction toward the star, which gives an instant-snap
    // first-frame outcome (acceptable degenerate-case behavior).
    this.initialAimDir.subVectors(spec.startTarget, spec.startCameraPos);
    if (this.initialAimDir.lengthSq() <= 1e-12) {
      this.initialAimDir
        .subVectors(spec.starWorldPos, spec.startCameraPos)
        .normalize();
    } else {
      this.initialAimDir.normalize();
    }
    this.starWorldPos.copy(spec.starWorldPos);
    this.durationMs = Math.max(spec.durationMs, 0);
    this.easing = spec.easing ?? DEFAULT_EASING;
    this.onComplete = spec.onComplete;
    this.startTimeMs = performance.now();
    this.active = true;
  }

  /** Side-effect-free frame compute. */
  private computeFrame(currentCameraPos: THREE.Vector3): AimLerpFrame {
    const elapsed = performance.now() - this.startTimeMs;
    const alphaRaw =
      this.durationMs > 0 ? clamp01(elapsed / this.durationMs) : 1;
    const alpha = this.easing(alphaRaw);

    // Recompute aim-toward-star each frame so the lerp endpoint
    // tracks the camera's actual motion.
    this.tmpToStar.subVectors(this.starWorldPos, currentCameraPos);
    const distanceToStar = this.tmpToStar.length();
    if (distanceToStar <= 0) {
      // Camera coincides with star — degenerate. Snap target to
      // star + small offset along initialAimDir so OrbitControls
      // doesn't see a zero target vector.
      this.outTarget
        .copy(this.starWorldPos)
        .addScaledVector(this.initialAimDir, 1);
      return { target: this.outTarget, done: alphaRaw >= 1 };
    }
    this.tmpToStar.divideScalar(distanceToStar);

    slerpDirections(
      this.tmpAimDir,
      this.initialAimDir,
      this.tmpToStar,
      alpha,
      this.tmpQ,
      this.tmpQPartial,
      this.qIdentity
    );

    // Place target at the actual camera-to-star distance along
    // the aim direction. When alpha=1, aimDir === toStar dir, so
    // target === starWorldPos.
    this.outTarget
      .copy(currentCameraPos)
      .addScaledVector(this.tmpAimDir, distanceToStar);

    return { target: this.outTarget, done: alphaRaw >= 1 };
  }

  /** Per-frame consumer. Pass the CURRENT camera world position
   *  so the lerp endpoint can be recomputed against the camera's
   *  actual motion. Returns `null` when inactive. */
  update(currentCameraPos: THREE.Vector3): AimLerpFrame | null {
    if (!this.active) return null;
    const frame = this.computeFrame(currentCameraPos);
    if (frame.done) {
      this.active = false;
      this.onComplete?.();
    }
    return frame;
  }

  /** Deactivate without firing `onComplete`. Unlike `OrientationLerp`,
   *  `AimLerp` does NOT need to return a frozen target — `update()`
   *  has already written `controls.target` to the lerped value
   *  in the most recent frame, and `useFrame` stops writing after
   *  `cancel()` so `controls.target` stays at that last value
   *  naturally. The OrbitControls "start" interrupt path therefore
   *  needs no extra `controls.target.copy(frozen.target)` step. */
  cancel(): void {
    this.active = false;
  }

  get isActive(): boolean {
    return this.active;
  }
}
