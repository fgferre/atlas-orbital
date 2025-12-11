import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useStore } from "../../store";

/**
 * InitialCameraAnimation - Cinematic intro animation
 * Flies camera from deep space (Milky Way view) to solar system overview
 *
 * Uses LOGARITHMIC interpolation for smooth animation across extreme scale differences
 */
export const InitialCameraAnimation = () => {
  const { camera } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;

  const hasPlayed = useStore((s) => s.hasPlayedIntroAnimation);
  const setHasPlayed = useStore((s) => s.setHasPlayedIntroAnimation);
  const isLoaderHidden = useStore((s) => s.isLoaderHidden);
  const setIsIntroAnimating = useStore((s) => s.setIsIntroAnimating);

  // Use REFS for animation state (useFrame has stale closures with React state)
  const animationRef = useRef({
    isRunning: false,
    startTime: 0,
    startPos: new THREE.Vector3(),
    endPos: new THREE.Vector3(),
  });

  // Animation duration in ms
  const DURATION = 12000;

  /**
   * Logarithmic interpolation for smooth animation across orders of magnitude
   */
  const logLerp = (a: number, b: number, t: number): number => {
    if (a <= 0) a = 1;
    if (b <= 0) b = 1;
    const logA = Math.log(a);
    const logB = Math.log(b);
    return Math.exp(logA + (logB - logA) * t);
  };

  /**
   * Smooth easing function - easeInOutCubic
   */
  const easeInOutCubic = (t: number): number => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };

  /**
   * Interpolate camera position using logarithmic distance interpolation
   */
  const interpolatePosition = (
    start: THREE.Vector3,
    end: THREE.Vector3,
    t: number
  ): THREE.Vector3 => {
    const startDist = start.length();
    const endDist = end.length();
    const currentDist = logLerp(startDist, endDist, t);

    const startDir = start.clone().normalize();
    const endDir = end.clone().normalize();
    const currentDir = new THREE.Vector3()
      .lerpVectors(startDir, endDir, t)
      .normalize();

    return currentDir.multiplyScalar(currentDist);
  };

  // Complete animation helper
  const completeAnimation = () => {
    if (!animationRef.current.isRunning) return;

    console.log("🎬 Completing animation");

    // Set exact end position (top-down inner solar system view)
    camera.position.copy(animationRef.current.endPos);

    // Keep camera looking at sun center
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }

    animationRef.current.isRunning = false;
    setHasPlayed(true);
    setIsIntroAnimating(false);
  };

  // Start animation when loader has fully hidden
  useEffect(() => {
    console.log("🔄 useEffect triggered:", {
      isLoaderHidden,
      hasPlayed,
      isRunning: animationRef.current.isRunning,
    });

    if (!isLoaderHidden) {
      console.log("⏳ Waiting for loader to hide...");
      return;
    }

    if (hasPlayed) {
      console.log("✅ Intro already played, skipping");
      return;
    }

    if (animationRef.current.isRunning) {
      console.log("🎬 Animation already running");
      return;
    }

    console.log("🚀 Starting intro animation!");

    // Start positions - captured via debug tool
    const startPos = new THREE.Vector3(-95809369, 999990981402, 4245931557);
    const endPos = new THREE.Vector3(0, 1746, 7);

    // Store in ref
    animationRef.current.startPos.copy(startPos);
    animationRef.current.endPos.copy(endPos);

    // Set camera to start position immediately
    camera.position.copy(startPos);

    // Set target to sun
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }

    // Start animation after a brief delay
    const timer = setTimeout(() => {
      console.log("🎬 Animation timer fired!");
      animationRef.current.startTime = performance.now();
      animationRef.current.isRunning = true;
      setIsIntroAnimating(true);
    }, 100);

    return () => clearTimeout(timer);
  }, [isLoaderHidden, hasPlayed]);

  // Stop on user interaction
  useEffect(() => {
    if (!controls) return;

    const stopIntro = () => {
      if (animationRef.current.isRunning) {
        console.log("🛑 User interrupted animation");
        animationRef.current.isRunning = false;
        setHasPlayed(true);
        setIsIntroAnimating(false);
      }
    };

    controls.addEventListener("start", stopIntro);
    return () => controls.removeEventListener("start", stopIntro);
  }, [controls]);

  // Animation loop - uses REF so it always has current values
  useFrame(() => {
    if (!animationRef.current.isRunning) return;

    const elapsed = performance.now() - animationRef.current.startTime;
    const rawT = Math.min(elapsed / DURATION, 1);
    const t = easeInOutCubic(rawT);

    // Interpolate position logarithmically
    const newPos = interpolatePosition(
      animationRef.current.startPos,
      animationRef.current.endPos,
      t
    );
    camera.position.copy(newPos);

    // Keep looking at sun
    if (controls) {
      controls.target.set(0, 0, 0);
    }

    // Log progress every second
    const currentSecond = Math.floor(elapsed / 1000);
    const prevSecond = Math.floor((elapsed - 16.67) / 1000);
    if (currentSecond !== prevSecond) {
      console.log(
        `🎬 Progress: ${(rawT * 100).toFixed(0)}%, distance: ${camera.position.length().toExponential(2)}`
      );
    }

    // Check completion
    if (rawT >= 1) {
      completeAnimation();
    }
  });

  return null;
};
