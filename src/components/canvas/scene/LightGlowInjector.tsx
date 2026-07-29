import { useEffect, useMemo, useRef, useState, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../../store";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../../lib/starfield";
import { useQualityProfile } from "../../../hooks/useQualityProfile";
import {
  computeFovFactor,
  LIGHT_GLOW_N_LIGHTS_BY_TIER,
  makeEmptyRegistry,
  type LightGlowTier,
  updateLightRegistry,
} from "../../../lib/lightRegistry";
import {
  LIGHT_GLOW_DEFAULT_SPIRAL_SCALE,
  LightGlowEffect,
} from "./effects/LightGlowEffect";

/**
 * Gaia Sky LightGlow post-process gate + driver (θ.3).
 *
 * Instantiates a single `LightGlowEffect` and mounts it as a child of
 * the pmndrs `<EffectComposer>`. Placement as the FIRST child matches
 * Gaia Sky's post-process chain (LightGlow runs before Bloom and
 * tone mapping — verified against `MainPostProcessor.java:227` and
 * `tasks/phase-gaia-sky.md §5.1`).
 *
 * Per-frame responsibilities:
 *   - Walk the HYG billboard-star catalog through
 *     `updateLightRegistry()` into a single Float32Array buffer.
 *   - Push the buffer into the effect's uniforms.
 *   - Advance `u_timeSeconds` for the polar-mask animation.
 *
 * Gating:
 *   - `a11y.reducedMotion === true` → returns `null`. `useFrame`
 *     early-outs and no `<primitive object={effect}>` node is ever
 *     created, so the composer's shader graph doesn't include the
 *     LightGlow fragment.
 */

/** Map the atlas quality-profile name to Gaia's LightGlow tier. */
const tierForProfile = (profileName: string): LightGlowTier => {
  switch (profileName) {
    case "constrained":
      return "low";
    case "balanced":
      return "normal";
    case "high":
      return "high";
    case "ultra":
      return "ultra";
    default:
      return "normal";
  }
};

/** Catalog-aware cache for the currently active tier. */
function useLightGlowCatalog(): HygCatalogData | null {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);
  const [catalog, setCatalog] = useState<HygCatalogData | null>(() =>
    getCachedHygCatalog(tier)
  );

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    // Catalog load is async (fetch + decode). A setState inside the
    // effect is the idiomatic way to surface the parsed catalog once
    // ready — the alternative (`useSyncExternalStore`) would need
    // the HYG cache to implement a subscribe API it doesn't have.
    const cached = getCachedHygCatalog(tier);
    if (cached) {
      setCatalog(cached);
      return;
    }
    let cancelled = false;
    loadHygCatalog(tier)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((err) => {
        // Catalog load failure → no LightGlow lights, degrade quietly.
        // Without this .catch a rejected HYG fetch/parse surfaced as an
        // unhandled promise rejection.
        if (!cancelled) {
          console.warn("[LightGlow] HYG catalog load failed:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [tier]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return catalog;
}

/**
 * React component that owns + drives the LightGlow effect. Designed
 * to be rendered as a direct child of `<EffectComposer>` (the pmndrs
 * composer picks up the underlying `Effect` instance via the React
 * primitive and wires it into the EffectPass).
 */
export function LightGlowSlot(): JSX.Element | null {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const reducedMotion = useStore((state) => state.accessibility.reducedMotion);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const camera = useThree((state) => state.camera);

  const catalog = useLightGlowCatalog();

  // Lazy-create the effect once per reducedMotion toggle. When
  // reducedMotion flips to true we tear down the effect (and the
  // composer re-registers on the next render without our primitive).
  const effect = useMemo(
    () => (reducedMotion ? null : new LightGlowEffect()),
    [reducedMotion]
  );

  const registry = useMemo(() => makeEmptyRegistry(), []);

  // Lazy-init the start time inside useEffect to keep the render
  // body pure (eslint react-hooks/purity).
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (startRef.current === null) {
      startRef.current = performance.now();
    }
  }, []);

  useFrame(() => {
    if (!effect) return;

    // Drive the animation clock.
    const now = performance.now();
    if (startRef.current === null) startRef.current = now;
    effect.setTime((now - startRef.current) / 1000);

    // Camera FOV → Gaia fovFactor (AbstractCamera.java:148). Atlas's
    // default 45° FOV yields ~1.138; any FOV slider change flows
    // through naturally.
    const perspCam = camera as THREE.PerspectiveCamera;
    const fovDeg =
      typeof perspCam.fov === "number" && Number.isFinite(perspCam.fov)
        ? perspCam.fov
        : 60;
    const fovFactor = computeFovFactor(fovDeg);

    // Recompute per-frame light registry.
    const tier = tierForProfile(qualityProfile.name);
    const nSlots = LIGHT_GLOW_N_LIGHTS_BY_TIER[tier];
    const backBufferHeight = Math.max(
      1,
      Math.round(size.height * gl.getPixelRatio())
    );
    updateLightRegistry({
      catalog,
      camera,
      backBufferHeight,
      nSlots,
      fovFactor,
      output: registry,
    });
    effect.setLightData(
      registry.nLights,
      registry.positions,
      registry.solidAngles,
      registry.colors
    );

    // Gaia's `getGlowSpiralScale` = starBrightness × pointSize × 5e-5 /
    // fovFactor (MainPostProcessor.java:562). Track FOV changes each
    // frame so zoom ops stay in sync.
    effect.setSpiralScale(LIGHT_GLOW_DEFAULT_SPIRAL_SCALE / fovFactor);
  });

  useEffect(() => {
    return () => {
      effect?.dispose();
    };
  }, [effect]);

  if (!effect) return null;
  return <primitive object={effect} dispose={null} />;
}
