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
  useProgress,
} from "@react-three/drei";
import { StarfieldManager } from "./StarfieldManager";
import * as THREE from "three";
import { BODIES_BY_ID } from "../../data/celestialBodies";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { useEffectiveGraphics } from "../../hooks/useEffectiveGraphics";
import { shouldMountBloom } from "../../lib/graphics/bloomGate";
import { detectWebGLSupport } from "../../lib/graphics/webglSupport";
import { registerWebglContextLossHandlers } from "../../lib/graphics/webglContextLoss";
import { AppCrashCard } from "../utils/AppCrashCard";
import { WebGLUnavailableCard } from "../ui/WebGLUnavailableCard";
import {
  resolveDeferredTextureBudget,
  setDeferredTextureBudget,
} from "../../lib/deferredTextureCache";
import { isCriticalStarfieldReady } from "../../lib/sceneReadiness";
import { parseHygFocusId } from "../../lib/focus/hygFocusResolver";
import { resolveSunRenderMode } from "../../lib/sunRenderMode";
import { SolarSystem } from "./SolarSystem";
import { SunBillboard } from "./SunBillboard";
import { CameraController } from "./CameraController";
import { SurfaceModeFirstPerson } from "./SurfaceModeFirstPerson";
import { InitialCameraAnimation } from "./InitialCameraAnimation";
import { OrbitalEngineDebugReporter } from "./OrbitalEngineDebugReporter";
import { OverlayPositionTracker } from "./OverlayPositionTracker";
import { PlanetLabels3D } from "./PlanetLabels3D";
import { PlanetOverlay } from "./PlanetOverlay";
import { SceneReadyChecker } from "./SceneReadyChecker";
import { GridDecadeLabel } from "./GridDecadeLabel";
import { GridRegionLabel } from "./GridRegionLabel";
import { GridRecursive } from "./GridRecursive";
import { resolveVisualRadiusWorld } from "./useSunScreenProjection";

import { useStore } from "../../store";

// Lazy: procedural shader module only loads when sun render mode is "procedural".
// Photo-mode users (majority) never download the shader chunk.
const ProceduralSun3D = lazy(() =>
  import("./ProceduralSun3D").then((m) => ({ default: m.ProceduralSun3D }))
);

// T6.3-β: HYG procedural-mesh wrapper. Lazy-loaded to keep the
// stellar-physics + procedural-sun shader chunk out of the boot
// path until a user actually focuses a HYG star. Self-gates on
// `focusId` matching `hyg:K` and the solid-angle hysteresis gate
// (T6.3-α); inactive when focus is on a curated body or the gate
// reports below threshold.
const HygStellarMesh = lazy(() =>
  import("./HygStellarMesh").then((m) => ({ default: m.HygStellarMesh }))
);

import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import {
  ORBIT_MOUSE_BUTTONS,
  accumulateWheelZoomSteps,
  calculateAdaptiveZoomSpeed,
} from "../../lib/camera";
import {
  addZoomImpulse,
  consumeZoomVelocity,
} from "../../lib/camera/zoomPhysics";
import {
  PostProcessingPipeline,
  type BloomController,
  type HueSaturationController,
  type BrightnessContrastController,
} from "./scene/PostProcessingPipeline";
import { SceneLighting } from "./scene/SceneLighting";
import { useVisualPresetLerp } from "./scene/useVisualPresetLerp";
import type { GraphicsOverrides } from "./scene/visualPresetOverrides";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_PLANET_METALNESS,
  DEFAULT_PLANET_ROUGHNESS,
  EARTH_NIGHT_LIGHT_INTENSITY,
  EARTH_ROTATION_OFFSET_DEG,
  RING_EMISSIVE_POWER,
  RING_SHADOW_INTENSITY,
  SUN_EMISSIVE_POWER,
} from "../../config/artistCalibration";

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
  // Pre-T4.2-γ: this ref accumulated fractional wheel deltas into
  // integer "logical zoom steps" that were then dispatched directly.
  // Post-T4.2-γ: the same accumulator still produces step counts, but
  // they feed an INERTIAL VELOCITY buffer rather than triggering an
  // immediate dolly. The per-frame integrator below decays the
  // velocity exponentially and dispatches fractional dolly calls until
  // it crosses the deadzone — Gaia-faithful coast-down for the wheel.
  const pendingWheelStepsRef = useRef(0);
  // T4.2-γ — zoom velocity buffer + active-flick flag. Mirror of
  // Gaia's `vel` scalar in `NaturalCamera.java` (1D form for the
  // wheel-only port). Sign convention matches `accumulateWheelZoomSteps`:
  // positive = zoom out (dollyOut), negative = zoom in (dollyIn).
  const zoomVelocityRef = useRef(0);
  // Tracks whether the current velocity coast-down is "active" so we
  // dispatch one `start` / one `end` per flick instead of per frame.
  // The CameraController listens for `start` to cancel any in-flight
  // privileged-position transition (`Scene.tsx:CameraController`
  // useEffect at line 286-297).
  const isCoastingRef = useRef(false);

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

      // Push the impulse onto the velocity buffer. The per-frame
      // integrator below picks it up next tick and starts dispatching
      // fractional dolly calls until friction brings velocity back
      // below the deadzone.
      zoomVelocityRef.current = addZoomImpulse(
        zoomVelocityRef.current,
        stepCount
      );

      // First flick after rest → fire `start` so any in-flight
      // privileged-position transition cancels (CameraController
      // listens for this).
      if (!isCoastingRef.current) {
        controls.dispatchEvent({ type: "start", target: controls });
        isCoastingRef.current = true;
      }
    };

    element.addEventListener("wheel", handleWheelCapture, {
      capture: true,
      passive: false,
    });

    return () => {
      element.removeEventListener("wheel", handleWheelCapture, true);
    };
  }, [controlsRef, gl.domElement]);

  // Per-frame integrator. Runs every frame regardless of wheel input;
  // when velocity is 0 it's a no-op. When non-zero, applies friction
  // → fractional dolly via OrbitControls' multiplicative dolly API.
  // OrbitControls reads `scope.scale` inside `update()` and resets
  // it each frame, so dispatching multiple dolly calls per frame is
  // safe (they compose into the next `scale`).
  // Defensive try/catch (added 2026-04-23 alongside SceneReadyChecker
  // safety hatch): any throw here would kill R3F's entire frame loop,
  // which prevents SceneReadyChecker from advancing → loader hangs at
  // 96 %. Wrap so the worst case is a single dropped zoom-tick + a
  // console error, instead of the whole canvas being dead.
  useFrame((_, dt) => {
    try {
      const controls = controlsRef.current;
      if (!controls) return;

      const velocity = zoomVelocityRef.current;
      if (velocity === 0) return;

      const { nextVelocity, frameSteps } = consumeZoomVelocity(velocity, dt);
      zoomVelocityRef.current = nextVelocity;

      if (frameSteps !== 0) {
        // Convert fractional steps to OrbitControls' multiplicative
        // dolly API. `controls.getZoomScale()` returns the per-step
        // scale factor (typically ~0.9 with zoomSpeed=2); raising it
        // to the absolute frameSteps preserves the sign-aware
        // cumulative effect.
        const dollyScale = Math.pow(
          controls.getZoomScale(),
          Math.abs(frameSteps)
        );
        if (frameSteps > 0) {
          controls.dollyOut(dollyScale);
        } else {
          controls.dollyIn(dollyScale);
        }
        controls.update();
      }

      if (nextVelocity === 0 && isCoastingRef.current) {
        // Velocity decayed below deadzone — fire `end` so callers can
        // resume any logic that was paused at `start`.
        controls.dispatchEvent({ type: "end", target: controls });
        isCoastingRef.current = false;
      }
    } catch (err) {
      console.error("[NormalizedWheelZoom] frame error:", err);
      // Reset to a known-good state so subsequent frames don't keep
      // throwing on a stuck velocity.
      zoomVelocityRef.current = 0;
      isCoastingRef.current = false;
    }
  });

  return null;
};

/**
 * T6.4-M2.5 Codex round-3 P2 — test-only camera probe.
 *
 * Exposes `window.__ATLAS_TEST_CAMERA__()` returning the current
 * camera world position, OrbitControls target, and quaternion as
 * plain objects (no Three.js types crossing the Playwright bridge).
 * Production-inert: gated on `__ATLAS_TEST_FREEZE__` (the same flag
 * `store.ts` reads to pin the simulation clock); tree-shaken away
 * for end users because the parent only mounts when the flag is
 * true at module-eval time.
 *
 * Used by `e2e/hyg-focus.spec.ts` to verify the M2.5 flight contract:
 * target lerps (not snapped at setup), landing distance lands in
 * the [400, 1000] wu bracket post-C-1 angular-radius math fix.
 */
const TestCameraProbe = ({
  controlsRef,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>;
}) => {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    type CameraSnapshot = {
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
      quaternion: { x: number; y: number; z: number; w: number };
    };
    const w = window as unknown as {
      __ATLAS_TEST_CAMERA__?: () => CameraSnapshot;
    };
    w.__ATLAS_TEST_CAMERA__ = () => {
      const t = controlsRef.current?.target;
      return {
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        target: t ? { x: t.x, y: t.y, z: t.z } : { x: 0, y: 0, z: 0 },
        quaternion: {
          x: camera.quaternion.x,
          y: camera.quaternion.y,
          z: camera.quaternion.z,
          w: camera.quaternion.w,
        },
      };
    };
    return () => {
      delete (window as unknown as { __ATLAS_TEST_CAMERA__?: unknown })
        .__ATLAS_TEST_CAMERA__;
    };
  }, [camera, controlsRef]);
  return null;
};

/**
 * Hard boot deadline for the whole scene, enforced OUTSIDE the R3F tree.
 *
 * `SceneReadyChecker`'s own 8 s safety hatch only arms once
 * `criticalAssetsReady` is true — i.e. once a Canvas child actually
 * mounted and ran its effect. It therefore cannot cover a renderer that
 * dies before/while being constructed: nothing inside the Canvas ever
 * runs, the loader stays capped at the "boot"/"render" stage, and the
 * user waits forever with no error surface.
 *
 * The window is re-armed on every asset-loader event (see the effect in
 * `Scene`), so it measures *silence*, not total boot duration — a slow
 * machine still streaming assets never trips it. It also sits above the
 * 8 s hatch, so the normal path always wins the race. Last resort, not a
 * competing timer.
 *
 * 2026-07-23 — raised 15 s → 30 s. The watchdog is now a pure BACKSTOP:
 * the honest failure signal for the user's real symptom (GPU VRAM
 * exhaustion killing the WebGL context → white canvas) is the direct
 * `webglcontextlost` listener wired in `handleCanvasCreated`, not this
 * blind timer. Two reasons the old 15 s was too aggressive as a backstop:
 * (1) `useProgress` (drei's loader store) does NOT observe atlas's custom
 * `deferredTextureCache` pipeline, so "no progress event" is a weak proxy
 * — a healthy boot can legitimately go silent for >15 s while custom
 * textures stream. (2) Real-hardware boots here measured 55–59 s wall
 * time. 30 s of *silence* (not total duration — the window re-arms on
 * every loader event) only trips on a genuine hang, keeping the honest
 * criterion: the card appears on real failure (context-lost, detected
 * directly) or a true stall, never on a slow-but-healthy boot.
 */
const SCENE_BOOT_WATCHDOG_MS = 30_000;

const isTestFreezeActive =
  typeof window !== "undefined" &&
  Boolean(
    (window as unknown as { __ATLAS_TEST_FREEZE__?: boolean })
      .__ATLAS_TEST_FREEZE__
  );

interface VisualPresetLerpBridgeProps {
  bloomRef: RefObject<BloomController | null>;
  hueSatRef: RefObject<HueSaturationController | null>;
  brightnessRef: RefObject<BrightnessContrastController | null>;
  ambientLightRef: RefObject<THREE.AmbientLight | null>;
  sunLightRef: RefObject<THREE.PointLight | null>;
  smartSunLightRef: RefObject<THREE.DirectionalLight | null>;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  bloomIntensityMultiplier: number;
  /** User-facing override layer from `graphicsSlice.graphicsOverrides`. */
  userOverrides: GraphicsOverrides;
}

const VisualPresetLerpBridge = (props: VisualPresetLerpBridgeProps) => {
  useVisualPresetLerp(props);
  return null;
};

export const Scene = () => {
  const setSelectedId = useStore((state) => state.setSelectedId);
  const qualityMode = useStore((state) => state.qualityMode);
  const sunRenderMode = useStore((state) => state.sunRenderMode);
  const showEclipticGrid = useStore((state) => state.showEclipticGrid);
  const scaleMode = useStore((state) => state.scaleMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const effectiveGraphics = useEffectiveGraphics();
  // Wave α P1.1 fix: pull graphicsOverrides from the slice so the
  // DisplayPanel's sliders actually reach useVisualPresetLerp. Shallow-
  // select to avoid re-render on unrelated store fields (L19).
  const graphicsOverrides = useStore(
    useShallow((state) => state.graphicsOverrides)
  );
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
  // (c) direct context-loss surface. The user's real symptom is GPU VRAM
  // exhaustion during the heavy boot: the driver kills the WebGL context,
  // the canvas goes white, but the HTML overlay/labels survive — so a
  // white 3D view with a live UI is the tell. Before this state there was
  // NO detection of that event; the only mechanism was the blind
  // "no-progress" boot watchdog, which let the white canvas sit silently
  // until its timeout. This latches from the `webglcontextlost` listener
  // registered in `handleCanvasCreated` below, and clears if the browser
  // restores the context (`webglcontextrestored`), so an auto-recovered
  // context dismisses the card instead of stranding the user on it.
  const [contextLost, setContextLost] = useState(false);

  const handleCanvasCreated = useCallback(
    ({ gl }: { gl: THREE.WebGLRenderer }) => {
      // R1 #1A (Wave α Commit 2): the postprocessing composer is the
      // single authority on tone mapping — keep the renderer linear so
      // bloom operates on real HDR luminance instead of a Reinhard-
      // compressed buffer. Gaia default omits tone mapping; optional
      // cinematic operators are applied by `PostProcessingPipeline.tsx`.
      // Output color space is set explicitly (the default at three r181
      // is SRGBColorSpace, but we pin it so a future default shift
      // doesn't silently change our gamma contract).
      gl.toneMapping = THREE.NoToneMapping;
      gl.outputColorSpace = THREE.SRGBColorSpace;

      // GPU diagnostic (added 2026-04-23 for white-canvas boot
      // investigation). Logs the WebGL renderer info on first mount
      // so a user-pasted console reveals the GPU + driver atlas is
      // running on. WEBGL_debug_renderer_info is privacy-gated in
      // some browsers; falls back to gl.getParameter alone in that
      // case. Also surfaces max-texture-size + max-cube-map-size to
      // confirm the GPU isn't running with degraded limits.
      try {
        const webglCtx = gl.getContext();
        const debugInfo = webglCtx.getExtension("WEBGL_debug_renderer_info");
        const vendor = debugInfo
          ? webglCtx.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
          : "(privacy-masked)";
        const renderer = debugInfo
          ? webglCtx.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          : "(privacy-masked)";
        console.info("[atlas] WebGL renderer info:", {
          vendor,
          renderer,
          maxTextureSize: webglCtx.getParameter(webglCtx.MAX_TEXTURE_SIZE),
          maxCubeMapSize: webglCtx.getParameter(
            webglCtx.MAX_CUBE_MAP_TEXTURE_SIZE
          ),
          version: webglCtx.getParameter(webglCtx.VERSION),
        });
      } catch (err) {
        console.warn("[atlas] WebGL diagnostic probe failed:", err);
      }

      // WebGL context-loss recovery + honest failure surface (listener
      // added 2026-04-23 after a user report showed `THREE.WebGLRenderer:
      // Context Lost.` followed by the SceneReadyChecker safety hatch
      // firing — frame loop dead; wired to a user-visible card 2026-07-23).
      // Common causes: GPU VRAM exhaustion during the heavy boot (the
      // user's real symptom); GPU driver crash; tab backgrounding
      // triggering Chrome to reclaim GPU resources; integrated-GPU memory
      // pressure. The helper calls `event.preventDefault()` on
      // `webglcontextlost` (the browser contract for "give the context
      // back" — without it the canvas stays permanently dead); here we
      // ALSO latch `contextLost` so the user gets an honest card instead
      // of a silently white canvas whose HTML overlay is still alive. On
      // `webglcontextrestored` Three.js auto-reinits its WebGL programs /
      // textures on the next render, so we clear the card and log.
      const canvasEl = gl.domElement;
      const detachContextLossHandlers = registerWebglContextLossHandlers(
        canvasEl,
        {
          onLost: () => {
            console.warn(
              "[atlas] WebGL context lost — preventing default so the browser can attempt recovery; surfacing the context-lost card."
            );
            setContextLost(true);
          },
          onRestored: () => {
            console.warn(
              "[atlas] WebGL context restored — Three.js will reinit GPU resources on next render; dismissing the context-lost card."
            );
            setContextLost(false);
          },
        }
      );

      // HMR hygiene (2026-04-24 white-canvas audit — Codex P3). The
      // listeners above attach inside `onCreated` which fires once
      // per Canvas mount; Vite HMR hot-replaces Scene.tsx can keep
      // the old canvas element alive briefly, stacking duplicate
      // handlers each iteration. Register a dispose hook so a single
      // `webglcontextlost` doesn't log N times (where N = number of
      // in-session hot updates).
      if (import.meta.hot) {
        import.meta.hot.dispose(detachContextLossHandlers);
      }
    },
    [setContextLost]
  );

  const bloomRef = useRef<BloomController | null>(null);
  const hueSatRef = useRef<HueSaturationController | null>(null);
  const brightnessRef = useRef<BrightnessContrastController | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const sunLightRef = useRef<THREE.PointLight | null>(null);
  const smartSunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  // Observable marker for the Onda 0.2 gate: EffectComposer + ToneMapping +
  // HueSaturation + BrightnessContrast do not mount on the `constrained`
  // tier (full-screen GPU passes hurt weak hardware). This hidden element
  // lets `e2e/postprocessing.spec.ts` assert the gate without reaching
  // into R3F internals.
  const postProcessingActive = qualityProfile.name !== "constrained";

  // --- Boot failure surfaces (both live OUTSIDE the R3F tree) ---------
  // (a) explicit probe: no WebGL context at all → never mount <Canvas>.
  // (b) watchdog: WebGL exists but the scene never reported ready.
  const [webglSupported] = useState(detectWebGLSupport);
  const isSceneReady = useStore((state) => state.isSceneReady);
  const setSceneReady = useStore((state) => state.setSceneReady);
  const [bootTimedOut, setBootTimedOut] = useState(false);

  // Release the loader in both failure paths: it is gated on
  // `isSceneReady` (`loaderStages.ts` caps progress until then), so
  // without this the fallback card renders *behind* a loader that never
  // exits. `setSceneReady` is a one-way latch, so this is idempotent.
  useEffect(() => {
    if (webglSupported) {
      return;
    }

    setSceneReady(true);
  }, [setSceneReady, webglSupported]);

  useEffect(() => {
    if (!webglSupported || isSceneReady) {
      return;
    }

    let timeoutId = 0;

    // Re-armed on every asset-loader event: the deadline measures
    // "nothing is happening", not "boot is taking a while". A healthy
    // but slow boot (software rasterizer, cold cache, huge textures)
    // keeps ticking `useProgress` and therefore keeps pushing the
    // deadline out — verified in headless SwiftShader, where a naive
    // fixed 15 s timer false-fired mid-download.
    const armWatchdog = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        console.error(
          `[Scene] Boot watchdog fired after ${SCENE_BOOT_WATCHDOG_MS} ms without progress — the scene never reported ready. Surfacing a failure card.`
        );
        setBootTimedOut(true);
        setSceneReady(true);
      }, SCENE_BOOT_WATCHDOG_MS);
    };

    // `useProgress` is drei's zustand store; subscribing (instead of
    // calling the hook) keeps progress churn from re-rendering the
    // whole Canvas subtree on every loaded asset.
    const unsubscribe = useProgress.subscribe(armWatchdog);
    armWatchdog();

    return () => {
      window.clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [isSceneReady, setSceneReady, webglSupported]);

  if (!webglSupported) {
    return <WebGLUnavailableCard />;
  }

  return (
    <>
      <div
        hidden
        aria-hidden="true"
        data-postprocessing={postProcessingActive ? "active" : "inactive"}
      />
      {/* Leva debug panel retired — DisplayPanel + A11yPanel are the
          canonical user surfaces for graphics tuning. Artist-calibration
          constants that Leva used to carry (sun / ring emissive, Earth
          night-lights, rotation offset, ring shadow, default roughness /
          metalness) live in `src/config/artistCalibration.ts`. The
          `debugMode` store flag kept for `OrbitalEngineDebugReporter`
          and `OverlayPositionTracker` logging — Ctrl+Shift+D no longer
          needs a keybind since there's nothing to flip-visible. */}
      <Canvas
        shadows="soft"
        // R3F fires this synchronously on a canvas-level click that
        // misses every raycastable scene object. HYG stars aren't
        // R3F-raycastable (they're rendered via the custom Starfield
        // mesh outside the R3F event manager), so a click on a HYG
        // star always counts as a "miss" here. StarHoverPicker
        // claims those clicks via a separate native canvas
        // `click` listener that runs in the same event tick — but
        // the relative listener order is implementation-detail
        // (R3F connects in `<Canvas>`-level useEffect; our picker
        // connects in its own child useEffect). Defer the clear to
        // a microtask so all sync click handlers complete first; if
        // the picker claimed a HYG selection, leave it alone.
        // Curated bodies still deselect on miss-click via the
        // microtask path (selectedId becomes null normally).
        onPointerMissed={() => {
          queueMicrotask(() => {
            const { selectedId: currentSelectedId } = useStore.getState();
            if (
              currentSelectedId &&
              parseHygFocusId(currentSelectedId) !== null
            ) {
              return;
            }
            setSelectedId(null);
          });
        }}
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
          bloomIntensityMultiplier={qualityProfile.bloomIntensityMultiplier}
          userOverrides={graphicsOverrides}
        />
        <color attach="background" args={["#000000"]} />
        {showEclipticGrid && <GridRecursive />}
        {showEclipticGrid && <GridDecadeLabel />}
        {showEclipticGrid && <GridRegionLabel />}
        <Suspense fallback={null}>
          <StarfieldManager />
          <Environment
            resolution={qualityProfile.environmentResolution}
            frames={1}
            far={1e9}
          >
            {/* Starfield removed from Environment - was causing planet lighting issues */}
            {/* Only sun mesh for reflections */}
            {/* Wave α P1-fix: under the pre-Wave-α Reinhard renderer the
                cubemap captured this 10-wide source compressed to ~0.91
                (Reinhard(10) = 10/11). The Commit 2 renderer is
                NoToneMapping, so the cubemap now captures linear 10 —
                10× brighter IBL than the pre-Wave-α baseline, which
                flooded planet surface lighting and contributed to the
                washed-out look. Dropping to 2 gives a modest HDR
                headroom for envMap highlights without over-lighting
                planet materials. envMapIntensity from visualPresets
                (1.9) keeps compounding on top. */}
            <mesh position={[0, 0, 0]} scale={[100, 100, 100]}>
              <sphereGeometry args={[1, 32, 32]} />
              <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
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
            roughness={DEFAULT_PLANET_ROUGHNESS}
            metalness={DEFAULT_PLANET_METALNESS}
            sunEmissive={SUN_EMISSIVE_POWER}
            ringEmissive={RING_EMISSIVE_POWER}
            ringShadowIntensity={RING_SHADOW_INTENSITY}
            earthRotationOffset={EARTH_ROTATION_OFFSET_DEG}
            nightLightIntensity={EARTH_NIGHT_LIGHT_INTENSITY}
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
            {/* T4.9a' — Sun star-billboard fallback at stellar
                distances. Self-gates via `SUN_BILLBOARD_THRESHOLD_AU`
                so it composites with `ProceduralSun3D`'s inverse gate
                without overlap. Procedural-mode-only for the first
                ship; the textured `Planet`-mesh path stays unchanged
                (out of scope for T4.9a' first ship). Re-enabled
                2026-04-23 after bisect confirmed the white-canvas
                bug reproduces in pre-session HEAD too — the env
                limitation is unrelated to this mount. */}
            <SunBillboard />
          </Suspense>
        )}
        {/* T6.3-β — HYG procedural-mesh wrapper. Self-gates on
            `focusId` matching `hyg:K` AND solid-angle hysteresis
            (T6.3-α). Mounted unconditionally (lazy-loaded shader
            chunk doesn't download until first activation); the
            single-mesh invariant (only one HygStellarMesh in the
            tree) is structural — there's exactly one mount. */}
        <Suspense fallback={null}>
          <HygStellarMesh />
        </Suspense>
        <OverlayPositionTracker />
        {/* T4.5-β — Gaia-native SDF body labels (drei <Text>); self-
            gates on `labelMode === "sdf" && showLabels` so it's a
            no-op in default HTML mode. Re-enabled 2026-04-23 after
            bisect confirmed pre-session HEAD also reproduces the
            user-reported white-canvas bug — the env limitation is
            unrelated to this mount. */}
        <PlanetLabels3D />
        <CameraController />
        <SurfaceModeFirstPerson />
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
        {isTestFreezeActive && <TestCameraProbe controlsRef={controlsRef} />}

        {postProcessingActive && (
          <PostProcessingPipeline
            bloomRef={bloomRef}
            hueSatRef={hueSatRef}
            brightnessRef={brightnessRef}
            bloomMounted={shouldMountBloom(
              qualityProfile.bloomEnabled,
              effectiveGraphics.bloomIntensity
            )}
            toneMapping={effectiveGraphics.toneMapping}
          />
        )}
        <DeferredTextureBudgetGate profileName={qualityProfile.name} />
        <CriticalSceneAssetsGate />
        <SceneReadyChecker />
      </Canvas>
      <PlanetOverlay />
      <OrbitalEngineDebugReporter />
      {/*
        Watchdog failure card. Unlike the app-shell ErrorBoundary
        consumers (App.tsx / main.tsx), this path cannot cheap-retry:
        the watchdog latches `setSceneReady(true)` (see ~line 585), so
        the Canvas is already dead and its loader released. Merely
        hiding the card (`setBootTimedOut(false)`) would remount nothing
        and re-arm no watchdog — "Try again" would no-op. A hard reload
        is the only honest retry here, matching the card's own
        "Reload to retry" copy.
      */}
      {/*
        Context-lost failure card. This is the HONEST surface for the
        user's real symptom (white 3D canvas while the HTML overlay stays
        alive): the `webglcontextlost` listener in `handleCanvasCreated`
        latches `contextLost`. It takes precedence over the blind watchdog
        card below (rendered only when `!contextLost`) because it names the
        actual cause instead of guessing "stalled or lost its context". A
        hard reload is the only honest retry — the killed context can't be
        cheap-remounted from here; if the browser auto-restores it,
        `webglcontextrestored` clears this flag and the card self-dismisses.
      */}
      {contextLost && (
        <AppCrashCard
          title="3D view stopped"
          description="The interface is still available, but the browser stopped the 3D graphics context."
          error={
            new Error(
              "The browser reported a lost WebGL context. GPU memory pressure is one possible cause. Reload the 3D view; if it keeps happening, lower the graphics quality or close other GPU-heavy tabs."
            )
          }
          retryLabel="Reload 3D view"
          showReload={false}
          reset={() => window.location.reload()}
        />
      )}
      {bootTimedOut && !contextLost && (
        <AppCrashCard
          title="3D view did not start"
          description="The interface loaded, but the 3D scene did not become ready in time."
          error={
            new Error(
              `The 3D scene did not finish loading within ${SCENE_BOOT_WATCHDOG_MS / 1000}s. WebGL is available, so the renderer likely stalled or lost its context. Reload to retry; if it keeps happening, check the browser console and your graphics drivers.`
            )
          }
          retryLabel="Reload"
          showReload={false}
          reset={() => window.location.reload()}
        />
      )}
    </>
  );
};
