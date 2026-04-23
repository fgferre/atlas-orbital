import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { resolveSunRenderRange } from "../../lib/sunRenderRange";
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

      // Camera distance to the Sun (origin in atlas's world frame).
      const dist = state.camera.position.length();
      const range = resolveSunRenderRange(dist);
      const isFar = range === "far";
      sprite.visible = isFar;
      if (!isFar) return;

      const screenSize = dist * SCREEN_SIZE_FACTOR;
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
