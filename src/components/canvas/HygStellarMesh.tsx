/**
 * T6.3-β — HygStellarMesh: integrating component for the T6 wave.
 *
 * When the user focuses a HYG star (`focusId === "hyg:K"`), this
 * component:
 *
 *   1. Resolves the star's world position via T6.0's
 *      `resolveHygWorldPosition`.
 *   2. Computes per-frame solid angle via T6.3-α's
 *      `computeStellarSolidAngle(starRadius, distToCamera)`.
 *   3. Runs the hysteresis gate `shouldStellarMeshBeActive` to
 *      decide the cross-fade RAMP DIRECTION (toward 1 when
 *      `solidAngle > ENTER`, toward 0 when `< EXIT`).
 *   4. Integrates the ramp linearly toward target over
 *      `M3_FADE_DURATION_MS` (default 300 ms). The ramp drives
 *      both the sprite's `a_fadeAlpha[K]` instanced attribute
 *      (sprite alpha multiplier = `1 - ramp`) and the procedural
 *      mesh's `uVisibility` uniform (mesh visibility = `ramp`).
 *      Sum invariant: `(sprite alpha + mesh visibility) ≈ 1`
 *      throughout the cross-fade.
 *   5. Mounts `<ProceduralSun3D>` whenever `ramp > 0` (any time
 *      the cross-fade is mid-flight or fully on); unmounts only
 *      when ramp returns to exactly 0.
 *
 * **M3 history (2026-05-06)**: replaced T6.3-β's binary
 * skipMask flip with a continuous cross-fade. The hysteresis
 * gate at `stellarMeshGate.ts` still drives DIRECTION (when to
 * flip target between 0 and 1); the ramp drives BLENDING (how
 * to traverse [0..1] over wall time). Closes U-3 ("sprite↔mesh
 * pop").
 *
 * **Single-mesh invariant**: only ONE `<HygStellarMesh>` instance
 * mounted in the scene tree (Scene.tsx mounts it exactly once).
 * Whichever HYG star is currently focused-and-cross-fading gets the
 * mesh; others stay sprites. Mirrors Gaia's "render proximity star
 * model" pattern at `ModelEntityRenderSystem.java:429-443` (only
 * `proximity.updating[0]` gets the model render path).
 *
 * **Lifecycle**:
 *   - On focus change to a HYG star → recompute `starData`
 *     (position + visualProfile + radius) from the catalog.
 *   - Per-frame integrator advances `rampRef` toward target.
 *   - On focus change away → ramp decays toward 0 (sprite fades
 *     IN, mesh fades OUT). Component unmounts when ramp == 0.
 *   - On unmount → cleanup zeroes the focused-star's `a_fadeAlpha`
 *     slot defensively (no stuck mid-fade alpha).
 *
 * **Catalog dependency**: subscribes to the same tier-bound catalog
 * Starfield uses via `useStarfieldCatalog`. Until the catalog
 * resolves, `starData` is null and the ramp stays at 0 (the
 * focus-change useEffect will re-evaluate when catalog arrives).
 *
 * **fadeAlpha access pattern**: scans the scene for a mesh named
 * `"atlas-starfield"` (T6.3-β added the name attribute to
 * `Starfield.tsx`'s `<mesh>` JSX). Reads
 * `geometry.getAttribute("a_fadeAlpha")` (M3 attribute) and
 * mutates the underlying Float32Array, then sets
 * `attribute.needsUpdate = true` to trigger GPU re-upload. Cleanup
 * resets to 0 unconditionally so a re-focus on the same star
 * re-spawns from the start of the fade-in.
 *
 * **Quality profile**: passes the active `qualityProfileName` from
 * the store directly into ProceduralSun3D — for T6.3-β-MVP, the
 * focused HYG star uses the same FX profile as the Sun. T6.4 will
 * add per-class tuning (LOD per stellar class).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useQualityProfile } from "../../hooks/useQualityProfile";
import {
  parseHygFocusId,
  resolveHygWorldPosition,
} from "../../lib/focus/hygFocusResolver";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
} from "../../lib/starfield";
import {
  SUN_RADIUS_WORLD_UNITS,
  computeStellarSolidAngle,
  shouldStellarMeshBeActive,
} from "../../lib/stellarMeshGate";
import {
  radiusFromSpect,
  stellarVisualProfileFrom,
} from "../../lib/stellarPhysics";
import {
  SUN_DEFAULT_VISUAL_PROFILE,
  type StellarVisualProfile,
} from "../../lib/stellarVisualProfile";
import { useStore } from "../../store";
import type { HygCatalogData } from "../../utils/hygBinary";
import { stepRampToward } from "./hygMeshFadeRamp";
import { ProceduralSun3D } from "./ProceduralSun3D";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

/**
 * M3 — fade duration for the sprite↔mesh cross-fade in
 * milliseconds. The ramp traverses [0..1] linearly over this
 * span at any frame rate (`delta`-driven). 300 ms is the
 * spec default — long enough that the eye perceives a smooth
 * transition rather than a step, short enough that mid-fade
 * doesn't read as "stuck loading".
 */
const M3_FADE_DURATION_MS = 300;

interface HygStarData {
  /** World-space position (parsec × DISTANCE_SCALE × R_x(obliquity)). */
  worldPos: THREE.Vector3;
  /** Visual profile from T6.2's `stellarVisualProfileFrom`. */
  visualProfile: StellarVisualProfile;
  /**
   * Star physical radius in atlas world units (= solar radii ×
   * SUN_RADIUS_WORLD_UNITS). Used by both the gate (solid-angle
   * computation) and the ProceduralSun3D mount (sphereScale).
   */
  radiusWorldUnits: number;
}

/**
 * Locate the Starfield mesh's `a_fadeAlpha` instanced attribute.
 * Returns null if the Starfield hasn't mounted yet (first frames
 * post-boot before the catalog resolves) or if the named mesh
 * isn't found (defensive — name attribute could regress).
 */
function findStarfieldFadeAlpha(
  scene: THREE.Scene
): THREE.InstancedBufferAttribute | null {
  const mesh = scene.getObjectByName("atlas-starfield");
  if (!mesh) return null;
  const obj3d = mesh as THREE.Object3D & { geometry?: THREE.BufferGeometry };
  const attr = obj3d.geometry?.getAttribute("a_fadeAlpha");
  if (!attr) return null;
  // Narrow to InstancedBufferAttribute; the attribute is registered as
  // such by Starfield.tsx but the typed-getter returns the base class.
  return attr as THREE.InstancedBufferAttribute;
}

/**
 * Mutate the fadeAlpha attribute for a given star index. Sets the
 * slot value (clamped [0..1]) and bumps `needsUpdate` so the next
 * frame re-uploads to the GPU. No-op when the value is already at
 * the desired ramp position (within float-equality tolerance) so
 * the steady-state per-frame cost is one scene lookup + one read.
 */
function writeFadeAlpha(
  scene: THREE.Scene,
  starIndex: number,
  value: number
): void {
  const attr = findStarfieldFadeAlpha(scene);
  if (!attr) return;
  if (starIndex < 0 || starIndex >= attr.count) return;
  const clamped = Math.max(0, Math.min(1, value));
  const arr = attr.array as Float32Array;
  if (arr[starIndex] === clamped) return; // no-op when unchanged
  arr[starIndex] = clamped;
  attr.needsUpdate = true;
}

export const HygStellarMesh = () => {
  const focusId = useStore((s) => s.focusId);
  const qualityMode = useStore((s) => s.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  // Subscribe to the same tier-bound catalog Starfield + StarHoverPicker
  // use. Going through `useStarfieldCatalog` means we re-evaluate when
  // either source resolves, no manual race handling.
  const loadCatalogForTier = useCallback(() => loadHygCatalog(tier), [tier]);
  const getCachedCatalogForTier = useCallback(
    () => getCachedHygCatalog(tier),
    [tier]
  );
  const catalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadCatalogForTier,
    getCachedCatalog: getCachedCatalogForTier,
  });

  // Parse focus → starIndex (or null).
  const starIndex = parseHygFocusId(focusId);

  // Compute static per-star data when focus + catalog align. Recomputes
  // when starIndex changes (focus to a different HYG star) OR when
  // catalog flips (tier change, first-load resolution).
  //
  // T6.3-ε — quality-downgrade strand handling. HYG tiers are a strict
  // brightness-sorted prefix (`build-hyg-binary.js:15`), so an index
  // valid in `full` (e.g. 105913 = Proxima) is out of range in any
  // smaller tier. Returning null here would silently strand the focus:
  // mesh disappears, sprite is gone (not in tier), camera frame loop
  // bails. Instead, defocus explicitly so OrbitControls + UI converge
  // back to a known state.
  const starData = useMemo<HygStarData | null>(() => {
    if (starIndex === null || !catalog) return null;
    if (starIndex < 0 || starIndex >= catalog.header.count) {
      Promise.resolve().then(() => {
        const state = useStore.getState();
        if (state.focusId === focusId) {
          state.setFocusId(null);
          if (state.selectedId !== null) state.setSelectedId(null);
        }
      });
      return null;
    }

    const worldPos = resolveHygWorldPosition(starIndex, catalog);
    if (!worldPos) return null;

    const bv = catalog.colorIndices[starIndex];
    const spectIdx = catalog.spectIndices[starIndex] ?? 0;
    const spectRaw = catalog.spectStrings[spectIdx] ?? "";
    const spect = spectRaw.length > 0 ? spectRaw : null;
    const absmagRaw = catalog.absmag[starIndex];
    const absmag = Number.isFinite(absmagRaw) ? absmagRaw : null;

    const visualProfile = stellarVisualProfileFrom({
      bv,
      spect,
      absmag,
    });

    const radiusSolar = radiusFromSpect(
      spect,
      absmag !== null ? absmag : undefined
    );
    const radiusWorldUnits = radiusSolar * SUN_RADIUS_WORLD_UNITS;

    return { worldPos, visualProfile, radiusWorldUnits };
  }, [starIndex, catalog, focusId]);

  // M3 — cross-fade ramp state. `rampRef` is the live [0..1]
  // position consumed by useFrame (no React re-render). `targetRef`
  // tracks where the hysteresis gate wants the ramp to settle —
  // updated each frame from `shouldStellarMeshBeActive`. The
  // `meshActive` state mirrors `rampRef.current > 0` and drives
  // ProceduralSun3D mount/unmount; React only re-renders on the
  // 0↔(0,1] boundary, never per fade tick.
  const rampRef = useRef(0);
  const targetRef = useRef(0);
  const [meshActive, setMeshActive] = useState(false);

  // Per-frame integrator + gate evaluation.
  useFrame((_, delta) => {
    if (!starData) {
      // No focus on a parseable HYG star, or catalog not loaded yet.
      // Force target to 0 so any in-flight ramp decays back to 0
      // (sprite fades back IN). Mesh component unmounts via the
      // `meshActive` flip below once ramp returns to 0.
      targetRef.current = 0;
    } else {
      const distToCamera = camera.position.distanceTo(starData.worldPos);
      const sa = computeStellarSolidAngle(
        starData.radiusWorldUnits,
        distToCamera
      );
      const wasActive = targetRef.current === 1;
      targetRef.current = shouldStellarMeshBeActive(wasActive, sa) ? 1 : 0;
    }

    rampRef.current = stepRampToward(
      rampRef.current,
      targetRef.current,
      delta,
      M3_FADE_DURATION_MS
    );

    // M3 — re-assert the per-star fadeAlpha each frame against
    // whatever Starfield instanced attribute is currently live.
    // `writeFadeAlpha` is idempotent (no-op when the slot is
    // already at the ramp value). The defensive re-write matters
    // during transient rebuilds: when the user changes quality
    // while a HYG mesh is fading, Starfield re-creates its
    // `InstancedBufferGeometry` with a fresh zero-filled
    // `a_fadeAlpha`. Without this re-assert, the sprite would
    // re-emerge under the procedural mesh until the next ramp
    // step. (Carried over from T6.3-δ Codex P2 audit.)
    if (starIndex !== null) {
      writeFadeAlpha(scene, starIndex, rampRef.current);
    }

    // Mount/unmount React boundary. ProceduralSun3D should be
    // alive as long as ramp > 0 (so the mesh contributes alpha to
    // the cross-fade). It can unmount only when ramp settles back
    // to exactly 0 (no overlap left to render).
    const shouldRender = rampRef.current > 0;
    if (shouldRender !== meshActive) {
      setMeshActive(shouldRender);
    }
  });

  // M3 — fadeAlpha sync. When focus changes to a new HYG star, the
  // PREVIOUS star's slot must be zeroed (cleanup) AND the live
  // ramp/target refs must reset to 0 so the NEW star starts the
  // cross-fade from scratch. Without the reset (T6.4 post-audit
  // P2 finding) a refocus while one star was fully meshed would
  // carry rampRef.current=1 into the next frame, instantly
  // suppressing the new star's sprite — the new star would mount
  // its mesh at full visibility instead of ramping in over 300 ms.
  useEffect(() => {
    rampRef.current = 0;
    targetRef.current = 0;
    if (starIndex === null) return;
    return () => {
      // Cleanup: clear this star's slot. Runs on starIndex change
      // (focus moves to a different star or null) and on unmount.
      writeFadeAlpha(scene, starIndex, 0);
    };
  }, [scene, starIndex]);

  // T6.4-M2.5 Codex round-3 P2 (carried into M3) — test-only mesh-
  // state probe. Exposes `window.__ATLAS_TEST_MESH_STATE__()`
  // returning the live `meshActive` + `fadeAlphaAtIndex` reader.
  // Production-inert: gated on `__ATLAS_TEST_FREEZE__` (the same
  // flag `store.ts` reads to pin the simulation clock). Used by
  // `e2e/hyg-focus.spec.ts` to assert pre-fly fadeAlpha === 0
  // and post-landing fadeAlpha === 1.
  useEffect(() => {
    const w = window as unknown as { __ATLAS_TEST_FREEZE__?: boolean };
    if (!w.__ATLAS_TEST_FREEZE__) return;
    type MeshStateSnapshot = {
      meshActive: boolean;
      fadeAlphaAtIndex: (k: number) => number;
    };
    const probeWindow = window as unknown as {
      __ATLAS_TEST_MESH_STATE__?: () => MeshStateSnapshot;
    };
    probeWindow.__ATLAS_TEST_MESH_STATE__ = () => ({
      meshActive: rampRef.current > 0,
      fadeAlphaAtIndex: (k: number): number => {
        const attr = findStarfieldFadeAlpha(scene);
        if (!attr) return 0;
        if (k < 0 || k >= attr.count) return 0;
        const arr = attr.array as Float32Array;
        return arr[k];
      },
    });
    return () => {
      delete (window as unknown as { __ATLAS_TEST_MESH_STATE__?: unknown })
        .__ATLAS_TEST_MESH_STATE__;
    };
  }, [scene]);

  if (!meshActive || !starData) return null;

  return (
    <ProceduralSun3D
      qualityProfileName={qualityProfile.name}
      sunVisualRadiusWorld={starData.radiusWorldUnits}
      position={starData.worldPos}
      visualProfile={starData.visualProfile ?? SUN_DEFAULT_VISUAL_PROFILE}
      renderRange="close"
      visibilityRef={rampRef}
    />
  );
};
