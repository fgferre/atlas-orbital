import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  type CelestialBody,
  KM_TO_3D_UNITS,
  AstroPhysics,
} from "../../lib/astrophysics";
import { useDeferredTexture } from "../../hooks/useDeferredTexture";
import type { ResolvedQualityName } from "../../lib/qualityProfile";
import { TEXTURE_VARIANT_MANIFEST } from "../../lib/textureVariantManifest";
import { resolveTextureRequest } from "../../lib/textureVariants";
import { useStore } from "../../store";
import { ensureSphericalUvProjection } from "../../utils/sphericalUv";
import {
  createProceduralSurfaceTexture,
  getSurfaceFillLight,
  shouldRenderDirectSurfaceMap,
} from "../../utils/proceduralSurface";

const applyDepthSettings = (material: THREE.Material | THREE.Material[]) => {
  const materials = Array.isArray(material) ? material : [material];

  for (const currentMaterial of materials) {
    currentMaterial.depthWrite = true;
    currentMaterial.depthTest = true;
  }
};

const applyStandardSurfaceSettings = (
  material: THREE.Material | THREE.Material[],
  roughness?: number,
  metalness?: number
) => {
  const materials = Array.isArray(material) ? material : [material];

  for (const currentMaterial of materials) {
    applyDepthSettings(currentMaterial);

    if (
      currentMaterial instanceof THREE.MeshStandardMaterial ||
      currentMaterial instanceof THREE.MeshPhysicalMaterial
    ) {
      if (roughness !== undefined) currentMaterial.roughness = roughness;
      if (metalness !== undefined) currentMaterial.metalness = metalness;
    }
  }
};

const disposeObjectResources = (object: THREE.Object3D) => {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) {
      return;
    }

    child.geometry?.dispose();

    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
      return;
    }

    child.material?.dispose();
  });
};

interface PlanetModelProps {
  body: CelestialBody;
  roughness?: number;
  metalness?: number;
  sunEmissive?: number;
  ringEmissive?: number;
  ringShadowIntensity?: number;
  qualityProfileName: ResolvedQualityName;
  assetPriority: number;
  baseTextureSalience: number;
}

// Sub-component for GLB models
const GLBModel = ({
  path,
  scale,
  roughness,
  metalness,
}: {
  path: string;
  scale?: number;
  roughness?: number;
  metalness?: number;
}) => {
  const { scene } = useGLTF(path);

  const { cloned, normalizationScale } = useMemo(() => {
    const c = scene.clone();
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = child.geometry.clone();
        child.material = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone();
        child.castShadow = true;
        child.receiveShadow = true;
        applyStandardSurfaceSettings(child.material, roughness, metalness);
      }
    });

    // Normalize size to radius 1 (diameter 2)
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    let normScale = 1;
    if (maxDim > 0) {
      // We want the model to fit within a sphere of radius 1 (diameter 2)
      normScale = 2 / maxDim;
    }

    return { cloned: c, normalizationScale: normScale };
  }, [scene, roughness, metalness]);

  useEffect(() => {
    return () => {
      disposeObjectResources(cloned);
    };
  }, [cloned]);

  return (
    <group rotation={new THREE.Euler(0, 0, 0)}>
      <primitive object={cloned} scale={normalizationScale * (scale || 1)} />
    </group>
  );
};

// Sub-component for OBJ models
const OBJModel = ({
  body,
  path,
  texturePath,
  scale,
  roughness,
  metalness,
  assetPriority,
}: {
  body: CelestialBody;
  path: string;
  texturePath?: string;
  scale?: number;
  roughness?: number;
  metalness?: number;
  assetPriority: number;
}) => {
  const obj = useLoader(OBJLoader, path);
  const directTexture = useDeferredTexture(
    texturePath && shouldRenderDirectSurfaceMap(body) ? texturePath : null,
    {
      enabled: true,
      pin: assetPriority <= 1,
    }
  ).texture;
  const proceduralTexture = useMemo(() => {
    if (directTexture) return null;
    return createProceduralSurfaceTexture(body);
  }, [body, directTexture]);
  const surfaceFillLight = useMemo(() => {
    if (directTexture) return null;
    return getSurfaceFillLight(body);
  }, [body, directTexture]);
  const surfaceTexture = directTexture ?? proceduralTexture ?? undefined;

  useEffect(() => {
    return () => {
      proceduralTexture?.dispose();
    };
  }, [proceduralTexture]);

  const { cloned, normalizationScale } = useMemo(() => {
    const c = obj.clone();
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = mergeVertices(
          ensureSphericalUvProjection(child.geometry.clone())
        );
        child.geometry.computeVertexNormals();
        child.castShadow = true;
        child.receiveShadow = true;

        const materialParams: THREE.MeshStandardMaterialParameters = {
          roughness: roughness ?? 1,
          metalness: metalness ?? 0,
          color: surfaceTexture ? 0xffffff : body.color,
          emissive: surfaceFillLight?.color ?? "#000",
          emissiveIntensity: surfaceFillLight?.intensity ?? 0,
        };

        if (surfaceTexture) {
          materialParams.map = surfaceTexture;
        }

        child.material = new THREE.MeshStandardMaterial(materialParams);

        applyDepthSettings(child.material);
      }
    });

    // Normalize size to radius 1 (diameter 2)
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);

    let normScale = 1;
    if (maxDim > 0) {
      normScale = 2 / maxDim;
    }

    return { cloned: c, normalizationScale: normScale };
  }, [obj, surfaceTexture, surfaceFillLight, roughness, metalness, body.color]);

  useEffect(() => {
    return () => {
      disposeObjectResources(cloned);
    };
  }, [cloned]);

  return (
    <group rotation={new THREE.Euler(0, 0, 0)}>
      <primitive object={cloned} scale={normalizationScale * (scale || 1)} />
    </group>
  );
};

export const PlanetModel = ({
  body,
  roughness,
  metalness,
  qualityProfileName,
  assetPriority,
  baseTextureSalience,
}: PlanetModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Determine loader type
  const isGLTF =
    body.model!.path.endsWith(".glb") || body.model!.path.endsWith(".gltf");
  const mapRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "map",
        qualityProfileName,
        baseTextureSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, baseTextureSalience, qualityProfileName]
  );

  useFrame(() => {
    if (!groupRef.current) return;

    // Scaling
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(body.radiusKm);
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }

    // Apply custom model scale adjustment if provided
    if (body.model?.scale) {
      s *= body.model.scale;
    }

    const [sx, sy, sz] = body.shapeScale ?? [1, 1, 1];
    groupRef.current.scale.set(s * sx, s * sy, s * sz);

    // Rotation
    if (rotationRef.current && body.rotationPeriodHours) {
      const { datetime } = useStore.getState();
      const currentRotation =
        (datetime.getTime() / (body.rotationPeriodHours * 3600000)) *
        Math.PI *
        2;
      rotationRef.current.rotation.y = currentRotation;
    }
  });

  return (
    <group
      ref={groupRef}
      onClick={(e) => {
        e.stopPropagation();
        selectId(body.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      {/* Axial Tilt Group */}
      <group rotation={[0, 0, (body.axialTilt || 0) * (Math.PI / 180)]}>
        {/* Rotation Group */}
        <group ref={rotationRef}>
          {/* Model Rotation Offset */}
          <group
            rotation={
              body.model?.rotationOffset
                ? new THREE.Euler(...body.model.rotationOffset)
                : new THREE.Euler(0, 0, 0)
            }
          >
            {isGLTF ? (
              <GLBModel
                path={body.model!.path}
                scale={1} // Visual scale handled by parent group now? No, kept logic same.
                roughness={roughness}
                metalness={metalness}
              />
            ) : (
              <OBJModel
                body={body}
                path={body.model!.path}
                texturePath={mapRequest.selectedPath ?? undefined}
                scale={1}
                roughness={roughness}
                metalness={metalness}
                assetPriority={assetPriority}
              />
            )}
          </group>
        </group>
      </group>
    </group>
  );
};
