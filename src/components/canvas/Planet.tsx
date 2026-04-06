import { useRef, useMemo, Suspense, useEffect, useState } from "react";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import {
  type CelestialBody,
  AstroPhysics,
  KM_TO_3D_UNITS,
} from "../../lib/astrophysics";
import { useDeferredTexture } from "../../hooks/useDeferredTexture";
import { VISUAL_PRESETS } from "../../config/visualPresets";
import { preloadDeferredTexture } from "../../lib/deferredTextureCache";
import { getOrbitCacheKey, getOrbitSegments } from "../../lib/orbitQuality";
import { useStore } from "../../store";
import { ErrorBoundary } from "../utils/ErrorBoundary";
import { SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { resolveTextureRequest } from "../../lib/textureVariants";
import { TEXTURE_VARIANT_MANIFEST } from "../../lib/textureVariantManifest";
import { PlanetModel } from "./PlanetModel";
import {
  createProceduralSurfaceTexture,
  getSurfaceFillLight,
  shouldRenderDirectSurfaceMap,
} from "../../utils/proceduralSurface";

const BODIES_BY_ID = new Map(SOLAR_SYSTEM_BODIES.map((b) => [b.id, b]));
const PARENT_BY_ID = Object.fromEntries(
  SOLAR_SYSTEM_BODIES.map((body) => [body.id, body.parentId ?? null])
);
const SYSTEM_MULTIPLIERS =
  AstroPhysics.calculateSystemMultipliers(SOLAR_SYSTEM_BODIES);
const ORBIT_POINTS_CACHE = new Map<string, THREE.Vector3[]>();

// import { cloudVertexShader, cloudFragmentShader } from "./shaders/cloudShader";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
} from "./shaders/atmosphereShader";
import type { ResolvedQualityName } from "../../lib/qualityProfile";

import {
  planetShadowVertexPatch,
  planetShadowFragmentPatch,
  planetShadowEmissivePatch,
} from "./shaders/planetShadowShader";
import type { Line2 } from "three-stdlib";

const PROGRADE_ARROW_BASE_WIDTH = 0.68;
const PROGRADE_ARROW_BASE_LENGTH = 1.0;
const PROGRADE_ARROW_BASE_DEPTH = 0.06;

type OrbitLineMaterial = THREE.Material & {
  opacity: number;
  uniforms?: {
    opacity?: { value: number };
  };
};

function createRadialGradientTexture(size: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const center = size / 2;
  const gradient = ctx.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center
  );
  gradient.addColorStop(0.0, "rgba(255, 255, 255, 1.0)");
  gradient.addColorStop(0.12, "rgba(255, 255, 255, 0.85)");
  gradient.addColorStop(0.32, "rgba(255, 255, 255, 0.25)");
  gradient.addColorStop(1.0, "rgba(255, 255, 255, 0.0)");

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createStarburstTexture(size: number, rays: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const center = size / 2;
  const radius = size * 0.48;

  ctx.clearRect(0, 0, size, size);
  ctx.translate(center, center);

  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";

  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const w = i % 2 === 0 ? 5 : 2.5;
    const inner = radius * 0.2;
    const outer = radius;

    const grad = ctx.createLinearGradient(
      Math.cos(a) * inner,
      Math.sin(a) * inner,
      Math.cos(a) * outer,
      Math.sin(a) * outer
    );
    grad.addColorStop(0.0, "rgba(255,255,255,0.0)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.35)");
    grad.addColorStop(0.55, "rgba(255,255,255,0.15)");
    grad.addColorStop(1.0, "rgba(255,255,255,0.0)");

    ctx.strokeStyle = grad;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
    ctx.stroke();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const SunScreenFlare = ({
  targetRef,
  radiusKm,
  color,
}: {
  targetRef: { current: THREE.Object3D | null };
  radiusKm: number;
  color: string;
}) => {
  const scene = useThree((s) => s.scene);
  const scaleMode = useStore((state) => state.scaleMode);

  const rootRef = useRef<THREE.Group>(null);

  const coreMatRef = useRef<THREE.SpriteMaterial>(null);
  const haloMatRef = useRef<THREE.SpriteMaterial>(null);
  const raysMatRef = useRef<THREE.SpriteMaterial>(null);

  const tmpWorld = useMemo(() => new THREE.Vector3(), []);
  const tmpNdc = useMemo(() => new THREE.Vector3(), []);
  const tmpTint = useMemo(() => new THREE.Color(), []);
  const tmpTintCore = useMemo(() => new THREE.Color(), []);
  const tmpTintHalo = useMemo(() => new THREE.Color(), []);
  const warmColor = useMemo(() => new THREE.Color("#FFD88A"), []);

  const textures = useMemo(() => {
    const radial = createRadialGradientTexture(512);
    const rays = createStarburstTexture(512, 14);
    if (!radial || !rays) return null;
    return { radial, rays };
  }, []);

  useEffect(() => {
    return () => {
      textures?.radial.dispose();
      textures?.rays.dispose();
    };
  }, [textures]);

  useFrame((state) => {
    if (!textures) return;
    if (!rootRef.current) return;
    if (!targetRef.current) return;

    if (!(state.camera instanceof THREE.PerspectiveCamera)) return;
    const cam = state.camera;

    targetRef.current.getWorldPosition(tmpWorld);

    tmpNdc.copy(tmpWorld).project(cam);
    const onScreen =
      tmpNdc.z > -1 &&
      tmpNdc.z < 1 &&
      tmpNdc.x > -1.05 &&
      tmpNdc.x < 1.05 &&
      tmpNdc.y > -1.05 &&
      tmpNdc.y < 1.05;

    const distToCamera = cam.position.distanceTo(tmpWorld);
    const fovVertRad = THREE.MathUtils.degToRad(cam.fov);
    const worldPerPixelAtSun =
      (2 * distToCamera * Math.tan(fovVertRad / 2)) /
      Math.max(1, state.size.height);

    const radiusWorld =
      scaleMode === "didactic"
        ? AstroPhysics.calculateDidacticRadius(radiusKm)
        : radiusKm * KM_TO_3D_UNITS;

    const radiusPx = radiusWorld / Math.max(1e-9, worldPerPixelAtSun);

    // Fade in when the Sun is only a handful of pixels.
    const appearAtPx = 12;
    const fullAtPx = 3;
    const t = THREE.MathUtils.clamp(
      (appearAtPx - radiusPx) / (appearAtPx - fullAtPx),
      0,
      1
    );
    const strength = t * t * (3 - 2 * t);

    const visible = onScreen && strength > 0.001;
    rootRef.current.visible = visible;
    if (!visible) return;

    rootRef.current.position.copy(tmpWorld);

    tmpTint.set(color).lerp(warmColor, 0.55);
    tmpTintCore.copy(tmpTint).multiplyScalar(8.0);
    tmpTintHalo.copy(tmpTint).multiplyScalar(2.6);

    const corePx = 8;
    const haloPx = 44;
    const raysPx = 64;

    const coreWorld = corePx * worldPerPixelAtSun;
    const haloWorld = haloPx * worldPerPixelAtSun;
    const raysWorld = raysPx * worldPerPixelAtSun;

    const coreMat = coreMatRef.current;
    const haloMat = haloMatRef.current;
    const raysMat = raysMatRef.current;

    if (coreMat) {
      coreMat.color.copy(tmpTintCore);
      coreMat.opacity = strength * 0.9;
    }
    if (haloMat) {
      haloMat.color.copy(tmpTintHalo);
      haloMat.opacity = strength * 0.58;
    }
    if (raysMat) {
      raysMat.color.copy(tmpTintHalo);
      raysMat.opacity = strength * 0.12;
      raysMat.rotation = state.clock.getElapsedTime() * 0.04;
    }

    const coreSprite = rootRef.current.children[0] as THREE.Sprite | undefined;
    const haloSprite = rootRef.current.children[1] as THREE.Sprite | undefined;
    const raysSprite = rootRef.current.children[2] as THREE.Sprite | undefined;
    coreSprite?.scale.set(coreWorld, coreWorld, 1);
    haloSprite?.scale.set(haloWorld, haloWorld, 1);
    raysSprite?.scale.set(raysWorld, raysWorld, 1);
  });

  if (!textures) return null;

  return createPortal(
    <group ref={rootRef} frustumCulled={false} renderOrder={5000}>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5001}>
        <spriteMaterial
          ref={coreMatRef}
          map={textures.radial}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5002}>
        <spriteMaterial
          ref={haloMatRef}
          map={textures.radial}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
      <sprite raycast={() => null} frustumCulled={false} renderOrder={5003}>
        <spriteMaterial
          ref={raysMatRef}
          map={textures.rays}
          transparent
          opacity={0}
          depthTest={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </sprite>
    </group>,
    scene
  );
};

const PROGRADE_ARROW_SHAPE = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.18, 0.0);
  s.lineTo(-0.18, 0.62);
  s.lineTo(-0.34, 0.62);
  s.lineTo(0.0, 1.0);
  s.lineTo(0.34, 0.62);
  s.lineTo(0.18, 0.62);
  s.lineTo(0.18, 0.0);
  s.lineTo(-0.18, 0.0);
  return s;
})();

const PROGRADE_ARROW_EXTRUDE_SETTINGS: THREE.ExtrudeGeometryOptions = {
  depth: PROGRADE_ARROW_BASE_DEPTH,
  bevelEnabled: true,
  bevelThickness: 0.012,
  bevelSize: 0.012,
  bevelSegments: 2,
  curveSegments: 6,
  steps: 1,
};

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
  qualityProfileName: ResolvedQualityName;
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
  qualityProfileName,
  assetPriority,
  baseTextureSalience,
}: {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
  earthRotationOffset: number;
  nightLightIntensity: number;
  qualityProfileName: ResolvedQualityName;
  assetPriority: number;
  baseTextureSalience: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const [screenSalience, setScreenSalience] = useState(baseTextureSalience);
  const screenSalienceRef = useRef(baseTextureSalience);
  const directSurfaceMapEnabled =
    Boolean(body.textures?.map) && shouldRenderDirectSurfaceMap(body);
  const mapSalience = Math.max(baseTextureSalience, screenSalience);
  const shouldPinMap =
    assetPriority <= 1 || body.id === "sun" || focusId === body.id;
  const shouldLoadMap =
    body.id === "sun" || assetPriority <= 2 || mapSalience >= 0.35;
  const shouldLoadSecondary =
    assetPriority <= 1 || focusId === body.id || mapSalience >= 0.78;

  const mapRequest = useMemo(() => {
    if (!directSurfaceMapEnabled) {
      return null;
    }

    return resolveTextureRequest(
      body,
      "map",
      qualityProfileName,
      mapSalience,
      TEXTURE_VARIANT_MANIFEST
    );
  }, [body, directSurfaceMapEnabled, mapSalience, qualityProfileName]);

  const ringRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "ring",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const cloudRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "clouds",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const nightRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "night",
        qualityProfileName,
        mapSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, mapSalience, qualityProfileName]
  );

  const ringTextureLoaded = useDeferredTexture(ringRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });
  const cloudTextureLoaded = useDeferredTexture(cloudRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });
  const bodyTextureLoaded = useDeferredTexture(mapRequest?.selectedPath, {
    enabled: shouldLoadMap,
    pin: shouldPinMap,
  });
  const nightTextureLoaded = useDeferredTexture(nightRequest.selectedPath, {
    enabled: shouldLoadSecondary,
    pin: shouldPinMap,
  });

  useEffect(() => {
    if (assetPriority !== 1 || !mapRequest?.selectedPath) {
      return;
    }

    void preloadDeferredTexture(mapRequest.selectedPath);
  }, [assetPriority, mapRequest?.selectedPath]);

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

  const textureRing = ringTextureLoaded.texture ?? undefined;
  const textureClouds = cloudTextureLoaded.texture ?? undefined;
  const textureMap = directSurfaceMapEnabled
    ? (bodyTextureLoaded.texture ?? undefined)
    : undefined;
  const textureNight = nightTextureLoaded.texture ?? undefined;
  const proceduralSurfaceMap = useMemo(() => {
    if (body.type === "star" || textureMap) return null;
    return createProceduralSurfaceTexture(body);
  }, [body, textureMap]);
  const surfaceFillLight = useMemo(() => {
    if (body.type === "star" || textureMap) return null;
    return getSurfaceFillLight(body);
  }, [body, textureMap]);
  const surfaceMap = textureMap ?? proceduralSurfaceMap ?? undefined;

  useEffect(() => {
    return () => {
      proceduralSurfaceMap?.dispose();
    };
  }, [proceduralSurfaceMap]);

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

  useEffect(() => {
    return () => {
      cloudShadowMaterial?.dispose();
    };
  }, [cloudShadowMaterial]);

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
      const starParams: THREE.MeshBasicMaterialParameters = {
        color: new THREE.Color(body.color).multiplyScalar(sunEmissive),
        toneMapped: false, // Allow HDR values for Bloom
      };

      if (surfaceMap) {
        starParams.map = surfaceMap;
      }

      return new THREE.MeshBasicMaterial(starParams);
    }

    const planetParams: THREE.MeshStandardMaterialParameters = {
      color: surfaceMap ? "#ffffff" : body.color,
      emissive: surfaceFillLight?.color ?? "#000",
      emissiveMap: null,
      emissiveIntensity: surfaceFillLight?.intensity ?? 0,
      roughness: roughness,
      metalness: metalness,
    };

    if (surfaceMap) {
      planetParams.map = surfaceMap;
    }

    const mat = new THREE.MeshStandardMaterial(planetParams);

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
    surfaceMap,
    textureNight,
    textureRing,
    body.id,
    body.color,
    body.type,
    body.ringSystem,
    roughness,
    metalness,
    sunEmissive,
    nightLightIntensity,
    surfaceFillLight,
  ]);

  useEffect(() => {
    return () => {
      planetMaterial?.dispose();
    };
  }, [planetMaterial]);

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

  useEffect(() => {
    return () => {
      ringMaterial?.dispose();
    };
  }, [ringMaterial]);

  const ringGeometry = useMemo(() => {
    if (!body.ringSystem) return null;

    const innerRadius = body.ringSystem.innerRadius;
    const outerRadius = body.ringSystem.outerRadius;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);
    const positions = geometry.attributes.position;
    const uvs = geometry.attributes.uv;
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      const radius = Math.sqrt(vertex.x * vertex.x + vertex.y * vertex.y);
      const u = (radius - innerRadius) / (outerRadius - innerRadius);
      uvs.setXY(i, u, 0.5);
    }

    return geometry;
  }, [body.ringSystem]);

  useEffect(() => {
    return () => {
      ringGeometry?.dispose();
    };
  }, [ringGeometry]);

  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ camera, size }) => {
    if (!groupRef.current) return;

    // 1. Scaling
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(body.radiusKm);
    } else {
      s = body.radiusKm * KM_TO_3D_UNITS;
    }
    const [sx, sy, sz] = body.shapeScale ?? [1, 1, 1];
    groupRef.current.scale.set(s * sx, s * sy, s * sz);

    if (camera instanceof THREE.PerspectiveCamera) {
      const worldPos = new THREE.Vector3();
      groupRef.current.getWorldPosition(worldPos);
      const distance = camera.position.distanceTo(worldPos);
      const fovVertRad = THREE.MathUtils.degToRad(camera.fov);
      const worldPerPixel =
        (2 * distance * Math.tan(fovVertRad / 2)) / Math.max(1, size.height);
      const visualRadius = s * Math.max(sx, sy, sz);
      const radiusPx = visualRadius / Math.max(worldPerPixel, 1e-6);

      let nextScreenSalience = 0.12;
      if (radiusPx >= 140) nextScreenSalience = 1;
      else if (radiusPx >= 84) nextScreenSalience = 0.82;
      else if (radiusPx >= 42) nextScreenSalience = 0.62;
      else if (radiusPx >= 18) nextScreenSalience = 0.38;

      if (Math.abs(nextScreenSalience - screenSalienceRef.current) > 0.04) {
        screenSalienceRef.current = nextScreenSalience;
        setScreenSalience(nextScreenSalience);
      }
    }

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
          {textureRing && ringMaterial && ringGeometry && (
            <mesh
              ref={ringRef}
              rotation={[-Math.PI / 2, 0, 0]}
              renderOrder={1000}
              // receiveShadow removed to prevent double shadows (we use analytical shadows)
              // castShadow removed - using analytical shadows
            >
              <primitive object={ringGeometry} />
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
  qualityProfileName: ResolvedQualityName;
  assetPriority: number;
  baseTextureSalience: number;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const scaleMode = useStore((state) => state.scaleMode);
  const selectId = useStore((state) => state.selectId);
  const fallbackSurfaceMap = useMemo(() => {
    if (props.body.type === "star") return null;
    return createProceduralSurfaceTexture(props.body, 256, 128);
  }, [props.body]);

  useEffect(() => {
    return () => {
      fallbackSurfaceMap?.dispose();
    };
  }, [fallbackSurfaceMap]);

  useFrame(() => {
    if (!meshRef.current) return;
    let s = 1;
    if (scaleMode === "didactic") {
      s = AstroPhysics.calculateDidacticRadius(props.body.radiusKm);
    } else {
      s = props.body.radiusKm * KM_TO_3D_UNITS;
    }
    const [sx, sy, sz] = props.body.shapeScale ?? [1, 1, 1];
    meshRef.current.scale.set(s * sx, s * sy, s * sz);
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
      <meshStandardMaterial
        {...(fallbackSurfaceMap
          ? { map: fallbackSurfaceMap, color: "#ffffff" }
          : { color: props.body.color })}
      />
    </mesh>
  );

  // Check for 3D Model first
  if (props.body.model) {
    const shouldLoadModel =
      props.assetPriority <= 1 || props.baseTextureSalience >= 0.82;

    if (!shouldLoadModel) {
      return fallback;
    }

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
            qualityProfileName={props.qualityProfileName}
            assetPriority={props.assetPriority}
            baseTextureSalience={props.baseTextureSalience}
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
  qualityProfileName,
}: PlanetProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const orbitLineRef = useRef<Line2 | null>(null);
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
  const visualPreset = useStore((state) => state.visualPreset);
  const vectorIntensity = VISUAL_PRESETS[visualPreset]?.vectorIntensity ?? 1;

  const progradeColors = useMemo(() => {
    const base = new THREE.Color(body.color);
    const haloBias = new THREE.Color("#00f0ff");

    const main = base.clone().multiplyScalar(3.8 * vectorIntensity);
    const halo = base
      .clone()
      .lerp(haloBias, 0.35)
      .multiplyScalar(1.6 * vectorIntensity);

    return { main, halo };
  }, [body.color, vectorIntensity]);

  const focusAncestorIds = useMemo(() => {
    if (!focusId) return new Set<string>();

    const ancestors = new Set<string>();
    let curParentId = PARENT_BY_ID[focusId] ?? null;

    while (curParentId) {
      if (ancestors.has(curParentId)) break;
      ancestors.add(curParentId);
      curParentId = PARENT_BY_ID[curParentId] ?? null;
    }

    return ancestors;
  }, [focusId]);

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
    if (focusAncestorIds.has(body.id)) return 0.45;

    // 3) Keep major bodies faintly for global orientation.
    if (body.type === "planet" || body.type === "dwarf") return 0.08;

    return 0.02;
  }, [
    body.id,
    body.parentId,
    body.type,
    declutterOrbits,
    focusAncestorIds,
    focusId,
  ]);

  const assetPriority = useMemo(() => {
    if (body.id === "sun") return 0;

    if (!focusId) {
      return body.type === "planet" || body.type === "dwarf" ? 1 : 2;
    }

    if (body.id === focusId) return 0;

    const focusBody = BODIES_BY_ID.get(focusId);
    if (!focusBody) return 1;

    if (body.parentId === focusId) return 1;
    if (focusBody.parentId && body.parentId === focusBody.parentId) return 1;
    if (focusAncestorIds.has(body.id)) return 1;
    if (body.type === "planet" || body.type === "dwarf") return 2;

    return 3;
  }, [body.id, body.parentId, body.type, focusAncestorIds, focusId]);

  const baseTextureSalience = useMemo(() => {
    if (body.id === "sun") return 1;
    if (assetPriority === 0) return 1;
    if (assetPriority === 1) return 0.72;
    if (assetPriority === 2) return 0.38;
    return 0.14;
  }, [assetPriority, body.id]);

  // Orbit points with adaptive resolution
  const orbitPoints = useMemo(() => {
    if (body.type === "star") return null;
    if (declutterOrbits && orbitSalience <= 0) return null;

    const segments = getOrbitSegments({
      bodyId: body.id,
      focusId,
      orbitProfile: qualityProfileName,
    });

    // Get system multiplier for this body (default to 1)
    const multiplier = body.parentId
      ? SYSTEM_MULTIPLIERS[body.parentId] || 1
      : 1;
    const cacheKey = getOrbitCacheKey({
      bodyId: body.id,
      focusId,
      orbitProfile: qualityProfileName,
      scaleMode,
      multiplier,
    });

    const cachedPoints = ORBIT_POINTS_CACHE.get(cacheKey);
    if (cachedPoints) {
      return cachedPoints;
    }

    const pts = AstroPhysics.getRelativeOrbitPoints(
      body.orbit,
      segments,
      scaleMode,
      multiplier
    );

    ORBIT_POINTS_CACHE.set(cacheKey, pts);
    return pts;
  }, [
    body,
    declutterOrbits,
    orbitSalience,
    focusId,
    qualityProfileName,
    scaleMode,
  ]);

  useFrame((state) => {
    const { camera, size } = state;
    if (!groupRef.current) return;
    const { datetime } = useStore.getState();

    // 1. Update Group Position (Orbital motion)
    const multiplier = body.parentId
      ? SYSTEM_MULTIPLIERS[body.parentId] || 1
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

      const material = orbitLineRef.current.material as OrbitLineMaterial;
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

        const desiredLengthPx = 72;
        const desiredWidthPx = 10;

        // One algorithm for both modes: size stays proportional to the body's visual radius,
        // while remaining readable at typical zoom levels.
        const targetLengthWorld = desiredLengthPx * worldPerPixel;
        const minLengthWorld = radius * 1.25;
        const maxLengthWorld = radius * 4.25;
        const arrowLengthWorld = THREE.MathUtils.clamp(
          targetLengthWorld,
          minLengthWorld,
          maxLengthWorld
        );

        const targetWidthWorld = desiredWidthPx * worldPerPixel;
        const minWidthWorld = radius * 0.32;
        const maxWidthWorld = radius * 0.85;
        const arrowWidthWorld = THREE.MathUtils.clamp(
          targetWidthWorld,
          minWidthWorld,
          maxWidthWorld
        );

        const thicknessWorld = THREE.MathUtils.clamp(
          arrowWidthWorld * 0.18,
          radius * 0.08,
          radius * 0.22
        );

        const scaleX = arrowWidthWorld / PROGRADE_ARROW_BASE_WIDTH;
        const scaleY = arrowLengthWorld / PROGRADE_ARROW_BASE_LENGTH;
        const scaleZ = thicknessWorld / PROGRADE_ARROW_BASE_DEPTH;
        progradeRef.current.scale.set(scaleX, scaleY, scaleZ);

        // Place the arrow just above the surface along the direction of travel.
        const offset = radius * 1.22 + thicknessWorld * 0.7;
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
          raycast={() => null}
        />
      )}

      <group ref={groupRef} name={body.id}>
        {body.type === "star" && (
          <SunScreenFlare
            targetRef={groupRef}
            radiusKm={body.radiusKm}
            color={body.color}
          />
        )}
        {showProgradeVector && focusId === body.id && body.type !== "star" && (
          <group ref={progradeRef} renderOrder={2000}>
            <mesh raycast={() => null}>
              <extrudeGeometry
                args={[PROGRADE_ARROW_SHAPE, PROGRADE_ARROW_EXTRUDE_SETTINGS]}
              />
              <meshBasicMaterial
                color={progradeColors.main}
                transparent
                opacity={0.95}
                depthWrite={false}
                toneMapped={false}
              />
            </mesh>
            <mesh scale={[1.12, 1.03, 1.55]} raycast={() => null}>
              <extrudeGeometry
                args={[PROGRADE_ARROW_SHAPE, PROGRADE_ARROW_EXTRUDE_SETTINGS]}
              />
              <meshBasicMaterial
                color={progradeColors.halo}
                transparent
                opacity={0.24}
                blending={THREE.AdditiveBlending}
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
          qualityProfileName={qualityProfileName}
          assetPriority={assetPriority}
          baseTextureSalience={baseTextureSalience}
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
