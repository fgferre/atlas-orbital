/**
 * T6.3-β — HygStellarMesh: integrating component for the T6 wave.
 *
 * When the user focuses a HYG star (`focusId === "hyg:K"`), this
 * component:
 *
 *   1. Resolves the star's world position via T6.0's
 *      `resolveHygWorldPosition`.
 *   2. Computes per-frame solid angle via T6.3-α's
 *      `computeStellarSolidAngle(starRadius, distToCamera)`.
 *   3. Runs the hysteresis gate `shouldStellarMeshBeActive` to
 *      decide whether to mount a procedural mesh.
 *   4. When active: mounts `<ProceduralSun3D>` (T6.1) at the star's
 *      world position with a class-tuned visual profile from T6.2's
 *      `stellarVisualProfileFrom`, and writes
 *      `Starfield.a_skipMask[K] = 1` to suppress the sprite (T6.0).
 *   5. When inactive: unmounts the mesh and clears
 *      `Starfield.a_skipMask[K] = 0`.
 *
 * **Single-mesh invariant**: only ONE `<HygStellarMesh>` instance
 * mounted in the scene tree (Scene.tsx mounts it exactly once).
 * Whichever HYG star is currently focused-and-large-enough gets the
 * mesh; others stay sprites. Mirrors Gaia's "render proximity star
 * model" pattern at `ModelEntityRenderSystem.java:429-443` (only
 * `proximity.updating[0]` gets the model render path).
 *
 * **Lifecycle**:
 *   - On focus change to a HYG star → recompute `starData` (position
 *     + visualProfile + radius) from the catalog. While the star is
 *     focused, run the per-frame gate.
 *   - On focus change away from any HYG star → mesh inactive,
 *     skipMask cleared, the unmount cleanup runs.
 *   - On unmount → cleanup clears the skipMask of any active star.
 *
 * **Catalog dependency**: subscribes to the same tier-bound catalog
 * Starfield uses via `useStarfieldCatalog`. Until the catalog
 * resolves, `starData` is null and the mesh stays inactive (the
 * focus-change useEffect will re-evaluate when catalog arrives).
 *
 * **Skip-mask access pattern**: scans the scene for a mesh named
 * `"atlas-starfield"` (T6.3-β added the name attribute to
 * `Starfield.tsx`'s `<mesh>` JSX). Reads
 * `geometry.getAttribute("a_skipMask")` (T6.0 attribute) and
 * mutates the underlying Float32Array, then sets
 * `attribute.needsUpdate = true` to trigger GPU re-upload. Cleanup
 * resets to 0 unconditionally so a re-focus on the same star
 * re-spawns cleanly.
 *
 * **Quality profile**: passes the active `qualityProfileName` from
 * the store directly into ProceduralSun3D — for T6.3-β-MVP, the
 * focused HYG star uses the same FX profile as the Sun. T6.4 will
 * add per-class tuning (LOD per stellar class).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useQualityProfile } from "../../hooks/useQualityProfile";
import {
  parseHygFocusId,
  resolveHygWorldPosition,
} from "../../lib/focus/hygFocusResolver";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
} from "../../lib/starfield";
import {
  SUN_RADIUS_WORLD_UNITS,
  computeStellarSolidAngle,
  shouldStellarMeshBeActive,
} from "../../lib/stellarMeshGate";
import {
  radiusFromSpect,
  stellarVisualProfileFrom,
} from "../../lib/stellarPhysics";
import {
  SUN_DEFAULT_VISUAL_PROFILE,
  type StellarVisualProfile,
} from "../../lib/stellarVisualProfile";
import { useStore } from "../../store";
import type { HygCatalogData } from "../../utils/hygBinary";
import { ProceduralSun3D } from "./ProceduralSun3D";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

interface HygStarData {
  /** World-space position (parsec × DISTANCE_SCALE × R_x(obliquity)). */
  worldPos: THREE.Vector3;
  /** Visual profile from T6.2's `stellarVisualProfileFrom`. */
  visualProfile: StellarVisualProfile;
  /**
   * Star physical radius in atlas world units (= solar radii ×
   * SUN_RADIUS_WORLD_UNITS). Used by both the gate (solid-angle
   * computation) and the ProceduralSun3D mount (sphereScale).
   */
  radiusWorldUnits: number;
}

/**
 * Locate the Starfield mesh's `a_skipMask` instanced attribute.
 * Returns null if the Starfield hasn't mounted yet (first frames
 * post-boot before the catalog resolves) or if the named mesh
 * isn't found (defensive — name attribute could regress).
 */
function findStarfieldSkipMask(
  scene: THREE.Scene
): THREE.InstancedBufferAttribute | null {
  const mesh = scene.getObjectByName("atlas-starfield");
  if (!mesh) return null;
  const obj3d = mesh as THREE.Object3D & { geometry?: THREE.BufferGeometry };
  const attr = obj3d.geometry?.getAttribute("a_skipMask");
  if (!attr) return null;
  // Narrow to InstancedBufferAttribute; the attribute is registered as
  // such by Starfield.tsx but the typed-getter returns the base class.
  return attr as THREE.InstancedBufferAttribute;
}

/**
 * Mutate the skipMask attribute for a given star index. Sets the
 * slot value and bumps `needsUpdate` so the next frame re-uploads
 * to the GPU.
 */
function writeSkipMask(
  scene: THREE.Scene,
  starIndex: number,
  value: 0 | 1
): void {
  const attr = findStarfieldSkipMask(scene);
  if (!attr) return;
  if (starIndex < 0 || starIndex >= attr.count) return;
  const arr = attr.array as Float32Array;
  if (arr[starIndex] === value) return; // no-op if already at desired value
  arr[starIndex] = value;
  attr.needsUpdate = true;
}

export const HygStellarMesh = () => {
  const focusId = useStore((s) => s.focusId);
  const qualityMode = useStore((s) => s.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  // Subscribe to the same tier-bound catalog Starfield + StarHoverPicker
  // use. Going through `useStarfieldCatalog` means we re-evaluate when
  // either source resolves, no manual race handling.
  const loadCatalogForTier = useCallback(() => loadHygCatalog(tier), [tier]);
  const getCachedCatalogForTier = useCallback(
    () => getCachedHygCatalog(tier),
    [tier]
  );
  const catalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadCatalogForTier,
    getCachedCatalog: getCachedCatalogForTier,
  });

  // Parse focus → starIndex (or null).
  const starIndex = parseHygFocusId(focusId);

  // Compute static per-star data when focus + catalog align. Recomputes
  // when starIndex changes (focus to a different HYG star) OR when
  // catalog flips (tier change, first-load resolution).
  const starData = useMemo<HygStarData | null>(() => {
    if (starIndex === null || !catalog) return null;
    if (starIndex < 0 || starIndex >= catalog.header.count) return null;

    const worldPos = resolveHygWorldPosition(starIndex, catalog);
    if (!worldPos) return null;

    const bv = catalog.colorIndices[starIndex];
    // T6.2-β: spect path. v2 catalogs populate spectIndices/spectStrings;
    // v1 catalogs default-fill so spectIdx=0 ("" sentinel) → falls back
    // to B-V via stellarVisualProfileFrom.
    const spectIdx = catalog.spectIndices[starIndex] ?? 0;
    const spectRaw = catalog.spectStrings[spectIdx] ?? "";
    const spect = spectRaw.length > 0 ? spectRaw : null;
    const absmagRaw = catalog.absmag[starIndex];
    const absmag = Number.isFinite(absmagRaw) ? absmagRaw : null;

    const visualProfile = stellarVisualProfileFrom({
      bv,
      spect,
      absmag,
    });

    const radiusSolar = radiusFromSpect(
      spect,
      absmag !== null ? absmag : undefined
    );
    const radiusWorldUnits = radiusSolar * SUN_RADIUS_WORLD_UNITS;

    return { worldPos, visualProfile, radiusWorldUnits };
  }, [starIndex, catalog]);

  // Hysteresis state. Ref tracks the live boolean for useFrame; the
  // useState mirror drives React re-renders (mount/unmount of
  // ProceduralSun3D).
  const meshActiveRef = useRef(false);
  const [meshActive, setMeshActive] = useState(false);

  // Per-frame gate evaluation.
  useFrame(() => {
    if (!starData) {
      // No focus on a parseable HYG star, or catalog not loaded yet.
      // Force inactive; cleanup useEffect handles the skipMask reset
      // when starIndex flips to null.
      if (meshActiveRef.current) {
        meshActiveRef.current = false;
        setMeshActive(false);
      }
      return;
    }

    const distToCamera = camera.position.distanceTo(starData.worldPos);
    const sa = computeStellarSolidAngle(
      starData.radiusWorldUnits,
      distToCamera
    );
    const next = shouldStellarMeshBeActive(meshActiveRef.current, sa);
    if (next !== meshActiveRef.current) {
      meshActiveRef.current = next;
      setMeshActive(next);
    }

    // T6.3-δ — re-assert skipMask each frame against whatever
    // Starfield instanced attribute is currently live. `writeSkipMask`
    // is idempotent (no-op when the slot already holds the desired
    // value, see line 133) so the per-frame cost is one scene lookup
    // + one Float32Array read in the steady state. The defensive
    // re-write only matters during transient rebuilds: when the user
    // changes quality while a HYG mesh is active, Starfield re-creates
    // its `InstancedBufferGeometry` with a fresh zero-filled
    // `a_skipMask`. Without this re-assert, the useEffect deps
    // `[scene, starIndex, meshActive]` don't fire on catalog change,
    // so the sprite would re-emerge under the procedural mesh until
    // the next hysteresis flip. (Codex P2 audit, 2026-05-04.)
    if (starIndex !== null) {
      writeSkipMask(scene, starIndex, meshActiveRef.current ? 1 : 0);
    }
  });

  // Skip-mask sync. When meshActive flips for a given starIndex, push
  // the value to the Starfield instanced attribute. Cleanup on unmount
  // OR starIndex change clears the previous slot so a re-focus on the
  // same star re-spawns cleanly (no stuck skipMask=1 after despawn).
  useEffect(() => {
    if (starIndex === null) return;
    writeSkipMask(scene, starIndex, meshActive ? 1 : 0);
    return () => {
      // Cleanup: clear this star's slot. Runs on starIndex change
      // (focus moves to a different star or null) and on unmount.
      writeSkipMask(scene, starIndex, 0);
    };
  }, [scene, starIndex, meshActive]);

  if (!meshActive || !starData) return null;

  return (
    <ProceduralSun3D
      qualityProfileName={qualityProfile.name}
      sunVisualRadiusWorld={starData.radiusWorldUnits}
      position={starData.worldPos}
      visualProfile={starData.visualProfile ?? SUN_DEFAULT_VISUAL_PROFILE}
      renderRange="close"
    />
  );
};
