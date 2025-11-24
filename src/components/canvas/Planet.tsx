import { useRef, useMemo, Suspense } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Html, useTexture } from '@react-three/drei';
import { type CelestialBody, AstroPhysics, KM_TO_3D_UNITS } from '../../lib/astrophysics';
import { useStore } from '../../store';

interface PlanetProps {
  body: CelestialBody;
  children?: React.ReactNode;
}

const PlanetVisual = ({ body, isSelected }: { body: CelestialBody, isSelected: boolean }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const { selectId, showLabels, scaleMode } = useStore();

    // Handle texture loading
    let textureMap: THREE.Texture | undefined;
    if (body.textures?.map) {
        textureMap = useTexture(body.textures.map);
    }

    useFrame(() => {
        if (!meshRef.current) return;
        let s = 1;
        if (scaleMode === 'didactic') {
            if (body.type === 'star') s = 60;
            else if (body.type === 'moon') s = 10;
            else s = body.radiusKm > 50000 ? 40 : 20;
        } else {
            s = body.radiusKm * KM_TO_3D_UNITS;
        }
        meshRef.current.scale.setScalar(s);
    });

    return (
        <mesh 
          ref={meshRef} 
          onClick={(e) => { e.stopPropagation(); selectId(body.id); }}
          onPointerOver={() => document.body.style.cursor = 'pointer'}
          onPointerOut={() => document.body.style.cursor = 'auto'}
        >
          <sphereGeometry args={[1, 64, 64]} />
          <meshStandardMaterial 
              map={textureMap}
              color={textureMap ? '#ffffff' : body.color} 
              emissive={body.type === 'star' ? body.color : '#000'}
              emissiveIntensity={body.type === 'star' ? 2 : 0}
              roughness={0.8}
              metalness={0.1}
          />
          
          {isSelected && (
              <mesh scale={[1.2, 1.2, 1.2]}>
                  <sphereGeometry args={[1, 32, 32]} />
                  <meshBasicMaterial color="#ffffff" wireframe transparent opacity={0.3} />
              </mesh>
          )}

          {showLabels && (
              <Html distanceFactor={100} className="pointer-events-none">
                  <div className="text-gray-300 text-xs font-mono whitespace-nowrap transform translate-x-4 -translate-y-1/2 drop-shadow-md">
                      {body.name.en}
                  </div>
              </Html>
          )}
        </mesh>
    );
}

// Wrapper to handle Suspense for textures
const PlanetVisualWrapper = (props: { body: CelestialBody, isSelected: boolean }) => {
    if (props.body.textures?.map) {
        return (
            <Suspense fallback={<mesh><sphereGeometry args={[1, 32, 32]} /><meshBasicMaterial color={props.body.color} wireframe /></mesh>}>
                <PlanetVisual {...props} />
            </Suspense>
        );
    }
    return <PlanetVisual {...props} />;
}

export const Planet = ({ body, children }: PlanetProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const { scaleMode, showOrbits, selectedId } = useStore();
  
  // Orbit geometry
  const orbitGeometry = useMemo(() => {
    if (body.type === 'star') return null;
    const pts = AstroPhysics.getRelativeOrbitPoints(body.orbit);
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [body]);

  useFrame(() => {
    if (!groupRef.current) return;
    const { datetime } = useStore.getState();
    
    // 1. Update Group Position (Orbital motion)
    const pos = AstroPhysics.calculateLocalPosition(body.orbit, datetime);
    if (body.parentId && scaleMode === 'didactic') {
        pos.multiplyScalar(50); // Exaggerate moon distance
    }
    groupRef.current.position.copy(pos);
    
    // 2. Update Scale (We apply scale to the group or the visual? 
    // If we apply to group, children scale too.
    // If we apply to visual, children don't scale.
    // We want children (moons) to NOT inherit planet scale if possible, or handle it.
    // In previous code, I applied scale to meshRef.
    // Here PlanetVisual has meshRef. But I can't access it easily from here to scale it.
    // So I should pass scale as prop or handle scale inside PlanetVisual.
    // Let's handle scale inside PlanetVisual via useFrame or prop.
  });
  
  // Calculate scale to pass to visual
  // Wait, useFrame in PlanetVisual is better.
  
  return (
    <>
      {showOrbits && orbitGeometry && (
        <lineLoop geometry={orbitGeometry}>
          <lineBasicMaterial color={body.color} transparent opacity={0.3} />
        </lineLoop>
      )}

      <group ref={groupRef} name={body.id}>
        <PlanetVisualWrapper body={body} isSelected={selectedId === body.id} />
        {children}
      </group>
    </>
  );
};

