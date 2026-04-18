import { Canvas, useThree, useFrame } from "@react-three/fiber";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  OrbitControls as DreiOrbitControls,
  Environment,
} from "@react-three/drei";
import { StarfieldManager } from "./StarfieldManager";
import * as THREE from "three";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import {
  resolveDeferredTextureBudget,
  setDeferredTextureBudget,
} from "../../lib/deferredTextureCache";
import { isCriticalStarfieldReady } from "../../lib/sceneReadiness";
import { resolveSunRenderMode } from "../../lib/sunRenderMode";
import { SolarSystem } from "./SolarSystem";
import { CameraController } from "./CameraController";
import { InitialCameraAnimation } from "./InitialCameraAnimation";
import { OrbitalEngineDebugReporter } from "./OrbitalEngineDebugReporter";
import { OverlayPositionTracker } from "./OverlayPositionTracker";
import { PlanetOverlay } from "./PlanetOverlay";
import { SceneReadyChecker } from "./SceneReadyChecker";
import { EclipticGrid } from "./EclipticGrid";
import { resolveVisualRadiusWorld } from "./useSunScreenProjection";

import { useStore } from "../../store";

// Lazy: procedural shader module only loads when sun render mode is "procedural".
// Photo-mode users (majority) never download the shader chunk.
const ProceduralSun3D = lazy(() =>
  import("./ProceduralSun3D").then((m) => ({ default: m.ProceduralSun3D }))
);

// Lazy: Leva is a debug-only chrome panel. We gate behind `debugMode` so
// non-debug users never download the chunk at all. `useControls`/`folder`/
// `button` (hook API) are imported synchronously where needed — only the
// UI panel component is lazy.
const Leva = lazy(() => import("leva").then((m) => ({ default: m.Leva })));
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  ORBIT_MOUSE_BUTTONS,
  accumulateWheelZoomSteps,
  calculateAdaptiveZoomSpeed,
} from "../../lib/camera";
import {
  PostProcessingPipeline,
  type BloomController,
  type HueSaturationController,
  type BrightnessContrastController,
} from "./scene/PostProcessingPipeline";
import { SceneLighting } from "./scene/SceneLighting";
import {
  useVisualPresetLerp,
  type DebugValues,
} from "./scene/useVisualPresetLerp";
import { useSceneDebugControls } from "./scene/useSceneDebugControls";

const CriticalSceneAssetsGate = () => {
  const showStarfield = useStore((state) => state.showStarfield);
  const starfieldSource = useStore((state) => state.starfieldSource);
  const starfieldProviderStates = useStore(
    (state) => state.starfieldProviderStates
  );
  const setCriticalAssetsReady = useStore(
    (state) => state.setCriticalAssetsReady
  );

  useEffect(() => {
    const providerState = starfieldProviderStates[starfieldSource];
    const ready = isCriticalStarfieldReady(
      showStarfield,
      providerState?.status
    );

    setCriticalAssetsReady(ready);

    return () => setCriticalAssetsReady(false);
  }, [
    setCriticalAssetsReady,
    showStarfield,
    starfieldProviderStates,
    starfieldSource,
  ]);

  return null;
};

const DeferredTextureBudgetGate = ({
  profileName,
}: {
  profileName: "ultra" | "high" | "balanced" | "constrained";
}) => {
  useEffect(() => {
    setDeferredTextureBudget(resolveDeferredTextureBudget(profileName));
  }, [profileName]);

  return null;
};

/**
 * Dynamic zoom speed based on camera distance.
 * Close to planets: slow zoom for precision
 * Far away: fast zoom to cover astronomical distances
 */
const DynamicZoom = ({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) => {
  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    controls.zoomSpeed = calculateAdaptiveZoomSpeed(
      controls.getDistance(),
      controls.minDistance
    );
  });

  return null;
};

const NormalizedWheelZoom = ({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) => {
  const { gl } = useThree();
  const pendingWheelStepsRef = useRef(0);

  useEffect(() => {
    const element = gl.domElement;

    const handleWheelCapture = (event: WheelEvent) => {
      const controls = controlsRef.current;
      if (!controls || !controls.enabled || !controls.enableZoom) return;

      event.preventDefault();
      event.stopImmediatePropagation();

      const { stepCount, pendingSteps } = accumulateWheelZoomSteps({
        pendingSteps: pendingWheelStepsRef.current,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
      });
      pendingWheelStepsRef.current = pendingSteps;

      if (stepCount === 0) return;

      controls.dispatchEvent({ type: "start", target: controls });

      for (let stepIndex = 0; stepIndex < Math.abs(stepCount); stepIndex++) {
        const zoomScale = controls.getZoomScale();

        if (stepCount > 0) {
          controls.dollyOut(zoomScale);
        } else {
          controls.dollyIn(zoomScale);
        }
      }

      controls.update();
      controls.dispatchEvent({ type: "end", target: controls });
    };

    element.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: false,
    });

    return () => {
      element.removeEventListener("wheel", handleWheelCapture, true);
    };
  }, [controlsRef, gl.domElement]);

  return null;
};

interface VisualPresetLerpBridgeProps {
  bloomRef: RefObject<BloomController | null>;
  hueSatRef: RefObject<HueSaturationController | null>;
  brightnessRef: RefObject<BrightnessContrastController | null>;
  ambientLightRef: RefObject<THREE.AmbientLight | null>;
  sunLightRef: RefObject<THREE.PointLight | null>;
  smartSunLightRef: RefObject<THREE.DirectionalLight | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  debugValues: DebugValues;
  debugMode: boolean;
  bloomIntensityMultiplier: number;
}

const VisualPresetLerpBridge = (props: VisualPresetLerpBridgeProps) => {
  useVisualPresetLerp(props);
  return null;
};

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);
  const qualityMode = useStore((state) => state.qualityMode);
  const sunRenderMode = useStore((state) => state.sunRenderMode);
  const visualPreset = useStore((state) => state.visualPreset); // Get current preset
  const debugMode = useStore((state) => state.debugMode);
  const toggleDebugMode = useStore((state) => state.toggleDebugMode);
  const showEclipticGrid = useStore((state) => state.showEclipticGrid);
  const scaleMode = useStore((state) => state.scaleMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const resolvedSunRenderMode = useMemo(
    () => resolveSunRenderMode(sunRenderMode, qualityProfile.name),
    [qualityProfile.name, sunRenderMode]
  );
  const [rendererAntialias] = useState(() => qualityProfile.antialias);
  const canvasDpr = useMemo(
    () => [1, qualityProfile.dprMax] as [number, number],
    [qualityProfile.dprMax]
  );
  const cameraConfig = useMemo(
    () => ({
      position: [-95809369, 999990981402, 4245931557] as [
        number,
        number,
        number,
      ],
      fov: 45,
      near: 0.1,
      far: 1e15,
    }),
    []
  );
  const sunBody = useMemo(() => BODIES_BY_ID.get("sun") ?? null, []);
  const sunVisualRadiusWorld = useMemo(() => {
    if (!sunBody) {
      return 0;
    }

    return resolveVisualRadiusWorld({
      radiusKm: sunBody.radiusKm,
      scaleMode,
      shapeScale: sunBody.shapeScale,
    });
  }, [scaleMode, sunBody]);
  const glConfig = useMemo(
    () => ({
      // The WebGL antialias flag is fixed at context creation time.
      // Keeping it stable avoids context loss when users switch profiles live.
      antialias: rendererAntialias,
      logarithmicDepthBuffer: true,
    }),
    [rendererAntialias]
  );
  const handleCanvasCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      gl.toneMapping = THREE.ReinhardToneMapping;
    },
    []
  );

  const bloomRef = useRef<BloomController | null>(null);
  const hueSatRef = useRef<HueSaturationController | null>(null);
  const brightnessRef = useRef<BrightnessContrastController | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sunLightRef = useRef<THREE.PointLight | null>(null);
  const smartSunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const values = useSceneDebugControls({
    visualPreset,
    debugMode,
    controlsRef,
  });

  const {
    ambientIntensity,
    sunIntensity,
    shadowIntensity,
    envMapIntensity,
    bloomThreshold,
    bloomIntensity,
    bloomRadius,
    saturation,
    contrast,
    brightness,
    roughness,
    metalness,
    sunEmissive,
    ringEmissive,
    ringShadowIntensity,
    earthRotationOffset,
    nightLightIntensity,
  } = values;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        e.preventDefault();
        toggleDebugMode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleDebugMode]);

  const debugValues = {
    ambientIntensity,
    sunIntensity,
    shadowIntensity,
    envMapIntensity,
    bloomThreshold,
    bloomIntensity,
    bloomRadius,
    saturation,
    contrast,
    brightness,
  };

  return (
    <>
      {debugMode && (
        <Suspense fallback={null}>
          <Leva theme={{ sizes: { rootWidth: "350px" } }} hidden={!debugMode} />
        </Suspense>
      )}
      <Canvas
        shadows="soft"
        onPointerMissed={() => setSelectedId(null)}
        dpr={canvasDpr}
        camera={cameraConfig}
        gl={glConfig}
        onCreated={handleCanvasCreated}
      >
        <VisualPresetLerpBridge
          bloomRef={bloomRef}
          hueSatRef={hueSatRef}
          brightnessRef={brightnessRef}
          ambientLightRef={ambientLightRef}
          sunLightRef={sunLightRef}
          smartSunLightRef={smartSunLightRef}
          controlsRef={controlsRef}
          debugValues={debugValues}
          debugMode={debugMode}
          bloomIntensityMultiplier={qualityProfile.bloomIntensityMultiplier}
        />
        <color attach="background" args={["#000000"]} />
        {showEclipticGrid && <EclipticGrid />}
        <Suspense fallback={null}>
          <StarfieldManager />
          <Environment
            resolution={qualityProfile.environmentResolution}
            frames={1}
            far={1e9}
          >
            {/* Starfield removed from Environment - was causing planet lighting issues */}
            {/* Only sun mesh for reflections */}
            <mesh position={[0, 0, 0]} scale={[100, 100, 100]}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshBasicMaterial color={[10, 10, 10]} toneMapped={false} />
            </mesh>
          </Environment>
        </Suspense>

        <SceneLighting
          ambientLightRef={ambientLightRef}
          sunLightRef={sunLightRef}
          smartSunLightRef={smartSunLightRef}
          shadowMapSize={qualityProfile.shadowMapSize}
        />

        <Suspense fallback={null}>
          <SolarSystem
            roughness={roughness}
            metalness={metalness}
            sunEmissive={sunEmissive}
            ringEmissive={ringEmissive}
            ringShadowIntensity={ringShadowIntensity}
            earthRotationOffset={earthRotationOffset}
            nightLightIntensity={nightLightIntensity}
            qualityProfileName={qualityProfile.name}
            sunRenderMode={resolvedSunRenderMode}
          />
        </Suspense>
        {resolvedSunRenderMode === "procedural" && (
          <Suspense fallback={null}>
            <ProceduralSun3D
              qualityProfileName={qualityProfile.name}
              sunVisualRadiusWorld={sunVisualRadiusWorld}
            />
          </Suspense>
        )}
        <OverlayPositionTracker />
        <CameraController />
        <InitialCameraAnimation />
        <DreiOrbitControls
          ref={controlsRef}
          enablePan={true}
          enableDamping={true}
          dampingFactor={0.05}
          maxDistance={1e12} // Large distance for proper zoom
          minDistance={10} // Increased to prevent near-plane clipping/jitter
          zoomSpeed={2.0}
          mouseButtons={ORBIT_MOUSE_BUTTONS}
          makeDefault
        />
        <DynamicZoom controlsRef={controlsRef} />
        <NormalizedWheelZoom controlsRef={controlsRef} />

        {qualityProfile.name !== "constrained" && (
          <PostProcessingPipeline
            bloomRef={bloomRef}
            hueSatRef={hueSatRef}
            brightnessRef={brightnessRef}
            bloomEnabled={qualityProfile.bloomEnabled}
          />
        )}
        <DeferredTextureBudgetGate profileName={qualityProfile.name} />
        <CriticalSceneAssetsGate />
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
      <OrbitalEngineDebugReporter />
    </>
  );
};
