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

const BODIES_BY_ID = new Map(SOLAR_SYSTEM_BODIES.map((b) => [b.id, b]));

// import { cloudVertexShader, cloudFragmentShader } from "./shaders/cloudShader";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "./shaders/atmosphereShader";

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
  earthRotationOffset: number;
  nightLightIntensity: number;
}

const PlanetVisual = ({
  body,
  roughness,
  metalness,
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
  earthRotationOffset,
  nightLightIntensity,
}: {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
  earthRotationOffset: number;
  nightLightIntensity: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Calculate orientation quaternion based on IAU pole data
  const orientationQuaternion = useMemo(() => {
    if (body.poleRA !== undefined && body.poleDec !== undefined) {
      // Get pole direction in Ecliptic space
      const poleDir = AstroPhysics.equatorialToEcliptic(
        body.poleRA,
        body.poleDec
      );

      // Default Up is (0, 1, 0) in our scene (Ecliptic North)
      const defaultUp = new THREE.Vector3(0, 1, 0);

      // Create quaternion to rotate Up to Pole Direction
      return new THREE.Quaternion().setFromUnitVectors(defaultUp, poleDir);
    } else {
      // Fallback to simple axial tilt (around Z axis)
      return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, -(body.axialTilt || 0) * (Math.PI / 180))
      );
    }
  }, [body.poleRA, body.poleDec, body.axialTilt]);

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

  // Handle night texture (for Earth city lights)
  let textureNight: THREE.Texture | undefined;
  if (body.textures?.night) {
    textureNight = useTexture(body.textures.night);
  }

  // Cloud Material (PBR + Analytical Shadows)
  const cloudMaterial = useMemo(() => {
    if (!textureClouds) return null;
    const mat = new THREE.MeshStandardMaterial({
      map: textureClouds,
      transparent: true,
      blending: THREE.AdditiveBlending, // Reverted to Additive for visual look
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1.0,
      metalness: 0.0,
    });

    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.uShadowIntensity = { value: ringShadowIntensity };
    };

    return mat;
  }, [textureClouds, ringShadowIntensity]);

  // Shadow Caster Material (Custom Depth Material)
  // This material is used ONLY for casting shadows from the clouds.
  // It converts the black-and-white cloud texture into an alpha map for the shadow depth buffer.
  const cloudShadowMaterial = useMemo(() => {
    if (!textureClouds) return null;

    // We use MeshDepthMaterial for the shadow map
    const mat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: textureClouds, // Use the cloud texture
      alphaTest: 0.2, // Cutoff for shadows
    });

    // Custom shader to use luminance (brightness) as alpha
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = `
        uniform sampler2D map;
        varying vec2 vUv;
        ${shader.fragmentShader}
      `.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 texColor = texture2D(map, vUv);
          // Use luminance (brightness) as alpha
          float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
          if (luminance < 0.2) discard; // Alpha test based on brightness
        #endif
        `
      );
    };
    return mat;
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
    // Use MeshBasicMaterial for stars (Sun) so they are not affected by lights/shadows
    if (body.type === "star") {
      return new THREE.MeshBasicMaterial({
        map: textureMap,
        color: new THREE.Color(body.color).multiplyScalar(sunEmissive),
        toneMapped: false, // Allow HDR values for Bloom
      });
    }

    const mat = new THREE.MeshStandardMaterial({
      map: textureMap,
      color: textureMap ? "#ffffff" : body.color,
      emissive: "#000", // Stars handled above, so this is always black for planets
      emissiveMap: null,
      emissiveIntensity: 0,
      roughness: roughness,
      metalness: metalness,
    });

    // Apply Earth day/night shader (takes priority over ring shadows)
    if (body.id === "earth" && textureNight) {
      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.tNight = { value: textureNight };
        shader.uniforms.uSunPosition = { value: new THREE.Vector3(0, 0, 0) };
        shader.uniforms.uNightLightIntensity = { value: nightLightIntensity };

        // Inject varyings in vertex shader
        shader.vertexShader = `
          varying vec3 vPos;
          varying vec3 vObjectNormal;
          varying vec2 vUv;
          ${shader.vertexShader}
        `.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          vPos = position;
          vObjectNormal = normal;
          vUv = uv;
          `
        );

        // Inject day texture handling in fragment shader
        shader.fragmentShader = `
          uniform sampler2D tNight;
          uniform vec3 uSunPosition;
          uniform float uNightLightIntensity;
          varying vec3 vPos;
          varying vec3 vObjectNormal;
          varying vec2 vUv;
          ${shader.fragmentShader}
        `;

        // Apply night lights to emissive channel
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `
          #include <emissivemap_fragment>
          
          // Calculate lighting for day/night transition
          vec3 lightDir = normalize(uSunPosition - vPos);
          float intensity = dot(normalize(vObjectNormal), lightDir);
          
          // Night lights appear where intensity is low
          float nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity);
          
          vec4 nightColor = texture2D(tNight, vUv);
          
          // Add night lights to emissive
          // Use uNightLightIntensity uniform for dynamic control
          totalEmissiveRadiance += nightColor.rgb * nightFactor * uNightLightIntensity;
          `
        );
      };
    }
    // Apply shaders: ring shadows for ringed planets (if not Earth)
    else if (textureRing && body.ringSystem) {
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
    textureNight,
    textureRing,
    body.id,
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
      // Rotation (synchronized with astronomical time using offset)
      if (body.rotationPeriodHours) {
        const { datetime } = useStore.getState();
        const rotationEpoch = body.rotationEpoch
          ? new Date(body.rotationEpoch)
          : new Date("2000-01-01T12:00:00Z");
        const currentRotation = AstroPhysics.calculateRotationAngle(
          datetime,
          body.rotationPeriodHours,
          body.id === "earth"
            ? earthRotationOffset
            : body.rotationOffsetDegrees || 0,
          rotationEpoch
        );
        rotationRef.current.rotation.y = currentRotation;
      }

      // Shader Uniforms (Analytical Shadows & Day/Night)
      // Update sun position for shaders that need it (Earth day/night, ring shadows)
      if (textureRing || (body.id === "earth" && textureNight)) {
        const sunWorldPos = new THREE.Vector3(0, 0, 0);

        // Update Planet Material shader uniforms
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

          // Update Night Light Intensity
          if (
            body.id === "earth" &&
            planetMaterial.userData.shader.uniforms.uNightLightIntensity
          ) {
            planetMaterial.userData.shader.uniforms.uNightLightIntensity.value =
              nightLightIntensity;
          }

          // Update Cloud Material (if exists)
          if (cloudMaterial && cloudMaterial.userData.shader) {
            cloudMaterial.userData.shader.uniforms.uSunPosition.value.copy(
              sunLocalPos
            );
          }
        }

        // B. Update Ring Material (Planet Shadow on Ring) - only for ringed planets
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
      {/* Axial Tilt Group - Now using Quaternion for accurate orientation */}
      <group quaternion={orientationQuaternion}>
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

          {/* 2. Cloud Layer (Visual - Additive) */}
          {cloudMaterial && (
            <mesh scale={[1.01, 1.01, 1.01]} castShadow={false} receiveShadow>
              <sphereGeometry args={[1, 64, 64]} />
              <primitive object={cloudMaterial} attach="material" />
            </mesh>
          )}

          {/* 2b. Cloud Shadow Caster (Invisible, only casts shadow) */}
          {cloudShadowMaterial && (
            <mesh scale={[1.01, 1.01, 1.01]} castShadow receiveShadow={false}>
              <sphereGeometry args={[1, 64, 64]} />
              <primitive
                object={cloudShadowMaterial}
                attach="customDepthMaterial"
              />
              {/* We need a basic material to make it renderable, but we make it invisible */}
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
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
  earthRotationOffset: number; // Added this prop
  nightLightIntensity: number;
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
  earthRotationOffset,
  nightLightIntensity,
}: PlanetProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const orbitLineRef = useRef<any>(null);
  const progradeRef = useRef<THREE.Group>(null);

  // Calculate orientation quaternion based on IAU pole data
  const orientationQuaternion = useMemo(() => {
    if (body.poleRA !== undefined && body.poleDec !== undefined) {
      // Get pole direction in Ecliptic space
      const poleDir = AstroPhysics.equatorialToEcliptic(
        body.poleRA,
        body.poleDec
      );

      // Default Up is (0, 1, 0) in our scene (Ecliptic North)
      const defaultUp = new THREE.Vector3(0, 1, 0);

      // Create quaternion to rotate Up to Pole Direction
      return new THREE.Quaternion().setFromUnitVectors(defaultUp, poleDir);
    } else {
      // Fallback to simple axial tilt (around Z axis)
      return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, 0, -(body.axialTilt || 0) * (Math.PI / 180))
      );
    }
  }, [body.poleRA, body.poleDec, body.axialTilt]);

  const scaleMode = useStore((state) => state.scaleMode);
  const showOrbits = useStore((state) => state.showOrbits);
  const declutterOrbits = useStore((state) => state.declutterOrbits);
  const focusId = useStore((state) => state.focusId);
  const showProgradeVector = useStore((state) => state.showProgradeVector);

  // Calculate system multipliers once
  const systemMultipliers = useMemo(() => {
    return AstroPhysics.calculateSystemMultipliers(SOLAR_SYSTEM_BODIES);
  }, []);

  const orbitSalience = useMemo(() => {
    if (!declutterOrbits) return 1;

    // In overview, keep the scene clean by default.
    if (!focusId) {
      if (body.type === "planet" || body.type === "dwarf") return 1;
      return 0;
    }

    if (body.id === focusId) return 1;

    const focusBody = BODIES_BY_ID.get(focusId);
    if (!focusBody) return 1;

    // 1) Emphasize direct context: children and siblings.
    if (body.parentId === focusId) return 0.55;
    if (focusBody.parentId && body.parentId === focusBody.parentId) return 0.25;

    // 2) Keep the ancestry chain visible (e.g., Moon -> Earth -> Sun).
    const ancestors = new Set<string>();
    let curParentId = focusBody.parentId ?? null;
    while (curParentId) {
      const parent = BODIES_BY_ID.get(curParentId);
      if (!parent) break;
      ancestors.add(parent.id);
      curParentId = parent.parentId ?? null;
    }
    if (ancestors.has(body.id)) return 0.45;

    // 3) Keep major bodies faintly for global orientation.
    if (body.type === "planet" || body.type === "dwarf") return 0.08;

    return 0.02;
  }, [declutterOrbits, focusId, body.id, body.type, body.parentId]);

  // Orbit points with adaptive resolution
  const orbitPoints = useMemo(() => {
    if (body.type === "star") return null;
    if (declutterOrbits && orbitSalience <= 0) return null;

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
  }, [
    body,
    scaleMode,
    focusId,
    systemMultipliers,
    declutterOrbits,
    orbitSalience,
  ]);

  useFrame((state) => {
    const { camera, size } = state;
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

      opacity *= orbitSalience;

      // Keep the focused orbit legible as a primary cue.
      if (body.id === focusId) {
        opacity = Math.max(opacity, 0.08);
      }

      const material = orbitLineRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms?.opacity) {
        material.uniforms.opacity.value = opacity;
      } else {
        material.opacity = opacity;
      }
    }

    // Prograde (velocity) indicator for the focused body (didactic cue).
    if (progradeRef.current) {
      const isActive =
        showProgradeVector && focusId === body.id && body.type !== "star";
      progradeRef.current.visible = isActive;

      if (isActive) {
        const worldPos = new THREE.Vector3();
        groupRef.current.getWorldPosition(worldPos);

        // Pick a delta that corresponds to ~0.1° of mean anomaly (clamped).
        const meanMotion = Math.max(1e-6, Math.abs(body.orbit?.n ?? 1e-6));
        const dtDays = THREE.MathUtils.clamp(0.1 / meanMotion, 1 / 1440, 60);
        const dtMs = dtDays * 86400000;

        const later = new Date(datetime.getTime() + dtMs);
        const posLater = AstroPhysics.calculateLocalPosition(
          body.orbit,
          later,
          scaleMode,
          multiplier
        );

        const velDir = posLater.sub(pos).normalize();

        const radius =
          scaleMode === "didactic"
            ? AstroPhysics.calculateDidacticRadius(body.radiusKm)
            : body.radiusKm * KM_TO_3D_UNITS;

        // Make the indicator stable across scale modes using screen-space sizing.
        const cam = camera as THREE.PerspectiveCamera;
        const fovVertRad = THREE.MathUtils.degToRad(cam.fov);
        const d = camera.position.distanceTo(worldPos);
        const worldPerPixel =
          (2 * d * Math.tan(fovVertRad / 2)) / Math.max(1, size.height);

        const desiredLengthPx = 70;
        const desiredWidthPx = 6;

        const arrowLengthWorld = THREE.MathUtils.clamp(
          desiredLengthPx * worldPerPixel,
          Math.max(4, radius * 1.2),
          240
        );

        const shaftRadiusWorld = THREE.MathUtils.clamp(
          (desiredWidthPx * worldPerPixel) / 2,
          0.02,
          6
        );

        // Our base shaft radius is ~0.03 world units (see cylinderGeometry args).
        const shaftScale = shaftRadiusWorld / 0.03;

        progradeRef.current.scale.set(shaftScale, arrowLengthWorld, shaftScale);

        // Place the arrow just above the surface along the direction of travel.
        const offset = Math.max(radius * 1.35, shaftRadiusWorld * 4);
        progradeRef.current.position.copy(
          velDir.clone().multiplyScalar(offset)
        );

        // Arrow geometry points along +Y in local space.
        progradeRef.current.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          velDir
        );
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
          lineWidth={body.id === focusId ? 2.5 : 1.5} // Emphasize focused orbit
          transparent
          opacity={0.3 * orbitSalience}
          depthTest={true}
          depthWrite={false}
        />
      )}

      <group ref={groupRef} name={body.id}>
        {showProgradeVector && focusId === body.id && body.type !== "star" && (
          <group ref={progradeRef} renderOrder={2000}>
            <mesh position={[0, 0.35, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.03, 0.03, 0.7, 8]} />
              <meshBasicMaterial
                color="#00f0ff"
                transparent
                opacity={0.9}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh position={[0, 0.85, 0]} raycast={() => null}>
              <coneGeometry args={[0.07, 0.3, 8]} />
              <meshBasicMaterial
                color="#00f0ff"
                transparent
                opacity={0.95}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
          </group>
        )}
        <PlanetVisualWrapper
          body={body}
          roughness={roughness}
          metalness={metalness}
          sunEmissive={sunEmissive}
          ringEmissive={ringEmissive}
          ringShadowIntensity={ringShadowIntensity}
          earthRotationOffset={earthRotationOffset} // Passed down
          nightLightIntensity={nightLightIntensity}
        />

        {/* 
          Moons usually orbit the planet's equatorial plane (which is tilted).
          We apply the planet's axial tilt to the children container so the moons orbit the equator.
          EXCEPTION: Earth's Moon orbits the ecliptic (mostly), not Earth's equator.
        */}
        <group
          quaternion={
            body.id !== "earth" ? orientationQuaternion : new THREE.Quaternion()
          }
        >
          {children}
        </group>
      </group>
    </>
  );
};
