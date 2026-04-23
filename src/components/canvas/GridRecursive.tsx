import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { VISUAL_PRESETS } from "../../config/visualPresets";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import { buildGridRecShaderMaterial } from "./shaders/gridRecShader";

/**
 * Atlas port of Gaia's `GridRecursive` entity (MPL-2.0) — replaces
 * the atlas-opinion `EclipticGrid.tsx` under
 * `feedback_no_effect_stacking.md`. The shader itself lives in
 * `shaders/gridRecShader.ts` and is a verbatim port of
 * `/tmp/gaiasky/assets/shader/gridrec.fragment.glsl`; this component
 * owns the mesh + placement + scene-level opacity fade.
 *
 * T4.4b ship scope:
 *  - Horizontal quad on the ecliptic plane (y=0) matching
 *    `EclipticGrid.tsx`'s footprint — preserves the "grid fades in
 *    as you zoom out" UX atlas users already have.
 *  - Static `u_tessQuality = 1` + `u_heightScale = 1` + CIRCULAR
 *    style (Gaia default per `config.yaml:384`). T4.4c wires the
 *    camera-distance-driven `getGridScaling` + orientation toggle
 *    (Equatorial / Ecliptic / Galactic) per
 *    `GridRecUpdater.java:80-81` + `GridRecursiveRadio.java:34-44`.
 *  - The AU tick labels `EclipticGrid.tsx` rendered (1/2/5/10/20/
 *    30/40 AU sprite text) are an atlas-opinion feature with no
 *    Gaia equivalent on the grid mesh itself. Removed with the
 *    predecessor sweep; a Gaia-native label path comes back via
 *    T4.5 (MSDF text + constellations).
 *
 * Opacity still follows atlas's camera-distance fade curve so the
 * layer toggle remains useful at close fly-by. Gaia's own opacity
 * curve is driven by `GridRecUpdater.java` through `base.opacity`
 * on the entity; a 1:1 runtime port is T4.4c scope.
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
    materialRef.current.uniforms.u_opacity.value = opacity;
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
