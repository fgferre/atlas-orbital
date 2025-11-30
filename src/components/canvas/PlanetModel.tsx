import { useRef, useMemo } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
// @ts-ignore
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import {
  type CelestialBody,
  KM_TO_3D_UNITS,
  AstroPhysics,
} from "../../lib/astrophysics";
import { useStore } from "../../store";

interface PlanetModelProps {
  body: CelestialBody;
  roughness?: number;
  metalness?: number;
  sunEmissive?: number;
  ringEmissive?: number;
  ringShadowIntensity?: number;
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
        child.castShadow = true;
        child.receiveShadow = true;
        if (child.material) {
          child.material.depthWrite = true;
          child.material.depthTest = true;
          // Apply global material settings if provided
          if (roughness !== undefined) child.material.roughness = roughness;
          if (metalness !== undefined) child.material.metalness = metalness;
        }
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

  return (
    <group rotation={new THREE.Euler(0, 0, 0)}>
      <primitive object={cloned} scale={normalizationScale * (scale || 1)} />
    </group>
  );
};

// Sub-component for OBJ models
const OBJModel = ({
  path,
  texturePath,
  scale,
  roughness,
  metalness,
}: {
  path: string;
  texturePath?: string;
  scale?: number;
  roughness?: number;
  metalness?: number;
}) => {
  const obj = useLoader(OBJLoader, path);
  const texture = texturePath ? useTexture(texturePath) : null;

  const { cloned, normalizationScale } = useMemo(() => {
    const c = obj.clone();
    c.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Apply texture and material settings
        child.material = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: roughness ?? 1,
          metalness: metalness ?? 0,
          color: 0xffffff, // Ensure white base color so texture shows correctly
        });

        child.material.depthWrite = true;
        child.material.depthTest = true;
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
  }, [obj, texture, roughness, metalness]);

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
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
}: PlanetModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Determine loader type
  const isGLTF =
    body.model!.path.endsWith(".glb") || body.model!.path.endsWith(".gltf");

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

    groupRef.current.scale.setScalar(s);

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
                path={body.model!.path}
                texturePath={body.textures?.map}
                scale={1}
                roughness={roughness}
                metalness={metalness}
              />
            )}
          </group>
        </group>
      </group>
    </group>
  );
};
