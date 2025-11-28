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
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { PlanetModel } from "./PlanetModel";

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
  }

  // Handle cloud texture
  let textureClouds: THREE.Texture | undefined;
  if (body.textures?.clouds) {
    textureClouds = useTexture(body.textures.clouds);
  }

  // Handle body texture
  let textureMap: THREE.Texture | undefined;
  if (body.textures?.map) {
    textureMap = useTexture(body.textures.map);
  }

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

  // Analytical Ring Shadow Logic
  const planetMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: textureMap,
      color: textureMap ? "#ffffff" : body.color,
      emissive: body.type === "star" ? body.color : "#000",
      emissiveMap: body.type === "star" ? textureMap : null,
      emissiveIntensity: body.type === "star" ? 1.2 : 0,
      roughness: 1.0,
      metalness: 0.1,
    });

    // Apply shaders: ring shadows for ringed planets
    if (textureRing && body.ringSystem) {
      const innerRadius = body.ringSystem.innerRadius;
      const outerRadius = body.ringSystem.outerRadius;

      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.tRing = { value: textureRing };
        shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) }; // Will be updated in useFrame
        shader.uniforms.uInnerRadius = { value: innerRadius };
        shader.uniforms.uOuterRadius = { value: outerRadius };

        // Inject uniforms and varying
        shader.vertexShader = `
          varying vec3 vPos;
          varying vec3 vObjectNormal;
          ${shader.vertexShader}
        `.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          vPos = position;
          vObjectNormal = normal;
          `
        );

        shader.fragmentShader = `
          uniform sampler2D tRing;
          uniform vec3 uSunPosition;
          uniform float uInnerRadius;
          uniform float uOuterRadius;
          varying vec3 vPos;
          varying vec3 vObjectNormal;
          ${shader.fragmentShader}
        `.replace(
          "#include <map_fragment>",
          `
          #include <map_fragment>

          // Analytical Ring Shadow
          // Ray from fragment (vPos) to Sun (uSunPosition)
          vec3 lightDir = normalize(uSunPosition - vPos);

          // Check if surface faces the sun (Day side)
          // We only cast shadows on the lit side.
          float sunDot = dot(normalize(vObjectNormal), lightDir);

          // Smoothly fade out the shadow effect as we approach the terminator (day/night line)
          // This prevents hard artifacts at the shadow edge near the dark side.
          float terminatorFade = smoothstep(0.0, 0.2, sunDot);

          if (terminatorFade > 0.0) {
            // Intersect with Ring Plane (y=0)
            // t = -origin.y / dir.y
            float t = -vPos.y / lightDir.y;

            // If t > 0, the ray hits the plane *towards* the sun (shadow caster)
            if (t > 0.0) {
              vec3 hitPos = vPos + lightDir * t;
              float radius = length(hitPos.xz);

              if (radius > uInnerRadius && radius < uOuterRadius) {
                float u = (radius - uInnerRadius) / (uOuterRadius - uInnerRadius);
                vec4 ringColor = texture2D(tRing, vec2(u, 0.5));

                // Darken based on ring opacity and terminator fade
                // 0.9 factor for max shadow density
                diffuseColor.rgb *= (1.0 - ringColor.a * 0.9 * terminatorFade);
              }
            }
          }
          `
        );
      };
    }

    return mat;
  }, [textureMap, textureRing, body.color, body.type, body.ringSystem]);

  // Analytical Planet Shadow on Rings Logic
  const ringMaterial = useMemo(() => {
    if (!textureRing) return null;

    const mat = new THREE.MeshStandardMaterial({
      map: textureRing,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      emissive: 0xffffff,
      emissiveMap: textureRing,
      emissiveIntensity: 0.5,
      roughness: 0.8,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };

      // Inject uniforms and varying
      shader.vertexShader = `
        varying vec3 vPos;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vPos = position;
        `
      );

      shader.fragmentShader = `
        uniform vec3 uSunPosition;
        varying vec3 vPos;
        ${shader.fragmentShader}
      `
        .replace(
          "#include <map_fragment>",
          `
        #include <map_fragment>
        
        // Analytical Planet Shadow
        // Ray from fragment (vPos) to Sun (uSunPosition)
        vec3 lightDir = normalize(uSunPosition - vPos);
        
        // Planet is a sphere at (0,0,0) with radius 1.0 (in local space)
        // Ray-Sphere Intersection: |O + tD|^2 = R^2
        // (vPos + t*lightDir)^2 = 1.0^2
        // t^2 + 2*dot(vPos, lightDir)*t + dot(vPos, vPos) - 1.0 = 0
        
        float b = 2.0 * dot(vPos, lightDir);
        float c = dot(vPos, vPos) - 1.0; // Radius is 1.0
        float delta = b*b - 4.0*c;
        
        // If delta > 0, line intersects sphere.
        // We need to check if intersection is in the direction of the sun (t > 0)
        // Since c > 0 (ring is outside planet), roots have same sign.
        // Sum of roots = -b. If b < 0 (pointing towards planet), roots are positive.
        
        bool inShadow = false;
        if (delta >= 0.0 && b < 0.0) {
           inShadow = true;
        }
        
        if (inShadow) {
          diffuseColor.rgb = vec3(0.0);
          // Also kill emissive if possible, but MeshStandardMaterial handles emissive separately.
          // We can hack it by multiplying the final color? 
          // Or just set diffuse to black, which kills the base color.
          // Emissive is added after. To kill emissive, we might need to modify totalEmissiveRadiance.
        }
        `
        )
        .replace(
          "#include <emissivemap_fragment>",
          `
        #include <emissivemap_fragment>
        // Hack to kill emissive in shadow
        // We need to re-calculate shadow condition or pass it?
        // Let's just re-calculate, it's cheap.
        
        vec3 lDir = normalize(uSunPosition - vPos);
        float bb = 2.0 * dot(vPos, lDir);
        float cc = dot(vPos, vPos) - 1.0;
        float dd = bb*bb - 4.0*cc;
        
        if (dd >= 0.0 && bb < 0.0) {
          totalEmissiveRadiance = vec3(0.0);
        }
        `
        );
    };

    return mat;
  }, [textureRing]);

  useFrame(() => {
    if (!rotationRef.current) return;

    // Update Sun Position uniform for analytical shadows
    if (rotationRef.current) {
      const sunWorldPos = new THREE.Vector3(0, 0, 0);
      const meshWorldMatrix = rotationRef.current.matrixWorld;
      const inverseMatrix = new THREE.Matrix4().copy(meshWorldMatrix).invert();
      const sunLocalPos = sunWorldPos.applyMatrix4(inverseMatrix);

      if (planetMaterial.userData.shader && textureRing) {
        planetMaterial.userData.shader.uniforms.uSunPosition.value.copy(
          sunLocalPos
        );
      }

      if (ringMaterial && ringMaterial.userData.shader) {
        ringMaterial.userData.shader.uniforms.uSunPosition.value.copy(
          sunLocalPos
        );
      }
    }
  });

  useFrame(() => {
    if (!groupRef.current) return;

    // Scaling
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
          {/* 1. Base Planet Sphere */}
          <mesh
            castShadow={body.type !== "star"}
            receiveShadow={body.type !== "star"}
          >
            <sphereGeometry args={[1, 64, 64]} />
            <primitive object={planetMaterial} attach="material" />
          </mesh>

          {/* 2. Cloud Layer (Slightly larger) */}
          {cloudMaterial && (
            <mesh scale={[1.01, 1.01, 1.01]} castShadow receiveShadow>
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
          {textureRing && ringMaterial && (
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={1000}
              receiveShadow
              // castShadow removed - using analytical shadows
            >
              <primitive
                object={useMemo(() => {
                  const innerRadius = body.ringSystem?.innerRadius || 1.11;
                  const outerRadius = body.ringSystem?.outerRadius || 2.33;
                  const segments = 128;

                  const geometry = new THREE.RingGeometry(
                    innerRadius,
                    outerRadius,
                    segments
                  );
                  const positions = geometry.attributes.position;
                  const uvs = geometry.attributes.uv;

                  const v3 = new THREE.Vector3();
                  for (let i = 0; i < positions.count; i++) {
                    v3.fromBufferAttribute(positions, i);
                    const radius = Math.sqrt(v3.x * v3.x + v3.y * v3.y);
                    const u =
                      (radius - innerRadius) / (outerRadius - innerRadius);
                    uvs.setXY(i, u, 0.5);
                  }

                  return geometry;
                }, [body.ringSystem])}
              />
              <primitive object={ringMaterial} attach="material" />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
};

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
    const segments = focusId === body.id ? 16384 : 4096;

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
