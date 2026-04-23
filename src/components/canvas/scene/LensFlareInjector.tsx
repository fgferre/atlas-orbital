import { useEffect, useMemo, type JSX } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";

import { LensFlareEffect } from "./effects/LensFlareEffect";
import { ndcToLensFlareUv } from "./effects/lensFlareMath";

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

export function LensFlareSlot(): JSX.Element {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  const effect = useMemo(() => new LensFlareEffect(), []);

  const worldPosBuffer = useMemo(() => new THREE.Vector3(), []);
  const ndcBuffer = useMemo(() => new THREE.Vector3(), []);

  useFrame(({ size }) => {
    // Viewport push — Gaia reads this for aspect-ratio correction at
    // `lensflare.frag.glsl:177`.
    effect.setViewportSize(size.width, size.height);

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
    // Single-light intensity = 1 (Gaia's `alphas[i] = 1` default when
    // the solid-angle fade window is not active). Atlas doesn't yet
    // port the per-light solid-angle ramp because only the Sun drives
    // the flare and its apparent angle in solar-system scope is always
    // well above `LENS_FLARE_FULL_ALPHA_ANGLE = 1e-6` — see
    // `computeLightIntensityAlpha` for the full ramp.
    effect.setLight([uv[0], uv[1]], 1.0);
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
