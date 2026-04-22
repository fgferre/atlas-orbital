import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { type CelestialBody } from "../../../lib/astrophysics";
import {
  atmosphereVertexShader,
  atmosphereFragmentShader,
  buildAtmosphereUniforms,
} from "../shaders/atmosphereShader";
import {
  planetShadowVertexPatch,
  planetShadowFragmentPatch,
  planetShadowEmissivePatch,
} from "../shaders/planetShadowShader";
import type { ResolvedSunRenderMode } from "../../../lib/sunRenderMode";

interface UsePlanetMaterialsParams {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringEmissive: number;
  ringShadowIntensity: number;
  nightLightIntensity: number;
  sunRenderMode: ResolvedSunRenderMode;
  textureRing: THREE.Texture | undefined;
  textureClouds: THREE.Texture | undefined;
  textureNight: THREE.Texture | undefined;
  textureNormal: THREE.Texture | undefined;
  textureRoughness: THREE.Texture | undefined;
  surfaceMap: THREE.Texture | undefined;
  surfaceFillLight: { color: string; intensity: number } | null;
}

export function usePlanetMaterials({
  body,
  roughness,
  metalness,
  sunEmissive,
  ringEmissive,
  ringShadowIntensity,
  nightLightIntensity,
  sunRenderMode,
  textureRing,
  textureClouds,
  textureNight,
  textureNormal,
  textureRoughness,
  surfaceMap,
  surfaceFillLight,
}: UsePlanetMaterialsParams) {
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
      // Sun is always at world origin — pass as world-space uniform, no CPU transform needed.
      shader.uniforms.uSunPositionWorld = { value: new THREE.Vector3(0, 0, 0) };
      shader.uniforms.uShadowIntensity = { value: ringShadowIntensity };

      // Inject world-space varyings into vertex shader
      shader.vertexShader = `
        varying vec3 vCloudWorldPos;
        varying vec3 vCloudWorldNormal;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `
        #include <begin_vertex>
        vCloudWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        vCloudWorldNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);
        `
      );

      // Inject world-space declarations into fragment shader
      shader.fragmentShader = `
        uniform vec3 uSunPositionWorld;
        varying vec3 vCloudWorldPos;
        varying vec3 vCloudWorldNormal;
        ${shader.fragmentShader}
      `;

      // Modulate cloud opacity/color based on world-space day/night
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        vec3 cloudLightDir = normalize(uSunPositionWorld - vCloudWorldPos);
        float cloudIntensity = dot(vCloudWorldNormal, cloudLightDir);
        float cloudNightFactor = 1.0 - smoothstep(-0.2, 0.2, cloudIntensity);
        // Darken clouds on the night side
        diffuseColor.rgb *= mix(1.0, 0.05, cloudNightFactor);
        `
      );
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

  // Atmosphere Shader — Rayleigh+Mie multi-scatter port (θ.5b-d).
  // Ports Gaia `atm.{fragment,vertex}.glsl`. Material is instantiated
  // only for bodies with an `atmosphereScattering` config on their
  // `CelestialBody` record; per-frame dynamic fields (v3CameraPos,
  // v3LightPos, v3PlanetPos, fCameraHeight) are overwritten every
  // frame by `Planet.tsx`'s useFrame.
  const atmosphereMaterial = useMemo(() => {
    if (!body.atmosphereScattering) return null;
    return new THREE.ShaderMaterial({
      uniforms: buildAtmosphereUniforms(body.atmosphereScattering),
      vertexShader: atmosphereVertexShader,
      fragmentShader: atmosphereFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide, // Render on the inside of a slightly larger sphere
      depthWrite: false,
    });
  }, [body.atmosphereScattering]);

  useEffect(() => {
    return () => {
      atmosphereMaterial?.dispose();
    };
  }, [atmosphereMaterial]);

  // Analytical Ring Shadow Logic & Earth Night Lights
  const planetMaterial = useMemo(() => {
    // Use MeshBasicMaterial for stars (Sun) so they are not affected by lights/shadows
    if (body.type === "star") {
      const baseColor = new THREE.Color(body.color).multiplyScalar(sunEmissive);

      if (sunRenderMode === "procedural") {
        return new THREE.MeshBasicMaterial({
          color: baseColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
      }

      const starParams: THREE.MeshBasicMaterialParameters = {
        color: baseColor,
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

    if (textureNormal) {
      planetParams.normalMap = textureNormal;
    }

    if (textureRoughness) {
      planetParams.roughnessMap = textureRoughness;
    }

    const mat = new THREE.MeshStandardMaterial(planetParams);

    // Apply Earth day/night shader (takes priority over ring shadows)
    if (body.id === "earth" && textureNight) {
      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.tNight = { value: textureNight };
        // Sun is always at world origin in this scene — no CPU transform needed.
        shader.uniforms.uSunPositionWorld = {
          value: new THREE.Vector3(0, 0, 0),
        };
        shader.uniforms.uNightLightIntensity = { value: nightLightIntensity };

        // Inject varyings in vertex shader — world-space position and normal
        shader.vertexShader = `
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying vec2 vUv;
          ${shader.vertexShader}
        `.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          // Transform to world space so lighting is frame-independent
          vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
          // Use inverse-transpose of modelMatrix for correct normal transform
          vWorldNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);
          vUv = uv;
          `
        );

        // Inject day texture handling in fragment shader
        shader.fragmentShader = `
          uniform sampler2D tNight;
          uniform vec3 uSunPositionWorld;
          uniform float uNightLightIntensity;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying vec2 vUv;
          ${shader.fragmentShader}
        `;

        // Apply night lights to emissive channel
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `
          #include <emissivemap_fragment>

          // Compute lighting in world space — both vectors are now in the same frame.
          // Sun is at world origin; direction from fragment to Sun:
          vec3 lightDir = normalize(uSunPositionWorld - vWorldPos);
          float intensity = dot(vWorldNormal, lightDir);

          // Night lights appear where intensity is low (terminator transition)
          float nightFactor = 1.0 - smoothstep(-0.2, 0.2, intensity);

          vec4 nightColor = texture2D(tNight, vUv);

          // Add night lights to emissive
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
    textureNormal,
    textureRoughness,
    textureRing,
    body.id,
    body.color,
    body.type,
    body.ringSystem,
    roughness,
    metalness,
    sunRenderMode,
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

  return useMemo(
    () => ({
      cloudMaterial,
      cloudShadowMaterial,
      atmosphereMaterial,
      planetMaterial,
      ringMaterial,
      ringGeometry,
    }),
    [
      cloudMaterial,
      cloudShadowMaterial,
      atmosphereMaterial,
      planetMaterial,
      ringMaterial,
      ringGeometry,
    ]
  );
}
