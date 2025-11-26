import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import {
  type CelestialBody,
  KM_TO_3D_UNITS,
  AstroPhysics,
} from "../../lib/astrophysics";
import { useStore } from "../../store";

interface EarthProps {
  body: CelestialBody;
}

export const Earth = ({ body }: EarthProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const { selectId, scaleMode } = useStore();

  // Load textures once
  const dayTexture = useTexture(body.textures?.map || "");
  const cloudsTexture = useTexture(body.textures?.clouds || "");

  // Simple material - no custom shaders for now
  const earthMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: dayTexture,
      roughness: 0.9,
      metalness: 0.1,
    });
  }, [dayTexture]);

  const cloudMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
  }, [cloudsTexture]);

  const atmosphereMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(0xadd8e6), // Light blue
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.BackSide, // Render on the inside of the sphere
    });
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(body.radiusKm);
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }
    groupRef.current.scale.setScalar(s);

    // Rotation
    if (rotationRef.current && body.rotationPeriodHours) {
      const { datetime } = useStore.getState();
      // Calculate rotation angle: (time / period) * 2PI
      // Period is in hours, time is in ms.
      // 1 hour = 3600000 ms
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
          {/* 1. Earth Surface */}
          <mesh>
            <sphereGeometry args={[1, 128, 128]} />
            <primitive object={earthMaterial} attach="material" />
          </mesh>

          {/* 2. Clouds */}
          <mesh scale={1.005}>
            <sphereGeometry args={[1, 128, 128]} />
            <primitive object={cloudMaterial} attach="material" />
          </mesh>

          {/* 3. Atmosphere */}
          <mesh scale={1.06}>
            <sphereGeometry args={[1, 64, 64]} />
            <primitive object={atmosphereMaterial} attach="material" />
          </mesh>
        </group>
      </group>
    </group>
  );
};
