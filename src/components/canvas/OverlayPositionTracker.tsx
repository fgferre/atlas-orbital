import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "../../store";
import { getLabelReservations } from "./labelReservations";
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
  /** Screen-pixel offset of the label from the icon. See LABEL_PLACEMENTS. */
  labelDx: number;
  labelDy: number;
  isSmall: boolean;
  showLabel: boolean;
  showIcon: boolean;
}

/**
 * Label positions to try, in order, relative to the body's icon. First entry
 * is the historical one (to the right, vertically centred) so nothing moves
 * unless it would otherwise have been dropped.
 *
 * Vertical variations only, all on the same side. Mirroring to the left
 * would mean flipping the text anchor, which troika can do but only via a
 * per-frame `.anchorX` + `sync()` and a block-bounds measurement to find the
 * left edge — and HTML and SDF would have to agree on that width. Stacking
 * vertically needs neither: both renderers apply the same pure translate,
 * so the two paths cannot drift from the arbitration or from each other.
 */
const LABEL_PLACEMENTS: ReadonlyArray<readonly [dx: number, dy: number]> = [
  [12, 0],
  [12, -18],
  [12, 18],
  [12, -36],
  [12, 36],
];

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

    // Seed the occupancy set with the AU ring labels the grid published
    // earlier this frame (it runs at useFrame priority 0, this pass at 10).
    // A body label now treats an AU label exactly like another body's label
    // instead of drawing straight through it.
    for (const box of getLabelReservations(state.gl.info.render.frame)) {
      placedLabels.push(box);
    }

    candidates.forEach((c) => {
      // Define Bounding Boxes
      // Icon: ~20x20 centered
      const iconBox = { x: c.x - 10, y: c.y - 10, w: 20, h: 20 };

      // Label: ~80x20 (approximate text size). We could measure text, but
      // approximation is faster and usually sufficient.
      const labelWidth = Math.min(120, Math.max(60, c.name.length * 8)); // Dynamic width based on name
      const boxAt = (dx: number, dy: number): ScreenBox => ({
        x: c.x + dx,
        y: c.y + dy - 10,
        w: labelWidth,
        h: 20,
      });

      const iconFitsBounds = fitsWithinBounds(iconBox, overlayBounds);
      let showIcon = iconFitsBounds;
      let showLabel = iconFitsBounds;
      let labelDx = LABEL_PLACEMENTS[0]![0];
      let labelDy = LABEL_PLACEMENTS[0]![1];
      let labelBox = boxAt(labelDx, labelDy);

      // Focused object skips collision arbitration but still respects reserved UI bounds.
      if (c.id !== focusId && showIcon) {
        // Check Icon Collision (vs other Icons)
        // We only hide icons if they overlap other icons.
        // If the icon is gone, the label goes with it.
        if (intersects(iconBox, placedIcons)) {
          showIcon = false;
          showLabel = false;
        } else {
          // Icon is safe. Try each placement around it before giving up.
          // Previously the label sat only at x+12 and was dropped on the
          // first collision, which is why Venus — whose label lands on the
          // Sun's at system framing — lost its name while Hygiea kept its
          // own out in empty screen space. A learner saw the asteroid and
          // not the planet. Priority cannot fix that: it correctly ranks
          // the Sun above Venus. Somewhere else to put the text can.
          showLabel = false;
          for (const [dx, dy] of LABEL_PLACEMENTS) {
            const box = boxAt(dx, dy);
            if (
              fitsWithinBounds(box, overlayBounds) &&
              !intersects(box, placedLabels) &&
              !intersects(box, placedIcons)
            ) {
              labelDx = dx;
              labelDy = dy;
              labelBox = box;
              showLabel = true;
              break;
            }
          }
        }
      } else if (showLabel) {
        showLabel = fitsWithinBounds(labelBox, overlayBounds);
      }

      // Register occupied space if visible
      if (showIcon) placedIcons.push(iconBox);
      if (showLabel) placedLabels.push(labelBox);

      finalOverlays.push({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        labelDx,
        labelDy,
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
