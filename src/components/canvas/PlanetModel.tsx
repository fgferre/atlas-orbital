import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  type CelestialBody,
  KM_TO_3D_UNITS,
  AstroPhysics,
} from "../../lib/astrophysics";
import { useStore } from "../../store";

interface PlanetModelProps {
  body: CelestialBody;
}

export const PlanetModel = ({ body }: PlanetModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Load the model
  const { scene } = useGLTF(body.model!.path);

  // Clone scene and normalize size
  const sceneClone = useMemo(() => {
    const clone = scene.clone();

    // Calculate bounding box
    const box = new THREE.Box3().setFromObject(clone);
    const size = new THREE.Vector3();
    box.getSize(size);

    // Get max dimension
    const maxDim = Math.max(size.x, size.y, size.z);

    // Scale to unit sphere (diameter 1, radius 0.5) -> wait, standard sphere is radius 1 (diameter 2)
    // Our PlanetVisual uses sphereGeometry args=[1, ...], so radius is 1.
    // So we want the model to fit in a sphere of radius 1.
    // Max dimension should be 2.

    if (maxDim > 0) {
      const scaleFactor = 2 / maxDim;
      clone.scale.multiplyScalar(scaleFactor);
    }

    // Enable shadows on all meshes
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Ensure material is standard (GLTF usually is)
        if (child.material) {
          child.material.depthWrite = true;
          child.material.depthTest = true;
        }
      }
    });

    return clone;
  }, [scene]);

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
          {/* Model Rotation Offset (to align model axis if needed) */}
          <group
            rotation={
              body.model?.rotationOffset
                ? new THREE.Euler(...body.model.rotationOffset)
                : new THREE.Euler(0, 0, 0)
            }
          >
            <primitive object={sceneClone} />
          </group>
        </group>
      </group>
    </group>
  );
};
