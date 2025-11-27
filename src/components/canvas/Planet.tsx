import { useRef, useMemo, Suspense, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture, Line } from "@react-three/drei";
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
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Handle ring texture
  let textureRing: THREE.Texture | undefined;
  if (body.textures?.ring) {
    textureRing = useTexture(body.textures.ring);
    // Don't rotate - let's see if that was causing issues
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

  useEffect(() => {
    return () => {
      earthMaterial?.dispose();
    };
  }, [earthMaterial]);

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

  useEffect(() => {
    return () => {
      cloudMaterial?.dispose();
    };
  }, [cloudMaterial]);

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

  useEffect(() => {
    return () => {
      atmosphereMaterial?.dispose();
    };
  }, [atmosphereMaterial]);

  useFrame(() => {
    if (!groupRef.current) return;

    // Scaling
    let s = 1;
    if (scaleMode === "didactic") {
      if (body.type === "star")
        s = 50; // Reduced from 60
      else if (body.type === "moon")
        s = 3; // Reduced from 5
      // Reduced planet scale to prevent overlap with moons in the new compressed scale
      else s = body.radiusKm > 50000 ? 25 : 10; // Reduced from 40/20 to 25/10
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
            <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1000}>
              {/* Custom geometry with radial UVs for horizontal strip texture */}
              <primitive
                object={useMemo(() => {
                  // Use defined ring system or fallback to Saturn defaults
                  const innerRadius = body.ringSystem?.innerRadius || 1.28;
                  const outerRadius = body.ringSystem?.outerRadius || 2.35;
                  const segments = 128;

                  const geometry = new THREE.RingGeometry(
                    innerRadius,
                    outerRadius,
                    segments
                  );
                  const positions = geometry.attributes.position;
                  const uvs = geometry.attributes.uv;

                  // Remap UVs for radial strip texture
                  const v3 = new THREE.Vector3();
                  for (let i = 0; i < positions.count; i++) {
                    v3.fromBufferAttribute(positions, i);
                    const radius = Math.sqrt(v3.x * v3.x + v3.y * v3.y);

                    // Map U from 0 (inner) to 1 (outer) based on radius
                    const u =
                      (radius - innerRadius) / (outerRadius - innerRadius);

                    // V stays at 0.5 for horizontal strip
                    uvs.setXY(i, u, 0.5);
                  }

                  return geometry;
                }, [body.ringSystem])}
              />
              <meshStandardMaterial
                map={textureRing}
                alphaMap={textureRing}
                transparent={true}
                side={THREE.DoubleSide}
                depthWrite={false}
                // Much brighter emissive to match reference images
                emissive={0xffffff}
                emissiveMap={textureRing}
                emissiveIntensity={1.5} // Increased from 0.4 to 1.5 for visibility
                roughness={0.8}
                metalness={0.0}
              />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
};

import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { PlanetModel } from "./PlanetModel";

// ... (existing imports)

// Wrapper to handle Suspense for textures/models
const PlanetVisualWrapper = (props: { body: CelestialBody }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleMode = useStore((state) => state.scaleMode);
  const selectId = useStore((state) => state.selectId);

  useFrame(() => {
    if (!meshRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(props.body.radiusKm);
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

  // Check for 3D Model first
  if (props.body.model) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <PlanetModel body={props.body} />
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
  const orbitLineRef = useRef<any>(null);
  const scaleMode = useStore((state) => state.scaleMode);
  const showOrbits = useStore((state) => state.showOrbits);
  const focusId = useStore((state) => state.focusId);

  // Calculate system multipliers once
  const systemMultipliers = useMemo(() => {
    return AstroPhysics.calculateSystemMultipliers(SOLAR_SYSTEM_BODIES);
  }, []);

  // Orbit points with adaptive resolution
  const orbitPoints = useMemo(() => {
    if (body.type === "star") return null;

    // Use 4x higher resolution for focused bodies
    const segments = focusId === body.id ? 2048 : 512;

    // Get system multiplier for this body (default to 1)
    const multiplier = body.parentId
      ? systemMultipliers[body.parentId] || 1
      : 1;

    const pts = AstroPhysics.getRelativeOrbitPoints(
      body.orbit,
      segments,
      scaleMode,
      multiplier
    );

    return pts;
  }, [body, scaleMode, focusId, systemMultipliers]);

  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    const { datetime } = useStore.getState();

    // 1. Update Group Position (Orbital motion)
    const multiplier = body.parentId
      ? systemMultipliers[body.parentId] || 1
      : 1;

    const pos = AstroPhysics.calculateLocalPosition(
      body.orbit,
      datetime,
      scaleMode,
      multiplier
    );
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
        // In didactic mode, use algorithmic sizes
        planetSize = AstroPhysics.calculateDidacticRadius(body.radiusKm);

        if (body.type === "star") {
          sizeMultiplier = 15;
        } else if (body.type === "moon") {
          sizeMultiplier = 10;
        } else {
          sizeMultiplier = 20;
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

      const material = orbitLineRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms?.opacity) {
        material.uniforms.opacity.value = opacity;
      } else {
        material.opacity = opacity;
      }
    }
  });

  return (
    <>
      {showOrbits && orbitPoints && (
        <Line
          ref={orbitLineRef}
          points={orbitPoints}
          color={body.color}
          lineWidth={1.5} // Thicker, volumetric look
          transparent
          opacity={0.3}
          depthTest={true}
          depthWrite={false}
        />
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
