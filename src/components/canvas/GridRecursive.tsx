import { useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { Line2 } from "three-stdlib";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import {
  computeViewExtentWorld,
  resolveGridRingSet,
} from "./shaders/gridRecScaling";

/**
 * The CONCENTRIC AU DISTANCE-RING grid — a Sun-centered polar grid on the
 * ecliptic (XZ) plane (redesign 2026-06-18).
 *
 * **What this replaced.** The square drei `<Grid infiniteGrid
 * followCamera>` floor (and its predecessor recursive ring shader) is
 * gone. The owner reported the square grid "completely broken": it did
 * not relate to the physical solar system in either scale mode, appeared
 * only when zoomed close, and its distance rings did not align with the
 * grid. A square Cartesian floor has no radial meaning, and `followCamera`
 * severed it from the system. This app is HELIOCENTRIC; the meaningful
 * quantity is distance-from-Sun, which concentric rings show directly.
 *
 * **Rings at physical AU radii (the alignment identity).** Each ring is a
 * circle centered at the origin (Sun) drawn at world radius
 * `AstroPhysics.auToWorld(au, scaleMode)`. Because the body positioner
 * places a body at world radius `auToWorld(distanceAU, scaleMode)`, a
 * planet at `D` AU sits EXACTLY on the ring for `D` — in BOTH didactic and
 * realistic modes, by construction (one transform, no second pipeline to
 * drift). This is the whole point of the redesign.
 *
 * **Always visible across zoom (fixes "only appears when close").** Which
 * rings draw is chosen per frame from the on-screen VIEW EXTENT
 * (`computeViewExtentWorld` → `resolveGridRingSet`): a 1-2-5 sequence of
 * AU values spanning a few decades around the in-view decade — finer rings
 * when zoomed in, coarser decade rings when zoomed out. The set is NEVER
 * empty. The rings are WORLD-SPACE and Sun-centered (no `followCamera`),
 * so they stay locked to the system at every zoom.
 *
 * **Standard line materials → free log-depth + occlusion.** Each ring is a
 * drei `<Line>` (three's `Line2` fat line, the same primitive
 * `PlanetOrbitLine` uses), so it participates in the scene's
 * `logarithmicDepthBuffer` automatically and planets/orbits occlude it
 * correctly — no custom-shader log-depth hack. `depthWrite={false}` so the
 * grid never occludes content in front of it.
 *
 * **Style.** Single teal accent on black, minimal/premium. Major rings
 * (round powers of ten + the in-view decade's 1/2/5 leaders) brighter and
 * thicker; minor rings dim and thin. Faint radial spokes give the polar
 * grid its bearing lines. Brightness folds in the preset `guideIntensity`.
 *
 * **Toggle.** On/off is the `showEclipticGrid` mount gate in `Scene.tsx`
 * (`{showEclipticGrid && <GridRecursive />}`). The decade AU label is a
 * sibling component ({@link GridDecadeLabel}) riding the same toggle.
 */

const noopRaycast: THREE.Object3D["raycast"] = () => null;

/** Number of radial spokes (a true polar grid's bearing lines). */
const SPOKE_COUNT = 12;

/** Circle tessellation — segments per ring. 128 reads smooth at any zoom. */
const RING_SEGMENTS = 128;

/**
 * Unit-circle points (radius 1) on the XZ plane, reused for every ring by
 * scaling the `<Line>` object. Allocated once. The loop is closed
 * (last point === first) so the ring has no seam.
 */
const buildUnitCirclePoints = (segments: number): THREE.Vector3[] => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
  }
  return pts;
};

/**
 * Radial spoke endpoints as a single open polyline that returns to the
 * origin between spokes (origin → rim → origin → next rim …), drawn at
 * unit radius and scaled per frame. One `<Line>` draws all spokes.
 */
const buildUnitSpokePoints = (count: number): THREE.Vector3[] => {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    pts.push(new THREE.Vector3(0, 0, 0));
    pts.push(new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)));
  }
  return pts;
};

/**
 * Fixed pool of ring slots. We pre-mount a fixed number of `<Line>`
 * objects and per frame assign each a radius/color/visibility from the
 * selected ring set — no per-frame remount (which would thrash geometry
 * allocation and React reconciliation). The selector emits at most
 * `(DECADES_FINER + DECADES_COARSER + 1) · RING_MANTISSAS.length` rings;
 * the pool is sized comfortably above that.
 */
const RING_POOL_SIZE = 16;

export const GridRecursive = () => {
  const { camera } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const visualPreset = useStore((state) => state.visualPreset);
  const scaleMode = useStore((state) => state.scaleMode);
  const guideIntensity = VISUAL_PRESETS[visualPreset]?.guideIntensity ?? 1;

  const unitCircle = useMemo(() => buildUnitCirclePoints(RING_SEGMENTS), []);
  const unitSpokes = useMemo(() => buildUnitSpokePoints(SPOKE_COUNT), []);

  // Per-slot refs for the ring Line2 objects + their materials, and the
  // spoke group. Imperative per-frame updates (radius / opacity / color)
  // keep the per-frame writes out of React's render path.
  const ringRefs = useRef<(Line2 | null)[]>([]);
  const spokeRef = useRef<Line2 | null>(null);
  const spokeGroupRef = useRef<THREE.Group>(null);

  const baseColor = useMemo(
    () => new THREE.Color(GRID_RECURSIVE_CONFIG.ringColor),
    []
  );

  useFrame(() => {
    const viewExtentWorld = computeViewExtentWorld(
      camera,
      controls?.target ?? null
    );
    const { rings, decadeRadius } = resolveGridRingSet(
      viewExtentWorld,
      scaleMode
    );

    // Drive each pooled ring slot from the selected set. Slots beyond the
    // selected count are hidden (radius set to 0 / invisible).
    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const line = ringRefs.current[i];
      if (!line) continue;
      const ring = rings[i];
      if (!ring) {
        line.visible = false;
        continue;
      }
      line.visible = true;
      line.scale.setScalar(ring.radius);

      const mat = line.material as
        | (THREE.Material & {
            color?: THREE.Color;
            opacity?: number;
            linewidth?: number;
          })
        | undefined;
      if (mat) {
        const tierOpacity = ring.major
          ? GRID_RECURSIVE_CONFIG.majorOpacity
          : GRID_RECURSIVE_CONFIG.minorOpacity;
        mat.opacity = THREE.MathUtils.clamp(tierOpacity * guideIntensity, 0, 1);
        // Major rings are thicker; minor rings thin. The Line2 material's
        // `linewidth` is the fat-line constant-pixel width.
        mat.linewidth = ring.major
          ? GRID_RECURSIVE_CONFIG.majorLineWidth
          : GRID_RECURSIVE_CONFIG.minorLineWidth;
        if (mat.color) {
          // One teal hue for both tiers; the opacity + width tier the rings.
          mat.color.copy(baseColor);
        }
      }
    }

    // Spokes are scaled to the outermost selected ring so they span the
    // whole visible grid. Hidden if there are no rings (degenerate).
    const group = spokeGroupRef.current;
    const outerRadius =
      rings.length > 0 ? rings[rings.length - 1].radius : decadeRadius;
    if (group) {
      group.scale.setScalar(outerRadius);
      group.visible = outerRadius > 0;
    }
    const spoke = spokeRef.current;
    if (spoke) {
      const mat = spoke.material as
        | (THREE.Material & { opacity?: number })
        | undefined;
      if (mat) {
        mat.opacity = THREE.MathUtils.clamp(
          GRID_RECURSIVE_CONFIG.spokeOpacity * guideIntensity,
          0,
          1
        );
      }
    }
  });

  return (
    <group raycast={noopRaycast}>
      {/* Radial spokes — the polar grid's bearing lines, drawn at unit
          radius and scaled per frame to the outermost ring. */}
      <group
        ref={spokeGroupRef}
        position-y={GRID_RECURSIVE_CONFIG.planeYOffset}
        raycast={noopRaycast}
      >
        <Line
          ref={spokeRef}
          points={unitSpokes}
          segments
          color={GRID_RECURSIVE_CONFIG.ringColor}
          lineWidth={GRID_RECURSIVE_CONFIG.minorLineWidth}
          transparent
          opacity={GRID_RECURSIVE_CONFIG.spokeOpacity}
          depthTest
          depthWrite={false}
          toneMapped={false}
          renderOrder={GRID_RECURSIVE_CONFIG.renderOrder}
          raycast={noopRaycast}
        />
      </group>

      {/* Concentric AU rings — one pooled <Line> per slot, unit-circle
          geometry scaled per frame to the ring's world radius. */}
      {Array.from({ length: RING_POOL_SIZE }, (_, i) => (
        <Line
          key={i}
          ref={(instance: Line2 | null) => {
            ringRefs.current[i] = instance;
          }}
          points={unitCircle}
          position-y={GRID_RECURSIVE_CONFIG.planeYOffset}
          color={GRID_RECURSIVE_CONFIG.ringColor}
          lineWidth={GRID_RECURSIVE_CONFIG.majorLineWidth}
          transparent
          opacity={GRID_RECURSIVE_CONFIG.minorOpacity}
          depthTest
          depthWrite={false}
          toneMapped={false}
          renderOrder={GRID_RECURSIVE_CONFIG.renderOrder}
          raycast={noopRaycast}
        />
      ))}
    </group>
  );
};
