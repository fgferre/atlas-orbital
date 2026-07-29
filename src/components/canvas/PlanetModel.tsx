import { useEffect, useMemo, useRef } from "react";
import { useFrame, useLoader } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { type CelestialBody, AstroPhysics } from "../../lib/astrophysics";
import { useProgressiveDeferredTexture } from "../../hooks/useProgressiveDeferredTexture";
import type { ResolvedQualityName } from "../../lib/qualityProfile";
import { TEXTURE_VARIANT_MANIFEST } from "../../lib/textureVariantManifest";
import { simulationClock } from "../../lib/simulationClock";
import {
  computeBodyPoleQuaternion,
  computeSpinAngleRad,
} from "../../lib/bodyOrientation";
import { dateToTDB } from "../../lib/orbital/time";
import { resolveTextureRequest } from "../../lib/textureVariants";
import { useStore } from "../../store";
import {
  applyDepthSettings,
  cloneGlbSceneForRuntime,
  disposeLoadedObject3D,
  disposeObject3D,
  normalizeToUnitSphereScale,
  prepareObjMeshGeometry,
} from "../../lib/assetProcessing";
import {
  createProceduralSurfaceTexture,
  getSurfaceFillLight,
  shouldRenderDirectSurfaceMap,
} from "../../utils/proceduralSurface";
import { useBodySunlightScalar } from "./planet/useBodySunlightScalar";
import {
  applyPlanetDirectLightCacheKey,
  applyPlanetDirectLightPatch,
  SOLAR_IRRADIANCE_UNIFORM,
} from "./shaders/solarIrradiancePatch";

interface PlanetModelProps {
  body: CelestialBody;
  roughness?: number;
  metalness?: number;
  sunEmissive?: number;
  ringShadowIntensity?: number;
  qualityProfileName: ResolvedQualityName;
  assetPriority: number;
  textureSalience: number;
}

const GLB_SOURCE_IDLE_EVICTION_MS = 10_000;
const glbSourceUsage = new Map<
  string,
  {
    refs: number;
    scene: THREE.Object3D;
    timer: ReturnType<typeof setTimeout> | null;
  }
>();

const retainGlbSource = (path: string, scene: THREE.Object3D) => {
  const current = glbSourceUsage.get(path);
  if (current) {
    current.refs += 1;
    if (current.timer) {
      clearTimeout(current.timer);
      current.timer = null;
    }
    return;
  }

  glbSourceUsage.set(path, { refs: 1, scene, timer: null });
};

const releaseGlbSource = (path: string, scene: THREE.Object3D) => {
  const current = glbSourceUsage.get(path);
  if (!current || current.scene !== scene) {
    return;
  }

  current.refs = Math.max(0, current.refs - 1);
  if (current.refs > 0 || current.timer) {
    return;
  }

  current.timer = setTimeout(() => {
    const latest = glbSourceUsage.get(path);
    if (!latest || latest !== current || latest.refs > 0) {
      return;
    }

    disposeLoadedObject3D(latest.scene);
    useGLTF.clear(path);
    glbSourceUsage.delete(path);
  }, GLB_SOURCE_IDLE_EVICTION_MS);
};

/**
 * Onda 2.2 — install the same direct-light chain the sphere path installs
 * (`usePlanetMaterials.ts`'s `patchDirectLights`) on a material built here.
 *
 * ## Why this file needed its own copy of the call
 *
 * The four bodies that render through `PlanetModel` — haumea, vesta, pallas,
 * hygiea, i.e. every catalog record with a `model` field — build their
 * materials in this file, not in `usePlanetMaterials`, and until now neither
 * loader path set `onBeforeCompile` at all. Every per-material lighting
 * mechanism therefore skipped them: first the Lommel-Seeliger regolith
 * photometry (documented as a known exclusion in
 * `regolithPhotometryPatch.ts` since Onda 1.2), then `u_solarIrradiance`
 * (Onda 2.1). Harmless while the assist default was `"compensated"` and the
 * fused scalar was 1.0 everywhere — and a glaring artefact the moment it is
 * not: all four sit in the 30–45 AU belt/TNO range, so they would have
 * rendered at full 1 AU brightness next to neighbours dimmed to ~1/11.
 *
 * ## One rule, not a special case
 *
 * `regolith` is read from `body.airlessRegolith` exactly as the sphere path
 * reads it, so these four join on the same terms as every other body instead
 * of getting a bespoke irradiance-only carve-out. As of today none of the
 * four actually carries that flag — the seven that do (mercury, moon,
 * ganymede, callisto, io, europa, enceladus) all render through the sphere
 * path — so in practice this installs the irradiance wrapper alone and the
 * Lommel-Seeliger photometry stays off for them. Wiring it through the flag
 * rather than hard-coding `false` means the day someone flags Vesta airless
 * (it is, physically), the photometry follows without a second edit here.
 *
 * The GLB path clones its materials before this runs
 * (`cloneGlbSceneForRuntime`) and the OBJ path constructs fresh ones, so
 * neither call reaches back into a loader-cached material.
 */
const patchModelMaterial = (material: THREE.Material, body: CelestialBody) => {
  const options = { regolith: !!body.airlessRegolith };
  material.onBeforeCompile = (shader) => {
    material.userData.shader = shader;
    applyPlanetDirectLightPatch(shader, options);
  };
  // Same discipline as the sphere path: the regolith flag is read from a
  // captured variable, so it does NOT appear in `onBeforeCompile`'s source
  // text — which is three's default program cache key. Without this, two
  // model materials differing only in that flag would share one program.
  applyPlanetDirectLightCacheKey(material, options);
};

/**
 * Per-frame `u_solarIrradiance` write for the model path.
 *
 * Materials are collected at construction time rather than by traversing the
 * scene graph every frame: the uniform only exists after three compiles the
 * program, so the read is `material.userData.shader?.uniforms[…]` — the same
 * idiom `Planet.tsx` uses — and a material that has not compiled yet is
 * simply skipped until it has. The value itself comes from the shared
 * 1 s-bucket cache, so this costs one `Map` lookup per material per frame.
 */
const useModelSolarIrradiance = (
  bodyId: string,
  materials: THREE.Material[]
) => {
  const readSunlightScalar = useBodySunlightScalar(bodyId);

  /* eslint-disable react-hooks/immutability --
   * Same scoped exception `Planet.tsx` carries for the identical write:
   * `uniform.value = …` mutates a three.js uniform object, which is mutable
   * by design, from inside `useFrame` — outside React's render, so no render
   * output depends on it. The rule reads the write as mutating the
   * `materials` argument; the alternative it suggests (a local copy) would
   * not reach the GPU. */
  useFrame(() => {
    if (materials.length === 0) return;
    const value = readSunlightScalar();
    for (const material of materials) {
      const uniform = (
        material.userData.shader as
          | { uniforms?: { [key: string]: THREE.IUniform } }
          | undefined
      )?.uniforms?.[SOLAR_IRRADIANCE_UNIFORM];
      if (uniform) uniform.value = value;
    }
  });
  /* eslint-enable react-hooks/immutability */
};

// Sub-component for GLB models
const GLBModel = ({
  body,
  path,
  scale,
  roughness,
  metalness,
}: {
  body: CelestialBody;
  path: string;
  scale?: number;
  roughness?: number;
  metalness?: number;
}) => {
  // Draco + meshopt decoders are explicitly disabled: every shipped GLB is
  // uncompressed (`extensionsUsed: []`), and drei's default `useMeshopt=true`
  // instantiates MeshoptDecoder, which runs `WebAssembly.instantiate` and is
  // rejected by the production CSP (`script-src 'self' blob:`).
  const { scene } = useGLTF(path, false, false);

  const { cloned, normalizationScale, litMaterials } = useMemo(() => {
    const collected: THREE.Material[] = [];
    const { cloned: clonedScene, normalizationScale: normalization } =
      cloneGlbSceneForRuntime(scene, (material) => {
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          if (roughness !== undefined) material.roughness = roughness;
          if (metalness !== undefined) material.metalness = metalness;
          patchModelMaterial(material, body);
          collected.push(material);
        }
      });
    return {
      cloned: clonedScene,
      normalizationScale: normalization,
      litMaterials: collected,
    };
  }, [scene, roughness, metalness, body]);

  useModelSolarIrradiance(body.id, litMaterials);

  useEffect(() => {
    retainGlbSource(path, scene);
    return () => releaseGlbSource(path, scene);
  }, [path, scene]);

  useEffect(() => {
    return () => {
      disposeObject3D(cloned);
    };
  }, [cloned]);

  return (
    <group rotation={new THREE.Euler(0, 0, 0)}>
      <primitive object={cloned} scale={normalizationScale * (scale || 1)} />
    </group>
  );
};

// Sub-component for OBJ models
const OBJModel = ({
  body,
  path,
  texturePath,
  scale,
  roughness,
  metalness,
  assetPriority,
}: {
  body: CelestialBody;
  path: string;
  texturePath?: string;
  scale?: number;
  roughness?: number;
  metalness?: number;
  assetPriority: number;
}) => {
  const obj = useLoader(OBJLoader, path);
  const directTexture = useProgressiveDeferredTexture(
    texturePath && shouldRenderDirectSurfaceMap(body) ? texturePath : null,
    {
      enabled: true,
      pin: assetPriority === 0,
      priority: assetPriority === 0 ? 0 : 1,
    }
  ).texture;
  const proceduralTexture = useMemo(() => {
    if (directTexture) return null;
    return createProceduralSurfaceTexture(body);
  }, [body, directTexture]);
  const surfaceFillLight = useMemo(() => {
    if (directTexture) return null;
    return getSurfaceFillLight(body);
  }, [body, directTexture]);
  const surfaceTexture = directTexture ?? proceduralTexture ?? undefined;

  useEffect(() => {
    return () => {
      proceduralTexture?.dispose();
    };
  }, [proceduralTexture]);

  const { cloned, normalizationScale, litMaterials } = useMemo(() => {
    const c = obj.clone();
    const collected: THREE.Material[] = [];
    c.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.geometry = prepareObjMeshGeometry(child.geometry);
      child.castShadow = true;
      child.receiveShadow = true;

      const materialParams: THREE.MeshStandardMaterialParameters = {
        roughness: roughness ?? 1,
        metalness: metalness ?? 0,
        color: surfaceTexture ? 0xffffff : body.color,
        emissive: surfaceFillLight?.color ?? "#000",
        emissiveIntensity: surfaceFillLight?.intensity ?? 0,
      };

      if (surfaceTexture) {
        materialParams.map = surfaceTexture;
      }

      const material = new THREE.MeshStandardMaterial(materialParams);
      applyDepthSettings(material);
      patchModelMaterial(material, body);
      collected.push(material);
      child.material = material;
    });

    return {
      cloned: c,
      normalizationScale: normalizeToUnitSphereScale(c),
      litMaterials: collected,
    };
  }, [obj, surfaceTexture, surfaceFillLight, roughness, metalness, body]);

  useModelSolarIrradiance(body.id, litMaterials);

  useEffect(() => {
    return () => {
      disposeObject3D(cloned);
    };
  }, [cloned]);

  return (
    <group rotation={new THREE.Euler(0, 0, 0)}>
      <primitive object={cloned} scale={normalizationScale * (scale || 1)} />
    </group>
  );
};

export const PlanetModel = ({
  body,
  roughness,
  metalness,
  qualityProfileName,
  assetPriority,
  textureSalience,
}: PlanetModelProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const poleRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const scaleMode = useStore((state) => state.scaleMode);

  // Determine loader type
  const isGLTF =
    body.model!.path.endsWith(".glb") || body.model!.path.endsWith(".gltf");
  const mapRequest = useMemo(
    () =>
      resolveTextureRequest(
        body,
        "map",
        qualityProfileName,
        textureSalience,
        TEXTURE_VARIANT_MANIFEST
      ),
    [body, qualityProfileName, textureSalience]
  );

  useFrame(() => {
    if (!groupRef.current) return;

    // Scaling
    let s = AstroPhysics.resolveSemanticBodyRadius({ body, scaleMode });

    // Apply custom model scale adjustment if provided
    if (body.model?.scale) {
      s *= body.model.scale;
    }

    // W5 — UNIFORM, and the `shapeScale` multiply that used to be here is
    // gone for two independent reasons. It was a double-apply
    // (`resolveSemanticBodyRadius` already returns the largest semi-axis), and
    // it put a non-uniform scale on the group that has the tilt group and
    // `rotationRef` BELOW it — the same S·R shear `PlanetVisual` outlaws.
    //
    // The precedence rule, stated once here and in the resolver's JSDoc: on
    // the model path **the asset owns the figure**. Haumea's GLB already
    // encodes its ellipsoid, so applying `shapeScale` or `flattening` here
    // would squash an already-squashed mesh. `celestialBodies.test.ts` forbids
    // the pairing so this cannot silently start mattering.
    groupRef.current.scale.setScalar(s);

    // Orientation — the same two functions `Planet.tsx` uses, so both render
    // paths now read one source. Before this they disagreed on the tilt SIGN:
    // this file used `Euler(0, 0, +tilt)` while the sphere path used −tilt, so
    // the four model bodies rendered at an azimuth 2× their tilt away from
    // their shaded-sphere counterparts — up to 168° for Pallas. Both azimuths
    // were arbitrary, so unifying them is correct rather than a tie-break.
    const jdTDB = dateToTDB(simulationClock.getNow());
    if (poleRef.current) {
      computeBodyPoleQuaternion(body, jdTDB, poleRef.current.quaternion);
    }
    if (rotationRef.current) {
      rotationRef.current.rotation.y = computeSpinAngleRad(body, jdTDB);
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
      {/* Pole group — written per frame, same basis as the sphere path.
          Note the meridian caveat: a GLB's own axes are unaudited, so model
          bodies deliberately stay on the `axialTilt` fallback inside
          `computeBodyPoleQuaternion` even where the IAU publishes a W row.
          Transcribing W₀ onto a mesh whose prime meridian is unknown would
          convert a measured number into a false claim. */}
      <group ref={poleRef}>
        {/* Rotation Group */}
        <group ref={rotationRef}>
          {/* Model Rotation Offset */}
          <group
            rotation={
              body.model?.rotationOffset
                ? new THREE.Euler(...body.model.rotationOffset)
                : new THREE.Euler(0, 0, 0)
            }
          >
            {isGLTF ? (
              <GLBModel
                body={body}
                path={body.model!.path}
                scale={1} // Visual scale handled by parent group now? No, kept logic same.
                roughness={roughness}
                metalness={metalness}
              />
            ) : (
              <OBJModel
                body={body}
                path={body.model!.path}
                texturePath={mapRequest.selectedPath ?? undefined}
                scale={1}
                roughness={roughness}
                metalness={metalness}
                assetPriority={assetPriority}
              />
            )}
          </group>
        </group>
      </group>
    </group>
  );
};
