import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import { type CelestialBody, KM_TO_3D_UNITS } from "../../lib/astrophysics";
import { useStore } from "../../store";

interface EarthProps {
  body: CelestialBody;
}

export const Earth = ({ body }: EarthProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const { selectId, scaleMode } = useStore();

  // Load textures - simple approach
  const dayTexture = useTexture(body.textures?.map || "");
  const nightTexture = useTexture(body.textures?.night || "");
  const cloudsTexture = useTexture(body.textures?.clouds || "");

  // Simple day/night material using MeshStandardMaterial
  const surfaceMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: dayTexture,
      roughness: 0.9,
      metalness: 0.1,
    });
  }, [dayTexture]);

  // Cloud material - simple white clouds with alpha
  const cloudMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    });
  }, [cloudsTexture]);

  // Atmosphere glow
  const atmosphereMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.15,
      side: THREE.BackSide,
    });
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      s = 20;
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }
    groupRef.current.scale.setScalar(s);
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
      {/* Earth Surface */}
      <mesh>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={surfaceMaterial} attach="material" />
      </mesh>

      {/* Clouds */}
      <mesh scale={1.005}>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={cloudMaterial} attach="material" />
      </mesh>

      {/* Atmosphere */}
      <mesh scale={1.05}>
        <sphereGeometry args={[1, 64, 64]} />
        <primitive object={atmosphereMaterial} attach="material" />
      </mesh>
    </group>
  );
};
