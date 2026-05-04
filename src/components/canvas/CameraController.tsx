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
  HYG_FOCUS_DEFAULT_RADIUS_WORLD,
  parseHygFocusId,
  resolveHygWorldPosition,
} from "../../lib/focus/hygFocusResolver";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
} from "../../lib/starfield";
import {
  SUN_RADIUS_WORLD_UNITS,
  STELLAR_MESH_ENTER_RAD,
} from "../../lib/stellarMeshGate";
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
      // T6.3-γ — HYG fly-to path. No scene mesh exists for HYG stars
      // (the entire catalog is one instanced billboard mesh in
      // Starfield.tsx). We resolve target position via T6.0's helper
      // and pick a close-distance that puts the per-frame solidAngle
      // (T6.3-α) clearly above STELLAR_MESH_ENTER_RAD so HygStellarMesh
      // spawns the procedural mesh on arrival. Skips occlusion +
      // viewport composition (those are tuned for solar-system
      // geometry; not meaningful for parsec-distance point sources).
      if (!hygCatalog || hygIndex === null) return;
      const resolvedPos = resolveHygWorldPosition(hygIndex, hygCatalog);
      if (!resolvedPos) return;
      const targetPos = resolvedPos;

      // Per-star physical radius in world units, same path as
      // HygStellarMesh (T6.3-β). For long-tail stars where the
      // canonicalized spect was capped to "" sentinel (T6.2-β-β),
      // radiusFromSpect returns 1.0 R_sun → ~4.654 wu fallback.
      const spectIdx = hygCatalog.spectIndices[hygIndex] ?? 0;
      const spectRaw = hygCatalog.spectStrings[spectIdx] ?? "";
      const spect = spectRaw.length > 0 ? spectRaw : null;
      const absmagRaw = hygCatalog.absmag[hygIndex];
      const absmag = Number.isFinite(absmagRaw) ? absmagRaw : null;
      const radiusSolar = radiusFromSpect(
        spect,
        absmag !== null ? absmag : undefined
      );
      // T6.3-δ — use the REAL physical radius for fly-to distance
      // computation. Must match what `HygStellarMesh` uses in its
      // per-frame gate (it has no `Math.max(1.0, ...)` clamp). The
      // earlier clamp pushed white-dwarf-class stars (~0.0465 wu)
      // to a 200-wu landing distance where solidAngle ≈ 2.3e-4
      // sat below `STELLAR_MESH_ENTER_RAD` (1e-3), so the procedural
      // mesh never spawned on arrival. (Codex P2 audit, 2026-05-04.)
      const radiusWu = radiusSolar * SUN_RADIUS_WORLD_UNITS;

      // Target solid angle 5× ENTER → distance such that
      // solidAngle = radius / distance comfortably exceeds the
      // hysteresis spawn threshold. Three-way max guarantees the
      // landing distance is at least:
      //   - 10 wu (absolute floor, avoids degenerate camera-at-origin)
      //   - 5 × physical radius (clearance from the star body itself)
      //   - radius / targetSolidAngle (mesh-spawn gate guarantee)
      // For Sun-equivalent (4.654 wu) the gate dominates (~931 wu);
      // for white dwarfs (~0.0465 wu) the 10-wu floor dominates and
      // still yields solidAngle ≈ 4.6e-3 (~4.6× ENTER margin).
      const targetSolidAngle = STELLAR_MESH_ENTER_RAD * 5;
      const idealDist = Math.max(10, radiusWu * 5, radiusWu / targetSolidAngle);

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

      // Duration scales with total fly distance (capped at 4s) —
      // identical curve to the curated-body path so the UX feels
      // consistent across body / HYG transitions.
      const duration = Math.min(
        1500 +
          Math.min(cameraInstance.position.distanceTo(newCamPos) / 1000, 2.5) *
            1000,
        4000
      );

      const sunPosition = new THREE.Vector3(0, 0, 0);
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

    const setupCamera = () => {
      // T6.3-γ — branch on focus type. HYG focus dispatches to the
      // parallel setupCameraHyg above; curated-body path stays
      // byte-identical to its pre-T6.3-γ shape.
      if (hygIndex !== null) {
        setupCameraHyg();
        return;
      }
      if (!bodyData) return;

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
    // T6.0 — HYG fallback. When focusId carries the `hyg:<index>`
    // prefix, the curated `BODIES_BY_ID` lookup misses; resolve a
    // placeholder radius so OrbitControls' minDistance + the
    // perspective `near` plane still get sane values. Real per-star
    // radius lands in T6.2 (`radiusFromSpect`) and T6.3 wires it.
    let targetRadius: number | null = null;
    if (bodyData) {
      targetRadius = getBodyRadius(bodyData);
    } else if (parseHygFocusId(focusId) !== null) {
      targetRadius = HYG_FOCUS_DEFAULT_RADIUS_WORLD;
    }
    if (targetRadius == null) return;

    controlsInstance.minDistance = targetRadius * 1.1;

    const newNear = Math.max(1e-7, controlsInstance.minDistance * 0.01);
    if (Math.abs(cameraInstance.near - newNear) > 1e-8) {
      cameraInstance.near = newNear;
      cameraInstance.updateProjectionMatrix();
    }
  }, [focusId, getBodyRadius]);

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
      const newPos = transitionRef.current.update();
      if (newPos) {
        cameraInstance.position.copy(newPos);
      }

      if (!transitionRef.current.active) {
        flyingRef.current.isFlying = false;
      }
      return;
    }

    cameraInstance.position.add(cameraDelta);
  });

  return null;
};
