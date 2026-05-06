/**
 * T6.4-M2.5 S6 + Round-6 (R6-C, 2026-05-06) — module-level
 * singleton for the HYG fly-to progress signal.
 *
 * **Why a singleton, not the store?** This is per-frame mutable
 * state used as a one-way producer→consumer channel between
 * `CameraController` (writes per frame in the HYG fly-to branch)
 * and `HygStellarMesh` (reads per frame to decide pre-warm). Going
 * through Zustand would either trigger React re-renders 60 fps
 * (bad) or require a `subscribe`-with-selector pattern that adds
 * coupling without buying anything for a fully imperative channel.
 * The singleton matches the channel's actual semantics: a shared
 * mutable cell with no React-tracked subscribers.
 *
 * **Round-6 semantic change** (Codex audit 2026-05-06 P2): pre-
 * Round-6 the value was "position-channel raw alpha (pre-easing)"
 * — a duration-fraction of the lerp's elapsed time. Round-6
 * swapped the position channel from `StellarFlightTransition` to
 * `HygPhysicsFlight`'s gate-driven integrator, which has no
 * fixed-duration alpha. The new value is
 * `HygPhysicsFlight.progressRaw`: a direction-agnostic angular-
 * radius journey fraction in `[0, 1]`. 0 = no integration yet
 * (`currentAngularRadius == initialAngularRadius`); 1 = at gate
 * (`currentAngularRadius == targetAngularRadius`); both forward
 * (camera closes in) and backward (camera-rebound, backs out) cases
 * advance from 0 → 1 monotonically. The signal is gate-aligned,
 * so M3's cross-fade ramp can consume it as the apparent-size
 * progression axis directly.
 *
 * **Why a `null`-vs-number contract?** `null` means "no HYG fly-to
 * is active" — consumers should fall through to their natural
 * sa-driven gate.
 *
 * **Lifecycle**:
 *   - `setHygFlightPosProgress(value)` — written by
 *     `CameraController.useFrame` while the HYG physics integrator
 *     is active.
 *   - `setHygFlightPosProgress(null)` — written on natural
 *     completion (last frame, after `HygPhysicsFlight.update()`
 *     flips `isActive` to false), on user interrupt
 *     (`OrbitControls "start"` handler), and on focus change
 *     (cleanup of the setupCamera useEffect).
 *
 * Test isolation: tests call `__resetHygFlightPosProgress()` in
 * `beforeEach` to avoid cross-test bleed.
 */

let progress: number | null = null;

/**
 * Publish the current angular-radius journey fraction (Round-6
 * semantic). Pass `null` to clear the signal (no active fly-to).
 * Numeric values outside `[0, 1]` are clamped (defensive — the
 * contract is `[0, 1]` but a producer with rounding error
 * shouldn't break the consumer).
 */
export const setHygFlightPosProgress = (value: number | null): void => {
  if (value === null) {
    progress = null;
    return;
  }
  if (!Number.isFinite(value)) {
    progress = null;
    return;
  }
  progress = value < 0 ? 0 : value > 1 ? 1 : value;
};

/**
 * Read the current angular-radius journey fraction (Round-6
 * semantic — see file header). Returns `null` when no HYG
 * fly-to is active.
 */
export const getHygFlightPosProgress = (): number | null => progress;

/**
 * Test-only escape hatch. Resets the singleton to `null`. Production
 * code should not call this — use `setHygFlightPosProgress(null)`
 * instead so the intent is grep-able.
 */
export const __resetHygFlightPosProgress = (): void => {
  progress = null;
};

/**
 * Threshold reserved for the M3 cross-fade consumer. Originally
 * (M2.5 S6, before Codex round-3 C-2 revert) HygStellarMesh used
 * this to force-activate its procedural mesh once the position-
 * channel raw alpha cleared 0.70 — but force-activate also wrote
 * skipMask=1, hiding the sprite while the mesh was still
 * angularly small (the very gap M2.5 was meant to avoid). C-2
 * reverted the force-activate; this constant now documents the
 * arrival-window threshold M3's cross-fade is expected to ramp
 * across.
 *
 * Under Round-6 semantics (Codex audit 2026-05-06 P2 doc-fix),
 * progress is a direction-agnostic angular-radius journey
 * fraction, NOT a duration-fraction of a logistic-sigmoid lerp.
 * 0.70 means "70 % of the angular-radius gap between
 * `initialAngularRadius` and `targetAngularRadius` has been
 * closed" — under the cap-bound exp-decay shape this happens
 * geometrically near the end of the flight (apparent-size growth
 * is exponential in time, so the last 30 % of journey-fraction
 * lives in the last ~25 % of wall-clock). M3's cross-fade should
 * ramp from 0 (sprite-only) at progress ≤ 0.70 to 1 (mesh-only)
 * around the natural sa-driven mesh-spawn gate, which crosses
 * shortly after this threshold for typical HYG geometries.
 */
export const HYG_FLIGHT_PREWARM_THRESHOLD = 0.7;
