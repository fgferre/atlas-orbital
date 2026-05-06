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
  HygPhysicsFlight,
  AimLerp,
  computeAtlasFlightLanding,
  createFocusTrackingState,
  resetFocusTrackingState,
  resolveFocusTrackingFrame,
  setHygFlightPosProgress,
} from "../../lib/camera";
import {
  computeProximityDamping,
  PROXIMITY_DAMPING_BASE,
} from "../../lib/camera/proximityDamping";
import { isSurfaceModeActive } from "../../lib/camera/surfaceMode";
import {
  parseHygFocusId,
  resolveHygDistanceFromSunPc,
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
  // T6.4-M2.5 round-6 R6-B — two-channel HYG fly-to under physics:
  // position channel uses the gate-driven `HygPhysicsFlight`
  // integrator (Gaia's `InteractiveCameraModule.go_to_object` shape,
  // calibrated for Atlas world units); orientation channel uses
  // `AimLerp`, which slerps the aim direction and derives a safe
  // `controls.target` each frame. Mutually exclusive with
  // `transitionRef` (curated solar bodies): starting one cancels
  // the other so the useFrame branch reads exactly one source.
  // Round-5b/`StellarFlightTransition` retained in `lib/camera` for
  // future scripted-tour features; no active call site uses it for
  // click-driven focus after Round-6.
  const hygPhysicsRef = useRef<HygPhysicsFlight>(new HygPhysicsFlight());
  // **Round-6 user-smoke fix (post R6-H, 2026-05-06)**: replaced
  // `OrientationLerp` (lerped `controls.target` absolutely from old
  // focus → new star) with `AimLerp` (slerps the aim DIRECTION,
  // derives target as `cameraPos + aimDir × distanceToStar`). The
  // absolute-target lerp had two failure modes under Round-6's
  // gate-driven physics that user smoke surfaced as "marcha ré"
  // and "tela muda para um quadro errado": (1) for the first
  // ~hundred ms the lerped target sits BEHIND the camera along
  // the motion axis, so OrbitControls derives a backward-looking
  // orientation; (2) as both the lerp and the camera converge on
  // the same axis, the lerped target can CROSS the camera path,
  // producing a `target - camera.position → 0` degeneracy that
  // visually flips. Aim-lerp keeps the target at the actual
  // camera-to-star distance ahead of the camera in the slerp'd
  // direction at all times — never crosses, never degenerates.
  const aimLerpRef = useRef<AimLerp>(new AimLerp());
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
    // T6.4-M2.5 S6 — clear the pre-warm signal on focus change. A
    // new HYG fly-to (setupCameraHyg) will write the fresh value next
    // frame; a curated-body or null focus leaves the signal cleared
    // so `HygStellarMesh` falls through to its natural gate.
    setHygFlightPosProgress(null);
    // T6.4-M2.5 round-4 C-5 + round-6 R6-D — focus-cleared paths
    // must cancel any in-flight transition. The setupCamera /
    // setupCameraHyg branches handle focus-to-NEW-target cases
    // (HYG→HYG cancels via overwrite when `start()` is called
    // again; HYG→curated explicitly cancels both physics +
    // orientation refs at the top of `setupCamera`). The gap is
    // `focus → null`: neither branch runs (the setup useEffect
    // early-returns on `!focusId`), so a transition stayed armed.
    // A later OrbitControls "start" event would then call cancel()
    // whose stale-endpoint behavior (round-5 S5) snapped the
    // controls.target back to the previous star. Cancelling here
    // closes the gap.
    if (!focusId) {
      hygPhysicsRef.current.cancel();
      aimLerpRef.current.cancel();
      transitionRef.current.stop();
      flyingRef.current.isFlying = false;
    }
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
      // T6.4-M2.5 round-6 R6-B — HYG fly-to via the gate-driven
      // physics integrator (`HygPhysicsFlight`) for the position
      // channel + `AimLerp` for the aim direction. Both channels
      // run in parallel with
      // independent completion conditions: position is gate-driven
      // (current angular radius reaches target), orientation is
      // duration-driven. The pair replaces the round-5b
      // `StellarFlightTransition` (pre-computed lerp + sigmoid)
      // because the analysis under round-5 — Codex 2026-05-06 —
      // showed that `logisticSigmoid` collapses 99.5 % of trajectory
      // progress into a ~825 ms warp window for solar→Sirius
      // (~6.4e8 wu/s ≈ 100× solar-system extent per frame).
      // Round-6 ports Gaia's `InteractiveCameraModule.go_to_object`
      // shape: per-frame velocity push from rest, friction kicks
      // in near gate, completion when the angular gate triggers.
      // Source citations in `hygPhysicsFlight.ts` header.
      if (!hygCatalog || hygIndex === null) return;
      const resolvedPos = resolveHygWorldPosition(hygIndex, hygCatalog);
      if (!resolvedPos) return;
      const targetPos = resolvedPos;

      // Per-star physical radius in world units (same path as
      // HygStellarMesh, T6.3-β / T6.3-δ). For long-tail stars where
      // the canonicalized spect was capped to "" sentinel (T6.2-β-β),
      // radiusFromSpect returns 1.0 R_sun → ~4.654 wu fallback.
      const radiusWu = resolveHygRadiusWu(hygIndex, hygCatalog);

      // Distance from Sun in parsec via `resolveHygDistanceFromSunPc`
      // (catalog `positions` are stored in parsec pre-scale —
      // `hygBinary.ts:21`). Helper returns null on out-of-range index;
      // the early return above already guards against that, so the
      // null branch here is defensive only.
      const distancePc = resolveHygDistanceFromSunPc(hygIndex, hygCatalog);
      if (distancePc === null) return;

      // T6.4-M2.5 S1 — Atlas flight landing. Round-6 only consumes
      // `target.angularRadiusRad` (the gate-threshold for the
      // physics integrator). `landing.distanceWu` is no longer the
      // input to a duration-driven lerp; it's now an emergent
      // property of where the integrator stops. The angular-radius
      // anchor curve (1.0° at 1.31 pc → 0.001° at 2805 pc) plus the
      // mesh-spawn floor (≥ STELLAR_MESH_ENTER_RAD × 5) still
      // dictate the gate, so M3 spawn invariants hold for free.
      const landing = computeAtlasFlightLanding(radiusWu, distancePc);

      // **Round-6 user-smoke fix structural rewrite (post R6-H,
      // 2026-05-06)**: aim-lerp duration. The earlier
      // `OrientationLerp` (absolute target lerp) had two failure
      // modes that no duration retune could solve — the lerped
      // target sits behind the camera early in the flight, AND it
      // can cross the camera path during the lerp (degeneracy +
      // visual flip). `AimLerp` fixes the geometry by lerping
      // the aim DIRECTION (target derived as `cameraPos + aimDir
      // × distanceToStar`, never crosses, never degenerates).
      // Duration here just controls how QUICKLY the slerp
      // completes — short enough that the brief "looking partly
      // off-target" period is sub-perceptible, long enough that
      // the rotation isn't a 1-frame snap. 200-400 ms with a
      // factor=17 logistic sigmoid puts most of the rotation
      // (60 % of total) in a ~80-160 ms window inside the
      // duration. Sweeps near π get the upper bound; small
      // sweeps get the lower bound.
      const camToStart = controlsInstance.target
        .clone()
        .sub(cameraInstance.position);
      const camToEnd = targetPos.clone().sub(cameraInstance.position);
      const angularSweep =
        camToStart.lengthSq() > 1e-12 && camToEnd.lengthSq() > 1e-12
          ? camToStart.angleTo(camToEnd)
          : 0;
      const oriDurationMs = Math.min(400, Math.max(200, angularSweep * 150));

      // Mutual exclusion with curated-body fly-to: stop any in-flight
      // `CameraTransition` so useFrame's HYG branch drives a single
      // source per frame. `stop()` is a no-op when not active.
      transitionRef.current.stop();

      // Both channels arm together. Position channel is gate-driven
      // (`HygPhysicsFlight` integrates until `currentAngularRadiusRad
      // >= targetAngularRadiusRad`), aim channel is
      // duration-driven (`AimLerp` with Gaia's scripted
      // factor=17 logistic sigmoid — `CameraModule.java:680`).
      // `flyingRef.isFlying` is cleared in useFrame once BOTH refs
      // report inactive (R6-C dispatch handles that — using two
      // independent `onComplete` handlers would race on the late
      // arrival).
      hygPhysicsRef.current.start({
        startPos: cameraInstance.position,
        targetPos,
        targetAngularRadiusRad: landing.target.angularRadiusRad,
        radiusWu,
      });
      aimLerpRef.current.start({
        startCameraPos: cameraInstance.position,
        startTarget: controlsInstance.target,
        starWorldPos: targetPos,
        durationMs: oriDurationMs,
        easing: (t) => CameraTransition.logisticSigmoid(t, 17),
      });

      flyingRef.current.isFlying = true;
      // Resetting focus-tracking state to `targetPos` matches the
      // curated-body contract: post-fly, focus-tracking glues
      // `controls.target` to the star world position (which is
      // static for HYG stars, so no further drift). AimLerp's
      // per-frame writes during the flight override the
      // focus-tracking write in useFrame; once both flight refs
      // are inactive, focus-tracking takes over again.
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

      // T6.4-M2.5 round-6 — mutual exclusion with HYG fly-to.
      // Cancel any in-flight physics + orientation channels so
      // useFrame's flight branch reads a single source. `cancel()`
      // on each is a no-op when inactive and deliberately does NOT
      // fire `onComplete`, so `isFlying` stays as we set it below.
      hygPhysicsRef.current.cancel();
      aimLerpRef.current.cancel();
      // T6.4-M2.5 S6 — clear the pre-warm signal too; switching to
      // a curated-body fly-to mid-HYG-flight should leave no stale
      // progress visible to `HygStellarMesh`.
      setHygFlightPosProgress(null);

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
      // T6.4-M2.5 round-6 R6-D + post-R6-H aim-lerp rewrite —
      // real interrupt for HYG fly-to, cancel = full stop (NOT
      // friction-drain). Both cancels zero internal state
      // synchronously. Neither needs to re-apply state to
      // (camera.position, controls.target) because useFrame
      // already wrote both in the most recent frame; the
      // OrbitControls "start" event fires immediately AFTER
      // useFrame, so the frozen state is exactly what's already
      // on the camera + controls. Neither cancel fires
      // `onComplete` (interrupt ≠ completion). No-op when both
      // refs are inactive (interrupting curated-body fly-to or
      // post-completion).
      hygPhysicsRef.current.cancel();
      aimLerpRef.current.cancel();
      // T6.4-M2.5 S6 — clear the pre-warm signal on user
      // interrupt. M3 (cross-fade) consumes this channel; clearing
      // it on cancel prevents stale mid-fly progress after a
      // user-initiated drag.
      setHygFlightPosProgress(null);
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

  useFrame((_state, delta) => {
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
      // T6.4-M2.5 round-6 R6-C + post-R6-H aim-lerp rewrite —
      // branch on which transition family is active. The HYG path
      // runs two refs in parallel: position physics
      // (`HygPhysicsFlight`) + aim-direction lerp (`AimLerp`,
      // replaces the earlier absolute-target `OrientationLerp`).
      // Position physics is written FIRST so the aim-lerp's
      // `update(currentCameraPos)` sees this frame's actual camera
      // position, not last frame's. Both writes are then forced
      // into in-frame orientation via `camera.lookAt(controls.target)`
      // because Drei OrbitControls's useFrame runs at priority -1
      // (BEFORE this useFrame's priority 0), which would otherwise
      // leave the rendered quaternion derived from last frame's
      // (position, target).
      const hygPositionActive = hygPhysicsRef.current.isActive;
      const hygOrientationActive = aimLerpRef.current.isActive;
      if (hygPositionActive || hygOrientationActive) {
        // Position channel — gate-driven physics. Pass R3F's
        // measured `delta` (seconds) to the semi-implicit Euler
        // integrator with sub-stepping. R3F may emit `delta = 0`
        // on the first frame post-resume; the integrator guards
        // against it.
        if (hygPositionActive) {
          const positionFrame = hygPhysicsRef.current.update(delta);
          if (positionFrame) {
            cameraInstance.position.copy(positionFrame.position);
          }
        }
        // Aim channel — slerps the aim DIRECTION; derives target
        // as `cameraPos + aimDir × distanceToStar`. Endpoint
        // (current dir-to-star) is recomputed from this frame's
        // updated camera position so the aim tracks motion.
        if (hygOrientationActive) {
          const aimFrame = aimLerpRef.current.update(cameraInstance.position);
          if (aimFrame) {
            controlsInstance.target.copy(aimFrame.target);
          }
        }
        // Force in-frame orientation update. Drei OrbitControls's
        // useFrame priority -1 runs BEFORE this priority-0
        // useFrame, so without this `lookAt` the rendered
        // quaternion lags position by one frame. Lookup is cheap
        // (matrix decompose); no allocation.
        cameraInstance.lookAt(controlsInstance.target);
        // Publish the angular-radius progress for M3's cross-fade
        // ramp. Round-6 changes the signal semantics from
        // round-5b's "time fraction (raw alpha)" to a direction-
        // agnostic angular-radius journey fraction.
        if (hygPhysicsRef.current.isActive) {
          setHygFlightPosProgress(hygPhysicsRef.current.progressRaw);
        } else {
          setHygFlightPosProgress(null);
        }
        // Both channels done → clear the global flying flag.
        if (!hygPhysicsRef.current.isActive && !aimLerpRef.current.isActive) {
          flyingRef.current.isFlying = false;
        }
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
