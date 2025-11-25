import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import * as THREE from "three";

// This component runs INSIDE the Canvas and calculates overlay positions
// Runs with LOWER priority (after planets update) to avoid lag
export const OverlayPositionTracker = () => {
  const { scene, camera } = useThree();
  const scaleMode = useStore((state) => state.scaleMode);
  const setOverlayItems = useStore((state) => state.setOverlayItems);

  // Priority: 10 means this runs AFTER normal updates (priority 0)
  // This ensures planets move first, then overlays update
  useFrame(() => {
    const overlays: Array<{
      id: string;
      name: string;
      x: number;
      y: number;
      isSmall: boolean;
    }> = [];

    SOLAR_SYSTEM_BODIES.forEach((body) => {
      if (body.type === "star") return; // Skip sun

      const mesh = scene.getObjectByName(body.id);
      if (!mesh) return;

      // Get WORLD position (not relative to parent) for correct moon positioning
      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      // Project 3D world position to 2D screen coordinates
      const pos = worldPos.clone();
      pos.project(camera);

      // Check if in front of camera
      if (pos.z < 1) {
        const x = (pos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-(pos.y * 0.5) + 0.5) * window.innerHeight;
        const dist = camera.position.distanceTo(worldPos);

        // Distance threshold based on scale mode
        const threshold = scaleMode === "realistic" ? 50 : 5000;

        overlays.push({
          id: body.id,
          name: body.name.en,
          x,
          y,
          isSmall: dist > threshold,
        });
      }
    });

    setOverlayItems(overlays);
  }, 10); // Priority 10 = runs after planet updates

  return null;
};
