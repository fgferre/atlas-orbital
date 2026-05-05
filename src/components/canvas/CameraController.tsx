import { useRef, useEffect, useCallback } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { useStore } from "../../store";
import { BODIES_BY_ID, SOLAR_SYSTEM_BODIES } from "../../data/celestialBodies";
import { AstroPhysics } from "../../lib/astrophysics";
import { simulationClock } from "../../lib/simulationClock";
import {
  PrivilegedPosition,
  CameraTransition,
  StellarFlightTransition,
  computeAtlasFlightLanding,
  createFocusTrackingState,
  resetFocusTrackingState,
  resolveFocusTrackingFrame,
} from "../../lib/camera";
import {
  computeProximityDamping,
  PROXIMITY_DAMPING_BASE,
} from "../../lib/camera/proximityDamping";
import { isSurfaceModeActive } from "../../lib/camera/surfaceMode";
import {
  parseHygFocusId,
  resolveHygWorldPosition,
} from "../../lib/focus/hygFocusResolver";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
} from "../../lib/starfield";
import { SUN_RADIUS_WORLD_UNITS } from "../../lib/stellarMeshGate";
import { radiusFromSpect } from "../../lib/stellarPhysics";
import type { HygCatalogData } from "../../utils/hygBinary";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

// Module-level scratch vectors for the focus-tracking useFrame. Safe
// because the frame loop is single-threaded and every read is paired
// synchronously with a write inside the same tick. `resolveFocusTrackingFrame`
// copies its inputs internally before use (see `lib/camera/controls.ts`),
// so passing these refs never leaks mutation back into the caller.
const TMP_WORLD_POS = new THREE.Vector3();
const TMP_PREV_TARGET = new THREE.Vector3();

/**
 * T6.4-M2.5 S4 — per-star physical radius in atlas world units.
 * Mirrors HygStellarMesh's resolution path so the camera math
 * (landing distance, OrbitControls minDistance, perspective near)
 * matches what the procedural mesh actually renders. Pre-M2.5
 * fell back to `HYG_FOCUS_DEFAULT_RADIUS_WORLD = 1.0 wu`, which
 * collapsed near-plane precision for white-dwarf-class stars and
 * inflated minDistance for supergiants.
 */
const resolveHygRadiusWu = (
  hygIndex: number,
  catalog: HygCatalogData
): number => {
  const spectIdx = catalog.spectIndices[hygIndex] ?? 0;
  const spectRaw = catalog.spectStrings[spectIdx] ?? "";
  const spect = spectRaw.length > 0 ? spectRaw : null;
  const absmagRaw = catalog.absmag[hygIndex];
  const absmag = Number.isFinite(absmagRaw) ? absmagRaw : null;
  const radiusSolar = radiusFromSpect(
    spect,
    absmag !== null ? absmag : undefined
  );
  return radiusSolar * SUN_RADIUS_WORLD_UNITS;
};

export const CameraController = () => {
  const { camera, scene, size } = useThree();
  const controls = useThree(
    (state) => state.controls
  ) as OrbitControlsImpl | null;
  const focusId = useStore((state) => state.focusId);
  const scaleMode = useStore((state) => state.scaleMode);
  const qualityMode = useStore((state) => state.qualityMode);
  const isIntroAnimating = useStore((state) => state.isIntroAnimating);
  const viewportFraming = useStore((state) => state.viewportFraming);

  // T6.3-γ: subscribe to the same tier-bound HYG catalog Starfield +
  // StarHoverPicker + HygStellarMesh use, so the focus-setup useEffect
  // can compute fly-to coordinates for `hyg:K` IDs. Until the catalog
  // resolves, HYG focus-clicks are no-ops at the camera path (the
  // store still updates focusId; the user just doesn't see a fly-to
  // until the catalog finishes loading).
  const qualityProfile = useQualityProfile(qualityMode);
  const hygTier = hygTierForQuality(qualityProfile.name);
  const loadHygForTier = useCallback(() => loadHygCatalog(hygTier), [hygTier]);
  const getCachedHygForTier = useCallback(
    () => getCachedHygCatalog(hygTier),
    [hygTier]
  );
  const hygCatalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadHygForTier,
    getCachedCatalog: getCachedHygForTier,
  });

  const flyingRef = useRef({
    isFlying: false,
    cameraTargetPos: new THREE.Vector3(),
  });

  const transitionRef = useRef<CameraTransition>(new CameraTransition());
  // T6.4-M2.5 S3+S4 — two-channel HYG fly-to. Independent durations
  // for position vs orientation channels; OrbitControls derives the
  // camera quaternion each frame from the lerped `controls.target`.
  // Mutually exclusive with `transitionRef`: starting one cancels
  // the other so the useFrame branch reads exactly one source.
  const stellarFlightRef = useRef<StellarFlightTransition>(
    new StellarFlightTransition()
  );
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(
    camera as THREE.PerspectiveCamera
  );
  const controlsRef = useRef<OrbitControlsImpl | null>(controls);
  // Cached resolution of the scene graph node for the currently focused
  // body. Repopulated on focus change (via the useEffect below) instead
  // of re-traversing the scene in every `useFrame`.
  const focusMeshRef = useRef<THREE.Object3D | null>(null);
  const prevFocusRef = useRef<string | null>(null);
  const prevScaleModeRef = useRef<string | null>(null);
  const cameraFramingSignature = [
    viewportFraming.fitInsets.left,
    viewportFraming.fitInsets.right,
    viewportFraming.fitInsets.top,
    viewportFraming.fitInsets.bottom,
    Math.round(viewportFraming.compositionOffsetXPx),
    Math.round(viewportFraming.compositionOffsetYPx),
  ].join(":");
  const prevCameraFramingSignatureRef = useRef<string>(cameraFramingSignature);
  const prevViewportSizeRef = useRef({
    width: size.width,
    height: size.height,
  });
  const focusTrackingRef = useRef(createFocusTrackingState());

  useEffect(() => {
    cameraRef.current = camera as THREE.PerspectiveCamera;
    controlsRef.current = controls;
  }, [camera, controls]);

  useEffect(() => {
    resetFocusTrackingState(focusTrackingRef.current);
  }, [focusId]);

  const getBodyRadius = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      return AstroPhysics.resolveSemanticBodyRadius({ body, scaleMode });
    },
    [scaleMode]
  );

  const getFocusMargin = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      const fidelity = body.visualProvenance?.fidelity;

      if (body.type === "moon" && fidelity === "interpretive") {
        return 3.6;
      }

      if (fidelity === "interpretive") {
        return 2.2;
      }

      if (fidelity === "observational-model") {
        return 1.95;
      }

      return 1.6;
    },
    []
  );

  const getFocusExtent = useCallback(
    (body: (typeof SOLAR_SYSTEM_BODIES)[0]) => {
      return AstroPhysics.resolveFocusExtent({
        body,
        bodies: SOLAR_SYSTEM_BODIES,
        date: simulationClock.getNow(),
        scaleMode,
      });
    },
    [scaleMode]
  );

  useEffect(() => {
    if (isIntroAnimating) return;

    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!focusId || !cameraInstance || !controlsInstance) return;

    const bodyData = BODIES_BY_ID.get(focusId);
    // T6.3-γ: HYG focus has no curated CelestialBody. Resolve a
    // synthetic targetPos via T6.0 + a per-star close-distance via
    // T6.2 so the fly-to lands the camera at a distance where T6.3-α's
    // hysteresis gate fires and HygStellarMesh spawns. When the
    // catalog hasn't loaded yet, return early — the focus-setup
    // useEffect re-runs when `hygCatalog` flips, retrying then.
    const hygIndex = bodyData ? null : parseHygFocusId(focusId);
    if (!bodyData && hygIndex === null) return;
    if (hygIndex !== null && !hygCatalog) return;
    // T6.3-ε — quality-downgrade strand handling. HYG tiers are a
    // strict brightness-sorted prefix (`build-hyg-binary.js:15`); a
    // focused index valid in `full` (e.g. 105913 = Proxima) becomes
    // out of range after a tier drop. Early-return + defocus keeps
    // the camera state consistent with HygStellarMesh's matching
    // out-of-range guard. (Codex round-2 P2 audit, 2026-05-04.)
    if (
      hygIndex !== null &&
      hygCatalog &&
      hygIndex >= hygCatalog.header.count
    ) {
      Promise.resolve().then(() => {
        const state = useStore.getState();
        if (state.focusId === focusId) {
          state.setFocusId(null);
          if (state.selectedId !== null) state.setSelectedId(null);
        }
      });
      return;
    }

    const isSameFocus = prevFocusRef.current === focusId;
    const isModeSwitch = isSameFocus && prevScaleModeRef.current !== scaleMode;
    const framingSignatureChanged =
      prevCameraFramingSignatureRef.current !== cameraFramingSignature;
    const viewportSizeChanged =
      prevViewportSizeRef.current.width !== size.width ||
      prevViewportSizeRef.current.height !== size.height;
    const isLayoutReframe =
      isSameFocus &&
      prevScaleModeRef.current === scaleMode &&
      (framingSignatureChanged || viewportSizeChanged);

    prevFocusRef.current = focusId;
    prevScaleModeRef.current = scaleMode;
    prevCameraFramingSignatureRef.current = cameraFramingSignature;
    prevViewportSizeRef.current = { width: size.width, height: size.height };

    // Wave α UX fix: skip the 520 ms privileged-position reposition
    // when the ONLY thing that changed is the camera-framing
    // signature (fit insets + composition offsets). Opening or
    // closing a side panel shifts `viewportFraming.fitInsets` —
    // which flipped this effect into `isLayoutReframe = true` and
    // snapped the camera back to the privileged angle every panel
    // interaction. That's the "anoying reset" the user reported.
    //
    // Genuine window resize (`viewportSizeChanged`) still triggers
    // the reframe, because the camera's privileged-position math
    // can legitimately need updating when the backing framebuffer
    // changes dimensions. Focus / scale-mode transitions also keep
    // going through the full reframe below.
    if (isLayoutReframe && framingSignatureChanged && !viewportSizeChanged) {
      return;
    }

    const setupCameraHyg = () => {
      // T6.4-M2.5 S4 — HYG fly-to via the two-channel
      // `StellarFlightTransition`. Position lerps along a straight
      // line; orientation lerps `controls.target` from its current
      // value to the star's world position so OrbitControls derives
      // the camera quaternion smoothly throughout the flight. Replaces
      // the pre-M2.5 path (single-channel Bézier + pre-animation
      // `controls.target.copy(targetPos)` snap, which produced the
      // spin-then-glide feel the user reported 2026-05-05).
      if (!hygCatalog || hygIndex === null) return;
      const resolvedPos = resolveHygWorldPosition(hygIndex, hygCatalog);
      if (!resolvedPos) return;
      const targetPos = resolvedPos;

      // Per-star physical radius in world units (same path as
      // HygStellarMesh, T6.3-β / T6.3-δ). For long-tail stars where
      // the canonicalized spect was capped to "" sentinel (T6.2-β-β),
      // radiusFromSpect returns 1.0 R_sun → ~4.654 wu fallback.
      const radiusWu = resolveHygRadiusWu(hygIndex, hygCatalog);

      // Distance from Sun in parsec — catalog `positions[3K..3K+3]`
      // are stored in parsec already (`hygBinary.ts:21`). The
      // OBLIQUITY rotation in `resolveHygWorldPosition` is a
      // length-preserving rotation, so deriving distancePc directly
      // from the un-rotated parsec triplet matches `worldPos.length()
      // / DISTANCE_SCALE` exactly without re-introducing the private
      // DISTANCE_SCALE constant.
      const px = hygCatalog.positions[hygIndex * 3];
      const py = hygCatalog.positions[hygIndex * 3 + 1];
      const pz = hygCatalog.positions[hygIndex * 3 + 2];
      const distancePc = Math.sqrt(px * px + py * py + pz * pz);

      // T6.4-M2.5 S1 — Atlas flight landing. `computeAtlasFlightLanding`
      // applies the three-way `Math.max(bodyClearance × 1.1,
      // ATLAS_MIN_LANDING_DISTANCE_WU = 10, angleDriven)` internally,
      // so the result already respects the body-clearance floor.
      // The `target.angularRadiusRad` ≥ `STELLAR_MESH_ENTER_RAD × 5`
      // invariant guarantees HygStellarMesh spawns on arrival even
      // for ultra-distant stars beyond the Gaia/Atlas crossover
      // (~1200 pc).
      const landing = computeAtlasFlightLanding(radiusWu, distancePc);
      const idealDist = landing.distanceWu;

      // Direction: from star back along the line to current camera
      // position, preserving the user's viewing orientation. Falls
      // back to "from sun toward star" when camera is exactly at
      // the star's world position (degenerate first-fly case).
      const cameraOffset = cameraInstance.position.clone().sub(targetPos);
      const direction =
        cameraOffset.lengthSq() > 1e-6
          ? cameraOffset.normalize()
          : targetPos.clone().normalize().negate();

      const newCamPos = targetPos
        .clone()
        .add(direction.multiplyScalar(idealDist));

      // T6.4-M2.5 S4 — scale-aware durations. Position channel
      // scales log10 with linear distance so a tiny solar-system
      // hop and a parsec-scale interstellar fly-to don't share a
      // 4 s budget. Orientation channel scales linearly with the
      // angular sweep between current and final view directions
      // (computed AT the start position; close enough for the
      // duration heuristic). Both clamped so quick HYG flips
      // don't drag past 8 s and tiny rotations stay above 1 s.
      const linearDist = cameraInstance.position.distanceTo(newCamPos);
      const posDurationMs = Math.min(
        8000,
        Math.max(2000, Math.log10(linearDist + 1) * 1500)
      );
      const camToStart = controlsInstance.target
        .clone()
        .sub(cameraInstance.position);
      const camToEnd = targetPos.clone().sub(cameraInstance.position);
      const angularSweep =
        camToStart.lengthSq() > 1e-12 && camToEnd.lengthSq() > 1e-12
          ? camToStart.angleTo(camToEnd)
          : 0;
      const oriDurationMs = Math.min(4000, Math.max(1000, angularSweep * 2000));

      // Mutual exclusion with curated-body fly-to: stop any in-flight
      // `CameraTransition` so useFrame's HYG branch drives a single
      // source per frame. `stop()` is a no-op when not active.
      transitionRef.current.stop();

      stellarFlightRef.current.start({
        startPos: cameraInstance.position.clone(),
        endPos: newCamPos,
        startTarget: controlsInstance.target.clone(),
        endTarget: targetPos.clone(),
        posDurationMs,
        oriDurationMs,
        onComplete: () => {
          flyingRef.current.isFlying = false;
        },
      });

      flyingRef.current.cameraTargetPos.copy(newCamPos);
      flyingRef.current.isFlying = true;
      // Drop the pre-M2.5 `controls.target.copy(targetPos)` snap.
      // Orientation now lerps via `stellarFlightRef`'s target channel;
      // OrbitControls derives the camera's quaternion each frame from
      // `(camera.position, controls.target)`, so animating `target`
      // is the OrbitControls-friendly way to animate orientation
      // (option 2 from the wave file's M2.5 §S4 coordination
      // strategy). Resetting focus-tracking state to `targetPos`
      // matches the existing curated-body contract: post-fly,
      // focus-tracking glues `controls.target` to the star world
      // position (which is static for HYG stars, so no further drift).
      resetFocusTrackingState(focusTrackingRef.current, targetPos);
    };

    const setupCamera = () => {
      // T6.3-γ — branch on focus type. HYG focus dispatches to the
      // parallel setupCameraHyg above; curated-body path stays
      // byte-identical to its pre-T6.3-γ shape.
      if (hygIndex !== null) {
        setupCameraHyg();
        return;
      }
      if (!bodyData) return;

      // T6.4-M2.5 S4 — mutual exclusion with HYG fly-to. Cancel any
      // in-flight `StellarFlightTransition` so useFrame's flight
      // branch reads a single source. `cancel()` deliberately does
      // NOT fire `onComplete`, so isFlying stays as we set it below.
      stellarFlightRef.current.cancel();

      const targetMesh = scene.getObjectByName(focusId);
      if (!targetMesh) return;

      const targetPos = new THREE.Vector3();
      targetMesh.getWorldPosition(targetPos);

      const targetRadius = getFocusExtent(bodyData);
      const idealDist = PrivilegedPosition.calculateViewportAwareDistance(
        targetRadius,
        cameraInstance,
        size.width,
        size.height,
        viewportFraming.usableRect,
        getFocusMargin(bodyData)
      );

      const sunPosition = new THREE.Vector3(0, 0, 0);
      const parentPos = bodyData.parentId
        ? (() => {
            const parentMesh = scene.getObjectByName(bodyData.parentId!);
            if (!parentMesh) return undefined;
            const parentWorldPos = new THREE.Vector3();
            parentMesh.getWorldPosition(parentWorldPos);
            return parentWorldPos;
          })()
        : undefined;

      const direction = PrivilegedPosition.calculateContextAwareDirection(
        targetPos,
        sunPosition,
        parentPos
      );

      let newCamPos = targetPos
        .clone()
        .add(direction.clone().multiplyScalar(idealDist));

      const { isOccluded } = PrivilegedPosition.checkOcclusion(
        newCamPos,
        targetPos,
        scene,
        [focusId]
      );

      if (isOccluded) {
        newCamPos = PrivilegedPosition.findUnoccludedPosition(
          targetPos,
          newCamPos,
          scene,
          focusId
        );
      }

      const composedCamPos = PrivilegedPosition.applyViewportComposition({
        targetPos,
        cameraPos: newCamPos,
        camera: cameraInstance,
        viewportWidth: size.width,
        viewportHeight: size.height,
        compositionOffsetXPx: viewportFraming.compositionOffsetXPx,
        compositionOffsetYPx: viewportFraming.compositionOffsetYPx,
        targetUpVector: cameraInstance.up,
      });

      const { isOccluded: isComposedOccluded } =
        PrivilegedPosition.checkOcclusion(composedCamPos, targetPos, scene, [
          focusId,
        ]);

      if (!isComposedOccluded) {
        newCamPos = composedCamPos;
      }

      const duration = isLayoutReframe
        ? 520
        : isModeSwitch
          ? 800
          : Math.min(
              1500 +
                Math.min(
                  cameraInstance.position.distanceTo(newCamPos) / 1000,
                  2.5
                ) *
                  1000,
              4000
            );

      transitionRef.current.start(
        cameraInstance.position.clone(),
        newCamPos,
        sunPosition,
        duration,
        () => {
          flyingRef.current.isFlying = false;
        }
      );

      flyingRef.current.cameraTargetPos.copy(newCamPos);
      flyingRef.current.isFlying = true;
      controlsInstance.target.copy(targetPos);
      resetFocusTrackingState(focusTrackingRef.current, targetPos);
    };

    if (isModeSwitch) {
      requestAnimationFrame(() => {
        requestAnimationFrame(setupCamera);
      });
      return;
    }

    setupCamera();
  }, [
    focusId,
    cameraFramingSignature,
    getFocusExtent,
    getFocusMargin,
    isIntroAnimating,
    scaleMode,
    scene,
    size.height,
    size.width,
    viewportFraming.compositionOffsetXPx,
    viewportFraming.compositionOffsetYPx,
    viewportFraming.usableRect,
    // T6.3-γ — re-run when the HYG catalog finishes loading so a
    // pending HYG focus from a click-before-load actually flies.
    hygCatalog,
  ]);

  useEffect(() => {
    if (!controls) return;

    const stopFlying = () => {
      flyingRef.current.isFlying = false;
      // T6.4-M2.5 S5 — real interrupt for HYG fly-to. `cancel()`
      // freezes both transition channels at their current alpha and
      // returns the intermediate `{ position, target }` (no
      // `onComplete` fire — interrupt is semantically distinct from
      // natural completion, see `StellarFlightTransition.ts:185-200`).
      // We sync `controls.target` to the frozen target so the
      // orientation visibly halts at the lerped value instead of
      // letting focus-tracking next frame snap it back to the star
      // world position. The position channel naturally stops driving
      // `camera.position` because the next useFrame branch reads
      // `!isActive` and falls through to the user-drag path.
      // No-op when `cancel()` returns null (no HYG transition active —
      // either we're interrupting a curated-body fly-to or just
      // post-completion).
      const frozen = stellarFlightRef.current.cancel();
      if (frozen) {
        controls.target.copy(frozen.target);
      }
    };

    controls.addEventListener("start", stopFlying);
    return () => {
      controls.removeEventListener("start", stopFlying);
    };
  }, [controls]);

  useEffect(() => {
    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!focusId || !cameraInstance || !controlsInstance) return;

    const bodyData = BODIES_BY_ID.get(focusId);
    // T6.4-M2.5 S4 — wire the REAL per-star physical radius for
    // HYG focus. Pre-M2.5 used `HYG_FOCUS_DEFAULT_RADIUS_WORLD = 1.0`
    // wu placeholder, which collapsed `near`-plane precision for
    // white-dwarf-class stars (real radius ≈ 0.0465 wu) and
    // inflated `minDistance` for supergiants (real radius ≈ 4128 wu
    // for Betelgeuse). Now resolves via `radiusFromSpect` matching
    // the path setupCameraHyg + HygStellarMesh use.
    //
    // Catalog dependency: HYG focus paths early-return when
    // `hygCatalog` is null; the effect re-fires on `hygCatalog`
    // load thanks to the dep array.
    let targetRadius: number | null = null;
    if (bodyData) {
      targetRadius = getBodyRadius(bodyData);
    } else {
      const hygIndex = parseHygFocusId(focusId);
      if (
        hygIndex !== null &&
        hygCatalog &&
        hygIndex < hygCatalog.header.count
      ) {
        targetRadius = resolveHygRadiusWu(hygIndex, hygCatalog);
      } else if (hygIndex !== null) {
        // Catalog not loaded yet (or out-of-range post quality
        // downgrade — sister branch in setupCamera handles defocus).
        // Wait for hygCatalog to flip; this effect re-runs.
        return;
      }
    }
    if (targetRadius == null) return;

    controlsInstance.minDistance = targetRadius * 1.1;

    const newNear = Math.max(1e-7, controlsInstance.minDistance * 0.01);
    if (Math.abs(cameraInstance.near - newNear) > 1e-8) {
      cameraInstance.near = newNear;
      cameraInstance.updateProjectionMatrix();
    }
  }, [focusId, getBodyRadius, hygCatalog]);

  // Re-resolve the scene graph node whenever the focus changes. The
  // mesh reference is then cached and reused in the useFrame below
  // without any per-frame scene traversal.
  useEffect(() => {
    if (!focusId) {
      focusMeshRef.current = null;
      return;
    }
    focusMeshRef.current = scene.getObjectByName(focusId) ?? null;
  }, [focusId, scene]);

  useFrame(() => {
    const cameraInstance = cameraRef.current;
    const controlsInstance = controlsRef.current;
    if (!cameraInstance || !controlsInstance) return;

    if (!focusId) {
      // T4.2-α — no focus active, keep OrbitControls at the base
      // damping (smooth coast at stellar distances).
      controlsInstance.dampingFactor = PROXIMITY_DAMPING_BASE;
      // T4.2-β — surface-mode is gated on focus-being-a-planet, so
      // a no-focus state is always normal mode. Clear the flag if
      // the user just defocused while inside the surface threshold.
      useStore.getState().setSurfaceModeActive(false);
      resetFocusTrackingState(focusTrackingRef.current);
      return;
    }

    // T6.3-δ — branch on focus type to resolve the target world
    // position. Curated solar-system bodies have a scene-mesh node
    // (looked up by name) whose `getWorldPosition` drives the path.
    // HYG stars have no per-star mesh — the entire catalog is one
    // instanced billboard in `Starfield.tsx` — so we resolve via
    // the catalog using T6.0's `resolveHygWorldPosition`. Without
    // this branch, focusId="hyg:K" hit the `!targetMesh` early
    // return below before `transitionRef.update()` could run,
    // leaving the fly-to armed but never consumed. (Codex P1
    // audit, 2026-05-04.)
    const hygIndex = parseHygFocusId(focusId);
    const worldPos = TMP_WORLD_POS;
    if (hygIndex !== null) {
      if (!hygCatalog) return;
      const resolved = resolveHygWorldPosition(hygIndex, hygCatalog, worldPos);
      if (!resolved) return;
    } else {
      // Validate the cached mesh lazily — if a body was unmounted between
      // focus change and this frame (extremely rare, but possible during
      // HMR / hot-swap) re-resolve on the fly.
      let targetMesh = focusMeshRef.current;
      if (!targetMesh || targetMesh.parent === null) {
        targetMesh = scene.getObjectByName(focusId) ?? null;
        focusMeshRef.current = targetMesh;
      }
      if (!targetMesh) return;
      targetMesh.getWorldPosition(worldPos);
    }

    // T4.2-α — proximity-aware damping. Mirrors NaturalCamera.java:993-997
    // counterAmount curve: friction grows as the camera approaches the
    // focused body's surface. Reads camera distance to focus + body
    // visual radius (scaleMode-aware via AstroPhysics) and writes the
    // resulting damping factor to OrbitControls. The control's update()
    // reads scope.dampingFactor each frame, so this live mutation
    // takes effect immediately.
    // Defensive try/catch (added 2026-04-23 alongside SceneReadyChecker
    // safety hatch): any throw here kills R3F's frame loop, which
    // hangs the loader at 96 %. Wrap so a stale focus / missing body
    // logs an error instead of taking the whole canvas down.
    try {
      const focusBody = BODIES_BY_ID.get(focusId);
      if (focusBody) {
        const focusRadius = AstroPhysics.resolveSemanticBodyRadius({
          body: focusBody,
          scaleMode: useStore.getState().scaleMode,
        });
        const cameraDistance = cameraInstance.position.distanceTo(worldPos);
        controlsInstance.dampingFactor = computeProximityDamping(
          cameraDistance,
          focusRadius
        );
        // T4.2-β — surface-mode flag publication. Atlas's mouse-only
        // input layer makes the gamepad/vr/tracking suppressors
        // permanently false; the threshold collapses to focus-type +
        // distance + fovDegrees. Setter dedups so React only
        // re-renders on flag flips, not every frame.
        const fovDegrees = (cameraInstance as THREE.PerspectiveCamera).fov;
        const active = isSurfaceModeActive({
          focusIsPlanet: focusBody.type === "planet",
          distFromFocus: cameraDistance,
          focusRadius,
          fovDegrees,
        });
        useStore.getState().setSurfaceModeActive(active);
      }
    } catch (err) {
      console.error(
        "[CameraController] proximity-damping / surface-mode error:",
        err
      );
      controlsInstance.dampingFactor = PROXIMITY_DAMPING_BASE;
    }

    const prevTarget = TMP_PREV_TARGET.copy(controlsInstance.target);
    const { nextTarget, cameraDelta } = resolveFocusTrackingFrame({
      currentTarget: prevTarget,
      focusWorldPos: worldPos,
      state: focusTrackingRef.current,
    });

    // T4.2-β-handler (Silver) — when surface mode is active, the
    // `SurfaceModeFirstPerson` component takes over rotation via
    // the Pointer Lock API and disables OrbitControls (`enabled
    // = false`). We STILL run the focus-tracking translation below
    // so the camera follows any motion of the focused body through
    // space (e.g., Earth orbiting the Sun) — only the user-driven
    // rotation path is replaced. Cameraposition is otherwise
    // untouched here; rotation flows through `camera.rotateX/Y/Z`
    // inside `SurfaceModeFirstPerson`'s useFrame.
    //
    // Note the `controls.target` assignment below is a no-op while
    // controls are disabled (OrbitControls.update() early-returns
    // on `!enabled`), but we keep it current so that when the user
    // leaves surface mode the target is already at the focus body's
    // world position — no snap transition.
    controlsInstance.target.copy(nextTarget);

    if (flyingRef.current.isFlying) {
      // T6.4-M2.5 S4 — branch on which transition is active.
      // `stellarFlightRef` (HYG) wins when active; the curated-body
      // `transitionRef` falls through. Mutual-exclusion at start
      // sites guarantees at most one is active per frame.
      if (stellarFlightRef.current.isActive) {
        const frame = stellarFlightRef.current.update();
        if (frame) {
          cameraInstance.position.copy(frame.position);
          // Override the focus-tracking write above with the lerped
          // target. OrbitControls.update() then derives the camera
          // quaternion from `(camera.position, controls.target)`,
          // which is the option-2 coordination strategy from the
          // wave file (no quaternion fight). On the final frame
          // this equals the star world position; focus-tracking
          // takes over post-completion.
          controlsInstance.target.copy(frame.target);
        }
        // `update()` flips `active = false` and fires `onComplete`
        // (which sets `flyingRef.current.isFlying = false`) on the
        // last frame; no manual flag flip needed here.
      } else {
        const newPos = transitionRef.current.update();
        if (newPos) {
          cameraInstance.position.copy(newPos);
        }
        if (!transitionRef.current.active) {
          flyingRef.current.isFlying = false;
        }
      }
      return;
    }

    cameraInstance.position.add(cameraDelta);
  });

  return null;
};
