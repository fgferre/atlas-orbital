/**
 * T6.4-M2.5 S6 — module-level singleton for the HYG fly-to
 * position-channel progress signal.
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
 * **Why a `null`-vs-number contract?** `null` means "no HYG fly-to
 * is active" — consumers should fall through to their natural
 * gate. A numeric value `[0, 1]` is the position-channel raw alpha
 * (pre-easing) of the active fly-to.
 *
 * **Lifecycle**:
 *   - `setHygFlightPosProgress(value)` — written by
 *     `CameraController.useFrame` while the HYG transition is
 *     active.
 *   - `setHygFlightPosProgress(null)` — written on natural
 *     completion (last frame, after `update()` flips `isActive`
 *     to false), on user interrupt (`OrbitControls "start"`
 *     handler), and on focus change (cleanup of the
 *     setupCamera useEffect).
 *
 * Test isolation: tests call `__resetHygFlightPosProgress()` in
 * `beforeEach` to avoid cross-test bleed.
 */

let progress: number | null = null;

/**
 * Publish the current position-channel raw alpha. Pass `null` to
 * clear the signal (no active fly-to). Numeric values outside
 * `[0, 1]` are clamped (defensive — the contract is `[0, 1]` but
 * a producer with rounding error shouldn't break the consumer).
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
 * Read the current position-channel raw alpha. Returns `null`
 * when no HYG fly-to is active.
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
 * across. Under the post-round-5 default `logisticSigmoid(factor=60)`
 * easing, raw alpha 0.70 corresponds to eased alpha ≈ 0.9975 —
 * the camera has covered ≈99.75% of its straight-line path. M3
 * fade alpha should ramp from 0 (sprite-only) at raw ≤ 0.70 to 1
 * (mesh-only) at the natural sa-driven gate crossing, which
 * happens shortly after raw 0.70 for typical HYG geometries.
 */
export const HYG_FLIGHT_PREWARM_THRESHOLD = 0.7;
