import { useFrame } from "@react-three/fiber";
import { canMarkSceneReady } from "../../lib/sceneReadiness";
import { useStore } from "../../store";
import { useEffect, useRef } from "react";

export const SceneReadyChecker = () => {
  const setSceneReady = useStore((state) => state.setSceneReady);
  const criticalAssetsReady = useStore((state) => state.criticalAssetsReady);
  const frameCount = useRef(0);
  const hasMarkedReady = useRef(false);

  // We wait for a few frames to ensure the GPU is actually pushing pixels
  // and the heavy assets (like textures) are fully uploaded and displayed.
  useFrame(() => {
    if (hasMarkedReady.current) return;
    if (!criticalAssetsReady) return;

    if (!canMarkSceneReady(criticalAssetsReady, frameCount.current)) {
      frameCount.current += 1;
    } else {
      hasMarkedReady.current = true;
      setSceneReady(true);
    }
  });

  useEffect(() => {
    frameCount.current = 0;
    hasMarkedReady.current = false;
    setSceneReady(false);

    return () => setSceneReady(false);
  }, [criticalAssetsReady, setSceneReady]);

  return null;
};
