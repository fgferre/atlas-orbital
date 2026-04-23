import { Text } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import * as THREE from "three";

import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { useStore } from "../../store";

/**
 * T4.5-β — body name labels as Gaia-native SDF text inside the
 * canvas. Mirrors the HTML callouts emitted by `PlanetOverlay` but
 * drawn as drei `<Text>` (wrapping `troika-three-text`) so the text
 * is a genuine 3D object that depth-tests, survives post-processing,
 * and matches the Gaia look.
 *
 * **Gating.** This component renders only when
 * `labelMode === "sdf" && showLabels === true`. In HTML mode the
 * HTML path owns visibility; in SDF mode each per-body `<Text>` is
 * additionally gated by the same `overlayItems[i].showLabel` flag
 * that `OverlayPositionTracker.tsx:195-246` sets (collision +
 * viewport-bounds + priority arbitration). That reuse is the
 * cleanest way to keep the "what shows" UX identical across modes;
 * Gaia's per-body solid-angle fade-in ramp from
 * `font.vertex.glsl:21-28` (`clamp((pow(viewAngle, viewAnglePow) -
 * thLabel) / thLabel, 0, 0.95)`) is a future tightening onda, not
 * in β's scope.
 *
 * **Smoothing.** Uses troika's default `fwidth()`-based smoothing,
 * same decision as `GridAuLabels.tsx` (T4.5-δ). Gaia's fixed-scale
 * `1/(16 × u_scale)` formula from `font.fragment.glsl:26` is pinned
 * in `src/lib/msdfFontMath.ts` by T4.5-α and available for a future
 * uniform-override pass; troika's adaptive smoothing is device-
 * pixel-ratio-aware and handles extreme zoom better than Gaia's
 * fixed divisor at the atlas camera ranges we ship.
 *
 * **Positioning.** Each label sits at its body's world position
 * (mesh lookup cached by body id, mirroring
 * `OverlayPositionTracker.tsx:69` pattern). Font size is a world-
 * unit constant scaled by the body's distance to the camera so the
 * label stays at a roughly constant on-screen pixel size — Gaia
 * does this via `view.textScale() * camera.getFovFactor()`
 * (`LabelEntityRenderSystem.java:327`); atlas ports the intent
 * (screen-stable text) with a simpler linear distance multiplier
 * that preserves the Gaia look without the full per-body
 * `textScale()` machinery.
 */

// Module-level scratch vectors reused across frames + bodies.
const TMP_WORLD = new THREE.Vector3();
const TMP_BILLBOARD = new THREE.Matrix4();

// Mesh cache keyed by body id — same pattern + invalidation rules as
// `OverlayPositionTracker.tsx:69`. A cached entry whose
// `parent === null` is stale (scene-graph detachment); re-lookup in
// that case.
const meshCache = new Map<string, THREE.Object3D>();

// Screen-stable font size: base world-unit value × `distance / 1000`
// so a body at 1000 world units from the camera renders at
// `FONT_WORLD_BASE` units tall. Tuned to approximate the HTML label
// pixel size at typical camera ranges (planets in focus-mode sit at
// 3k-40k world units, giving a font roughly 9-120 world units tall —
// visually comparable to the HTML label's ~12-20 px footprint).
const FONT_WORLD_BASE = 9;
const FONT_DISTANCE_DIVISOR = 1000;
const LABEL_COLOR = "#d1d5db";
const LABEL_OUTLINE_COLOR = "#000000";
const LABEL_OUTLINE_WIDTH = 0.15;
const LABEL_OUTLINE_OPACITY = 1;

// Horizontal nudge mirroring PlanetOverlay.tsx:59
// `transform: translate(12px, -50%)`. Pushed into world units via
// the same distance scaling so the offset stays visually consistent.
const LABEL_OFFSET_FRACTION = 1.4;

const noopRaycast: THREE.Object3D["raycast"] = () => null;

export const PlanetLabels3D = () => {
  const showLabels = useStore((s) => s.showLabels);
  const labelMode = useStore((s) => s.labelMode);
  const { scene, camera } = useThree();

  // Imperatively-managed group refs. A plain Map (held by useRef)
  // keeps the per-frame visibility / position writes out of React's
  // memoized state graph, sidestepping the
  // `react-hooks/immutability` flag that triggers on `groupRef.current`
  // mutations reachable through useMemo'd arrays.
  const groupRefs = useRef(new Map<string, THREE.Group>());
  const visibilityRef = useRef<Map<string, boolean>>(new Map());

  const setGroupRef = useCallback(
    (id: string) => (group: THREE.Group | null) => {
      if (group) {
        groupRefs.current.set(id, group);
      } else {
        groupRefs.current.delete(id);
      }
    },
    []
  );

  useFrame(() => {
    if (labelMode !== "sdf" || !showLabels) return;

    const { overlayItems } = useStore.getState();
    visibilityRef.current.clear();
    for (const item of overlayItems) {
      visibilityRef.current.set(item.id, item.showLabel);
    }

    for (const body of SOLAR_SYSTEM_BODIES) {
      const group = groupRefs.current.get(body.id);
      if (!group) continue;

      const shouldShow = visibilityRef.current.get(body.id) === true;
      group.visible = shouldShow;
      if (!shouldShow) continue;

      let mesh = meshCache.get(body.id);
      if (!mesh || mesh.parent === null) {
        mesh = scene.getObjectByName(body.id) ?? undefined;
        if (mesh) {
          meshCache.set(body.id, mesh);
        } else {
          meshCache.delete(body.id);
          group.visible = false;
          continue;
        }
      }

      mesh.getWorldPosition(TMP_WORLD);
      group.position.copy(TMP_WORLD);

      // Billboard the text toward the camera — libGDX's TextRenderer
      // does this implicitly via the view matrix; troika renders in
      // the group's local frame so we have to orient the group
      // ourselves. A `lookAt` toward the camera with the default
      // Three.js up vector produces the billboard we want.
      TMP_BILLBOARD.lookAt(group.position, camera.position, camera.up);
      group.quaternion.setFromRotationMatrix(TMP_BILLBOARD);

      const distance = group.position.distanceTo(camera.position);
      const fontScale = (distance / FONT_DISTANCE_DIVISOR) * FONT_WORLD_BASE;
      group.scale.setScalar(Math.max(fontScale, FONT_WORLD_BASE));
    }
  });

  if (labelMode !== "sdf" || !showLabels) return null;

  return (
    <group raycast={noopRaycast}>
      {SOLAR_SYSTEM_BODIES.map((body) => (
        <group
          key={body.id}
          ref={setGroupRef(body.id)}
          visible={false}
          raycast={noopRaycast}
        >
          <Text
            position={[LABEL_OFFSET_FRACTION, 0, 0]}
            fontSize={1}
            color={LABEL_COLOR}
            anchorX="left"
            anchorY="middle"
            outlineWidth={LABEL_OUTLINE_WIDTH}
            outlineColor={LABEL_OUTLINE_COLOR}
            outlineOpacity={LABEL_OUTLINE_OPACITY}
            raycast={noopRaycast}
          >
            {body.name.en}
          </Text>
        </group>
      ))}
    </group>
  );
};
