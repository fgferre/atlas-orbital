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

// **Vertex-range cap** (2026-04-24 Codex white-canvas audit).
// During the intro camera animation the camera starts at ~1e12
// world units, which makes `distance / FONT_DISTANCE_DIVISOR ×
// FONT_WORLD_BASE` balloon to ~9e9 world units per label — the
// same class of coordinate that drove `SunBillboard`'s
// documented context-loss blow-up before `a9fc1bf` capped it at
// 1e6. Using the identical cap here keeps the two billboard-like
// pipelines symmetric: any vertex uploaded to ANGLE stays below
// the float32 / D3D11 rasterization threshold that was causing
// GPU command-queue stalls → `webglcontextlost`. Active only when
// `labelMode === "sdf"` (the HTML path does not route through
// this code); SDF mode is opt-in via the Layers panel so users on
// the default HTML path never hit the code path either way, but
// the cap is the defense-in-depth if they do.
const LABEL_SCALE_MAX_WORLD_UNITS = 1e6;

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

  // Defensive try/catch (added 2026-04-23): a throw here would kill
  // R3F's frame loop and hang the loader at 96 %. Worst case is that
  // SDF labels stop tracking for a frame; the next frame retries.
  useFrame(() => {
    try {
      if (labelMode !== "sdf" || !showLabels) return;

      // Suppress labels while the intro camera animation is running.
      // Intro starts the camera at ~1e12 world units; labels scaled
      // proportionally would upload vertices at ~1e10 scale, which
      // the 2026-04-24 post-mortem traced to GPU command-queue stalls
      // → `webglcontextlost`. Mirrors `SunBillboard.tsx`'s intro gate
      // (commit `a9fc1bf`). Skipping the frame while intro runs costs
      // nothing visually — intro hides the solar system anyway.
      if (useStore.getState().isIntroAnimating) return;

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

        // Billboard the text toward the camera — mirrors Gaia's
        // `DecalUtils.drawFont3D` pattern at `DecalUtils.java:184-189`:
        //   .rotate(getBillboardRotation(camera.direction, camera.up))
        //   .rotate(0, 1, 0, 180)
        // The `lookAt(group.position, camera.position, camera.up)`
        // orients the group's local `-Z` toward the camera (Three.js
        // camera convention). But `troika-three-text` renders its
        // readable face on `+Z`, so without the 180° flip the back
        // face would show (mirrored text). Applying `rotateY(π)` after
        // the lookAt mirrors Gaia's `.rotate(0, 1, 0, 180)` byte-for-
        // byte and brings the readable face toward the camera.
        TMP_BILLBOARD.lookAt(group.position, camera.position, camera.up);
        group.quaternion.setFromRotationMatrix(TMP_BILLBOARD);
        group.rotateY(Math.PI);

        const distance = group.position.distanceTo(camera.position);
        const rawFontScale =
          (distance / FONT_DISTANCE_DIVISOR) * FONT_WORLD_BASE;
        // Clamp to `[FONT_WORLD_BASE, LABEL_SCALE_MAX_WORLD_UNITS]`.
        // Lower bound keeps labels readable at near distances; upper
        // bound prevents GPU rasterization stalls at extreme camera
        // positions (see the `LABEL_SCALE_MAX_WORLD_UNITS` header).
        const clampedFontScale = Math.min(
          Math.max(rawFontScale, FONT_WORLD_BASE),
          LABEL_SCALE_MAX_WORLD_UNITS
        );
        group.scale.setScalar(clampedFontScale);
      }
    } catch (err) {
      console.error("[PlanetLabels3D] frame error:", err);
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
