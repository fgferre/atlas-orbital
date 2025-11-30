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
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { PlanetModel } from "./PlanetModel";

// import { cloudVertexShader, cloudFragmentShader } from "./shaders/cloudShader";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "./shaders/atmosphereShader";
import {
  ringShadowVertexPatch,
  ringShadowFragmentPatch,
} from "./shaders/ringShadowShader";
import {
  planetShadowVertexPatch,
  planetShadowFragmentPatch,
  planetShadowEmissivePatch,
} from "./shaders/planetShadowShader";

interface PlanetProps {
  body: CelestialBody;
  children?: React.ReactNode;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
}

const PlanetVisual = ({
  body,
  roughness,
  metalness,
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
}: {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
}) => {
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

  // Cloud Material (PBR + Analytical Shadows)
  const cloudMaterial = useMemo(() => {
    if (!textureClouds) return null;
    const mat = new THREE.MeshStandardMaterial({
      map: textureClouds,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false, // Don't write to depth buffer to avoid occlusion issues
      roughness: 1.0,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.uShadowIntensity = { value: ringShadowIntensity };

      // Inject uniforms and varying
      shader.vertexShader = `
        varying vec3 vPos;
        ${shader.vertexShader}
      `.replace("#include <begin_vertex>", planetShadowVertexPatch);

      shader.fragmentShader = `
        uniform vec3 uSunPosition;
        uniform float uShadowIntensity;
        varying vec3 vPos;
        ${shader.fragmentShader}
      `.replace("#include <map_fragment>", planetShadowFragmentPatch);
    };

    return mat;
  }, [textureClouds, ringShadowIntensity]);

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
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
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

  // Analytical Ring Shadow Logic & Earth Night Lights
  const planetMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      map: textureMap,
      color: textureMap ? "#ffffff" : body.color,
      emissive: body.type === "star" ? body.color : "#000",
      emissiveMap: body.type === "star" ? textureMap : null,
      emissiveIntensity: body.type === "star" ? sunEmissive : 0,
      roughness: roughness,
      metalness: metalness,
    });

    // Apply shaders: ring shadows for ringed planets
    if (textureRing && body.ringSystem) {
      const innerRadius = body.ringSystem.innerRadius;
      const outerRadius = body.ringSystem.outerRadius;

      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.tRing = { value: textureRing };
        shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };
        shader.uniforms.uInnerRadius = { value: innerRadius };
        shader.uniforms.uOuterRadius = { value: outerRadius };

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
  }, [
    textureMap,
    textureRing,
    body.color,
    body.type,
    body.ringSystem,
    roughness,
    metalness,
    sunEmissive,
  ]);

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
      emissiveIntensity: ringEmissive,
      roughness: 0.8,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.uShadowIntensity = { value: ringShadowIntensity };

      // Inject uniforms and varying
      shader.vertexShader = `
        varying vec3 vPos;
        ${shader.vertexShader}
      `.replace("#include <begin_vertex>", planetShadowVertexPatch);

      shader.fragmentShader = `
        uniform vec3 uSunPosition;
        uniform float uShadowIntensity;
        varying vec3 vPos;
        ${shader.fragmentShader}
      `
        .replace("#include <map_fragment>", planetShadowFragmentPatch)
        .replace("#include <emissivemap_fragment>", planetShadowEmissivePatch);
    };

    return mat;
  }, [textureRing, ringEmissive, ringShadowIntensity]);

  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!groupRef.current) return;

    // 1. Scaling
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(body.radiusKm);
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }
    groupRef.current.scale.setScalar(s);

    // 2. Rotation & Shader Uniforms
    if (rotationRef.current) {
      // Rotation
      if (body.rotationPeriodHours) {
        const { datetime } = useStore.getState();
        const currentRotation =
          (datetime.getTime() / (body.rotationPeriodHours * 3600000)) *
          Math.PI *
          2;
        rotationRef.current.rotation.y = currentRotation;
      }

      // Shader Uniforms (Analytical Shadows)
      if (textureRing) {
        const sunWorldPos = new THREE.Vector3(0, 0, 0);

        // A. Update Planet Material (Planet Shadow on itself / Ring Shadow on Planet)
        // Planet is direct child of rotationRef, so use rotationRef matrix
        if (planetMaterial.userData.shader) {
          const meshWorldMatrix = rotationRef.current.matrixWorld;
          const inverseMatrix = new THREE.Matrix4()
            .copy(meshWorldMatrix)
            .invert();
          const sunLocalPos = sunWorldPos.clone().applyMatrix4(inverseMatrix);

          planetMaterial.userData.shader.uniforms.uSunPosition.value.copy(
            sunLocalPos
          );

          // Update Cloud Material (if exists)
          if (cloudMaterial && cloudMaterial.userData.shader) {
            cloudMaterial.userData.shader.uniforms.uSunPosition.value.copy(
              sunLocalPos
            );
          }
        }

        // B. Update Ring Material (Planet Shadow on Ring)
        // Ring has extra rotation, so use ringRef matrix if available
        if (ringMaterial && ringMaterial.userData.shader && ringRef.current) {
          const ringWorldMatrix = ringRef.current.matrixWorld;
          const inverseRingMatrix = new THREE.Matrix4()
            .copy(ringWorldMatrix)
            .invert();
          const sunLocalPosRing = sunWorldPos
            .clone()
            .applyMatrix4(inverseRingMatrix);

          ringMaterial.userData.shader.uniforms.uSunPosition.value.copy(
            sunLocalPosRing
          );
        }
      }
    }
  });

  return (
    <group
      ref={groupRef}
      name={body.id}
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
            <mesh scale={[1.025, 1.025, 1.025]}>
              <sphereGeometry args={[1, 64, 64]} />
              <primitive object={atmosphereMaterial} attach="material" />
            </mesh>
          )}

          {/* 4. Ring System */}
          {textureRing && ringMaterial && (
            <mesh
              ref={ringRef}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={1000}
              // receiveShadow removed to prevent double shadows (we use analytical shadows)
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
const PlanetVisualWrapper = (props: {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
}) => {
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

  // Check for 3D Model first
  if (props.body.model) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Suspense fallback={fallback}>
          <PlanetModel
            body={props.body}
            roughness={props.roughness}
            metalness={props.metalness}
            sunEmissive={props.sunEmissive}
            ringEmissive={props.ringEmissive}
            ringShadowIntensity={props.ringShadowIntensity}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <PlanetVisual {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};

export const Planet = ({
  body,
  children,
  roughness,
  metalness,
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
}: PlanetProps) => {
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
        <PlanetVisualWrapper
          body={body}
          roughness={roughness}
          metalness={metalness}
          sunEmissive={sunEmissive}
          ringEmissive={ringEmissive}
          ringShadowIntensity={ringShadowIntensity}
        />

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
