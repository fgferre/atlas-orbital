import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import * as THREE from "three";

// This component runs INSIDE the Canvas and calculates overlay positions
// Runs with LOWER priority (after planets update) to avoid lag
export const OverlayPositionTracker = () => {
  const { scene, camera } = useThree();
  const setOverlayItems = useStore((state) => state.setOverlayItems);
  const prevVisibleRef = useRef<{ labels: Set<string>; icons: Set<string> }>({
    labels: new Set(),
    icons: new Set(),
  });

  // Priority: 10 means this runs AFTER normal updates
  useFrame((state) => {
    const { width, height } = state.size;
    const { focusId, visibility, showLabels, showIcons } = useStore.getState();

    // 1. Calculate Screen Positions for ALL bodies
    let candidates: Array<{
      id: string;
      name: string;
      type: string;
      radius: number;
      x: number;
      y: number;
      dist: number;
      priority: number;
    }> = [];

    SOLAR_SYSTEM_BODIES.forEach((body) => {
      // if (body.type === "star") return; // Skip sun logic for now (handled separately or static)

      // Respect visibility toggles (prevents "ghost" overlays when categories are hidden).
      if (body.type === "planet" && !visibility.planets) return;
      if (body.type === "dwarf" && !visibility.dwarfs) return;
      if (body.type === "moon" && !visibility.moons) return;
      if (body.type === "asteroid" && !visibility.asteroids) return;
      if (body.type === "comet" && !visibility.comets) return;
      if (body.type === "tno" && !visibility.tnos) return;

      const mesh = scene.getObjectByName(body.id);
      if (!mesh) return;

      const worldPos = new THREE.Vector3();
      mesh.getWorldPosition(worldPos);

      // Distance to camera
      const dist = camera.position.distanceTo(worldPos);

      // Project to screen
      const pos = worldPos.clone();
      pos.project(camera);

      // Check if in front of camera
      if (pos.z < 1) {
        const x = (pos.x * 0.5 + 0.5) * width;
        const y = (-(pos.y * 0.5) + 0.5) * height;

        // Calculate Priority Score
        // Base Priority: Planet(10) > Dwarf(8) > Moon(6) > Asteroid(4)
        let basePriority = 0;
        if (body.id === focusId)
          basePriority = 100; // Focused object always wins
        else if (body.type === "planet") basePriority = 10;
        else if (body.type === "dwarf") basePriority = 8;
        else if (body.type === "moon") basePriority = 6;
        else basePriority = 4;

        // Hysteresis: keep labels stable when there are close collisions.
        // Previously-visible labels get a small bonus so they don't flicker.
        const stabilityBonus = prevVisibleRef.current.labels.has(body.id)
          ? basePriority * 0.2
          : 0;

        candidates.push({
          id: body.id,
          name: body.name.en,
          type: body.type,
          radius: body.radiusKm,
          x,
          y,
          dist,
          priority: basePriority + stabilityBonus,
        });
      }
    });

    // 2. Sort Candidates
    // Primary: Priority (Desc), Secondary: Distance (Asc - closer is better)
    candidates.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.dist - b.dist;
    });

    // 3. Collision Detection
    const placedIcons: { x: number; y: number; w: number; h: number }[] = [];
    const placedLabels: { x: number; y: number; w: number; h: number }[] = [];

    const finalOverlays: any[] = [];

    // Helper: Check intersection
    const intersects = (
      box: { x: number; y: number; w: number; h: number },
      others: { x: number; y: number; w: number; h: number }[]
    ) => {
      for (const other of others) {
        if (
          box.x < other.x + other.w &&
          box.x + box.w > other.x &&
          box.y < other.y + other.h &&
          box.y + box.h > other.y
        ) {
          return true;
        }
      }
      return false;
    };

    candidates.forEach((c) => {
      // Define Bounding Boxes
      // Icon: ~20x20 centered
      const iconBox = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };

      // Label: Starts at x+12, ~80x20 (approximate text size)
      // We could measure text, but approximation is faster and usually sufficient
      const labelWidth = Math.min(120, Math.max(60, c.name.length * 8)); // Dynamic width based on name
      const labelBox = { x: c.x + 12, y: c.y - 10, w: labelWidth, h: 20 };

      let showIcon = true;
      let showLabel = true;

      // Always show focused object
      if (c.id === focusId) {
        showIcon = true;
        showLabel = true;
      } else {
        // Check Icon Collision (vs other Icons)
        // We only hide icons if they overlap other icons.
        // User said: "hide just labels, then we hide the body itself"
        // So we check labels first? No, if icon is hidden, label must be hidden.

        if (intersects(iconBox, placedIcons)) {
          showIcon = false;
          showLabel = false; // If icon is gone, label is gone
        } else {
          // Icon is safe. Now check Label.
          // Check Label vs other Labels AND other Icons (don't draw text over icons)
          if (
            intersects(labelBox, placedLabels) ||
            intersects(labelBox, placedIcons)
          ) {
            showLabel = false;
          }
        }
      }

      // Register occupied space if visible
      if (showIcon) placedIcons.push(iconBox);
      if (showLabel) placedLabels.push(labelBox);

      finalOverlays.push({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        isSmall: true, // Kept for compatibility, logic moved to flags
        showLabel,
        showIcon,
      });
    });

    setOverlayItems(finalOverlays);

    // Track which overlays were actually visible (resets when global toggles are off).
    const nextLabels = new Set<string>();
    const nextIcons = new Set<string>();
    for (const o of finalOverlays) {
      if (showLabels && o.showLabel) nextLabels.add(o.id);
      if (showIcons && o.showIcon) nextIcons.add(o.id);
    }
    prevVisibleRef.current = { labels: nextLabels, icons: nextIcons };
  }, 10);

  return null;
};
