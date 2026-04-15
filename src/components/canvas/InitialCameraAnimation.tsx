import { useCallback, useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { PrivilegedPosition } from "../../lib/camera";
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
    const sunBody =
      SOLAR_SYSTEM_BODIES.find((body) => body.id === "sun") ?? null;

    if (!(perspectiveCamera instanceof THREE.PerspectiveCamera) || !sunBody) {
      return INTRO_END_DIRECTION.clone().multiplyScalar(
        FALLBACK_INTRO_END_DISTANCE
      );
    }

    const focusExtent = AstroPhysics.resolveFocusExtent({
      body: sunBody,
      bodies: SOLAR_SYSTEM_BODIES,
      date: useStore.getState().datetime,
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
    viewportFraming.usableRect.height,
    viewportFraming.usableRect.width,
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

    cameraRef.current.position.copy(INTRO_START_POSITION);
    syncControlsToSun();

    const timer = window.setTimeout(() => {
      animationRef.current.startTime = performance.now();
      animationRef.current.isRunning = true;
      setIsIntroAnimating(true);
    }, INTRO_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [
    hasPlayed,
    isLoaderHidden,
    resolveIntroEndPosition,
    setIsIntroAnimating,
    syncControlsToSun,
  ]);

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

  useFrame(() => {
    if (!animationRef.current.isRunning) return;

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
  });

  return null;
};
