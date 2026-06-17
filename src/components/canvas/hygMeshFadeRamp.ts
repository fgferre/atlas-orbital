/**
 * M3 — linear integrator for the HygStellarMesh sprite↔mesh
 * cross-fade ramp.
 *
 * Lives outside `HygStellarMesh.tsx` so the Fast Refresh rule
 * (react-refresh/only-export-components) stays clean and the
 * integrator is independently unit-testable without mounting
 * the full Three.js scene.
 *
 * Contract: traverses [0..1] linearly toward `target` over
 * `durationMs` of wall-time. No overshoot, no exponential decay
 * (predictable timing for the user). Defensive against
 * pathological inputs (NaN dt, ≤ 0 durationMs, out-of-range
 * current).
 */

/**
 * Step `current` toward `target` linearly. Returns the new value
 * after `dtSeconds` of wall-time, where the full [0..1]
 * traversal takes `durationMs`. Clamped to the segment between
 * current and target (no overshoot).
 *
 * Defensive on `durationMs <= 0`: returns the clamped target
 * directly (treats as instantaneous). Useful guard for tests
 * that pass 0 to bypass the ramp.
 */
export function stepRampToward(
  current: number,
  target: number,
  dtSeconds: number,
  durationMs: number
): number {
  if (durationMs <= 0) return Math.max(0, Math.min(1, target));
  // Guard non-finite dt (honors the NaN-safety promised in the docstring
  // — Math.max(0, Math.min(1, NaN)) is NaN, so an unguarded NaN dt would
  // poison the ramp) and clamp pathological spikes such as the large raw
  // R3F delta on the first frame after a backgrounded tab resumes, so the
  // cross-fade animates instead of snapping. 0.1 s matches the camera
  // flight dt cap.
  const dt = Number.isFinite(dtSeconds)
    ? Math.min(Math.max(dtSeconds, 0), 0.1)
    : 0;
  const stepMagnitude = (dt * 1000) / durationMs;
  const remaining = target - current;
  if (Math.abs(remaining) <= stepMagnitude) return target;
  const next = current + Math.sign(remaining) * stepMagnitude;
  return Math.max(0, Math.min(1, next));
}
