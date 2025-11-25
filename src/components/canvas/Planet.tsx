import { useRef, useMemo, Suspense } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import {
  type CelestialBody,
  AstroPhysics,
  KM_TO_3D_UNITS,
} from "../../lib/astrophysics";
import { useStore } from "../../store";
import { ErrorBoundary } from "../utils/ErrorBoundary";

interface PlanetProps {
  body: CelestialBody;
  children?: React.ReactNode;
}

const PlanetVisual = ({ body }: { body: CelestialBody }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectId, scaleMode } = useStore();

  // Handle texture loading
  let textureMap: THREE.Texture | undefined;
  if (body.textures?.map) {
    textureMap = useTexture(body.textures.map);
  }

  useFrame(() => {
    if (!meshRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      if (body.type === "star") s = 60;
      else if (body.type === "moon")
        s = 5; // Moon is ~1/4 of Earth size (1737km vs 6371km)
      else s = body.radiusKm > 50000 ? 40 : 20; // Large planets = 40, Small planets = 20
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }
    meshRef.current.scale.setScalar(s);
  });

  return (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        selectId(body.id);
      }}
      onPointerOver={() => (document.body.style.cursor = "pointer")}
      onPointerOut={() => (document.body.style.cursor = "auto")}
    >
      <sphereGeometry args={[1, 64, 64]} />
      <meshStandardMaterial
        map={textureMap}
        color={textureMap ? "#ffffff" : body.color}
        emissive={body.type === "star" ? body.color : "#000"}
        emissiveIntensity={body.type === "star" ? 2 : 0}
        roughness={0.8}
        metalness={0.1}
      />
    </mesh>
  );
};

// Wrapper to handle Suspense for textures
const PlanetVisualWrapper = (props: { body: CelestialBody }) => {
  const fallback = (
    <mesh
      onClick={(e) => {
        e.stopPropagation();
        useStore.getState().selectId(props.body.id);
      }}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color={props.body.color} />
    </mesh>
  );

  if (props.body.textures?.map) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <PlanetVisual {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  }
  return <PlanetVisual {...props} />;
};

export const Planet = ({ body, children }: PlanetProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scaleMode, showOrbits } = useStore();

  // Orbit geometry
  const orbitGeometry = useMemo(() => {
    if (body.type === "star") return null;
    const pts = AstroPhysics.getRelativeOrbitPoints(body.orbit);

    // In didactic mode, exaggerate moon orbit distance to match position
    if (body.parentId && scaleMode === "didactic") {
      pts.forEach((p) => p.multiplyScalar(50));
    }

    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [body, scaleMode]);

  useFrame(() => {
    if (!groupRef.current) return;
    const { datetime } = useStore.getState();

    // 1. Update Group Position (Orbital motion)
    const pos = AstroPhysics.calculateLocalPosition(body.orbit, datetime);
    if (body.parentId && scaleMode === "didactic") {
      pos.multiplyScalar(50); // Exaggerate moon distance
    }
    groupRef.current.position.copy(pos);
  });

  return (
    <>
      {showOrbits && orbitGeometry && (
        <lineLoop geometry={orbitGeometry}>
          <lineBasicMaterial color={body.color} transparent opacity={0.3} />
        </lineLoop>
      )}

      <group ref={groupRef} name={body.id}>
        <PlanetVisualWrapper body={body} />
        {children}
      </group>
    </>
  );
};
