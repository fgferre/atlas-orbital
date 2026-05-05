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
 * Threshold above which `HygStellarMesh` force-activates its
 * procedural mesh during a HYG fly-to. 0.70 of the position-channel
 * raw alpha corresponds to ~92% of the straight-line camera travel
 * under the default `logisticSigmoid(factor=12)` easing — the
 * "deceleration tail" where the camera is approaching its landing
 * pose. Pre-warming here gives the M3 cross-fade a workable window
 * before arrival.
 */
export const HYG_FLIGHT_PREWARM_THRESHOLD = 0.7;
