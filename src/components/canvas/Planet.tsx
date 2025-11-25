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
import { Earth } from "./Earth";

interface PlanetProps {
  body: CelestialBody;
  children?: React.ReactNode;
}

const PlanetVisual = ({ body }: { body: CelestialBody }) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const { selectId, scaleMode } = useStore();

  // Handle ring texture
  let textureRing: THREE.Texture | undefined;
  if (body.textures?.ring) {
    textureRing = useTexture(body.textures.ring);
    textureRing.rotation = -Math.PI / 2; // Rotate texture to align with geometry
  }

  // Handle cloud texture
  let textureClouds: THREE.Texture | undefined;
  if (body.textures?.clouds) {
    textureClouds = useTexture(body.textures.clouds);
  }

  // Handle night texture
  let textureNight: THREE.Texture | undefined;
  if (body.textures?.night) {
    textureNight = useTexture(body.textures.night);
  }

  // Handle body texture
  let textureMap: THREE.Texture | undefined;
  if (body.textures?.map) {
    textureMap = useTexture(body.textures.map);
  }

  // Custom Shader for Earth Day/Night cycle
  const earthMaterial = useMemo(() => {
    if (!textureMap || !textureNight) return null;

    return new THREE.ShaderMaterial({
      uniforms: {
        dayTexture: { value: textureMap },
        nightTexture: { value: textureNight },
        sunDirection: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;
        void main() {
          vUv = uv;
          // Calculate normal in World Space
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform sampler2D dayTexture;
        uniform sampler2D nightTexture;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPosition;

        void main() {
          vec3 normal = normalize(vNormal);
          
          // Calculate sun light intensity
          // Sun is at (0,0,0), so vector FROM surface TO sun is -vWorldPosition
          vec3 sunDir = normalize(-vWorldPosition); 
          
          float intensity = max(dot(normal, sunDir), 0.0);

          vec3 dayColor = texture2D(dayTexture, vUv).rgb;
          vec3 nightColor = texture2D(nightTexture, vUv).rgb;

          // Smooth transition between day and night
          float mixFactor = smoothstep(-0.1, 0.1, intensity);

          // Mix night lights (when dark) with day map (when lit)
          vec3 finalColor = mix(nightColor, dayColor * intensity, mixFactor);
          
          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
      transparent: false,
      depthWrite: true,
    });
  }, [textureMap, textureNight]);

  // Custom Shader for Clouds (treating black as transparent)
  const cloudMaterial = useMemo(() => {
    if (!textureClouds) return null;
    return new THREE.ShaderMaterial({
      uniforms: {
        map: { value: textureClouds },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          vec4 texColor = texture2D(map, vUv);
          // Use the brightness (red channel) as alpha
          // Clouds are white, background is black.
          gl_FragColor = vec4(1.0, 1.0, 1.0, texColor.r); 
        }
      `,
      transparent: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
      depthWrite: false, // Don't write to depth buffer to avoid occlusion issues
    });
  }, [textureClouds]);

  // Atmosphere Shader (Fresnel Glow)
  const atmosphereMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        color: { value: new THREE.Color(0x00aaff) },
        viewVector: { value: new THREE.Vector3(0, 0, 0) },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 color;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(vViewPosition);
          float intensity = pow(0.6 - dot(normal, viewDir), 4.0);
          gl_FragColor = vec4(color, intensity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, // Render on the inside of a slightly larger sphere
      depthWrite: false,
    });
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    // Scaling
    let s = 1;
    if (scaleMode === "didactic") {
      if (body.type === "star") s = 60;
      else if (body.type === "moon") s = 5;
      else s = body.radiusKm > 50000 ? 40 : 20;
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
          {/* 1. Base Planet Sphere */}
          <mesh>
            <sphereGeometry args={[1, 64, 64]} />
            {earthMaterial ? (
              <primitive object={earthMaterial} attach="material" />
            ) : (
              <meshStandardMaterial
                map={textureMap}
                color={textureMap ? "#ffffff" : body.color}
                emissive={body.type === "star" ? body.color : "#000"}
                emissiveMap={body.type === "star" ? textureMap : undefined}
                emissiveIntensity={body.type === "star" ? 2 : 0}
                roughness={0.8}
                metalness={0.1}
              />
            )}
          </mesh>

          {/* 2. Cloud Layer (Slightly larger) */}
          {cloudMaterial && (
            <mesh scale={[1.01, 1.01, 1.01]}>
              <sphereGeometry args={[1, 64, 64]} />
              <primitive object={cloudMaterial} attach="material" />
            </mesh>
          )}

          {/* 3. Atmosphere Layer (Larger still) */}
          {body.id === "earth" && (
            <mesh scale={[1.15, 1.15, 1.15]}>
              <sphereGeometry args={[1, 64, 64]} />
              <primitive object={atmosphereMaterial} attach="material" />
            </mesh>
          )}

          {/* 4. Ring System */}
          {textureRing && (
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.4, 2.4, 64]} />
              <meshStandardMaterial
                map={textureRing}
                transparent
                side={THREE.DoubleSide}
                opacity={0.8}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
};

// Wrapper to handle Suspense for textures
const PlanetVisualWrapper = (props: { body: CelestialBody }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { scaleMode, selectId } = useStore();

  useFrame(() => {
    if (!meshRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      if (props.body.type === "star") s = 60;
      else if (props.body.type === "moon") s = 5;
      else s = props.body.radiusKm > 50000 ? 40 : 20;
    } else {
      s = props.body.radiusKm * KM_TO_3D_UNITS;
    }
    meshRef.current.scale.setScalar(s);
  });

  const fallback = (
    <mesh
      ref={meshRef}
      onClick={(e) => {
        e.stopPropagation();
        selectId(props.body.id);
      }}
    >
      <sphereGeometry args={[1, 32, 32]} />
      <meshStandardMaterial color={props.body.color} />
    </mesh>
  );

  if (props.body.id === "earth") {
    return (
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <Earth body={props.body} />
        </Suspense>
      </ErrorBoundary>
    );
  }

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
  const orbitLineRef = useRef<THREE.LineLoop>(null);
  const { scaleMode, showOrbits, focusId } = useStore();

  // Orbit geometry with adaptive resolution
  const orbitGeometry = useMemo(() => {
    if (body.type === "star") return null;

    // Use 4x higher resolution for focused bodies
    const segments = focusId === body.id ? 16384 : 4096;
    const pts = AstroPhysics.getRelativeOrbitPoints(body.orbit, segments);

    // In didactic mode, exaggerate moon orbit distance to match position
    if (body.parentId && scaleMode === "didactic") {
      pts.forEach((p) => p.multiplyScalar(50));
    }

    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [body, scaleMode, focusId]);

  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    const { datetime } = useStore.getState();

    // 1. Update Group Position (Orbital motion)
    const pos = AstroPhysics.calculateLocalPosition(body.orbit, datetime);
    if (body.parentId && scaleMode === "didactic") {
      pos.multiplyScalar(50); // Exaggerate moon distance
    }
    groupRef.current.position.copy(pos);

    // 2. Adaptive fade for ALL bodies based on camera distance (both modes)
    if (orbitLineRef.current) {
      // For moons (geocentric), we need world position. For planets, group position is world position.
      const worldPos = new THREE.Vector3();
      groupRef.current.getWorldPosition(worldPos);
      const distance = camera.position.distanceTo(worldPos);

      let planetSize: number;
      let sizeMultiplier: number;

      if (scaleMode === "didactic") {
        // In didactic mode, use fixed sizes
        if (body.type === "star") {
          planetSize = 60;
          sizeMultiplier = 15; // Stars: fade earlier (was 8)
        } else if (body.type === "moon") {
          // Moon orbits are exaggerated by 50x, so we need to account for this
          planetSize = 5 * 50; // Moon orbit is 50x farther in didactic
          sizeMultiplier = 3; // Closer multiplier since orbit is already 50x away
        } else {
          planetSize = body.radiusKm > 50000 ? 40 : 20;
          sizeMultiplier = body.radiusKm > 50000 ? 20 : 40; // Planets: earlier fade (was 10/20)
        }
      } else {
        // In realistic mode, use actual scale with logarithmic multipliers
        planetSize = body.radiusKm * KM_TO_3D_UNITS;
        // Increased from max(100, 500/log) to max(200, 800/log) for much earlier fade
        sizeMultiplier = Math.max(
          200,
          800 / Math.max(1, Math.log10(body.radiusKm))
        );
      }

      const fadeStart = planetSize * sizeMultiplier;
      const fadeEnd = planetSize * (sizeMultiplier * 0.2);

      let opacity = 0.3;
      if (distance < fadeStart) {
        opacity = THREE.MathUtils.clamp(
          THREE.MathUtils.mapLinear(distance, fadeEnd, fadeStart, 0, 0.3),
          0,
          0.3
        );
      }

      const material = orbitLineRef.current.material as THREE.LineBasicMaterial;
      material.opacity = opacity;
    }
  });

  return (
    <>
      {showOrbits && orbitGeometry && (
        <lineLoop ref={orbitLineRef} geometry={orbitGeometry} renderOrder={-1}>
          <lineBasicMaterial
            color={body.color}
            transparent
            opacity={0.3}
            depthTest={true}
            depthWrite={false}
          />
        </lineLoop>
      )}

      <group ref={groupRef} name={body.id}>
        <PlanetVisualWrapper body={body} />

        {/* 
          Moons usually orbit the planet's equatorial plane (which is tilted).
          We apply the planet's axial tilt to the children container so the moons orbit the equator.
          EXCEPTION: Earth's Moon orbits the ecliptic (mostly), not Earth's equator.
        */}
        <group
          rotation={
            body.id !== "earth"
              ? [0, 0, (body.axialTilt || 0) * (Math.PI / 180)]
              : [0, 0, 0]
          }
        >
          {children}
        </group>
      </group>
    </>
  );
};
