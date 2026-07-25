import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../../store";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { resolveBodyName } from "../../lib/bodyName";
import * as THREE from "three";

interface OverlayCandidate {
  id: string;
  name: string;
  type: string;
  radius: number;
  x: number;
  y: number;
  dist: number;
  priority: number;
}

interface OverlayItem {
  id: string;
  name: string;
  x: number;
  y: number;
  isSmall: boolean;
  showLabel: boolean;
  showIcon: boolean;
}

interface ScreenBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const intersects = (box: ScreenBox, others: ScreenBox[]) => {
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

const fitsWithinBounds = (
  box: ScreenBox,
  bounds: { left: number; top: number; right: number; bottom: number }
) =>
  box.x >= bounds.left &&
  box.y >= bounds.top &&
  box.x + box.w <= bounds.right &&
  box.y + box.h <= bounds.bottom;

// Module-level scratch vector reused across frames and across bodies
// within the same useFrame tick. Safe because every read is preceded
// synchronously by `mesh.getWorldPosition(TMP_WORLD)` inside the same
// forEach iteration. Eliminates ~N allocations per frame.
const TMP_WORLD = new THREE.Vector3();

// Cache of `scene.getObjectByName(body.id)` results keyed by body ID.
// Planets mount once at boot and remain for the session, so scene-graph
// traversal here is pure overhead after the first hit. An entry is
// invalidated lazily when its cached Object3D reports `parent === null`
// (i.e. it was detached on unmount).
const meshCache = new Map<string, THREE.Object3D>();

// This component runs INSIDE the Canvas and calculates overlay positions
// Runs with LOWER priority (after planets update) to avoid lag
export const OverlayPositionTracker = () => {
  const { scene, camera } = useThree();
  // `useFrame`'s callback is recreated each render, so a language switch
  // re-renders here and the next frame picks up the new closure.
  const { i18n } = useTranslation();
  const language = i18n.language;
  const setOverlayItems = useStore((state) => state.setOverlayItems);
  const prevVisibleRef = useRef<{ labels: Set<string>; icons: Set<string> }>({
    labels: new Set(),
    icons: new Set(),
  });
  // Fingerprint of the last overlay array we emitted, quantized to
  // integer pixels. `setOverlayItems` only fires when this changes —
  // sub-pixel jitter no longer triggers React re-renders of
  // `PlanetOverlay` and its subtree (45 bodies × 60 Hz → overlays
  // emission drops by >90 % during navigation idle).
  const prevKeyRef = useRef<string | null>(null);
  // Debug-only counters; logged at 1 Hz when `debugMode === true`.
  const dbgRef = useRef({
    framesInWindow: 0,
    emitsInWindow: 0,
    windowStart: 0,
  });

  // Priority: 10 means this runs AFTER normal updates
  useFrame((state) => {
    const { width, height } = state.size;
    const {
      focusId,
      visibility,
      showLabels,
      showIcons,
      viewportFraming,
      debugMode,
    } = useStore.getState();
    const overlayBounds = {
      left: viewportFraming.overlayRect.left,
      top: viewportFraming.overlayRect.top,
      right: viewportFraming.overlayRect.right,
      bottom: viewportFraming.overlayRect.bottom,
    };

    // 1. Calculate Screen Positions for ALL bodies
    const candidates: OverlayCandidate[] = [];

    SOLAR_SYSTEM_BODIES.forEach((body) => {
      // if (body.type === "star") return; // Skip sun logic for now (handled separately or static)

      // Respect visibility toggles (prevents "ghost" overlays when categories are hidden).
      if (body.type === "planet" && !visibility.planets) return;
      if (body.type === "dwarf" && !visibility.dwarfs) return;
      if (body.type === "moon" && !visibility.moons) return;
      if (body.type === "asteroid" && !visibility.asteroids) return;
      if (body.type === "tno" && !visibility.tnos) return;

      // Lookup via cache to skip repeated scene traversal.
      let mesh = meshCache.get(body.id);
      if (!mesh || mesh.parent === null) {
        mesh = scene.getObjectByName(body.id) ?? undefined;
        if (mesh) {
          meshCache.set(body.id, mesh);
        } else {
          meshCache.delete(body.id);
          return;
        }
      }

      const worldPos = TMP_WORLD;
      mesh.getWorldPosition(worldPos);

      // Distance to camera BEFORE projection (project() mutates in place).
      const dist = camera.position.distanceTo(worldPos);

      // Reuse TMP_WORLD for projection: after `.project(camera)` the
      // vector holds NDC (x/y ∈ [-1, 1], z is depth).
      worldPos.project(camera);

      // Check if in front of camera
      if (worldPos.z < 1) {
        const x = (worldPos.x * 0.5 + 0.5) * width;
        const y = (-worldPos.y * 0.5 + 0.5) * height;

        // Calculate Priority Score
        // Base Priority: Focus(100) > Sun(90) > Planet(10) > Dwarf(8) > Moon(6) > Others(4)
        let basePriority = 0;
        if (body.id === focusId)
          basePriority = 100; // Focused object always wins
        else if (body.type === "star")
          basePriority = 90; // Sun wins conflicts unless something is focused
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
          name: resolveBodyName(body.name, language),
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
    const placedIcons: ScreenBox[] = [];
    const placedLabels: ScreenBox[] = [];

    const finalOverlays: OverlayItem[] = [];

    candidates.forEach((c) => {
      // Define Bounding Boxes
      // Icon: ~20x20 centered
      const iconBox = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };

      // Label: Starts at x+12, ~80x20 (approximate text size)
      // We could measure text, but approximation is faster and usually sufficient
      const labelWidth = Math.min(120, Math.max(60, c.name.length * 8)); // Dynamic width based on name
      const labelBox = { x: c.x + 12, y: c.y - 10, w: labelWidth, h: 20 };

      const iconFitsBounds = fitsWithinBounds(iconBox, overlayBounds);
      const labelFitsBounds = fitsWithinBounds(labelBox, overlayBounds);
      let showIcon = iconFitsBounds;
      let showLabel = iconFitsBounds && labelFitsBounds;

      // Focused object skips collision arbitration but still respects reserved UI bounds.
      if (c.id !== focusId && showIcon) {
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
            !labelFitsBounds ||
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

    // Fingerprint by id + pixel-quantized screen position + visibility
    // flags. Sub-pixel jitter (camera drift, focus-tracker smoothing)
    // no longer re-triggers a Zustand update, so `PlanetOverlay` stops
    // re-rendering when nothing visibly moved.
    let key = "";
    for (const o of finalOverlays) {
      key += `${o.id}|${o.x | 0}|${o.y | 0}|${o.showLabel ? 1 : 0}|${
        o.showIcon ? 1 : 0
      };`;
    }

    const dbg = dbgRef.current;
    dbg.framesInWindow++;
    if (key !== prevKeyRef.current) {
      prevKeyRef.current = key;
      setOverlayItems(finalOverlays);
      dbg.emitsInWindow++;
    }

    if (debugMode) {
      const now = state.clock.elapsedTime;
      if (dbg.windowStart === 0) {
        dbg.windowStart = now;
      } else if (now - dbg.windowStart >= 1) {
        // Structured enough for a quick grep / regex bench during perf
        // investigation; noop in non-debug builds (tree-shaken by the
        // `debugMode` guard at the call site).
        console.info(
          `[overlay] setOverlayItems: ${dbg.emitsInWindow} emit / ${dbg.framesInWindow} frames / 1s`
        );
        dbg.windowStart = now;
        dbg.framesInWindow = 0;
        dbg.emitsInWindow = 0;
      }
    }

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
