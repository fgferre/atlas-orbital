import { forwardRef, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import * as THREE from "three";
import type { Line2, LineSegments2 } from "three-stdlib";

import { parseHygFocusId } from "../../lib/focus/hygFocusResolver";
import { GRID_ORIENTATION_COLORS } from "../../lib/gridOrientation";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import { useGaiaSdfLinePatch } from "./planet/useGaiaSdfLinePatch";

/**
 * T4.4e-β runtime mount for Gaia's recursive-grid projection lines —
 * the L-polyline connecting the grid origin (Sun) to the focused
 * body's XZ projection on the grid plane, then vertically up to the
 * focus itself.
 *
 * **Atlas-world vs Gaia camera-relative**. T4.4e-α shipped a 1:1
 * port of `GridRecUpdater.java:171-200` (`src/lib/gridProjection.ts`)
 * which produces endpoints in Gaia's camera-relative rendering
 * frame. Atlas uses absolute-world rendering — applying α's raw
 * output would place the polyline at `-cam` / `focus − cam` which
 * is not visually meaningful in atlas's frame. This component
 * therefore computes endpoints DIRECTLY in atlas-world:
 *
 *   - `zxA` = grid origin at `(0, planeY, 0)` (≈ Sun)
 *   - `zxB` = focus's XZ projection at `(focus.x, planeY, focus.z)`
 *   - `yB`  = focus's world position (the Line's last point)
 *
 * The three points are rendered as a single continuous `<Line>` so
 * the L-corner joins naturally. This gives the same visual INTENT
 * Gaia's feature carries (show where the focus sits relative to
 * the grid plane) using atlas-native absolute-world math. α's
 * helpers remain pinned for the day atlas adopts camera-relative
 * rendering (T4.1) — at that point β switches to `computeProjection
Segments` + the camera-shift correction.
 *
 * Gating (mirrors `GridRecUpdater.java:84`):
 *   - `showEclipticGrid` (atlas's visibility toggle for the grid)
 *   - `gridProjectionLines` (the T4.4e-β flag, default `true` per
 *     `config.yaml:381`)
 *   - `focusId && focusId !== "sun"` — hiding the lines when no
 *     focus is active or when the Sun IS the focus (self-reference).
 *
 * Visual: SDF-feathered line (`useGaiaSdfLinePatch` — T4.6) colored
 * by the active grid orientation so the projection matches the
 * grid's cc{Eq,Ecl,Gal} palette (Gaia `GridRecursive.java:21-23`).
 */

type LineLike = Line2 | LineSegments2;

const TMP_FOCUS = new THREE.Vector3();

interface GridProjectionLinesInnerProps {
  points: THREE.Vector3[];
  color: readonly [number, number, number, number];
}

// Inner component wraps the drei Line + SDF patch so the outer
// gating component can early-return `null` without triggering the
// drei material-build cost on hidden frames.
const GridProjectionLinesInner = forwardRef<
  Line2,
  GridProjectionLinesInnerProps
>(function GridProjectionLinesInner({ points, color }, ref) {
  const localRef = useRef<LineLike | null>(null);
  useGaiaSdfLinePatch(localRef);

  const lineColor = useMemo(
    () => new THREE.Color(color[0], color[1], color[2]),
    [color]
  );

  return (
    <Line
      ref={(instance: LineLike | null) => {
        localRef.current = instance;
        if (typeof ref === "function") ref(instance as Line2);
        else if (ref) ref.current = instance as Line2;
      }}
      points={points}
      color={lineColor}
      lineWidth={1.2}
      transparent
      opacity={0.55 * color[3]}
      depthTest={true}
      depthWrite={false}
      raycast={() => null}
    />
  );
});

export const GridProjectionLines = () => {
  const { scene } = useThree();
  const showEclipticGrid = useStore((s) => s.showEclipticGrid);
  const gridProjectionLines = useStore((s) => s.gridProjectionLines);
  const gridOrientation = useStore((s) => s.gridOrientation);
  const focusId = useStore((s) => s.focusId);

  // Three scratch points reused across frames; the drei Line
  // rebuilds geometry from the array each render, so we mutate in
  // place and bump a version stamp only when the visibility gate
  // flips (drei handles per-frame attribute updates via buffer
  // attribute `needsUpdate` internally).
  const points = useMemo(
    () => [
      new THREE.Vector3(0, GRID_RECURSIVE_CONFIG.planeYOffset, 0),
      new THREE.Vector3(0, GRID_RECURSIVE_CONFIG.planeYOffset, 0),
      new THREE.Vector3(),
    ],
    []
  );

  const orientationColor = GRID_ORIENTATION_COLORS[gridOrientation];

  // T6.3-ε — exclude HYG focus from the active gate. HYG stars have
  // no per-star scene mesh (the entire catalog is one instanced
  // billboard in `Starfield.tsx`), so `scene.getObjectByName(focusId)`
  // returns null inside useFrame and the projection-line geometry is
  // never updated. Without this gate, the lines stayed mounted with
  // stale points (carried over from the previous curated focus or
  // from origin). Lines are a "where on the ecliptic plane is this
  // focused body" affordance — for a parsec-distance HYG star, that
  // signal is meaningless anyway. (Codex round-2 P3 audit, 2026-05-04.)
  const active =
    showEclipticGrid &&
    gridProjectionLines &&
    focusId &&
    focusId !== "sun" &&
    parseHygFocusId(focusId) === null;

  useFrame(() => {
    if (!active) return;
    const focusObj = scene.getObjectByName(focusId);
    if (!focusObj) return;

    focusObj.getWorldPosition(TMP_FOCUS);

    // Leg 1: sun (grid origin, y=planeOffset) to focus's XZ
    // projection on the plane. `points[0]` stays pinned at origin
    // (re-set each frame to keep the scratch vector honest).
    points[0].set(0, GRID_RECURSIVE_CONFIG.planeYOffset, 0);
    points[1].set(TMP_FOCUS.x, GRID_RECURSIVE_CONFIG.planeYOffset, TMP_FOCUS.z);
    // Leg 2: XZ projection up to focus itself.
    points[2].copy(TMP_FOCUS);
  });

  if (!active) return null;

  return <GridProjectionLinesInner points={points} color={orientationColor} />;
};
