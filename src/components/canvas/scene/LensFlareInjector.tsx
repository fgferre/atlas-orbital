import { useEffect, useMemo, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

import { useStore } from "../../../store";
import { PseudoLensFlareEffect } from "./effects/PseudoLensFlareEffect";

/**
 * Gaia Sky θ.4 post-process driver — mounts + drives
 * `PseudoLensFlareEffect` (which encapsulates the merged
 * pseudo-lens + lensdirt + starburst pipeline) as a direct child of
 * `<EffectComposer>`.
 *
 * Per-frame responsibilities:
 *   - Read camera forward direction via `camera.getWorldDirection`.
 *   - Compute `starburstOffset = direction.x + direction.y + direction.z`
 *     (1:1 with Gaia `MainPostProcessor.java:911`). The summed
 *     scalar is in approximately `[-sqrt(3), +sqrt(3)]`; as the
 *     camera rotates the starburst spike pattern rotates with it.
 *   - Push the offset into the effect uniform.
 *
 * Reduced-motion gate (§4.2 secondary-animation rule): we freeze the
 * starburst offset at 0 so the spike pattern stops drifting. The
 * static lens flare (ghosts + halo + dirt) continues to render —
 * only the animated rotation is suppressed.
 */

const REDUCED_MOTION_FALLBACK_OFFSET = 0.0;

export function LensFlareSlot(): JSX.Element {
  const reducedMotion = useStore((state) => state.accessibility.reducedMotion);
  const camera = useThree((state) => state.camera);

  const effect = useMemo(() => new PseudoLensFlareEffect(), []);

  const directionBuffer = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    if (reducedMotion) {
      effect.setStarburstOffset(REDUCED_MOTION_FALLBACK_OFFSET);
      return;
    }
    camera.getWorldDirection(directionBuffer);
    const offset = directionBuffer.x + directionBuffer.y + directionBuffer.z;
    effect.setStarburstOffset(offset);
  });

  useEffect(() => {
    return () => {
      effect.dispose();
    };
  }, [effect]);

  return <primitive object={effect} dispose={null} />;
}
