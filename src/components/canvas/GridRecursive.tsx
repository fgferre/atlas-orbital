import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { VISUAL_PRESETS } from "../../config/visualPresets";
import { AstroPhysics } from "../../lib/astrophysics";
import {
  GRID_ORIENTATION_COLORS,
  getGridOrientationMatrix,
} from "../../lib/gridOrientation";
import { useStore } from "../../store";
import { GRID_RECURSIVE_CONFIG } from "./gridRecursiveConfig";
import { GRIDREC_CIRCLE_LEVEL1_F, GRIDREC_N } from "./shaders/gridRecMath";
import {
  getGridRecAuLockedScaling,
  gridRecBaseRingWorldRadius,
} from "./shaders/gridRecScaling";
import { buildGridRecShaderMaterial } from "./shaders/gridRecShader";

/**
 * World radius the level-1 ring (k=1) lands at when `u_tessQuality
 * = 1`, derived from the plane size + shader ring constants. Locking
 * `u_tessQuality = baseRingRadius / auToWorld(10^decade)` pins that
 * ring to the AU-decade's world radius — the same radius the body
 * positioner draws a body at `10^decade` AU. Constant per build (mesh
 * size + shader constants are fixed).
 */
const GRID_REC_BASE_RING_WORLD_RADIUS = gridRecBaseRingWorldRadius(
  GRID_RECURSIVE_CONFIG.worldSize,
  GRIDREC_CIRCLE_LEVEL1_F,
  GRIDREC_N
);

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
 *  - **T4.4c** (this file, below): per-frame scaling driver pushing
 *    the camera distance → `u_tessQuality` + `u_heightScale`. The
 *    grid zooms through decades as the camera pulls back, matching
 *    Gaia's recursive behavior (`GridRecUpdater.java:80-81`); the
 *    level-1 rings swap smoothly between decades via the
 *    `heightScale` fade.
 *  - **Scale-lock fix** (2026-06-17): the driver now pins the
 *    level-1 ring to the AU-decade world radius the body positioner
 *    uses (`getGridRecAuLockedScaling` + `AstroPhysics.auToWorld` /
 *    `worldToAu`) instead of the original scale-invariant
 *    `getGridRecScaling(camera.position.length())`. The original
 *    walk emitted a camera-relative ratio with no world anchor, so
 *    in didactic mode (where bodies are log-compressed via
 *    `mapDidacticHeliocentricDistance`) the rings drifted free of the
 *    planets under zoom. The grid and bodies now share ONE transform,
 *    so a planet at `10^decade` AU sits on the level-1 ring in both
 *    scale modes by construction. See `getGridRecAuLockedScaling`
 *    JSDoc for the ring-radius derivation and the saturated-cap
 *    handling.
 *  - **T4.4d** (this file, below): orientation toggle (Equatorial /
 *    Ecliptic / Galactic) per `GridRecursiveRadio.java:34-48`
 *    transform-name swap + per-orientation color callouts. Applied
 *    via a `<group>` wrapper whose quaternion comes from
 *    `getGridOrientationMatrix` — identity for ecliptic (atlas's
 *    world frame), `Rz(obliquity)` for equatorial, full ICRS→galactic
 *    composition for galactic. Color swatch pushed into
 *    `u_diffuseColor` whenever orientation flips.
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
  const gridOrientation = useStore((state) => state.gridOrientation);
  const scaleMode = useStore((state) => state.scaleMode);
  const guideIntensity = VISUAL_PRESETS[visualPreset]?.guideIntensity ?? 1;

  const material = useMemo(() => buildGridRecShaderMaterial(), []);
  const materialRef = useRef(material);

  // Recompose the orientation quaternion whenever the user flips
  // the radio. The base mesh keeps its `rotation-x = -π/2` to lay
  // the plane on XZ; this wrapper rotation applies ON TOP of that.
  const orientationQuaternion = useMemo(() => {
    const matrix = getGridOrientationMatrix(gridOrientation);
    return new THREE.Quaternion().setFromRotationMatrix(matrix);
  }, [gridOrientation]);

  useEffect(() => {
    materialRef.current = material;
    return () => {
      material.dispose();
    };
  }, [material]);

  useEffect(() => {
    // Per-orientation color callout matches `ccEq` / `ccEcl` /
    // `ccGal` in `GridRecursive.java:21-23`. Mutating the existing
    // uniform keeps the WebGLProgram bound; rebuilding the
    // material would drop any per-frame state the shader
    // accumulated.
    const [r, g, b, a] = GRID_ORIENTATION_COLORS[gridOrientation];
    material.uniforms.u_diffuseColor.value.set(r, g, b, a);
    // Inner color stays atlas-default (lower-alpha variant of the
    // outer color) so the level-1 fade still reads; if Gaia-parity
    // requires a per-orientation inner color we'd add it here.
    material.uniforms.u_emissiveColor.value.set(r, g, b, a * 0.3);
  }, [material, gridOrientation]);

  useFrame(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;

    const dist = camera.position.length();

    // Scale-lock fix (2026-06-17): pin the grid rings to the AU-decade
    // world radii the BODIES use, instead of the raw-camera-distance
    // scale-invariant walk that floated the rings free of the planets.
    //
    // 1. Convert the camera's world distance into the heliocentric AU
    //    it represents (the SAME space bodies are positioned in), so
    //    the decade is chosen in AU, not raw world units.
    // 2. Lock the level-1 ring to `auToWorld(10^decade)` — the world
    //    radius a body at `10^decade` AU is drawn at — via
    //    `getGridRecAuLockedScaling`. A planet at `10^decade` AU then
    //    sits on that ring in BOTH didactic and realistic modes by
    //    construction (in realistic `auToWorld` is linear `au×1000`,
    //    so this reduces to the trivially-correct linear lock).
    //
    // The old scale-invariant `getGridRecScaling(dist)` could not lock:
    // its `tessQuality` is a camera-relative ratio with no world anchor
    // (see `gridRecScaling.ts` JSDoc). Feeding it an effective-AU would
    // NOT have helped — the fix is to derive `tessQuality` from a fixed
    // AU-decade world radius.
    const effectiveAU = AstroPhysics.worldToAu(dist, scaleMode);
    const scaling = getGridRecAuLockedScaling(
      effectiveAU,
      (au) => AstroPhysics.auToWorld(au, scaleMode),
      GRID_REC_BASE_RING_WORLD_RADIUS
    );
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
    <group quaternion={orientationQuaternion}>
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
    </group>
  );
};
