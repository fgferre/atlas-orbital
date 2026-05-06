import * as THREE from "three";

/**
 * CameraTransition - Smooth camera transitions using Bezier curves and easing
 * Based on NASA Eyes on the Solar System architecture
 */
export class CameraTransition {
  private startPos: THREE.Vector3;
  private endPos: THREE.Vector3;
  private bezierCurve: THREE.QuadraticBezierCurve3 | null = null;
  private startTime: number = 0;
  private duration: number = 2000; // ms
  private isActive: boolean = false;
  private onComplete?: () => void;

  constructor() {
    this.startPos = new THREE.Vector3();
    this.endPos = new THREE.Vector3();
  }

  /**
   * Start a camera transition with Bezier curve
   */
  start(
    startPos: THREE.Vector3,
    endPos: THREE.Vector3,
    sunPos: THREE.Vector3,
    duration: number = 2000,
    onComplete?: () => void
  ): void {
    this.startPos.copy(startPos);
    this.endPos.copy(endPos);
    this.duration = duration;
    this.onComplete = onComplete;

    // Calculate control point that avoids the sun
    const controlPoint = this.calculateSafeControlPoint(
      startPos,
      endPos,
      sunPos
    );

    this.bezierCurve = new THREE.QuadraticBezierCurve3(
      startPos.clone(),
      controlPoint,
      endPos.clone()
    );

    this.startTime = performance.now();
    this.isActive = true;
  }

  /**
   * Calculate a control point for Bezier curve that avoids passing through the sun
   */
  private calculateSafeControlPoint(
    start: THREE.Vector3,
    end: THREE.Vector3,
    sunPos: THREE.Vector3
  ): THREE.Vector3 {
    // Midpoint between start and end
    const midpoint = start.clone().add(end).multiplyScalar(0.5);

    // Vector from sun to midpoint
    const sunToMid = midpoint.clone().sub(sunPos);

    // Distance between start and end
    const distance = start.distanceTo(end);

    // If already far from sun, just use elevated midpoint
    const distToSun = sunToMid.length();

    if (distToSun > distance * 0.3) {
      // Already safe, just add some elevation for a nice arc
      const upOffset = new THREE.Vector3(0, 1, 0).multiplyScalar(
        distance * 0.2
      );
      return midpoint.add(upOffset);
    }

    // Push control point away from sun to avoid passing through
    const pushDirection = sunToMid.normalize();
    const pushDistance = distance * 0.4; // Push by 40% of travel distance

    return midpoint.add(pushDirection.multiplyScalar(pushDistance));
  }

  /**
   * Update the transition and return current position
   * Returns null if transition is complete or not active
   */
  update(): THREE.Vector3 | null {
    if (!this.isActive || !this.bezierCurve) {
      return null;
    }

    const elapsed = performance.now() - this.startTime;
    const rawT = Math.min(elapsed / this.duration, 1);

    // Apply easing - easeOutQuint for very smooth "landing" (slows down even more at the end)
    const t = CameraTransition.easeOutQuint(rawT);

    // Get position on Bezier curve
    const position = this.bezierCurve.getPoint(t);

    // Check if complete
    if (rawT >= 1) {
      this.isActive = false;
      this.onComplete?.();
    }

    return position;
  }

  /**
   * Check if transition is currently active
   */
  get active(): boolean {
    return this.isActive;
  }

  /**
   * Get progress (0-1)
   */
  get progress(): number {
    if (!this.isActive) return 1;
    const elapsed = performance.now() - this.startTime;
    return Math.min(elapsed / this.duration, 1);
  }

  /**
   * Stop the current transition
   */
  stop(): void {
    this.isActive = false;
  }

  // ===========================================================================
  // Easing Functions Library
  //
  // Atualmente apenas easeOutQuint é utilizada (método update, linha 101).
  // Outras funções mantidas para:
  // - Flexibilidade em futuras animações de câmera com diferentes características
  // - Possível uso em transições de UI (timeline, panels, overlays)
  // - Referência matemática para implementação de novos easings
  // ===========================================================================

  /**
   * Cubic ease-in-out function for smooth acceleration/deceleration
   */
  static easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Quartic ease-out - starts fast, ends very slow (smooth landing)
   * Best for camera movements where you want a gentle arrival
   */
  static easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - t, 4);
  }

  /**
   * Quintic ease-out - starts fast, ends VERY slow (ultra smooth landing)
   * Best for camera movements where the final rotation needs to be very gentle
   */
  static easeOutQuint(t: number): number {
    return 1 - Math.pow(1 - t, 5);
  }

  /**
   * Quadratic ease-out (faster start, slower end)
   */
  static easeOutQuad(t: number): number {
    return 1 - (1 - t) * (1 - t);
  }

  /**
   * Linear interpolation (no easing)
   */
  static linear(t: number): number {
    return t;
  }

  /**
   * Symmetric S-curve normalized to [0, 1] over [0, 1]. Port of
   * Gaia Sky's "logisticsigmoid" mapper.
   *
   * **Default factor `60`** matches Gaia's `getMapper` default at
   * `CameraModule.java:1210` (which clamps the smoothing factor to
   * `[12, 500]` and is fed Gaia's default `60` from Settings; see
   * `MathUtilsDouble.logisticSigmoid` source). Both endpoints are
   * softly approached over ~30% of the duration each, mid-flight
   * is fast — the cinematic "lift-off → warp → arrival" feel for
   * catalog star fly-to.
   *
   * **Pre-round-5 used factor=12** as an Atlas-opinion divergence,
   * documented as "Gaia's 60 is too steep — feels like the camera
   * stalled". User smoke 2026-05-05 disconfirmed that judgment:
   * with factor=12 every solar→star fly-to felt like a jump
   * because the camera covered most of the trajectory in the first
   * second (no stall = no perceptual departure phase). Per
   * `feedback_default_gaia_fidelity.md` (when stuck between match
   * Gaia and atlas-opinion, pick Gaia), round-5 closes this
   * divergence by aligning with Gaia's `60`. T6.4-M2.5 S2 +
   * round-5 (2026-05-06).
   *
   * Endpoints clamp via affine renormalization
   * `(at(t) - at(0)) / (at(1) - at(0))` so `logisticSigmoid(0) === 0`
   * and `logisticSigmoid(1) === 1` exactly (raw sigmoid sits at
   * ~`9e-14` and ~`1 - 9e-14` for `factor=60` without the clamp;
   * for `factor=12` the raw endpoints were ~`0.0025` and ~`0.9975`,
   * which is why the affine renorm became necessary).
   */
  static logisticSigmoid(t: number, factor = 60): number {
    const k = factor;
    const center = 0.5;
    const sigmoid = (x: number): number =>
      1 / (1 + Math.exp(-k * (x - center)));
    const a0 = sigmoid(0);
    const a1 = sigmoid(1);
    return (sigmoid(t) - a0) / (a1 - a0);
  }
}
