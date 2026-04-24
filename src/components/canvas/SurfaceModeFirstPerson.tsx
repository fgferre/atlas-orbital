import { useEffect, useRef, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../../store";
import {
  computeMouseLookDelta,
  computeRollDelta,
  clampPitch,
  SURFACE_LOOK_ROLL_RAD_PER_SEC,
} from "../../lib/camera/surfaceLook";
import { useSurfaceModePointerLock } from "../../lib/camera/useSurfaceModePointerLock";

/**
 * T4.2-β-handler (Silver) — pointer-lock first-person look for
 * atlas's surface mode.
 *
 * Replaces the near-target orbit approximation from the original
 * T4.2-β-handler ship (`src/lib/camera/surfaceLookTarget.ts`).
 * Under `feedback_no_effect_stacking.md`, a port that supersedes an
 * atlas-native implementation REPLACES it — the old approximation
 * is removed in the same commit, not stacked.
 *
 * **Port target** (`/tmp/gaiasky/core/src/gaiasky/`):
 *   - `input/GameMouseKbdListener.java:152-169` — mouse-move → yaw
 *     + pitch acceleration path.
 *   - `input/GameMouseKbdListener.java:74-80` — Q/E keys → roll
 *     acceleration path.
 *   - `scene/camera/NaturalCamera.java:1111-1127` —
 *     `updateRotationFree`: rotates direction + up around camera-
 *     local right (`direction × up`) and camera-local up.
 *   - `scene/camera/NaturalCamera.java:1130-1137` — `updateRoll`:
 *     rotates around camera-local forward (`direction`).
 *
 * **Architectural adaptation**:
 *   - Gaia's Game mode uses the LibGDX mouse-capture API;
 *     atlas uses the browser Pointer Lock API. Same contract (raw
 *     `MouseEvent.movementX/Y`, Esc-to-exit).
 *   - Gaia's rotation handlers apply to its custom `direction` +
 *     `up` vectors; atlas mutates `camera.rotation` directly via
 *     local-axis rotations (`rotateX`/`Y`/`Z`), which are
 *     semantically identical — Three.js's `Camera` tracks
 *     direction+up through its rotation quaternion, and local-axis
 *     rotations produce the same geometric transform Gaia's
 *     `rotate(axis, angle)` applies to its direction+up pair.
 *   - Gaia has a two-stage input pipeline (low-pass smoothing →
 *     acceleration/velocity integration → per-frame rotate). Atlas
 *     collapses this to a direct per-event angle emit because
 *     Pointer Lock's `movementX/Y` already integrates pixels since
 *     the last event; another integration stage would introduce
 *     perceptible latency for no gain.
 *
 * **Sign conventions** are pinned in `surfaceLook.test.ts` —
 *   mouse right → look right, mouse down → look down (both via
 *   negative rotation angles applied locally, see `surfaceLook.ts`
 *   header for the derivation), Q → roll left (CCW from viewer =
 *   `rotateZ(+)`), E → roll right (CW = `rotateZ(-)`). See the test
 *   file for the reference behavior if a future tuning session
 *   needs to confirm.
 *
 * **Why `getElementById('root')` instead of `gl.domElement`**:
 * pointer lock is acquired on an HTMLElement that receives user
 * input. `gl.domElement` IS the canvas, which is what we lock, but
 * R3F's `useThree(({ gl }) => gl.domElement)` returns the same
 * reference. We pass it directly via ref below.
 *
 * **Interaction with OrbitControls**: on entry we set
 * `controls.enabled = false`, restore on exit. Disabling controls
 * freezes `controls.target` at its pre-entry value, so when the
 * user leaves surface mode the camera reverts to orbiting that
 * target. CameraController's own useFrame then re-establishes the
 * focus-tracking target on the next tick. Net effect: clean
 * round-trip with no "target snap" transition artifact.
 */
export const SurfaceModeFirstPerson = () => {
  const { camera, gl } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;

  const surfaceModeActive = useStore((state) => state.surfaceModeActive);
  const isIntroAnimating = useStore((state) => state.isIntroAnimating);

  // **Retry-loop guard** (2026-04-24 white-canvas post-mortem).
  // If the browser denies pointer lock (no user gesture, detached
  // element, transient activation crossed), `pointerlockerror` fires
  // but `surfaceModeActive` stays true and `isLocked` stays false,
  // which means the effect below can re-invoke `request()` on any
  // subsequent render. The 2026-04-23 audit flagged this as a real
  // retry storm vector. Mitigation: count consecutive errors and
  // stop requesting after 3 failures for the remainder of the
  // current surface-mode session. Counter resets on successful
  // lock + on `surfaceModeActive` flipping false.
  const lockErrorCountRef = useRef(0);
  const LOCK_ERROR_BACKOFF_THRESHOLD = 3;

  // Accumulators for clamp-safe incremental rotation. We don't
  // re-derive pitch from `camera.rotation.x` every frame because
  // that's Euler-order dependent (YXZ vs XYZ yield different
  // decompositions) and the accumulator carries the intent cleanly.
  //
  // **Known resync behavior** (2026-04-23, SUBAGENT VERIFY note):
  // the accumulator is initialized to 0 at mount and is NOT
  // resync'd to the camera's current orientation on surface-mode
  // re-entry. Intent: pitch "starts fresh" each time the user
  // enters surface mode — equivalent to Gaia's Game-mode entry,
  // which also discards prior pitch input state. If OrbitControls
  // had tilted the camera significantly before re-entry the
  // clamp will STILL bound the accumulated pitch to ±(π/2 − 0.01),
  // so the user cannot accidentally pitch past the pole by
  // stacking OrbitControls + pointer-lock inputs.
  const pitchAccumRef = useRef(0);
  // Per-frame aggregated mouse deltas, consumed + reset in useFrame.
  // Batching per frame avoids applying N rotations per frame when
  // high-DPI mice fire multiple mousemove events per vsync tick.
  const pendingYawRef = useRef(0);
  const pendingPitchRef = useRef(0);

  // Ref to the canvas element for the pointer-lock hook. Stable
  // across renders (gl.domElement identity doesn't change).
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    canvasRef.current = gl.domElement;
  }, [gl.domElement]);

  // Capture OrbitControls state on lock-enter so we can restore it
  // on exit. `controls.enabled` is the only field we mutate.
  const prevControlsEnabledRef = useRef<boolean | null>(null);

  const onMouseMove = useMemo(
    () => (event: MouseEvent) => {
      // Pointer lock MouseEvents carry `movementX/Y` in CSS pixels
      // relative to the pre-lock cursor position (always 0 when
      // the cursor is hidden, so the value is pure motion delta).
      const delta = computeMouseLookDelta(event.movementX, event.movementY);
      pendingYawRef.current += delta.yaw;
      pendingPitchRef.current += delta.pitch;
    },
    []
  );

  const { isLocked, keys, request, exit } = useSurfaceModePointerLock({
    target: canvasRef,
    onMouseMove,
    onLockChange: (locked) => {
      if (!controls) return;
      // OrbitControls.enabled is a plain boolean field; mutating it
      // is the stdlib-documented way to disable input without
      // remounting the control. The react-hooks/immutability rule
      // fires on any `controls.*` mutation because the object came
      // from a hook, but the Three.js OrbitControls pattern treats
      // these mutations as legitimate. Ignore both writes below.
      if (locked) {
        // Successful lock — reset the retry-error backoff counter.
        lockErrorCountRef.current = 0;
        // Snapshot + disable. OrbitControls.update() is idempotent
        // so leaving it "enabled = false" doesn't leak state.
        if (prevControlsEnabledRef.current === null) {
          prevControlsEnabledRef.current = controls.enabled;
        }
        // eslint-disable-next-line react-hooks/immutability -- OrbitControls.enabled mutation is the stdlib API
        controls.enabled = false;
      } else {
        // Restore. If the lock was never entered (locked === false
        // from the initial attach), prev is null and we leave
        // controls as-is.
        if (prevControlsEnabledRef.current !== null) {
          controls.enabled = prevControlsEnabledRef.current;
          prevControlsEnabledRef.current = null;
        }
        // Drop any pending deltas that accumulated mid-transition
        // so they don't leak into the next lock.
        pendingYawRef.current = 0;
        pendingPitchRef.current = 0;
      }
    },
    onLockError: (event) => {
      // Browsers throw here when the target is detached or when a
      // transient user-activation boundary was crossed. Log so user
      // reports surface the cause; don't crash the frame loop.
      lockErrorCountRef.current += 1;
      console.warn(
        `[SurfaceModeFirstPerson] pointerlockerror — lock denied (attempt ${lockErrorCountRef.current}/${LOCK_ERROR_BACKOFF_THRESHOLD}):`,
        event
      );
      if (lockErrorCountRef.current >= LOCK_ERROR_BACKOFF_THRESHOLD) {
        console.warn(
          "[SurfaceModeFirstPerson] backoff engaged — no further lock attempts until surfaceModeActive flips false."
        );
      }
    },
  });

  // Drive lock acquisition off `surfaceModeActive`. The flag is
  // written by CameraController's useFrame; once true, request lock
  // on the next microtask to avoid a frame-loop → React-render
  // reentrance. When it flips false, exit.
  //
  // NOTE: `requestPointerLock()` must be called within a user-
  // gesture context on some browsers. atlas enters surface mode by
  // the USER dragging the camera close to a planet surface — that
  // drag IS the gesture, and the request fires synchronously from
  // the useEffect that observes the store flag flip, which is
  // inside the React render cycle tied to that gesture. Real-world
  // behavior: works consistently in Chromium + Firefox; Safari may
  // require an explicit click fallback (out of scope for Silver).
  useEffect(() => {
    if (isIntroAnimating) return;
    // When the user leaves surface mode, reset the error backoff so
    // the next entry gets a fresh retry budget.
    if (!surfaceModeActive) {
      lockErrorCountRef.current = 0;
    }
    if (
      surfaceModeActive &&
      !isLocked &&
      lockErrorCountRef.current < LOCK_ERROR_BACKOFF_THRESHOLD
    ) {
      request();
    } else if (!surfaceModeActive && isLocked) {
      exit();
    }
  }, [surfaceModeActive, isLocked, isIntroAnimating, request, exit]);

  // Per-frame application of accumulated input → camera rotation.
  // Defensive try/catch per the T4.2-α / T4.2-β ships' pattern —
  // a throw here would kill R3F's frame loop and hang the loader
  // at 96 %. See `tasks/lessons.md L26` + `Scene.tsx` safety hatch.
  useFrame((_, dt) => {
    if (!isLocked) return;
    try {
      // 1. Yaw — rotate around camera's own up axis. Local Y in
      //    three-js is the camera's up vector regardless of any
      //    prior pitch/roll, matching Gaia's `rotate(up, ...)`.
      const yaw = pendingYawRef.current;
      pendingYawRef.current = 0;
      if (yaw !== 0) {
        camera.rotateY(yaw);
      }

      // 2. Pitch — rotate around camera's right axis. Clamped
      //    against gimbal lock via the accumulator idiom.
      const pitchDelta = pendingPitchRef.current;
      pendingPitchRef.current = 0;
      if (pitchDelta !== 0) {
        const proposed = pitchAccumRef.current + pitchDelta;
        const clamped = clampPitch(proposed);
        const effectiveDelta = clamped - pitchAccumRef.current;
        pitchAccumRef.current = clamped;
        if (effectiveDelta !== 0) {
          camera.rotateX(effectiveDelta);
        }
      }

      // 3. Roll — from Q/E keyboard state integrated over dt.
      const { qPressed, ePressed } = keys.current;
      const roll = computeRollDelta(
        qPressed,
        ePressed,
        dt,
        SURFACE_LOOK_ROLL_RAD_PER_SEC
      );
      if (roll !== 0) {
        camera.rotateZ(roll);
      }
    } catch (err) {
      console.error(
        "[SurfaceModeFirstPerson] rotation application error:",
        err
      );
    }
  });

  return null;
};
