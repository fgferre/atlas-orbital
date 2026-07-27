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

interface PlanetModelProps {
  body: CelestialBody;
  roughness?: number;
  metalness?: number;
  sunEmissive?: number;
  ringEmissive?: number;
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

// Sub-component for GLB models
const GLBModel = ({
  path,
  scale,
  roughness,
  metalness,
}: {
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

  const { cloned, normalizationScale } = useMemo(
    () =>
      cloneGlbSceneForRuntime(scene, (material) => {
        if (
          material instanceof THREE.MeshStandardMaterial ||
          material instanceof THREE.MeshPhysicalMaterial
        ) {
          if (roughness !== undefined) material.roughness = roughness;
          if (metalness !== undefined) material.metalness = metalness;
        }
      }),
    [scene, roughness, metalness]
  );

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

  const { cloned, normalizationScale } = useMemo(() => {
    const c = obj.clone();
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

      child.material = new THREE.MeshStandardMaterial(materialParams);
      applyDepthSettings(child.material);
    });

    return { cloned: c, normalizationScale: normalizeToUnitSphereScale(c) };
  }, [obj, surfaceTexture, surfaceFillLight, roughness, metalness, body.color]);

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

    // Rotation — same helper as `Planet.tsx` so a body's `rotationEpoch` /
    // `rotationOffsetDegrees` are honoured whether it renders as a shaded
    // sphere or as a GLB model. The raw `Date.now()/period` form this
    // replaced silently ignored both fields.
    if (rotationRef.current && body.rotationPeriodHours) {
      rotationRef.current.rotation.y = AstroPhysics.calculateRotationAngle(
        simulationClock.getNow(),
        body.rotationPeriodHours,
        body.rotationOffsetDegrees || 0,
        body.rotationEpoch ? new Date(body.rotationEpoch) : undefined
      );
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
