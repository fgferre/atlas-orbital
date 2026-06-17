import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import * as THREE from "three";

import { AU_TO_3D_UNITS, AstroPhysics } from "../../lib/astrophysics";
import { GRID_ORIENTATION_COLORS } from "../../lib/gridOrientation";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";

/**
 * T4.5-δ — AU tick labels around the recursive grid. Brings back
 * the 1 / 2 / 5 / 10 / 20 / 30 / 40 AU callouts the pre-T4.4b
 * `EclipticGrid.tsx` rendered via canvas-textured sprites; the
 * T4.4b predecessor sweep retired them pending a Gaia-native text
 * path. This ship lands that path via drei's `<Text>` (which wraps
 * `troika-three-text`, an SDF-font renderer whose math primitives
 * were pinned in T4.5-α's `src/lib/msdfFontMath.ts`).
 *
 * **Smoothing decision.** T4.5-α captured Gaia's
 * `1/(16 × u_scale)` formula for reference. This ship uses
 * troika's DEFAULT `fwidth(distance)`-based smoothing because:
 *   1. troika's smoothing is already device-pixel-ratio-aware +
 *      adapts to scene zoom automatically (no manual `u_scale`
 *      uniform to drive);
 *   2. Gaia's fixed-scale smoothing would require overriding the
 *      material via `customMaterial` prop — meaningful visual
 *      diff only at extreme zoom levels;
 *   3. Shipping the default first lets us measure visual quality
 *      before committing to a uniform override (T4.5-β dedicated
 *      onda handles the smoothing customization if needed).
 *
 * **Billboarding** (added 2026-05-04 after user reported labels
 * appearing inverted from certain camera angles). Mirrors Gaia's
 * `DecalUtils.drawFont3D` pattern at `DecalUtils.java:184-189`:
 *   .rotate(getBillboardRotation(camera.direction, camera.up))
 *   .rotate(0, 1, 0, 180)
 * Pre-fix the labels sat in their default world orientation (XY
 * plane facing +Z), readable from one camera side and mirrored
 * from the other. Per-frame lookAt + 180° Y flip orients the
 * readable face toward the camera regardless of orbit angle, same
 * as the body name labels in `PlanetLabels3D`.
 *
 * **Scale-mode alignment** (fixed 2026-06-17, opportunity-sweep
 * do-now). Each label sits at the SAME world radius the planet
 * positioner uses for a heliocentric body at that AU distance:
 * `au × AU_TO_3D_UNITS` in `realistic` mode, and
 * `AstroPhysics.mapDidacticHeliocentricDistance(au)` in `didactic`
 * mode (the exact calls `calculateLocalPosition` /
 * heliocentric positioning apply at astrophysics.ts:439-451,623-626).
 * Previously the labels stayed at linear-AU spacing in BOTH modes,
 * so in didactic mode the "1 / 5 / 10 AU" ruler drifted away from
 * where the planets were actually drawn — a learner counting AU
 * rings was silently misled. The ruler now reads true against the
 * compressed positions. (Radii stay exaggerated independently; this
 * fixes only the distance ruler, not sizes — the grid backdrop is a
 * generic world-unit reference, not an AU-tied set of rings.)
 *
 * **Layout** mirrors the old EclipticGrid pattern:
 *   - X-axis labels at `(au × 1000, planeY, tickOffset)` —
 *     nudged off-axis in +Z so the text doesn't overlap the axis
 *     cross-line from the gridrec `circle_rec` shader.
 *   - Z-axis labels at `(tickOffset, planeY, au × 1000)` — same
 *     nudge in +X.
 */

const TICK_AU_VALUES = [1, 2, 5, 10, 20, 30, 40] as const;
// Off-axis nudge so labels don't sit on the grid's center cross
// lines (gridrec.fragment.glsl:66-68 renders a cross at the
// plane's tc=0 axes — the labels offset in the orthogonal
// direction to stay readable).
const LABEL_OFFSET_WORLD_UNITS = 250;
const LABEL_FONT_SIZE = 180; // world units; tune for camera range.
const LABEL_OUTLINE_WIDTH = 6;

const noopRaycast: THREE.Object3D["raycast"] = () => null;

// Module-level scratch reused across frames + label groups.
const TMP_BILLBOARD = new THREE.Matrix4();

// Composite key — `${au}-${axis}` where axis ∈ {"x", "z"} — uniquely
// identifies each of the 14 label groups (7 AU values × 2 axes).
type LabelKey = string;

export const GridAuLabels = () => {
  const showEclipticGrid = useStore((s) => s.showEclipticGrid);
  const showLabels = useStore((s) => s.showLabels);
  const gridOrientation = useStore((s) => s.gridOrientation);
  const scaleMode = useStore((s) => s.scaleMode);
  const { camera } = useThree();

  const labelColor = useMemo(() => {
    const [r, g, b] = GRID_ORIENTATION_COLORS[gridOrientation];
    return new THREE.Color(r, g, b);
  }, [gridOrientation]);

  const groupRefs = useRef(new Map<LabelKey, THREE.Group>());
  const setGroupRef = useCallback(
    (key: LabelKey) => (group: THREE.Group | null) => {
      if (group) {
        groupRefs.current.set(key, group);
      } else {
        groupRefs.current.delete(key);
      }
    },
    []
  );

  // Per-frame billboard. Labels sit at fixed world positions; only
  // their orientation tracks the camera. Cheap (14 groups × matrix
  // setup + quaternion write).
  useFrame(() => {
    if (!showEclipticGrid || !showLabels) return;
    for (const group of groupRefs.current.values()) {
      TMP_BILLBOARD.lookAt(group.position, camera.position, camera.up);
      group.quaternion.setFromRotationMatrix(TMP_BILLBOARD);
      group.rotateY(Math.PI);
    }
  });

  if (!showEclipticGrid || !showLabels) return null;

  const planeY = GRID_RECURSIVE_CONFIG.planeYOffset;

  return (
    <group raycast={noopRaycast}>
      {TICK_AU_VALUES.map((au) => {
        // Match the planet positioner so the ruler reads true in both
        // scale modes (didactic compresses heliocentric distance; see
        // the Scale-mode alignment note above).
        const worldRadius =
          scaleMode === "didactic"
            ? AstroPhysics.mapDidacticHeliocentricDistance(au)
            : au * AU_TO_3D_UNITS;
        const text = `${au} AU`;
        return (
          <group key={au}>
            {/* +X axis tick — positioned in +Z so the label doesn't
                overlap the grid's center cross. Outer group owns the
                world position + per-frame billboard; inner Text sits
                at local origin. */}
            <group
              ref={setGroupRef(`${au}-x`)}
              position={[worldRadius, planeY, LABEL_OFFSET_WORLD_UNITS]}
            >
              <Text
                fontSize={LABEL_FONT_SIZE}
                color={labelColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={LABEL_OUTLINE_WIDTH}
                outlineColor="#000000"
                outlineOpacity={0.7}
                raycast={noopRaycast}
              >
                {text}
              </Text>
            </group>
            {/* +Z axis tick — positioned in +X. */}
            <group
              ref={setGroupRef(`${au}-z`)}
              position={[LABEL_OFFSET_WORLD_UNITS, planeY, worldRadius]}
            >
              <Text
                fontSize={LABEL_FONT_SIZE}
                color={labelColor}
                anchorX="center"
                anchorY="middle"
                outlineWidth={LABEL_OUTLINE_WIDTH}
                outlineColor="#000000"
                outlineOpacity={0.7}
                raycast={noopRaycast}
              >
                {text}
              </Text>
            </group>
          </group>
        );
      })}
    </group>
  );
};
