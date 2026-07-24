/**
 * Shared primitives for runtime + asset-study surfaces.
 *
 * `PlanetModel.tsx` (the runtime planet renderer) and
 * `AssetStudyApp.tsx` (the Playwright-driven validation surface) each
 * need to turn a loaded GLB scene or OBJ mesh into a visually neutral,
 * shadow-ready, unit-sized object. The math — clone everything mutable,
 * project spherical UVs on OBJ meshes, merge vertices, recompute
 * normals, and normalise to a unit sphere via the bounding box — must
 * match between the two surfaces. Drift there is the worst kind of
 * silent regression: the study surface exists precisely to be trusted
 * as a reference for the runtime.
 *
 * This module collects the geometry and disposal primitives. Material
 * construction (roughness, metalness, emissive, map selection) stays
 * per-component because the two surfaces intentionally diverge on
 * appearance (study uses a flat 0.95 roughness for reproducibility;
 * runtime respects body-specific quality profile + emissive fill
 * lights).
 */

import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ensureSphericalUvProjection } from "../utils/sphericalUv";

/**
 * Force opaque-pass depth semantics on a material or material array.
 * Loaders sometimes leave GLB materials with `depthWrite: false` (the
 * glTF transmission extension flips this) which produces self-sorting
 * artifacts under our lighting. Both runtime and study want the same
 * answer: write and test depth, period.
 */
export const applyDepthSettings = (
  material: THREE.Material | THREE.Material[]
): void => {
  const materials = Array.isArray(material) ? material : [material];
  for (const currentMaterial of materials) {
    currentMaterial.depthWrite = true;
    currentMaterial.depthTest = true;
  }
};

/**
 * Deep-dispose every geometry and material reachable from `object`.
 *
 * **Ownership contract — read before calling.** `THREE.Object3D.clone()`
 * is a shallow copy: the cloned tree shares geometry and material
 * references with the original. Calling this on raw loader output
 * (`useGLTF`, `useLoader(OBJLoader, …)`) or on a plain `scene.clone()`
 * would dispose the loader's cached resources and break every other
 * component reading from the same cache.
 *
 * Only call on an object whose meshes have already had their
 * geometries and materials detached — i.e. the result of
 * `cloneGlbSceneForRuntime` (which clones both per-mesh) or a tree you
 * built with `prepareObjMeshGeometry` (which returns a fresh geometry
 * the caller owns). The React pattern is to use it in a cleanup effect
 * keyed on the owned clone.
 */
export const disposeObject3D = (object: THREE.Object3D): void => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
      return;
    }
    child.material?.dispose();
  });
};

/**
 * Disposes loader-owned geometry, materials, and texture maps.
 *
 * Unlike `disposeObject3D`, this must only be used after the loader cache has
 * no consumers. Runtime clones deliberately share immutable texture objects
 * with the cached GLB source, so those maps are released once, at source-cache
 * eviction, rather than every time an instance unmounts.
 */
export const disposeLoadedObject3D = (object: THREE.Object3D): void => {
  const textures = new Set<THREE.Texture>();

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
          textures.add(value);
        }
      }

      if (material instanceof THREE.ShaderMaterial) {
        for (const uniform of Object.values(material.uniforms)) {
          if (uniform?.value instanceof THREE.Texture) {
            textures.add(uniform.value);
          }
        }
      }
    }
  });

  disposeObject3D(object);
  for (const texture of textures) {
    const image = texture.source?.data;
    texture.dispose();
    if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
      image.close();
    }
  }
};

/**
 * Return the scalar that normalises `object`'s bounding box to a
 * unit sphere (diameter 2). Zero-volume objects map to `1` — the
 * callers that use this to set `<primitive scale={…}>` would render
 * nothing with `0`, so returning `1` at least keeps the dev loop
 * self-diagnosable.
 */
export const normalizeToUnitSphereScale = (object: THREE.Object3D): number => {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  return maxDim > 0 ? 2 / maxDim : 1;
};

/**
 * Deep-clone a glTF scene for runtime use: every mesh gets its own
 * geometry and material copies (so per-instance material tweaks never
 * reach back into the cached drei scene), shadow casting/receiving is
 * enabled, and an optional per-mesh visitor adjusts each material
 * (apply roughness, swap a color, etc.). Returns the clone alongside
 * the unit-sphere normalization scale so callers don't have to run the
 * Box3 math themselves.
 *
 * The visitor is invoked per-material, not per-mesh, so
 * `material.isArray` meshes are handled transparently.
 */
export const cloneGlbSceneForRuntime = (
  scene: THREE.Object3D,
  adjustMaterial?: (material: THREE.Material, mesh: THREE.Mesh) => void
): { cloned: THREE.Object3D; normalizationScale: number } => {
  const cloned = scene.clone();
  cloned.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry = child.geometry.clone();
    child.material = Array.isArray(child.material)
      ? child.material.map((material) => material.clone())
      : child.material.clone();
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of materials) {
      applyDepthSettings(material);
      adjustMaterial?.(material, child);
    }
  });
  return { cloned, normalizationScale: normalizeToUnitSphereScale(cloned) };
};

/**
 * Prepare an OBJ mesh geometry for spherical shading:
 *
 * 1. Clone so the cached OBJLoader output stays untouched.
 * 2. Project spherical UVs when the geometry has none (or a mismatched
 *    count) — many of our asteroid / moon OBJs ship without UVs.
 * 3. Merge coincident vertices so normal averaging produces smooth
 *    shading across hard-edged vertex duplicates.
 * 4. Recompute vertex normals against the merged topology.
 *
 * Returns a fresh `BufferGeometry` the caller owns and must dispose.
 */
export const prepareObjMeshGeometry = (
  geometry: THREE.BufferGeometry
): THREE.BufferGeometry => {
  const prepared = mergeVertices(ensureSphericalUvProjection(geometry.clone()));
  prepared.computeVertexNormals();
  return prepared;
};
