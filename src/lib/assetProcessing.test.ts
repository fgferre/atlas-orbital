import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";

import {
  applyDepthSettings,
  cloneGlbSceneForRuntime,
  disposeObject3D,
  normalizeToUnitSphereScale,
  prepareObjMeshGeometry,
} from "./assetProcessing";

describe("applyDepthSettings", () => {
  it("forces depthWrite + depthTest true on a single material", () => {
    const m = new THREE.MeshStandardMaterial();
    m.depthWrite = false;
    m.depthTest = false;
    applyDepthSettings(m);
    expect(m.depthWrite).toBe(true);
    expect(m.depthTest).toBe(true);
  });

  it("handles material arrays", () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshBasicMaterial();
    a.depthWrite = false;
    b.depthTest = false;
    applyDepthSettings([a, b]);
    expect(a.depthWrite).toBe(true);
    expect(b.depthTest).toBe(true);
  });
});

describe("disposeObject3D", () => {
  it("disposes every mesh's geometry and material", () => {
    const root = new THREE.Group();
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial();
    const geomSpy = vi.spyOn(geom, "dispose");
    const matSpy = vi.spyOn(mat, "dispose");
    root.add(new THREE.Mesh(geom, mat));

    disposeObject3D(root);
    expect(geomSpy).toHaveBeenCalledOnce();
    expect(matSpy).toHaveBeenCalledOnce();
  });

  it("disposes every element in a material array", () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const spyA = vi.spyOn(a, "dispose");
    const spyB = vi.spyOn(b, "dispose");
    const mesh = new THREE.Mesh(geom, [a, b]);
    disposeObject3D(mesh);
    expect(spyA).toHaveBeenCalledOnce();
    expect(spyB).toHaveBeenCalledOnce();
  });

  it("ignores non-mesh children", () => {
    const group = new THREE.Group();
    group.add(new THREE.Object3D());
    expect(() => disposeObject3D(group)).not.toThrow();
  });
});

describe("normalizeToUnitSphereScale", () => {
  it("returns 2/maxDim for a standard box", () => {
    // Box side 4 → maxDim 4 → 0.5
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4));
    expect(normalizeToUnitSphereScale(mesh)).toBeCloseTo(0.5);
  });

  it("picks the largest axis", () => {
    // Side lengths 2, 1, 0.5 → maxDim 2 → scale 1
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.5));
    expect(normalizeToUnitSphereScale(mesh)).toBeCloseTo(1);
  });

  it("returns 1 as a safe fallback for zero-volume objects", () => {
    const empty = new THREE.Group();
    expect(normalizeToUnitSphereScale(empty)).toBe(1);
  });
});

describe("prepareObjMeshGeometry", () => {
  it("returns a fresh geometry instance (does not mutate the input)", () => {
    const input = new THREE.BoxGeometry(1, 1, 1);
    const out = prepareObjMeshGeometry(input);
    expect(out).not.toBe(input);
    expect(out.getAttribute("position")).toBeDefined();
  });

  it("populates a UV attribute even when the input lacks one", () => {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1],
        3
      )
    );
    geom.setIndex([0, 1, 2, 3, 4, 5]);
    const out = prepareObjMeshGeometry(geom);
    expect(out.getAttribute("uv")).toBeDefined();
  });

  it("recomputes vertex normals", () => {
    const geom = new THREE.BoxGeometry(1, 1, 1);
    // Destroy normals so the function's computeVertexNormals is observable.
    geom.deleteAttribute("normal");
    const out = prepareObjMeshGeometry(geom);
    expect(out.getAttribute("normal")).toBeDefined();
  });
});

describe("cloneGlbSceneForRuntime", () => {
  const buildScene = () => {
    const scene = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({ roughness: 0.1, metalness: 0.9 })
    );
    scene.add(mesh);
    return { scene, mesh };
  };

  it("clones every mesh's geometry and material (source untouched)", () => {
    const { scene, mesh } = buildScene();
    const originalGeom = mesh.geometry;
    const originalMat = mesh.material;

    const { cloned } = cloneGlbSceneForRuntime(scene);
    const clonedMesh = cloned.children[0] as THREE.Mesh;
    expect(clonedMesh.geometry).not.toBe(originalGeom);
    expect(clonedMesh.material).not.toBe(originalMat);
  });

  it("enables castShadow and receiveShadow on every mesh", () => {
    const { scene } = buildScene();
    const { cloned } = cloneGlbSceneForRuntime(scene);
    const clonedMesh = cloned.children[0] as THREE.Mesh;
    expect(clonedMesh.castShadow).toBe(true);
    expect(clonedMesh.receiveShadow).toBe(true);
  });

  it("applies depth settings unconditionally on every material", () => {
    const { scene, mesh } = buildScene();
    (mesh.material as THREE.MeshStandardMaterial).depthWrite = false;
    const { cloned } = cloneGlbSceneForRuntime(scene);
    const clonedMesh = cloned.children[0] as THREE.Mesh;
    const clonedMat = clonedMesh.material as THREE.MeshStandardMaterial;
    expect(clonedMat.depthWrite).toBe(true);
    expect(clonedMat.depthTest).toBe(true);
  });

  it("invokes the visitor once per material with the owning mesh", () => {
    const { scene } = buildScene();
    const visitor = vi.fn();
    const { cloned } = cloneGlbSceneForRuntime(scene, visitor);
    expect(visitor).toHaveBeenCalledTimes(1);
    const clonedMesh = cloned.children[0] as THREE.Mesh;
    expect(visitor).toHaveBeenCalledWith(clonedMesh.material, clonedMesh);
  });

  it("computes normalizationScale from the clone's bounding box", () => {
    const { scene } = buildScene();
    const { normalizationScale } = cloneGlbSceneForRuntime(scene);
    // Box side 2 → scale 1
    expect(normalizationScale).toBeCloseTo(1);
  });

  it("handles material arrays via the visitor", () => {
    const scene = new THREE.Group();
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [a, b]));

    const visitor = vi.fn();
    cloneGlbSceneForRuntime(scene, visitor);
    expect(visitor).toHaveBeenCalledTimes(2);
  });
});
