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
import {
  ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY,
  ECLIPSE_FRAGMENT_HELPERS,
  ECLIPSE_FRAGMENT_OUTPUT_PATCH,
  ECLIPSE_FRAGMENT_UNIFORMS,
  ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN,
  ECLIPSE_VERTEX_WORLD_VARYINGS_DECL,
} from "../shaders/eclipseShaderPatch";
import type { ResolvedSunRenderMode } from "../../../lib/sunRenderMode";

/**
 * T3.4 — shared luma threshold between the visual cloud material and
 * the cloud shadow depth material. Cloud pixels below this Rec.709
 * luminance value are skipped for shadow casting and effectively
 * invisible in the final composite (T3.6 multiplies `texColor.rgb *
 * cloudBrightness`, so low-rgb pixels barely contribute post-COLOR-
 * blend). Keeping the threshold identical on both sides prevents
 * shadow silhouette from diverging from the visible cloud mask.
 */
const CLOUD_SHADOW_LUMA_CUTOFF = 0.2;

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
  // Cloud Material — T3.6 Gaia-fidelity pass.
  // Blending: matches Gaia `CloudComponent.java:116` (BlendMode.COLOR
  // = `GL_ONE, GL_ONE_MINUS_SRC_COLOR`). Replaces the pre-T3.6
  // `THREE.AdditiveBlending` (`GL_ONE, GL_ONE`) which over-brightened
  // the terminator because even dimmed cloud values added to the
  // background unconditionally. `OneMinusSrcColorFactor` masks the
  // background by (1 − cloudColor), so dim clouds barely disturb the
  // night side.
  // Terminator: matches Gaia `cloud.fragment.glsl:144,165` —
  // `linstep(-0.25, 0.12, -NL)` (asymmetric) with 0.03 night floor.
  // Pinned by `cloudTerminatorMath.{ts,test.ts}` (8 tests).
  const cloudMaterial = useMemo(() => {
    if (!textureClouds) return null;
    const mat = new THREE.MeshStandardMaterial({
      map: textureClouds,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendEquation: THREE.AddEquation,
      side: THREE.DoubleSide,
      depthWrite: false,
      roughness: 1.0,
      metalness: 0.0,
    });

    // T3.3 cloud-layer eclipse port (2026-04-22 codex audit drift
    // #5 fix). Gaia includes `eclipses.glsl` in the cloud shader
    // (`cloud.fragment.glsl:65`) and applies `eclipseBlend` at
    // lines 170-172, so a solar eclipse darkens BOTH the Earth
    // surface AND the clouds above it. Atlas previously patched
    // eclipse only into the planet material, so during a solar
    // eclipse the Earth surface would darken but clouds stayed
    // fully lit — a visible layered artefact.
    const cloudEclipseEnabled = !!body.eclipsingBodyId;
    mat.onBeforeCompile = (shader) => {
      mat.userData.shader = shader;
      // Sun is always at world origin — pass as world-space uniform, no CPU transform needed.
      shader.uniforms.uSunPositionWorld = { value: new THREE.Vector3(0, 0, 0) };
      // T5.5b (2026-04-24 hygiene sweep) — removed dead
      // `shader.uniforms.uShadowIntensity = { value: ringShadowIntensity }`
      // write. The cloud fragment shader never declared or sampled
      // the uniform (unlike the ring material at L635 which actually
      // uses it via `planetShadowShader.ts:37,54`), so the CPU slot
      // assignment was writing to a uniform Three.js's WebGLUniforms
      // map never allocated — zero visible effect, tiny compile
      // overhead. If a future port needs cloud-shadow intensity
      // modulation, re-add the write AND inject a matching
      // `uniform float uShadowIntensity;` + a read site in the cloud
      // fragment shader (see L645 for the ring-material pattern).
      if (cloudEclipseEnabled) {
        shader.uniforms.uEclipsingBodyPos = {
          value: new THREE.Vector3(0, 0, 0),
        };
        shader.uniforms.uEclipsingBodyRadius = { value: 0 };
        shader.uniforms.uEclipsingVrScale = { value: 1 };
        shader.uniforms.uEclipsingActive = { value: 0 };
      }

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

      // Inject world-space declarations + linstep helper into fragment
      // shader. `linstep` mirrors Gaia `math.glsl:58-61` — same helper
      // is inlined in the planet-material patch for T3.5 night-lights,
      // but onBeforeCompile patches are per-material, so we inject
      // here too rather than cross-reference.
      //
      // Eclipse branch: reuse the shared `ECLIPSE_FRAGMENT_HELPERS`
      // + `ECLIPSE_FRAGMENT_OUTPUT_PATCH` but the helpers hardcode
      // varying names `vWorldPos` / `vWorldNormal` (planet convention).
      // The cloud shader uses `vCloudWorldPos` / `vCloudWorldNormal`,
      // so we alias via `#define` before the helper block — lets us
      // reuse the helper GLSL verbatim without string-munging.
      shader.fragmentShader = `
        uniform vec3 uSunPositionWorld;
        varying vec3 vCloudWorldPos;
        varying vec3 vCloudWorldNormal;

        float linstep(float edge0, float edge1, float x) {
            float d = edge1 - edge0;
            return d != 0.0 ? clamp((x - edge0) / d, 0.0, 1.0) : 0.0;
        }

        ${
          cloudEclipseEnabled
            ? `
        #define vWorldPos vCloudWorldPos
        #define vWorldNormal vCloudWorldNormal
        ${ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY}
        ${ECLIPSE_FRAGMENT_HELPERS}
        `
            : ""
        }

        ${shader.fragmentShader}
      `;

      // Modulate cloud brightness based on world-space day/night.
      // T3.6 port of Gaia `cloud.fragment.glsl:144,165`:
      //   dayFactor = 1 - linstep(-0.25, 0.12, -NL);
      //   brightness = clamp(dayFactor, 0.03, 1.0);
      //   cloudColor = cloud.rgb * brightness;
      // Applied via multiplication onto diffuseColor.rgb (the MSM
      // chunk that later drives the fragment output).
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `
        #include <color_fragment>
        vec3 cloudLightDir = normalize(uSunPositionWorld - vCloudWorldPos);
        float cloudIntensity = dot(vCloudWorldNormal, cloudLightDir);
        float cloudDayFactor = 1.0 - linstep(-0.25, 0.12, -cloudIntensity);
        float cloudBrightness = clamp(cloudDayFactor, 0.03, 1.0);
        diffuseColor.rgb *= cloudBrightness;
        `
      );

      // T3.3 cloud-layer eclipse — inject the same output patch
      // planet materials use; the `#define` aliases above let the
      // shared helpers reference `vCloudWorldPos` / `vCloudWorldNormal`
      // transparently. Matches Gaia `cloud.fragment.glsl:170-172`:
      //   fragColor.rgb = eclipseBlend(fragColor.rgb, diffractionTint, eclshdw);
      if (cloudEclipseEnabled) {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <output_fragment>",
          `
          ${ECLIPSE_FRAGMENT_OUTPUT_PATCH}
          #include <output_fragment>
          `
        );
      }
    };

    return mat;
    // T5.5b — `ringShadowIntensity` dep removed alongside the dead
    // uniform write above. Keeping it would force the cloud material
    // to rebuild on every ring-shadow-intensity change even though
    // the material no longer observes that value.
  }, [textureClouds, body.eclipsingBodyId]);

  // Shadow Caster Material (Custom Depth Material) — T3.4.
  // Used as the cloud mesh's `customDepthMaterial` during Three.js's
  // shadow pass, so the visible cloud mesh itself casts shadows and
  // we no longer need a separate invisible shadow-caster geometry
  // (removed in T3.4 — see Planet.tsx cloud block).
  //
  // Luminance weights updated NTSC → Rec.709 (0.2126, 0.7152, 0.0722)
  // to match Gaia `/tmp/gaiasky/assets/shader/lib/luma.glsl:3-4`. Pre-
  // T3.4 used the legacy BT.601 weights (0.299, 0.587, 0.114), which
  // over-weighted red in the cloud-shadow silhouette — a visible
  // drift from Gaia parity even though the luminance range is similar.
  const cloudShadowMaterial = useMemo(() => {
    if (!textureClouds) return null;

    // We use MeshDepthMaterial for the shadow map
    const mat = new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking,
      map: textureClouds, // Use the cloud texture
      alphaTest: CLOUD_SHADOW_LUMA_CUTOFF, // Cutoff for shadows (shared w/ visual)
    });

    // Custom shader to use Rec.709 luminance (matching Gaia luma.glsl)
    // as alpha-test source. Cloud pixels below CLOUD_SHADOW_LUMA_CUTOFF
    // discard (no shadow); above, full-alpha-through to depth write.
    // Silhouette alignment contract: the visual cloud material's
    // T3.6 `cloudBrightness` modulation multiplies RGB (not alpha),
    // so the effective "visible cloud area" is approximately where
    // `luma(texColor.rgb) >= CLOUD_SHADOW_LUMA_CUTOFF`. Shadow pass
    // uses the same threshold on the same luma definition → silhouette
    // matches the visual within ~1 texel (hard alphaTest vs smooth
    // RGB modulation).
    //
    // We intentionally do NOT prepend `uniform sampler2D map;` or
    // `varying vec2 vUv;` here — Three.js's `USE_MAP` preprocessor
    // flag already emits those declarations (`ShaderChunk.map_pars_fragment`).
    // Prepending them produced `ERROR: 'map' : redefinition` at runtime
    // (caught by L26 multi-frame smoke during T3.4).
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        `
        #ifdef USE_MAP
          vec4 texColor = texture2D(map, vMapUv);
          // Rec.709 luminance, matches Gaia luma.glsl:3-4.
          float luminance = dot(texColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          if (luminance < ${CLOUD_SHADOW_LUMA_CUTOFF.toFixed(3)}) discard;
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
      // T5.2 (Silver) — standard alpha blend. Gaia uses
      // `GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA` at
      // `/tmp/gaiasky/core/src/gaiasky/scene/record/AtmosphereComponent.java:88-89`
      // for the atmosphere material. Three.js `NormalBlending` with
      // the default `premultipliedAlpha = false` maps exactly to
      // that `glBlendFuncSeparate(SRC_ALPHA, ONE_MINUS_SRC_ALPHA,
      // ONE, ONE_MINUS_SRC_ALPHA)` per `three/renderers/webgl/
      // WebGLState.js:683`. The alpha-channel factor
      // (`ONE` vs Gaia's implicit `SRC_ALPHA`) diverges only when
      // atmosphere composites against another transparent layer,
      // which atlas never does (atmosphere sits on top of the
      // opaque planet mesh + opaque skybox). Pre-T5.2 used
      // `AdditiveBlending` (`SRC_ALPHA, ONE`) which summed the
      // atmosphere RGB into the backdrop unconditionally →
      // over-exposed bright atmospheres on Jupiter/Saturn/Earth.
      blending: THREE.NormalBlending,
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
      const eclipseEnabled = !!body.eclipsingBodyId;
      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.tNight = { value: textureNight };
        // Sun is always at world origin in this scene — no CPU transform needed.
        shader.uniforms.uSunPositionWorld = {
          value: new THREE.Vector3(0, 0, 0),
        };
        shader.uniforms.uNightLightIntensity = { value: nightLightIntensity };

        // T3.3 eclipse uniforms — populated per-frame by `Planet.tsx`
        // via `body.eclipsingBodyId` scene-graph lookup.
        if (eclipseEnabled) {
          shader.uniforms.uEclipsingBodyPos = {
            value: new THREE.Vector3(0, 0, 0),
          };
          shader.uniforms.uEclipsingBodyRadius = { value: 0 };
          shader.uniforms.uEclipsingVrScale = { value: 1 };
          shader.uniforms.uEclipsingActive = { value: 0 };
        }

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

        // Inject day texture handling in fragment shader.
        // Linstep helper injected here (inlined from Gaia
        // `/tmp/gaiasky/assets/shader/lib/math.glsl:58-61`) so the
        // T3.5 night-lights terminator formula below can use it
        // verbatim — WebGL has no `#include`.
        shader.fragmentShader = `
          uniform sampler2D tNight;
          uniform vec3 uSunPositionWorld;
          uniform float uNightLightIntensity;
          varying vec3 vWorldPos;
          varying vec3 vWorldNormal;
          varying vec2 vUv;

          float linstep(float edge0, float edge1, float x) {
              float d = edge1 - edge0;
              return d != 0.0 ? clamp((x - edge0) / d, 0.0, 1.0) : 0.0;
          }

          ${eclipseEnabled ? ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY : ""}
          ${eclipseEnabled ? ECLIPSE_FRAGMENT_HELPERS : ""}

          ${shader.fragmentShader}
        `;

        // Apply night lights to emissive channel.
        // T3.5 — Gaia terminator (pbr.glsl:98-99): 1:1 port via
        // `linstep(-0.1, 0.1, -NdotL)`. Atlas pre-T3.5 used
        // `1.0 - smoothstep(-0.2, 0.2, intensity)` — 2x-wider band +
        // cubic smoothing — which leaked 15.9% of night-lights onto
        // the day side at intensity=0.1 (sun 5.7° above horizon).
        // New formula is pinned by `nightLightsMath.test.ts`.
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <emissivemap_fragment>",
          `
          #include <emissivemap_fragment>

          // Compute lighting in world space — both vectors are now in the same frame.
          // Sun is at world origin; direction from fragment to Sun:
          vec3 lightDir = normalize(uSunPositionWorld - vWorldPos);
          float intensity = dot(vWorldNormal, lightDir);

          // Gaia-1:1 night-lights gate (T3.5). Linear ramp over a
          // 0.2-wide band centered on the terminator; 0 on the day
          // side at intensity >= 0.1, 1 on the night side at
          // intensity <= -0.1. Mirrors pbr.glsl:98-99.
          float nightFactor = linstep(-0.1, 0.1, -intensity);

          vec4 nightColor = texture2D(tNight, vUv);

          // Add night lights to emissive
          totalEmissiveRadiance += nightColor.rgb * nightFactor * uNightLightIntensity;
          `
        );

        // T3.3 — inject eclipse shadow blend before output_fragment
        // so the multiplication hits outgoingLight pre-tonemap
        // (matches Gaia pbr.fragment.glsl:671,676 call site).
        if (eclipseEnabled) {
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <output_fragment>",
            `
            ${ECLIPSE_FRAGMENT_OUTPUT_PATCH}
            #include <output_fragment>
            `
          );
        }
      };
    }
    // T3.3 — bodies with eclipsingBodyId but no Earth-specific
    // day/night or ring-planet treatment (e.g. Moon during a
    // lunar eclipse). Injects the eclipse shader on top of a
    // default MeshStandardMaterial.
    else if (body.eclipsingBodyId) {
      mat.onBeforeCompile = (shader) => {
        mat.userData.shader = shader;
        shader.uniforms.uSunPositionWorld = {
          value: new THREE.Vector3(0, 0, 0),
        };
        shader.uniforms.uEclipsingBodyPos = {
          value: new THREE.Vector3(0, 0, 0),
        };
        shader.uniforms.uEclipsingBodyRadius = { value: 0 };
        shader.uniforms.uEclipsingVrScale = { value: 1 };
        shader.uniforms.uEclipsingActive = { value: 0 };

        shader.vertexShader = `
          ${ECLIPSE_VERTEX_WORLD_VARYINGS_DECL}
          ${shader.vertexShader}
        `.replace(
          "#include <begin_vertex>",
          `
          #include <begin_vertex>
          ${ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN}
          `
        );

        shader.fragmentShader = `
          ${ECLIPSE_FRAGMENT_UNIFORMS}
          ${ECLIPSE_FRAGMENT_HELPERS}
          ${shader.fragmentShader}
        `.replace(
          "#include <output_fragment>",
          `
          ${ECLIPSE_FRAGMENT_OUTPUT_PATCH}
          #include <output_fragment>
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
            // Intersect with Ring Plane (y=0). Skip near-parallel rays
            // to avoid Inf/NaN propagation from the division by lightDir.y.
            if (abs(lightDir.y) > 0.000001) {
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
    body.eclipsingBodyId,
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
