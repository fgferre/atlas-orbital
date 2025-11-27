import { useFrame } from "@react-three/fiber";
import { useStore } from "../../store";
import { useEffect, useRef } from "react";

export const SceneReadyChecker = () => {
  const setSceneReady = useStore((state) => state.setSceneReady);
  const frameCount = useRef(0);

  // We wait for a few frames to ensure the GPU is actually pushing pixels
  // and the heavy assets (like textures) are fully uploaded and displayed.
  useFrame(() => {
    if (frameCount.current < 2) {
      frameCount.current += 1;
    } else {
      setSceneReady(true);
    }
  });

  // Reset on unmount
  useEffect(() => {
    return () => setSceneReady(false);
  }, [setSceneReady]);

  return null;
};
