import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import { getGridRecScaling } from "./shaders/gridRecScaling";
import { buildGridRecShaderMaterial } from "./shaders/gridRecShader";

/**
 * Atlas port of Gaia's `GridRecursive` entity (MPL-2.0) — replaces
 * the atlas-opinion `EclipticGrid.tsx` under
 * `feedback_no_effect_stacking.md`. The shader itself lives in
 * `shaders/gridRecShader.ts` and is a verbatim port of
 * `/tmp/gaiasky/assets/shader/gridrec.fragment.glsl`; this component
 * owns the mesh + placement + scene-level opacity fade.
 *
 * Ship scope by sub-wave:
 *  - **T4.4b** (shipped `94af1b8`): horizontal quad + shader mount
 *    on the ecliptic plane, CIRCULAR style default, static uniforms.
 *  - **T4.4c** (this file, below): per-frame `getGridRecScaling`
 *    driver pushing camera-distance → `u_tessQuality` +
 *    `u_heightScale`. The grid now actually zooms through decades
 *    as the camera pulls back, matching Gaia's recursive behavior
 *    (`GridRecUpdater.java:80-81`). The level-1 rings swap
 *    smoothly between decades via the `heightScale` fade.
 *  - **T4.4d** (pending): orientation toggle (Equatorial / Ecliptic /
 *    Galactic) per `GridRecursiveRadio.java:34-48` transform-name
 *    swap + per-orientation color callouts.
 *  - **T4.4e** (pending): projection lines when `origin=REFSYS` +
 *    camera focus is active (`GridRecUpdater.java:84-102`).
 *  - The AU tick labels `EclipticGrid.tsx` rendered (1/2/5/10/20/
 *    30/40 AU sprite text) are an atlas-opinion feature with no
 *    Gaia equivalent on the grid mesh itself. Removed with the
 *    T4.4b predecessor sweep; a Gaia-native label path returns
 *    with T4.5 (MSDF text + constellations).
 *
 * Opacity still follows atlas's camera-distance fade curve so the
 * layer toggle remains useful at close fly-by. Gaia's own opacity
 * curve is driven by `GridRecUpdater.java` through `base.opacity`
 * on the entity at line 74 (`flint` on distToCamera); atlas keeps
 * its linear `clamp((dist - 10k)/(140k - 10k), 0, 1)` curve as a
 * UI-affordance layer on top.
 */

const noopRaycast: THREE.Object3D["raycast"] = () => null;

export const GridRecursive = () => {
  const { camera } = useThree();
  const visualPreset = useStore((state) => state.visualPreset);
  const guideIntensity = VISUAL_PRESETS[visualPreset]?.guideIntensity ?? 1;

  const material = useMemo(() => buildGridRecShaderMaterial(), []);
  const materialRef = useRef(material);

  useEffect(() => {
    materialRef.current = material;
    return () => {
      material.dispose();
    };
  }, [material]);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const dist = camera.position.length();

    // T4.4c — Gaia's recursive decade walk. Feeds atlas world
    // units directly into the scale-invariant algorithm; see
    // `gridRecScaling.ts` JSDoc for why no AU conversion is
    // required.
    const scaling = getGridRecScaling(dist);
    const uniforms = materialRef.current.uniforms;
    uniforms.u_tessQuality.value = scaling.tessQuality;
    uniforms.u_heightScale.value = scaling.heightScale;

    // Scene-level opacity fade stays atlas-native (UI affordance
    // on top of the Gaia shader). Mirrors `base.opacity` role in
    // `GridRecUpdater.java:74` but uses atlas's linear curve.
    const t = THREE.MathUtils.clamp(
      (dist - GRID_RECURSIVE_CONFIG.opacityFadeStart) /
        (GRID_RECURSIVE_CONFIG.opacityFadeEnd -
          GRID_RECURSIVE_CONFIG.opacityFadeStart),
      0,
      1
    );
    const opacity =
      THREE.MathUtils.lerp(
        GRID_RECURSIVE_CONFIG.opacityClose,
        GRID_RECURSIVE_CONFIG.opacityFar,
        t
      ) * guideIntensity;
    uniforms.u_opacity.value = opacity;
  });

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={GRID_RECURSIVE_CONFIG.planeYOffset}
      renderOrder={GRID_RECURSIVE_CONFIG.renderOrder}
      raycast={noopRaycast}
    >
      <planeGeometry
        args={[
          GRID_RECURSIVE_CONFIG.worldSize,
          GRID_RECURSIVE_CONFIG.worldSize,
          1,
          1,
        ]}
      />
      <primitive object={material} attach="material" />
    </mesh>
  );
};
