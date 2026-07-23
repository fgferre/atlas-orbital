import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { PrivilegedPosition } from "../../lib/camera";
import { shouldSnapRunningIntro } from "../../lib/camera/reducedMotionCamera";
import { simulationClock } from "../../lib/simulationClock";
import { useStore } from "../../store";

const INTRO_DURATION_MS = 12000;
const INTRO_START_POSITION = new THREE.Vector3(
  -95809369,
  999990981402,
  4245931557
);
const INTRO_END_DIRECTION = new THREE.Vector3(0, 1746, 7).normalize();
const INTRO_TARGET = new THREE.Vector3(0, 0, 0);
const INTRO_DELAY_MS = 100;
const FALLBACK_INTRO_END_DISTANCE = 1746;

/**
 * InitialCameraAnimation - Cinematic intro animation
 * Flies camera from deep space (Milky Way view) to solar system overview
 *
 * Uses LOGARITHMIC interpolation for smooth animation across extreme scale differences
 */
export const InitialCameraAnimation = () => {
  const { camera, size } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;

  const hasPlayed = useStore((s) => s.hasPlayedIntroAnimation);
  const setHasPlayed = useStore((s) => s.setHasPlayedIntroAnimation);
  const isLoaderHidden = useStore((s) => s.isLoaderHidden);
  const setIsIntroAnimating = useStore((s) => s.setIsIntroAnimating);
  const scaleMode = useStore((s) => s.scaleMode);
  const viewportFraming = useStore((s) => s.viewportFraming);
  // a11y N-4 — reduced motion governs the intro. Reactive read at
  // component level (never inside `useFrame`); consumed by the
  // arming effect below. Policy: `lib/camera/reducedMotionCamera.ts`.
  const reducedMotion = useStore((s) => s.accessibility.reducedMotion);

  const cameraRef = useRef(camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(controls);
  const animationRef = useRef({
    isRunning: false,
    startTime: 0,
    startPos: INTRO_START_POSITION.clone(),
    endPos: INTRO_END_DIRECTION.clone().multiplyScalar(
      FALLBACK_INTRO_END_DISTANCE
    ),
  });

  useEffect(() => {
    cameraRef.current = camera;
    controlsRef.current = controls;
  }, [camera, controls]);

  const logLerp = useCallback((a: number, b: number, t: number): number => {
    const start = a <= 0 ? 1 : a;
    const end = b <= 0 ? 1 : b;
    const logA = Math.log(start);
    const logB = Math.log(end);
    return Math.exp(logA + (logB - logA) * t);
  }, []);

  const easeInOutCubic = useCallback((t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }, []);

  const interpolatePosition = useCallback(
    (start: THREE.Vector3, end: THREE.Vector3, t: number): THREE.Vector3 => {
      const startDist = start.length();
      const endDist = end.length();
      const currentDist = logLerp(startDist, endDist, t);

      const startDir = start.clone().normalize();
      const endDir = end.clone().normalize();
      const currentDir = new THREE.Vector3()
        .lerpVectors(startDir, endDir, t)
        .normalize();

      return currentDir.multiplyScalar(currentDist);
    },
    [logLerp]
  );

  const resolveIntroEndPosition = useCallback(() => {
    const perspectiveCamera = cameraRef.current as THREE.PerspectiveCamera;
    const sunBody = BODIES_BY_ID.get("sun") ?? null;

    if (!(perspectiveCamera instanceof THREE.PerspectiveCamera) || !sunBody) {
      return INTRO_END_DIRECTION.clone().multiplyScalar(
        FALLBACK_INTRO_END_DISTANCE
      );
    }

    const focusExtent = AstroPhysics.resolveFocusExtent({
      body: sunBody,
      bodies: SOLAR_SYSTEM_BODIES,
      date: simulationClock.getNow(),
      scaleMode,
    });
    const idealDistance = PrivilegedPosition.calculateViewportAwareDistance(
      focusExtent,
      perspectiveCamera,
      size.width,
      size.height,
      viewportFraming.usableRect,
      1.15
    );

    return PrivilegedPosition.applyViewportComposition({
      targetPos: INTRO_TARGET,
      cameraPos: INTRO_END_DIRECTION.clone().multiplyScalar(idealDistance),
      camera: perspectiveCamera,
      viewportWidth: size.width,
      viewportHeight: size.height,
      compositionOffsetXPx: viewportFraming.compositionOffsetXPx,
      compositionOffsetYPx: viewportFraming.compositionOffsetYPx,
      targetUpVector: perspectiveCamera.up,
    });
  }, [
    scaleMode,
    size.height,
    size.width,
    viewportFraming.compositionOffsetXPx,
    viewportFraming.compositionOffsetYPx,
    viewportFraming.usableRect,
  ]);

  const syncControlsToSun = useCallback(() => {
    const controlsInstance = controlsRef.current;
    if (!controlsInstance) return;

    controlsInstance.target.copy(INTRO_TARGET);
    controlsInstance.update();
  }, []);

  const completeAnimation = useCallback(() => {
    if (!animationRef.current.isRunning) return;

    cameraRef.current.position.copy(animationRef.current.endPos);
    syncControlsToSun();

    animationRef.current.isRunning = false;
    setHasPlayed(true);
    setIsIntroAnimating(false);

    if (useStore.getState().showTutorial) {
      useStore.getState().selectId("sun");
    }
  }, [setHasPlayed, setIsIntroAnimating, syncControlsToSun]);

  useEffect(() => {
    if (!isLoaderHidden || hasPlayed || animationRef.current.isRunning) {
      return;
    }

    animationRef.current.startPos.copy(INTRO_START_POSITION);
    animationRef.current.endPos.copy(resolveIntroEndPosition());

    // a11y N-4 — reduced motion: no 12 s deep-space sweep. The end
    // pose is the only essential outcome (WCAG 2.3.3), so apply it
    // and finish in the same tick. Crucially we never write
    // `INTRO_START_POSITION` onto the camera, so the 1e12-world-unit
    // pose (and the `isIntroAnimating` suppression gate it needs)
    // never happens at all. `isRunning` is flipped first because
    // `completeAnimation` guards on it.
    if (reducedMotion) {
      animationRef.current.isRunning = true;
      completeAnimation();
      return;
    }

    // **Intro race-window fix** (2026-04-24 Codex white-canvas audit).
    // Previously this block ran in the order:
    //   1. `camera.position.copy(INTRO_START_POSITION)` → camera at ~1e12
    //   2. `setTimeout(INTRO_DELAY_MS)` → after 100 ms:
    //   3. `setIsIntroAnimating(true)`
    //
    // During the ~100 ms gap between (1) and (3) the camera was at
    // ~1e12 world units while the `isIntroAnimating` gate that
    // distance-sensitive components (SunBillboard, PlanetLabels3D
    // SDF mode) use to SUPPRESS themselves was still false. Those
    // components therefore computed vertex scales on the order of
    // ~1e10 and uploaded them to the GPU, triggering
    // ANGLE/D3D11 rasterization stalls that Chrome's GPU watchdog
    // resolved by killing the WebGL context → the white-canvas +
    // 7-second rAF signature in the bug report.
    //
    // Fix: flip `setIsIntroAnimating(true)` BEFORE touching the
    // camera so consumers see the gate as soon as the position
    // changes. The setTimeout stays for the physics-runway warm-up
    // it was ostensibly buying (deferring the first interpolation
    // to after the first paint), but the gate is now set in the
    // same synchronous block as the position write.
    setIsIntroAnimating(true);
    cameraRef.current.position.copy(INTRO_START_POSITION);
    syncControlsToSun();

    const timer = window.setTimeout(() => {
      animationRef.current.startTime = performance.now();
      animationRef.current.isRunning = true;
    }, INTRO_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    completeAnimation,
    hasPlayed,
    isLoaderHidden,
    reducedMotion,
    resolveIntroEndPosition,
    setIsIntroAnimating,
    syncControlsToSun,
  ]);

  // a11y N-4 — reduced motion flipped ON *during* the sweep. The
  // arming effect above only applies the snap policy when it decides
  // to START the intro; once `isRunning` is true its early `return`
  // fires before the `reducedMotion` branch, so a mid-flight
  // preference change would otherwise let the 12 s vestibular sweep
  // play out. Mirror the `stopIntro` listener below: when the policy
  // says a running sweep must be cut, jump to the end pose via the
  // shared completion path (which applies `endPos` and clears
  // `isIntroAnimating`). Guarded by `shouldSnapRunningIntro` so an
  // idle intro is a no-op and there is no re-entrant loop
  // (`completeAnimation` clears `isRunning` first).
  useEffect(() => {
    if (shouldSnapRunningIntro(reducedMotion, animationRef.current.isRunning)) {
      completeAnimation();
    }
  }, [completeAnimation, reducedMotion]);

  useEffect(() => {
    if (!controls) return;

    const stopIntro = () => {
      if (!animationRef.current.isRunning) return;

      animationRef.current.isRunning = false;
      setHasPlayed(true);
      setIsIntroAnimating(false);
    };

    controls.addEventListener("start", stopIntro);
    return () => {
      controls.removeEventListener("start", stopIntro);
    };
  }, [controls, setHasPlayed, setIsIntroAnimating]);

  // Defensive try/catch per the session-wide useFrame pattern (see
  // lessons.md L26 + the CameraController / SurfaceModeFirstPerson
  // wrappers). A throw here — e.g., `logLerp` hitting a 0/negative
  // distance that slips the guard at `:58-59`, NaN from float
  // precision in the 1e12 → 1e3 scale transit — would kill the R3F
  // frame loop during the exact intro phase the user is most
  // exposed to. Flagged by the 2026-04-24 audit as the only
  // session-era useFrame missing the wrapper.
  useFrame(() => {
    if (!animationRef.current.isRunning) return;

    try {
      const elapsed = performance.now() - animationRef.current.startTime;
      const rawT = Math.min(elapsed / INTRO_DURATION_MS, 1);
      const t = easeInOutCubic(rawT);

      const newPos = interpolatePosition(
        animationRef.current.startPos,
        animationRef.current.endPos,
        t
      );
      cameraRef.current.position.copy(newPos);

      const controlsInstance = controlsRef.current;
      if (controlsInstance) {
        controlsInstance.target.copy(INTRO_TARGET);
      }

      if (rawT >= 1) {
        completeAnimation();
      }
    } catch (err) {
      console.error(
        "[InitialCameraAnimation] useFrame error — aborting intro:",
        err
      );
      // `completeAnimation` clears `isRunning` itself — clearing it
      // here first made the call a no-op, so the abort path left
      // `isIntroAnimating` stuck at `true` (suppression gates on,
      // camera parked mid-sweep). Let the completion path run.
      completeAnimation();
    }
  });

  return null;
};
