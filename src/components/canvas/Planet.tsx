import {
  Children,
  isValidElement,
  useRef,
  useMemo,
  Suspense,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { type CelestialBody, AstroPhysics } from "../../lib/astrophysics";
import {
  resolveOrbitalDisplayPosition,
  getOrbitalDisplayOrbitPoints,
} from "../../lib/orbital";
import { VISUAL_PRESETS } from "../../config/visualPresets";
import { getOrbitCacheKey, getOrbitSegments } from "../../lib/orbitQuality";
import { simulationClock } from "../../lib/simulationClock";
import { useStore } from "../../store";
import { ErrorBoundary } from "../utils/ErrorBoundary";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { PlanetModel } from "./PlanetModel";
import { createProceduralSurfaceTexture } from "../../utils/proceduralSurface";
import type { ResolvedQualityName } from "../../lib/qualityProfile";
import type { ResolvedSunRenderMode } from "../../lib/sunRenderMode";
import type { Line2 } from "three-stdlib";
import {
  CAMERA_ASSET_INTEREST_DEMOTION_MS,
  CAMERA_ASSET_INTEREST_SAMPLE_MS,
  HIDDEN_CAMERA_ASSET_INTEREST,
  cameraAssetInterestEquals,
  isCameraAssetInterestPromotion,
  resolveCameraAssetInterest,
  type CameraAssetInterest,
} from "../../lib/cameraAssetInterest";

import {
  PROGRADE_ARROW_BASE_WIDTH,
  PROGRADE_ARROW_BASE_LENGTH,
  PROGRADE_ARROW_BASE_DEPTH,
} from "./planet/progradeArrow";
import { useOrbitalSalience } from "./planet/useOrbitalSalience";
import { usePlanetAssets } from "./planet/usePlanetAssets";
import { usePlanetMaterials } from "./planet/usePlanetMaterials";
import { PlanetOrbitLine } from "./planet/PlanetOrbitLine";
import { satelliteUsesParentEquatorialFrame } from "./moonSceneFrame";
import {
  computeBodyPoleQuaternion,
  computeSpinAngleRad,
} from "../../lib/bodyOrientation";
import { dateToTDB } from "../../lib/orbital/time";
import { PlanetMotionOverlays } from "./planet/PlanetMotionOverlays";
// T5.1 — per-frame atmosphere dynamic-uniform recompute. Mirrors
// Gaia's `updateAtmosphericScatteringParams` at
// `AtmosphereComponent.java:229-288` which writes `KrESun`, `KmESun`,
// `Alpha`, `nSamples` on every render + boosts `m_ESun` when the
// camera is inside the atmosphere shell.
import {
  computeDynamicAtmosphereUniforms,
  resolveAtmosphereDynamicConfig,
} from "./shaders/atmosphereDynamics";
import { SOLAR_IRRADIANCE_UNIFORM } from "./shaders/solarIrradiancePatch";
import { useBodySunlightScalar } from "./planet/useBodySunlightScalar";
import {
  PLANETSHINE_DIR_UNIFORM,
  PLANETSHINE_RADIANCE_UNIFORM,
} from "./shaders/planetshinePatch";
import { usePlanetshineScalar } from "./planet/usePlanetshineScalar";
import { isPlanetshineRecipient } from "../../lib/graphics/planetshine";

const ORBIT_POINTS_CACHE = new Map<string, THREE.Vector3[]>();
const MAX_ORBIT_CACHE_ENTRIES = 256;

// Module-level scratch vectors/matrices reused across hot-path useFrame
// blocks. Safe because useFrame runs synchronously per frame in the
// same thread, and every read is immediately preceded by a write into
// the same scratch (e.g. `getWorldPosition(TMP_WORLD_POS)` before
// reading, `.set(0,0,0).applyMatrix4(...)` before consuming, etc.).
const TMP_WORLD_POS = new THREE.Vector3();
const TMP_ASSET_WORLD_POS = new THREE.Vector3();
const TMP_RING_INV_MATRIX = new THREE.Matrix4();
const TMP_RING_SUN_LOCAL = new THREE.Vector3();
const TMP_PLANET_INV_MATRIX = new THREE.Matrix4();
const TMP_PLANET_SUN_LOCAL = new THREE.Vector3();
const TMP_ATMO_INV_MATRIX = new THREE.Matrix4();
const TMP_ATMO_CAMERA_WORLD = new THREE.Vector3();
const TMP_ATMO_CAMERA_LOCAL = new THREE.Vector3();
const TMP_ATMO_SUN_LOCAL = new THREE.Vector3();
const TMP_ECLIPSE_RECEIVER_POS = new THREE.Vector3();
const TMP_ECLIPSE_ECLIPSING_POS = new THREE.Vector3();
const TMP_SHINE_PARENT_WORLD = new THREE.Vector3();
const TMP_SHINE_SELF_WORLD = new THREE.Vector3();

// Atmospheric super-rotation: Earth's equatorial clouds drift east roughly
// 3% faster than the solid body. Applied to any body that renders a cloud layer.
const CLOUD_SUPER_ROTATION_FACTOR = 1.03;

type OrbitLineMaterial = THREE.Material & {
  opacity: number;
  uniforms?: {
    opacity?: { value: number };
  };
};

function getOrbitDateBucket(body: CelestialBody, date: Date): string {
  const meanMotion = Math.abs(body.orbit.n ?? 0);
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) {
    return "static";
  }

  const orbitalPeriodDays = 360 / meanMotion;
  const bucketDays = THREE.MathUtils.clamp(
    orbitalPeriodDays / 360,
    body.type === "moon" ? 1 / 24 : 0.5,
    30
  );

  return `${Math.floor(date.getTime() / (bucketDays * 86400000))}`;
}

interface PlanetProps {
  body: CelestialBody;
  children?: React.ReactNode;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringShadowIntensity: number;
  nightLightIntensity: number;
  qualityProfileName: ResolvedQualityName;
  sunRenderMode: ResolvedSunRenderMode;
}

const PlanetVisual = ({
  body,
  roughness,
  metalness,
  sunEmissive,
  ringShadowIntensity,
  nightLightIntensity,
  qualityProfileName,
  sunRenderMode,
  assetPriority,
  cameraInterest,
}: {
  body: CelestialBody;
  roughness: number;
  metalness: number;
  sunEmissive: number;
  ringShadowIntensity: number;
  nightLightIntensity: number;
  qualityProfileName: ResolvedQualityName;
  sunRenderMode: ResolvedSunRenderMode;
  assetPriority: number;
  cameraInterest: CameraAssetInterest;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const rotationRef = useRef<THREE.Group>(null);
  const cloudRotationRef = useRef<THREE.Group>(null);
  const selectId = useStore((state) => state.selectId);
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);

  const {
    textureRing,
    textureClouds,
    textureNight,
    textureNormal,
    textureRoughness,
    surfaceMap,
    surfaceFillLight,
  } = usePlanetAssets({
    body,
    qualityProfileName,
    sunRenderMode,
    assetPriority,
    focusId,
    cameraInterest,
  });

  /**
   * Onda 2.1 — the per-body fused sunlight scalar
   * (`irradiance × assistGain`, see `lib/graphics/solarIrradiance.ts`),
   * behind the shared 1 s bucket cache. `PlanetModel.tsx` reads the same
   * hook for the four model-path bodies.
   */
  const readSunlightScalar = useBodySunlightScalar(body.id);

  /**
   * Onda 2.3 — planetshine/earthshine second-source scalar (Io, Europa,
   * Moon only; 0 for every other body). Same 1 s bucket idiom as the sun
   * scalar above, kept as a separate hook/uniform pair rather than folded
   * into `u_solarIrradiance` because the two multiply DIFFERENT
   * `IncidentLight`s in the shader (see `planetshinePatch.ts`) — fusing
   * them would require the shine's own inverse-square law to route through
   * the sun's uniform, which `solarIrradiancePatch.ts` scales exactly once
   * per real light.
   */
  const readPlanetshineScalar = usePlanetshineScalar(body.id, body.parentId);
  const isShineRecipient = isPlanetshineRecipient(body.id);

  // The pole is NOT memoised. IAU poles are functions of time — Earth's α₀
  // moves 0.641°/century, Mars's δ₀ carries a 1.6° periodic term — so freezing
  // the quaternion in a `useMemo` keyed on scalars would pin the axis at
  // whatever instant the component last reconciled. It is written in the same
  // `useFrame` that writes the spin, from the same `jdTDB`.
  const poleRef = useRef<THREE.Group>(null);

  // T5.1 — pre-resolve the atmosphere dynamic-config primitives
  // once per body. The per-frame `computeDynamicAtmosphereUniforms`
  // call inside useFrame consumes this flat shape instead of
  // re-resolving `??` defaults every tick.
  const atmosphereDynamicConfig = useMemo(
    () =>
      body.atmosphereScattering
        ? resolveAtmosphereDynamicConfig(body.atmosphereScattering)
        : null,
    [body.atmosphereScattering]
  );

  const {
    cloudMaterial,
    cloudShadowMaterial,
    atmosphereMaterial,
    planetMaterial,
    ringMaterial,
    ringGeometry,
    figureGeometry,
  } = usePlanetMaterials({
    body,
    roughness,
    metalness,
    sunEmissive,
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
  });

  const ringRef = useRef<THREE.Mesh>(null);

  /* eslint-disable react-hooks/immutability --
   * Writing shader uniforms on a material returned by `usePlanetMaterials` is
   * what this callback is for: `atmoUniforms.*.value = …` and the eclipse
   * uniforms below are per-frame GPU writes, and lesson L26 records that
   * hoisting them to static values flickers against the cloud layer's
   * transparent sort. Three.js materials are mutable objects by design and
   * `useFrame` is outside React's render, so no render output depends on them.
   *
   * This is unmasked, not new. HEAD carried an `exhaustive-deps` disable on
   * the pole `useMemo` this wave deleted, which made the compiler skip the
   * whole component; removing it let the analysis reach code that has been
   * here since T5.1. The narrow fix is this scoped disable, not putting the
   * suppression comment back on a hook that no longer exists. */
  useFrame(({ camera, scene }) => {
    if (!groupRef.current) return;

    // 1. Scaling. W5 — this stays UNIFORM at the largest semi-axis. The pole
    // quaternion and the spin group sit below this group, so a non-uniform
    // scale here would compose as S·R — a shear, not a rotated ellipsoid, and
    // Uranus at 97.77° would render as a skewed blob. The figure lives in the
    // baked `figureGeometry` instead, below the rotations where it belongs.
    const semanticRadius = AstroPhysics.resolveSemanticBodyRadius({
      body,
      scaleMode,
    });
    groupRef.current.scale.set(semanticRadius, semanticRadius, semanticRadius);

    // 2. Rotation & Shader Uniforms
    if (rotationRef.current) {
      // One `dateToTDB` per body per frame, shared by the pole and the spin.
      // `calculateDeltaT` allocates a Date, so calling it twice here would be
      // needless churn in a file that otherwise uses TMP_ scratch religiously.
      const jdTDB = dateToTDB(simulationClock.getNow());

      if (poleRef.current) {
        computeBodyPoleQuaternion(body, jdTDB, poleRef.current.quaternion);
      }

      const spin = computeSpinAngleRad(body, jdTDB);
      rotationRef.current.rotation.y = spin;
      if (cloudRotationRef.current) {
        // NEW-2: the super-rotation multiplies the **rate**, which is what
        // multiplying an unwrapped angle means. The previous form multiplied
        // an angle already wrapped to [0, 360), so every wrap moved the clouds
        // by (factor − 1) × 360° = 10.8° in one frame — a snap once per
        // simulated day. See `computeSpinAngleRad`.
        cloudRotationRef.current.rotation.y =
          spin * CLOUD_SUPER_ROTATION_FACTOR;
      }

      // Shader Uniforms (Analytical Shadows & Day/Night)
      // Earth day/night shader now uses world-space uniforms — no CPU transform needed.
      // uSunPositionWorld stays at (0,0,0) (Sun is always at world origin) and never changes,
      // so there is nothing to update each frame for Earth or clouds.

      // Update Ring Material (Planet Shadow on Ring) - only for ringed planets
      if (
        textureRing &&
        ringMaterial &&
        ringMaterial.userData.shader &&
        ringRef.current
      ) {
        // The Sun sits at world-space (0,0,0) in this scene, so the
        // sun's position in ring-local space is simply the inverse ring
        // world matrix applied to the world origin — no dedicated
        // world-position Vector3 required.
        TMP_RING_INV_MATRIX.copy(ringRef.current.matrixWorld).invert();
        TMP_RING_SUN_LOCAL.set(0, 0, 0).applyMatrix4(TMP_RING_INV_MATRIX);
        const parallelSunLocalPosRing =
          AstroPhysics.resolveParallelLightReferencePoint(TMP_RING_SUN_LOCAL);

        ringMaterial.userData.shader.uniforms.uSunPosition.value.copy(
          parallelSunLocalPosRing
        );
      }

      // Update Planet Material (Ring Shadow on Planet) — ringed non-Earth planets.
      // The fragment shader at usePlanetMaterials.ts:289-362 intersects
      // a ring plane using `vPos = position` (object-space). `uSunPosition`
      // must live in the SAME frame, or the ray/plane math mixes frames
      // and only coincides under an identity model matrix — Saturn's
      // 26.73° tilt and orbital translation both break that (T1.2).
      if (
        textureRing &&
        planetMaterial &&
        planetMaterial.userData.shader &&
        body.ringSystem
      ) {
        TMP_PLANET_INV_MATRIX.copy(rotationRef.current.matrixWorld).invert();
        TMP_PLANET_SUN_LOCAL.set(0, 0, 0).applyMatrix4(TMP_PLANET_INV_MATRIX);
        planetMaterial.userData.shader.uniforms.uSunPosition.value.copy(
          TMP_PLANET_SUN_LOCAL
        );
      }

      // Update Atmosphere Shader uniforms — θ.5b-d. Runs for any body
      // whose record opts into Rayleigh+Mie scattering via
      // `atmosphereScattering`. Mirrors T1.2's ring-shadow transform:
      // camera world-pos + Sun world-origin both enter the planet-local
      // frame via the inverse of `rotationRef.matrixWorld`. The Nishita
      // integrator expects every position in the same unit-sphere frame
      // (fInnerRadius=1.0; fOuterRadius = config.outerRadiusRatio).
      // Static defaults here flicker against the cloud layer's
      // transparent-sort (see lesson L26) — per-frame writes are
      // mandatory.
      if (
        body.atmosphereScattering &&
        atmosphereMaterial &&
        atmosphereMaterial instanceof THREE.ShaderMaterial
      ) {
        const atmoUniforms = atmosphereMaterial.uniforms;
        TMP_ATMO_INV_MATRIX.copy(rotationRef.current.matrixWorld).invert();

        // v3CameraPos: camera world → planet-local.
        camera.getWorldPosition(TMP_ATMO_CAMERA_WORLD);
        TMP_ATMO_CAMERA_LOCAL.copy(TMP_ATMO_CAMERA_WORLD).applyMatrix4(
          TMP_ATMO_INV_MATRIX
        );
        atmoUniforms.v3CameraPos.value.copy(TMP_ATMO_CAMERA_LOCAL);

        // v3LightPos: unit direction from Earth center to Sun (at world
        // origin). Gaia uses v3LightPos as a NORMALIZED direction despite
        // the "Pos" name — see `atmscattering.frag.glsl:180,197`.
        TMP_ATMO_SUN_LOCAL.set(0, 0, 0).applyMatrix4(TMP_ATMO_INV_MATRIX);
        atmoUniforms.v3LightPos.value.copy(TMP_ATMO_SUN_LOCAL).normalize();

        // fCameraHeight in the same local frame. Scalar uniforms require
        // direct assignment (no `.copy()` path for floats).
        atmoUniforms.fCameraHeight.value = TMP_ATMO_CAMERA_LOCAL.length();

        // T5.1 — dynamic scattering uniforms. Gaia writes fKrESun,
        // fKmESun, fAlpha, nSamples every render; fKrESun/fKmESun get
        // boosted when the camera descends into the atmosphere shell
        // (`AtmosphereComponent.java:229-288`), which is the
        // characteristic "sky brightens as you enter it" effect.
        // Pre-T5.1 these stayed at their initial-resolve values and
        // that boost never reached the GPU. Silver tier per
        // `feedback_divergence_aaa_ux.md`: all four uniforms written
        // unconditionally so atlas matches Gaia's write schedule 1:1.
        if (atmosphereDynamicConfig) {
          const dynamic = computeDynamicAtmosphereUniforms(
            atmosphereDynamicConfig,
            atmoUniforms.fCameraHeight.value
          );
          atmoUniforms.fKrESun.value = dynamic.fKrESun;
          atmoUniforms.fKmESun.value = dynamic.fKmESun;
          atmoUniforms.fAlpha.value = dynamic.fAlpha;
          atmoUniforms.nSamples.value = dynamic.nSamples;
        }
      }

      // T3.3 — Eclipse uniforms. Runs for any body with an
      // `eclipsingBodyId` (Earth during solar eclipse, Moon during
      // lunar eclipse). Looks up the eclipsing body's mesh via
      // `scene.getObjectByName`, writes its world-pos + radius into
      // the shader uniforms every frame. Matches Gaia's
      // `MainPostProcessor.java:633-679` (light-position update
      // handler) pattern: driver pushes CPU-computed world-space
      // eclipse geometry; shader reads as-is.
      // Shared block — computes the eclipse state once, writes to all
      // materials that have eclipse uniforms. Post 2026-04-22 codex
      // audit fix #5, the cloud material also needs eclipse so a solar
      // eclipse darkens clouds above the Earth surface, matching Gaia
      // `cloud.fragment.glsl:170-172`.
      if (body.eclipsingBodyId) {
        const eclipsingBody = BODIES_BY_ID.get(body.eclipsingBodyId);
        const eclipsingMesh = scene.getObjectByName(body.eclipsingBodyId);
        let pos: THREE.Vector3 | null = null;
        let radius = 0;
        let vrScale = 1;
        let active = 0;
        if (eclipsingBody && eclipsingMesh) {
          eclipsingMesh.getWorldPosition(TMP_ECLIPSE_ECLIPSING_POS);
          pos = TMP_ECLIPSE_ECLIPSING_POS;
          // World radius of the eclipsing body, matching atlas's
          // scale-mode resolution.
          //
          // W5 corrected this comment (standing law 4). It used to claim
          // `resolveSemanticBodyRadius` "returns the same value the eclipsing
          // body's mesh is actually scaled by". That is now only true for a
          // spherical body: a body with a `flattening` or `shapeScale` record
          // is scaled uniformly by its LARGEST semi-axis and then carries its
          // figure in the baked geometry, so the shadow caster is treated as a
          // sphere of that largest semi-axis. Harmless today — the only
          // eclipsing bodies in the catalog are the Moon and Earth, both
          // unflagged — but the cone model gains a real per-axis error the day
          // a flattened body eclipses anything, and W7 owns that fix.
          // The `eclipsingBodyRadius × 1.7` penumbra ratio is unchanged.
          radius = AstroPhysics.resolveSemanticBodyRadius({
            body: eclipsingBody,
            scaleMode,
          });
          // vrScale must be large enough for the segment from the
          // receiver fragment toward the Sun (world origin) to reach
          // past the eclipsing body. `distance(receiver, sun) × 2`
          // guarantees that regardless of whether the eclipsing body
          // is between receiver and sun or beyond.
          groupRef.current.getWorldPosition(TMP_ECLIPSE_RECEIVER_POS);
          vrScale = Math.max(1, TMP_ECLIPSE_RECEIVER_POS.length() * 2);
          active = 1;
        }
        const materials = [planetMaterial, cloudMaterial] as (
          | THREE.Material
          | null
          | undefined
        )[];
        for (const m of materials) {
          const s = m?.userData?.shader as
            | { uniforms: { [key: string]: THREE.IUniform } }
            | undefined;
          if (!s) continue;
          const uPos = s.uniforms.uEclipsingBodyPos;
          const uRadius = s.uniforms.uEclipsingBodyRadius;
          const uVrScale = s.uniforms.uEclipsingVrScale;
          const uActive = s.uniforms.uEclipsingActive;
          if (!uPos || !uRadius || !uVrScale || !uActive) continue;
          if (pos) {
            (uPos.value as THREE.Vector3).copy(pos);
          }
          uRadius.value = radius;
          uVrScale.value = vrScale;
          uActive.value = active;
        }
      }
    }

    // 3. Solar irradiance — Onda 2.1, extended to the ring material in
    // W5-B. ONE uniform per material carrying `irradiance(ephemeris AU) ×
    // assistGain`, multiplying the DIRECT sunlight only
    // (`solarIrradiancePatch.ts` / `ringLightingPatch.ts` both wrap
    // `RE_Direct`; ambient and every emissive are deliberately outside it).
    // A per-frame uniform write is the safe half of the pipeline: the
    // material is never recreated, unlike the `sunEmissive` /
    // `nightLightIntensity` family which are `useMemo` deps and would
    // rebuild the material every tick.
    //
    // The uniform lookup comes FIRST so the Sun — a `MeshBasicMaterial`
    // with no shader, and the one body whose heliocentric distance is
    // exactly zero — never reaches the resolver. Rings share the planet's
    // own heliocentric distance, so the SAME scalar value is correct for
    // both — one resolver call, not two.
    const planetIrradianceUniform = (
      planetMaterial?.userData?.shader as
        | { uniforms: { [key: string]: THREE.IUniform } }
        | undefined
    )?.uniforms?.[SOLAR_IRRADIANCE_UNIFORM];
    const ringIrradianceUniform = (
      ringMaterial?.userData?.shader as
        | { uniforms: { [key: string]: THREE.IUniform } }
        | undefined
    )?.uniforms?.[SOLAR_IRRADIANCE_UNIFORM];
    if (planetIrradianceUniform || ringIrradianceUniform) {
      const sunlightScalarValue = readSunlightScalar();
      if (planetIrradianceUniform) {
        planetIrradianceUniform.value = sunlightScalarValue;
      }
      if (ringIrradianceUniform) {
        ringIrradianceUniform.value = sunlightScalarValue;
      }
    }

    // 4. Planetshine / earthshine — Onda 2.3. Magnitude comes from the pure
    // ephemeris resolver (never a render-space distance — same rule
    // `u_solarIrradiance` follows). Direction comes from the ACTUAL
    // rendered world position of `body.parentId`'s mesh via
    // `scene.getObjectByName`, the same pattern the eclipse block above
    // uses to find its eclipsing body — `mapPhysicalPositionToDisplay`
    // preserves direction under the didactic remap (only the magnitude
    // compresses), so this needs no separate ephemeris-direction path.
    if (isShineRecipient && body.parentId && groupRef.current) {
      const shineShader = planetMaterial?.userData?.shader as
        | { uniforms: { [key: string]: THREE.IUniform } }
        | undefined;
      const dirUniform = shineShader?.uniforms?.[PLANETSHINE_DIR_UNIFORM];
      const radianceUniform =
        shineShader?.uniforms?.[PLANETSHINE_RADIANCE_UNIFORM];
      const parentMesh = scene.getObjectByName(body.parentId);

      if (dirUniform && radianceUniform && parentMesh) {
        parentMesh.getWorldPosition(TMP_SHINE_PARENT_WORLD);
        groupRef.current.getWorldPosition(TMP_SHINE_SELF_WORLD);

        const dir = (dirUniform.value as THREE.Vector3)
          .copy(TMP_SHINE_PARENT_WORLD)
          .sub(TMP_SHINE_SELF_WORLD);
        if (dir.lengthSq() > 1e-12) dir.normalize();

        const scalar = readPlanetshineScalar();
        (radianceUniform.value as THREE.Vector3).setScalar(scalar);
      }
    }
  });
  /* eslint-enable react-hooks/immutability */

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
      {/* Pole group — written per frame from the body's IAU pole, so local +Y
          is the spin axis and local +X is node Q, the origin W is measured
          from. The spin group below turns inside it. */}
      <group ref={poleRef}>
        {/* Rotation Group */}
        <group ref={rotationRef}>
          {/* 1. Base Planet Sphere */}
          {planetMaterial ? (
            <mesh
              castShadow={body.type !== "star"}
              receiveShadow={body.type !== "star"}
              raycast={THREE.Mesh.prototype.raycast}
            >
              {figureGeometry ? (
                <primitive object={figureGeometry} attach="geometry" />
              ) : (
                <sphereGeometry args={[1, 64, 64]} />
              )}
              <primitive object={planetMaterial} attach="material" />
            </mesh>
          ) : null}

          {/* 3. Atmosphere Layer (Larger still) — θ.5d: any body with an
              `atmosphereScattering` config on its record renders the
              shell. Outer-radius ratio defaults to 1.025 (Gaia default)
              but can be overridden per body via `outerRadiusRatio`. */}
          {body.atmosphereScattering && atmosphereMaterial && (
            <mesh
              scale={[
                body.atmosphereScattering.outerRadiusRatio ?? 1.025,
                body.atmosphereScattering.outerRadiusRatio ?? 1.025,
                body.atmosphereScattering.outerRadiusRatio ?? 1.025,
              ]}
            >
              {/* Earth is the only `atmosphereScattering` body and is
                  deliberately unflagged for figure, so this branch always
                  takes the sphere today. Kept symmetric so a future flattened
                  atmosphere body gets a conformal shell rather than a sphere
                  around an ellipsoid — the catalog test forbids that pairing
                  until the Nishita integrator learns ellipsoids. */}
              {figureGeometry ? (
                <primitive object={figureGeometry} attach="geometry" />
              ) : (
                <sphereGeometry args={[1, 64, 64]} />
              )}
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

        {/* Cloud Rotation Group — super-rotates independently of the solid body */}
        <group ref={cloudRotationRef}>
          {/* 2. Cloud Layer — T3.4 collapsed. Pre-T3.4 this was split
              into two meshes: a visible cloud mesh with castShadow=false,
              and an invisible "shadow caster" mesh at the same scale
              with an opacity=0 basic material + customDepthMaterial.
              T3.4 merges into one mesh: the visible cloud casts its own
              shadow via the attached `cloudShadowMaterial` as
              customDepthMaterial — Three.js uses the main material for
              the forward pass and the custom depth material for the
              shadow pass. Silhouette alignment is enforced by the shared
              `CLOUD_SHADOW_LUMA_CUTOFF` constant in usePlanetMaterials.ts
              and the Rec.709 luma convention matching Gaia luma.glsl. */}
          {cloudMaterial && (
            <mesh scale={[1.01, 1.01, 1.01]} castShadow receiveShadow={false}>
              {/* Earth is the only body with a cloud texture, so this also
                  always takes the sphere today; symmetric for the same reason
                  as the atmosphere shell above. The uniform 1.01 stays a
                  uniform scale on the mesh — it inflates the figure, it does
                  not reshape it. */}
              {figureGeometry ? (
                <primitive object={figureGeometry} attach="geometry" />
              ) : (
                <sphereGeometry args={[1, 64, 64]} />
              )}
              <primitive object={cloudMaterial} attach="material" />
              {cloudShadowMaterial && (
                <primitive
                  object={cloudShadowMaterial}
                  attach="customDepthMaterial"
                />
              )}
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
  ringShadowIntensity: number;
  nightLightIntensity: number;
  qualityProfileName: ResolvedQualityName;
  sunRenderMode: ResolvedSunRenderMode;
  assetPriority: number;
  cameraInterest: CameraAssetInterest;
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
    // W5 — the fallback carries the figure too. It has no tilt or spin group
    // under it, so a per-axis scale here is safe (there is no rotation to
    // shear), and without it the boot frame and every model body below the
    // salience gate would re-commit the round-Quaoar bug in miniature.
    const [ax, ay, az] = AstroPhysics.resolveBodyAxisScale({
      body: props.body,
      scaleMode,
    });
    meshRef.current.scale.set(ax, ay, az);
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
      props.assetPriority === 0 ||
      (props.cameraInterest.visibility === "visible" &&
        props.cameraInterest.salience >= 0.38);

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
            ringShadowIntensity={props.ringShadowIntensity}
            qualityProfileName={props.qualityProfileName}
            assetPriority={props.assetPriority}
            textureSalience={props.cameraInterest.salience}
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
  ringShadowIntensity,
  nightLightIntensity,
  qualityProfileName,
  sunRenderMode,
}: PlanetProps) => {
  const groupRef = useRef<THREE.Group>(null);
  const orbitLineRef = useRef<Line2 | null>(null);
  const progradeRef = useRef<THREE.Group>(null);
  const [cameraInterest, setCameraInterest] = useState<CameraAssetInterest>(
    HIDDEN_CAMERA_ASSET_INTEREST
  );
  const cameraInterestRef = useRef(cameraInterest);
  const lastInterestSampleAtRef = useRef(Number.NEGATIVE_INFINITY);
  const pendingInterestRef = useRef<{
    interest: CameraAssetInterest;
    since: number;
  } | null>(null);

  // Split the satellites by the frame their position source uses, so each
  // group lands under the right container below. Memoised on the `children`
  // identity: `Children.toArray` clones every element, so recomputing on a
  // parent-only re-render (focus change, the 4 Hz clock tick) would defeat
  // React's element-identity bail-out and re-render every moon subtree.
  const { eclipticChildren, equatorialChildren } = useMemo(() => {
    const ecliptic: ReactNode[] = [];
    const equatorial: ReactNode[] = [];

    for (const child of Children.toArray(children)) {
      const childBodyId = isValidElement<{ body?: CelestialBody }>(child)
        ? child.props.body?.id
        : undefined;

      if (childBodyId && satelliteUsesParentEquatorialFrame(childBodyId)) {
        equatorial.push(child);
      } else {
        ecliptic.push(child);
      }
    }

    return { eclipticChildren: ecliptic, equatorialChildren: equatorial };
  }, [children]);

  const scaleMode = useStore((state) => state.scaleMode);
  const showOrbits = useStore((state) => state.showOrbits);
  const declutterOrbits = useStore((state) => state.declutterOrbits);
  const focusId = useStore((state) => state.focusId);
  const showProgradeVector = useStore((state) => state.showProgradeVector);
  const visualPreset = useStore((state) => state.visualPreset);
  // UI-rate tick driven by simulationClock via the store bridge. We
  // subscribe to this only so React-level memos (orbitPoints) invalidate
  // at ~4 Hz while the simulation is playing. All high-frequency reads
  // inside useFrame use simulationClock.getNow() directly so the
  // component does not re-render at 60 Hz.
  const displayedDatetime = useStore((state) => state.displayedDatetime);

  /**
   * Parent pole for the legacy parent-equatorial satellites — after W6 stage B
   * that is Vanth and Weywot only, the two TNO moons with no measured orbit to
   * invert. Applied by React on reconciliation rather than per frame.
   *
   * Documented approximation: this evaluates the parent's pole at the 4 Hz
   * store tick instead of at 60 Hz. IAU poles move by degrees per *century*,
   * so the error is unmeasurable; what this buys is not re-rendering every
   * moon subtree at frame rate. The visual body's own pole, which must track
   * the spin exactly, is written in `useFrame` instead — see `PlanetVisual`.
   */
  const satelliteMountQuaternion = useMemo(
    () => computeBodyPoleQuaternion(body, dateToTDB(displayedDatetime)),
    [body, displayedDatetime]
  );
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

  const { orbitSalience, assetPriority } = useOrbitalSalience(
    body,
    focusId,
    declutterOrbits
  );

  const parentBody = useMemo(
    () => (body.parentId ? (BODIES_BY_ID.get(body.parentId) ?? null) : null),
    [body.parentId]
  );
  const orbitDateBucket = useMemo(
    () => getOrbitDateBucket(body, displayedDatetime),
    [body, displayedDatetime]
  );

  // `displayedDatetime` is used inside the memo (passed to
  // `getOrbitalDisplayOrbitPoints`) but intentionally NOT listed in
  // the dep array. Invalidation is gated by `orbitDateBucket`, which
  // is itself derived from `displayedDatetime` and only flips when we
  // cross a per-body bucket (hours to a month depending on orbital
  // period). Within a bucket the polyline is topologically identical
  // — we sweep an osculating ellipse at the bucket epoch — so feeding
  // a slightly-stale Date is safe, and the ORBIT_POINTS_CACHE keyed
  // on bucket guarantees we never actually observe the difference.
  // Before Onda 1 this extra dep caused the memo to invalidate at
  // ~60 Hz per body (2 700 invalidations/s across the catalogue) via
  // the per-frame `datetime` write; now that write is gone and the
  // dep list narrows to the real invalidators.
  const orbitPoints = useMemo(() => {
    if (body.type === "star") return null;
    if (declutterOrbits && orbitSalience <= 0) return null;

    const segments = getOrbitSegments({
      bodyId: body.id,
      focusId,
      orbitProfile: qualityProfileName,
    });

    const cacheKey = getOrbitCacheKey({
      bodyId: body.id,
      focusId,
      orbitProfile: qualityProfileName,
      scaleMode,
      dateBucket: orbitDateBucket,
    });

    const cachedPoints = ORBIT_POINTS_CACHE.get(cacheKey);
    if (cachedPoints) {
      return cachedPoints;
    }

    const pts = getOrbitalDisplayOrbitPoints({
      body,
      parentBody,
      date: displayedDatetime,
      segments,
      scaleMode,
    });

    if (ORBIT_POINTS_CACHE.size >= MAX_ORBIT_CACHE_ENTRIES) {
      ORBIT_POINTS_CACHE.clear();
    }
    ORBIT_POINTS_CACHE.set(cacheKey, pts);
    return pts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    body,
    declutterOrbits,
    orbitSalience,
    orbitDateBucket,
    parentBody,
    focusId,
    qualityProfileName,
    scaleMode,
  ]);

  useFrame((state) => {
    const { camera, size } = state;
    if (!groupRef.current) return;

    // 1. Update Group Position (Orbital motion). Read the sim clock
    // directly so useFrame never participates in React re-renders.
    const simNow = simulationClock.getNow();
    const pos = resolveOrbitalDisplayPosition({
      body,
      parentBody,
      date: simNow,
      scaleMode,
    });
    groupRef.current.position.copy(pos);

    // Asset streaming is camera-driven, not render-tree-driven. Three may
    // frustum-cull a mesh, but that does not stop React hooks from fetching its
    // textures. Sample at a controlled cadence, promote immediately, and delay
    // demotion briefly so a body near the viewport edge does not thrash tiers.
    const nowMs = state.clock.elapsedTime * 1_000;
    if (
      camera instanceof THREE.PerspectiveCamera &&
      nowMs - lastInterestSampleAtRef.current >= CAMERA_ASSET_INTEREST_SAMPLE_MS
    ) {
      lastInterestSampleAtRef.current = nowMs;
      groupRef.current.getWorldPosition(TMP_ASSET_WORLD_POS);

      let visualRadius = AstroPhysics.resolveSemanticBodyRadius({
        body,
        scaleMode,
      });
      if (body.model?.scale) {
        visualRadius *= body.model.scale;
      }
      // W5 — the `Math.max(...body.shapeScale)` multiply that used to sit here
      // was a double-apply: `resolveSemanticBodyRadius` already returns the
      // largest semi-axis, so Quaoar's asset-interest radius was inflated by
      // 1.18² = 1.39×, promoting its texture tier earlier than any other body.

      const nextInterest = resolveCameraAssetInterest({
        camera,
        viewportWidth: size.width,
        viewportHeight: size.height,
        worldPosition: TMP_ASSET_WORLD_POS,
        worldRadius: visualRadius,
        focused: body.id === focusId,
      });
      const currentInterest = cameraInterestRef.current;

      if (cameraAssetInterestEquals(currentInterest, nextInterest)) {
        pendingInterestRef.current = null;
      } else if (
        isCameraAssetInterestPromotion(currentInterest, nextInterest)
      ) {
        pendingInterestRef.current = null;
        cameraInterestRef.current = nextInterest;
        setCameraInterest(nextInterest);
      } else {
        const pending = pendingInterestRef.current;
        if (
          !pending ||
          !cameraAssetInterestEquals(pending.interest, nextInterest)
        ) {
          pendingInterestRef.current = {
            interest: nextInterest,
            since: nowMs,
          };
        } else if (nowMs - pending.since >= CAMERA_ASSET_INTEREST_DEMOTION_MS) {
          pendingInterestRef.current = null;
          cameraInterestRef.current = nextInterest;
          setCameraInterest(nextInterest);
        }
      }
    }

    // 2. Adaptive fade for ALL bodies based on camera distance (both modes)
    if (orbitLineRef.current) {
      // For moons (geocentric), we need world position. For planets, group position is world position.
      const worldPos = TMP_WORLD_POS;
      groupRef.current.getWorldPosition(worldPos);
      const distance = camera.position.distanceTo(worldPos);

      let planetSize: number;
      let sizeMultiplier: number;

      if (scaleMode === "didactic") {
        // In didactic mode, use algorithmic sizes
        planetSize = AstroPhysics.resolveSemanticBodyRadius({
          body,
          scaleMode: "didactic",
        });

        if (body.type === "star") {
          sizeMultiplier = 15;
        } else if (body.type === "moon") {
          sizeMultiplier = 10;
        } else {
          sizeMultiplier = 20;
        }
      } else {
        // In realistic mode, use actual scale with logarithmic multipliers
        planetSize = AstroPhysics.resolveSemanticBodyRadius({
          body,
          scaleMode: "realistic",
        });
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
        const worldPos = TMP_WORLD_POS;
        groupRef.current.getWorldPosition(worldPos);

        // Pick a delta that corresponds to ~0.1° of mean anomaly (clamped).
        const meanMotion = Math.max(1e-6, Math.abs(body.orbit?.n ?? 1e-6));
        const dtDays = THREE.MathUtils.clamp(0.1 / meanMotion, 1 / 1440, 60);
        const dtMs = dtDays * 86400000;

        const later = new Date(simNow.getTime() + dtMs);
        const posLater = resolveOrbitalDisplayPosition({
          body,
          parentBody,
          date: later,
          scaleMode,
        });

        const velDir = posLater.sub(pos).normalize();

        const radius =
          scaleMode === "didactic"
            ? AstroPhysics.resolveSemanticBodyRadius({
                body,
                scaleMode: "didactic",
              })
            : AstroPhysics.resolveSemanticBodyRadius({
                body,
                scaleMode: "realistic",
              });

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
        <PlanetOrbitLine
          ref={orbitLineRef}
          points={orbitPoints}
          color={body.color}
          isFocused={body.id === focusId}
          orbitSalience={orbitSalience}
        />
      )}

      <group ref={groupRef} name={body.id}>
        {showProgradeVector && focusId === body.id && body.type !== "star" && (
          <PlanetMotionOverlays
            ref={progradeRef}
            progradeColors={progradeColors}
          />
        )}
        <PlanetVisualWrapper
          body={body}
          roughness={roughness}
          metalness={metalness}
          sunEmissive={sunEmissive}
          ringShadowIntensity={ringShadowIntensity}
          nightLightIntensity={nightLightIntensity}
          qualityProfileName={qualityProfileName}
          sunRenderMode={sunRenderMode}
          assetPriority={assetPriority}
          cameraInterest={cameraInterest}
        />

        {/*
          Children are positioned by their OWN provider, so the frame of that
          provider decides whether this container may rotate them. Analytical
          satellites already come back in J2000 ecliptic (see
          `satelliteUsesParentEquatorialFrame`) and must stay unrotated; only
          the legacy Keplerian satellites, whose elements are parent-equatorial,
          go under the pole quaternion. The planet's own visual tilt is applied
          independently in `PlanetVisual` / `PlanetModel` and is unaffected.
        */}
        {eclipticChildren.length > 0 && <group>{eclipticChildren}</group>}
        {equatorialChildren.length > 0 && (
          <group quaternion={satelliteMountQuaternion}>
            {equatorialChildren}
          </group>
        )}
      </group>
    </>
  );
};
