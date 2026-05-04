import { useEffect, useMemo, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

import { useEffectiveGraphics } from "../../../hooks/useEffectiveGraphics";
import {
  computeFovFactor,
  STAR_BRIGHTNESS_DEFAULT,
} from "../../../lib/lightRegistry";
import { LensFlareEffect } from "./effects/LensFlareEffect";
import {
  computeLightIntensityAlpha,
  ndcToLensFlareUv,
} from "./effects/lensFlareMath";

/**
 * Lens-flare composer slot. Mounts Gaia's COMPLEX lens-flare shader
 * (`/tmp/gaiasky/assets/shader/postprocess/lensflare.frag.glsl`,
 * `#ifdef complexLensFlare` branch) via `LensFlareEffect`.
 *
 * Per-frame driver:
 *   - **Sun projection**: scene.getObjectByName("sun") → world-pos →
 *     NDC → UV in [0, 1]. Writes to effect's light[0]. Matches
 *     `MainPostProcessor.java:633-679` (`LIGHT_POS_2D_UPDATE` handler)
 *     which collects per-light UV positions and pushes them into
 *     `LensFlare.setLightPositions`. Atlas scopes to a single light
 *     (the Sun) — other stars in the starfield are too dim to drive
 *     the COMPLEX shader's luma-gated occlusion accumulator, matching
 *     Gaia's own solid-angle threshold
 *     (`MainPostProcessor.java:644-655`, ported as
 *     `computeLightIntensityAlpha` in `lensFlareMath.ts`).
 *   - **Off-screen cull**: when the Sun projects outside the NDC
 *     `[-1, 1]` box, the effect is parked via `clearLights()` so the
 *     shader's `u_intensity <= 0` early-out kicks in and no work
 *     happens. Equivalent to Gaia's
 *     `lensFlare.setIntensity(0)` at `MainPostProcessor.java:671`.
 *   - **Viewport**: pushed every frame. Gaia does this via the
 *     framebuffer resize hook; atlas cheaper to just push per-frame
 *     (two uniform writes).
 *   - **Starburst offset**: NOT animated here. Gaia's
 *     `MainPostProcessor.java:915-917` updates `setStarburstOffset`
 *     only for `PseudoLensFlare.class` — never for `LensFlare`
 *     (COMPLEX). Our inlined dirt modulation keeps offset at the
 *     constructor default (0) to match Gaia's COMPLEX behaviour.
 *     (Drift fix from 2026-04-22 codex audit; pre-fix atlas
 *     animated the offset every frame, producing a rotating
 *     diffraction pattern Gaia's COMPLEX does not render.)
 *
 * PSEUDO variant (θ.4 `PseudoLensFlareEffect`) is NOT mounted here —
 * it remains importable for users who explicitly opt in, but is no
 * longer the default (rule `feedback_default_gaia_fidelity.md`; Gaia
 * ships `config.yaml:606 type: COMPLEX`).
 */

const SUN_OBJECT_NAME = "sun";

/**
 * Sun radius in atlas world units. Sun radius is 696,340 km
 * (`celestialBodies.ts:13`); 1 AU = 149,597,870.7 km; atlas world
 * scale is 1 AU = 1000 world units. So
 * `R_sun_world = (696340 / 149597870.7) × 1000 ≈ 4.654`.
 *
 * Used by the alpha-ramp per-frame computation below to derive the
 * Sun's apparent solid angle from camera distance — see
 * `computeLightIntensityAlpha` for the ramp formula
 * (Gaia `MainPostProcessor.java:645-653`).
 */
const SUN_RADIUS_WORLD_UNITS = (696_340 / 149_597_870.7) * 1000;

export function LensFlareSlot(): JSX.Element {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  const effect = useMemo(() => new LensFlareEffect(), []);

  const worldPosBuffer = useMemo(() => new THREE.Vector3(), []);
  const ndcBuffer = useMemo(() => new THREE.Vector3(), []);

  // Atlas-only UX knob (not in Gaia): user-tunable multiplier on the
  // composer-level flare contribution. Default 1.0 = full Gaia
  // intensity. Drives the existing `u_flareIntensity` uniform in
  // `LensFlareEffect`. Lives alongside Sun Brightness / Env
  // Reflections in the Display panel.
  const lensFlareIntensityMul = useEffectiveGraphics().lensFlareIntensityMul;

  useFrame(({ size }) => {
    // Viewport push — Gaia reads this for aspect-ratio correction at
    // `lensflare.frag.glsl:177`.
    effect.setViewportSize(size.width, size.height);

    // Push the effective lens-flare multiplier each frame so slider
    // changes propagate without remount.
    effect.setFlareIntensity(lensFlareIntensityMul);

    // Codex audit drift fix (2026-04-22): Gaia animates starburstOffset
    // ONLY for PSEUDO — `MainPostProcessor.java:915-917` targets
    // `PseudoLensFlare.class` and never calls `LensFlare.setStarburstOffset`
    // for COMPLEX. Atlas's LensFlareEffect inlines the lensdirt modulation
    // (architectural necessity under pmndrs single-Effect), but the
    // offset itself must stay at the constructor default (0) to match
    // Gaia's COMPLEX behaviour. Reduced-motion code path is no longer
    // needed either — 0 already matches the fallback.

    // Sun projection → lensFlare light 0.
    // Off-screen cull: `setIntensity(0)` triggers the shader's cheap
    // early-out at `LensFlareEffect.ts` main (matches Gaia
    // `MainPostProcessor.java:671`). `clearLights()` additionally
    // zeroes `u_nLights` so, even if a future variant ran past the
    // early-out, the loop body is still skipped — belt-and-suspenders.
    const sun = scene.getObjectByName(SUN_OBJECT_NAME);
    if (!sun) {
      effect.clearLights();
      effect.setIntensity(0);
      return;
    }
    sun.getWorldPosition(worldPosBuffer);
    ndcBuffer.copy(worldPosBuffer).project(camera);
    const { uv, onScreen } = ndcToLensFlareUv([
      ndcBuffer.x,
      ndcBuffer.y,
      ndcBuffer.z,
    ]);
    if (!onScreen) {
      effect.clearLights();
      effect.setIntensity(0);
      return;
    }
    // **T2.1-fix-γ (2026-05-04)** — wire the per-light alpha ramp.
    // Replaces the previously hardcoded `1.0` intensity scalar with
    // Gaia's solid-angle-based fade at
    // `MainPostProcessor.java:645-653`. The math is
    // `computeLightIntensityAlpha(angle)` — angle is the Sun's
    // Gaia-style apparent solid angle:
    //   solidAngleApparent = (R_sun / dist) × starBrightness / fovFactor
    // mirroring `lightRegistry.ts:60` + `GraphUpdater.java:182`. At
    // solar-system distances (< few thousand AU) this stays well
    // above `LENS_FLARE_FULL_ALPHA_ANGLE = 1e-6` and the ramp returns
    // 1.0 — same behaviour as the previous hardcoded constant. The
    // ramp activates only past ~10 kAU where Sun's apparent angle
    // drops below 1e-6, fading the flare to zero by ~20 kAU. Closes
    // a documented latent code debt (the math was ported but never
    // consumed) and prepares the path for future bright-star light
    // sources.
    const distanceToSun = worldPosBuffer.distanceTo(camera.position);
    const perspCam = camera as THREE.PerspectiveCamera;
    const fovDeg =
      typeof perspCam.fov === "number" && Number.isFinite(perspCam.fov)
        ? perspCam.fov
        : 60;
    const fovFactor = computeFovFactor(fovDeg);
    const sunSolidAngle =
      distanceToSun > 0
        ? ((SUN_RADIUS_WORLD_UNITS / distanceToSun) * STAR_BRIGHTNESS_DEFAULT) /
          fovFactor
        : Number.POSITIVE_INFINITY;
    const alpha = computeLightIntensityAlpha(sunSolidAngle);
    effect.setLight([uv[0], uv[1]], alpha);
    // Restore `u_intensity` to the config-time strength (Gaia
    // `config.yaml:608 strength: 1.0`). This was zeroed on a prior
    // off-screen frame and has to be rehydrated before the shader can
    // fire again.
    effect.setIntensity(1.0);
  });

  useEffect(() => {
    return () => {
      effect.dispose();
    };
  }, [effect]);

  return <primitive object={effect} dispose={null} />;
}
