import { useEffect, useRef, useState, useCallback } from "react";

/**
 * T4.2-β-handler (Silver) — React hook managing the browser Pointer
 * Lock API lifecycle for atlas's surface-mode first-person look.
 *
 * **Pointer Lock API** (MDN:
 * https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API).
 * Removes the cursor and delivers raw mouse motion via
 * `MouseEvent.movementX/Y` — the primitive any AAA FPS control
 * scheme relies on. User must initiate via a user-gesture-bound
 * call (`canvas.requestPointerLock()`) and can exit with `Esc` at
 * any time. The hook listens for `pointerlockchange` +
 * `pointerlockerror` so consumers can react to system-driven exits
 * (user pressed Esc, tab backgrounded, etc).
 *
 * **What this hook owns**:
 *   - Request/exit of pointer lock on an element ref (the R3F
 *     canvas).
 *   - Observable `isLocked` state.
 *   - `onMouseMove` subscription that fires ONLY while locked
 *     (listener is attached on lock, detached on exit).
 *   - `Q`/`E` keyboard state (roll input) — also scoped to the lock
 *     window so keys don't leak when the user is browsing elsewhere.
 *
 * **What this hook does NOT own**:
 *   - OrbitControls enable/disable (consumer's responsibility — the
 *     hook has no R3F context).
 *   - Camera rotation application (consumer applies via useFrame or
 *     the mousemove callback).
 *   - Store state (`surfaceModeActive` — consumer reads from the
 *     Zustand store and calls `request`/`exit` accordingly).
 *
 * **Why `useRef` for the mousemove callback**: React renders can
 * change the identity of inline handlers each frame; we snapshot the
 * latest callback in a ref so the underlying `addEventListener`
 * registration stays stable across renders. Detaches cleanly on
 * unlock.
 */

export interface PointerLockKeys {
  /** `Q` key currently held? Used for roll-left input. */
  qPressed: boolean;
  /** `E` key currently held? Used for roll-right input. */
  ePressed: boolean;
}

export interface UseSurfaceModePointerLockOptions {
  /**
   * The element to request pointer lock on. Typically the R3F
   * canvas. Pointer-lock MUST be requested on an HTMLElement that
   * is currently focusable + connected to the DOM. When the ref is
   * null the hook is inert.
   */
  target: React.RefObject<HTMLElement | null>;
  /**
   * Called on every `mousemove` that fires while the lock is active.
   * Receives the raw `MouseEvent` — consumer reads `.movementX`
   * / `.movementY`. Stable identity across renders is NOT required;
   * the hook snapshots the latest callback in a ref.
   */
  onMouseMove: (event: MouseEvent) => void;
  /**
   * Called whenever the lock state transitions. Consumer can use
   * this to re-enable OrbitControls on exit, log the event, etc.
   */
  onLockChange?: (isLocked: boolean) => void;
  /**
   * Called on `pointerlockerror` — browser denied the request or
   * the target is in an invalid state. Consumer typically logs and
   * falls back to a non-locked input mode.
   */
  onLockError?: (event: Event) => void;
}

export interface UseSurfaceModePointerLockResult {
  /** True while pointer lock is engaged on the target element. */
  isLocked: boolean;
  /** Current Q/E key state — read inside useFrame to drive roll. */
  keys: React.RefObject<PointerLockKeys>;
  /** Request pointer lock on the target. No-op if target is null. */
  request: () => void;
  /** Exit pointer lock if currently locked. No-op otherwise. */
  exit: () => void;
}

export const useSurfaceModePointerLock = ({
  target,
  onMouseMove,
  onLockChange,
  onLockError,
}: UseSurfaceModePointerLockOptions): UseSurfaceModePointerLockResult => {
  const [isLocked, setIsLocked] = useState(false);

  // Snapshot the latest mousemove callback in a ref so the listener
  // identity stays stable across renders.
  const onMouseMoveRef = useRef(onMouseMove);
  useEffect(() => {
    onMouseMoveRef.current = onMouseMove;
  }, [onMouseMove]);

  const onLockChangeRef = useRef(onLockChange);
  useEffect(() => {
    onLockChangeRef.current = onLockChange;
  }, [onLockChange]);

  const onLockErrorRef = useRef(onLockError);
  useEffect(() => {
    onLockErrorRef.current = onLockError;
  }, [onLockError]);

  // Key state — ref so consumers can poll inside useFrame without
  // forcing re-renders on every keydown.
  const keysRef = useRef<PointerLockKeys>({
    qPressed: false,
    ePressed: false,
  });

  const request = useCallback(() => {
    const element = target.current;
    if (!element) return;
    // Pointer lock must be in the same document; typeof guard keeps
    // this hook safe to import from server-rendered code paths.
    if (typeof document === "undefined") return;
    if (document.pointerLockElement === element) return; // already locked
    element.requestPointerLock();
  }, [target]);

  const exit = useCallback(() => {
    if (typeof document === "undefined") return;
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const handleLockChange = () => {
      const element = target.current;
      const locked = !!element && document.pointerLockElement === element;
      setIsLocked(locked);
      // Release any stale key state on unlock so a held Q that was
      // released while un-focused doesn't leak into the next lock.
      if (!locked) {
        keysRef.current.qPressed = false;
        keysRef.current.ePressed = false;
      }
      onLockChangeRef.current?.(locked);
    };

    const handleLockError = (event: Event) => {
      onLockErrorRef.current?.(event);
    };

    document.addEventListener("pointerlockchange", handleLockChange);
    document.addEventListener("pointerlockerror", handleLockError);

    return () => {
      document.removeEventListener("pointerlockchange", handleLockChange);
      document.removeEventListener("pointerlockerror", handleLockError);
    };
  }, [target]);

  // mousemove is attached only while locked — zero overhead in the
  // normal (un-locked) state.
  useEffect(() => {
    if (!isLocked) return;

    const handleMouseMove = (event: MouseEvent) => {
      onMouseMoveRef.current(event);
    };

    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isLocked]);

  // Q/E key listeners — attached only while locked so the Game-mode
  // roll binding doesn't intercept the user's normal Q/E presses
  // when they're interacting with the app shell (menus, search,
  // etc.). Scoped to `window` so focus-target changes inside the
  // canvas don't lose events.
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyQ") keysRef.current.qPressed = true;
      else if (event.code === "KeyE") keysRef.current.ePressed = true;
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === "KeyQ") keysRef.current.qPressed = false;
      else if (event.code === "KeyE") keysRef.current.ePressed = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isLocked]);

  return { isLocked, keys: keysRef, request, exit };
};

// HMR hygiene (2026-04-24 white-canvas audit). Vite hot-replacing
// this module could preserve stale closures on `document` listeners
// that attached via React useEffects — the cleanup runs only when
// React unmounts the hook, which doesn't happen if Fast Refresh
// preserves the component identity across the edit. Module-level
// dispose force-exits any active pointer lock on hot update so the
// browser's pointer-lock state matches the code that's about to
// replace it. No-op in prod or when no session had an active lock.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (typeof document !== "undefined" && document.pointerLockElement) {
      document.exitPointerLock();
    }
  });
}
