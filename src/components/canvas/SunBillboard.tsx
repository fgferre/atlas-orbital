import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { resolveSunRenderRange } from "../../lib/sunRenderRange";
import { useStore } from "../../store";
import { getSunBillboardSprite } from "./scene/effects/sunBillboardSprite";

/**
 * T4.9a' — Gaia-faithful Sun rendering at stellar distances.
 *
 * Gaia switches the Sun (like every star) from the body-pipeline
 * mesh to the star-billboard pipeline once the camera is far enough
 * that the body's solid angle drops below the billboard threshold
 * (`BillboardRenderer.java` consumes `Settings.scene.star.getStarTexture()`
 * → `star-tex-04-*.png` per `config.yaml:169`). Atlas approximates
 * the same UX with a simple AU-distance gate
 * (`SUN_BILLBOARD_THRESHOLD_AU = 100`); above that, this component
 * renders, and `ProceduralSun3D` hides itself by reading the same
 * threshold lib.
 *
 * Architecture notes:
 *   - Both `ProceduralSun3D` and `SunBillboard` mount unconditionally
 *     and self-gate their visibility per-frame against the same
 *     `resolveSunRenderRange` decision. Each is the inverse of the
 *     other so there is no overlap window (no `feedback_no_effect_
 *     stacking.md` violation).
 *   - The sprite scales per-frame proportional to camera distance so
 *     its on-screen pixel size stays roughly constant — Gaia's
 *     billboard renderer does this via screen-space size in
 *     `SingleStarQuadRenderer.java`; atlas implements the same
 *     intent with a multiplicative `dist × SCREEN_SIZE_FACTOR` so the
 *     Sun reads as a small bright dot from interstellar viewpoints
 *     instead of shrinking to invisible.
 *   - Texture is the gitignored placeholder copy of `star-tex-03.jpg`
 *     at `public/textures/stars/star-tex-04-low.jpg`; gets swapped
 *     for the real `star-tex-04` in the final asset-licensing wave
 *     alongside T2.3b. See `sunBillboardSprite.ts` header for the
 *     placeholder rationale.
 *
 * Only mounts when the procedural Sun is the active renderer
 * (`sunRenderMode === "procedural"`). In `texture` mode the Sun
 * renders as a regular Planet mesh whose distance-fall behavior is
 * handled by the standard PBR pipeline; that path is intentionally
 * out of scope for the first T4.9a' ship.
 */

// Scaling factor for the screen-stable sprite. At distance D world
// units, the sprite scales to `D × SCREEN_SIZE_FACTOR` world units.
// With FOV 45° and viewport height ≈ 1080, a sprite of world-size W
// at distance D occupies roughly `W × 1080 / (2 × D × tan(22.5°))`
// pixels = `W × 1.305 / D` pixels. Picking SCREEN_SIZE_FACTOR =
// 0.012 yields ≈ 0.012 × 1.305 = 1.6 % of viewport height ≈ 17 px
// at 1080p, a comfortable star-dot footprint regardless of distance.
const SCREEN_SIZE_FACTOR = 0.012;

// Hard ceiling on the sprite's world-unit scale. The intro camera
// animation starts the camera at `[~1e12]` world units before
// flying it down to the viewing position; without this cap the
// per-frame `dist × SCREEN_SIZE_FACTOR` produces vertex coordinates
// in the `±6e9` range during the first few frames, well past the
// float32 precision the GPU vertex stage relies on. Some drivers
// (especially integrated / mobile GPUs) respond to that with a
// WebGL Context Lost — the user-reported boot failure
// 2026-04-23 traced to exactly this. Capping at 1e6 keeps vertex
// coords in the safe ±5e5 range while still rendering the Sun as
// a tiny dot at interstellar distances (~17 px on a 1080p screen
// at 100 AU; at 1000 AU it shrinks but stays visible).
const SCREEN_SIZE_MAX_WORLD_UNITS = 1_000_000;

const noopRaycast: THREE.Object3D["raycast"] = () => null;

export const SunBillboard = () => {
  const spriteRef = useRef<THREE.Sprite>(null);

  // Sprite material owned by this component (no shared cache — only
  // one SunBillboard mounts per scene, so caching the material would
  // just complicate teardown).
  const material = useMemo(() => {
    const mat = new THREE.SpriteMaterial({
      map: getSunBillboardSprite(),
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      // Additive blending matches Gaia's `BillboardRenderer.java`
      // which uses GL_ONE / GL_ONE for star sprites — the bright
      // star sums into the framebuffer without darkening the
      // backdrop.
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return mat;
  }, []);

  useEffect(() => {
    // Diagnostic log — confirms SunBillboard is mounting (only fires
    // when sunRenderMode resolves to "procedural"). If the user
    // reports a boot issue and DOES NOT see this log, the issue is
    // elsewhere; if they DO see it, the cap + intro suppression
    // additions in the useFrame below should keep the sprite scale
    // safe at the boot's `[~1e12]` initial camera distance.
    console.info(
      "[SunBillboard] mounted (procedural sun-render mode active; sprite scale capped + intro-suppressed)"
    );
    return () => {
      material.dispose();
    };
  }, [material]);

  // Defensive try/catch (added 2026-04-23): a throw here would kill
  // R3F's frame loop and hang the loader at 96 %.
  useFrame((state) => {
    try {
      const sprite = spriteRef.current;
      if (!sprite) return;

      // Suppress the billboard during the intro camera animation —
      // the camera transits from [~1e12] world units to the viewing
      // position over ~2 s, and any sprite scale derived from that
      // initial distance would push vertex coordinates past safe
      // float32 precision (cause of the 2026-04-23 user-reported
      // canvas-white boot failure). Once the animation completes,
      // distance is bounded and SunBillboard activates normally.
      const isIntroAnimating = useStore.getState().isIntroAnimating;
      if (isIntroAnimating) {
        sprite.visible = false;
        return;
      }

      // Camera distance to the Sun (origin in atlas's world frame).
      const dist = state.camera.position.length();
      const range = resolveSunRenderRange(dist);
      const isFar = range === "far";
      sprite.visible = isFar;
      if (!isFar) return;

      // Cap the sprite scale to keep vertex coords in the GPU's
      // safe-precision range (see SCREEN_SIZE_MAX_WORLD_UNITS comment).
      // At extreme distances (>~10 AU per FOV unit) the sprite shrinks
      // on screen below the constant-pixel target; that's an acceptable
      // visual trade for boot stability.
      const screenSize = Math.min(
        dist * SCREEN_SIZE_FACTOR,
        SCREEN_SIZE_MAX_WORLD_UNITS
      );
      sprite.scale.setScalar(screenSize);
    } catch (err) {
      console.error("[SunBillboard] frame error:", err);
    }
  });

  return (
    <sprite
      ref={spriteRef}
      material={material}
      position={[0, 0, 0]}
      visible={false}
      // Render before the postprocessing pass picks up the buffer; the
      // additive blend means SunBillboard composes naturally on top of
      // anything else at the Sun's position. `renderOrder` slightly
      // negative so the LightGlow post-process samples the sprite as
      // part of the scene contribution.
      renderOrder={-1}
      raycast={noopRaycast}
    />
  );
};
