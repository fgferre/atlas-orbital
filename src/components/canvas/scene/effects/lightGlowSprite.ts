import * as THREE from "three";

/**
 * Baked glow sprite for the Gaia Sky LightGlow port (θ.3).
 *
 * Gaia Sky's `u_texture1` for LightGlow comes from
 * `Settings.scene.star.getGlowTexture()` → `getStarTexture(textureIndexLens)`
 * → `$GS_DATA/tex/base/star-tex-{XX}-*`. config.yaml ships
 * `textureIndexLens: 3` which (per the config comment) is the
 * "horizontal and vertical spikes" asset.
 *
 * **The actual Gaia asset is not vendored in this repo** (it lives in
 * a separate `$GS_DATA` package under Gaia Sky's licensing). Without
 * the real texture we keep a CONSERVATIVE substitute: a pure radial
 * gaussian. An earlier attempt to bake procedural cross-spikes
 * (σ_long = 34 of 128 px) produced visible hard cartesian lines
 * radiating from every bright star — the actual Gaia asset has
 * extremely subtle spikes that only become visible at near-ceiling
 * halo intensities, not the wide strong lobes a procedural
 * approximation generates.
 *
 * Net behaviour: our halo shape is closer to `star-tex-04-*` (radial
 * profile, which is Gaia's default for the regular billboard `u_texture0`
 * path). This is fine as a parity target because:
 *   1. The LightGlow polar-mask modulation already adds soft angular
 *      variance to the radial disc, which breaks the perfect-circle
 *      look and gives the "alive" animation.
 *   2. Both Gaia textures (03 spikes and 04 radial) share the same
 *      soft gaussian core — the spikes are an overlay on top. Without
 *      the overlay we lose only the cross character, not the halo.
 *   3. Shipping the real asset is a one-line swap later if licensing
 *      allows.
 *
 * Texture characteristics:
 *   - 128 × 128 px (larger than θ.1's 64² because the LightGlow halo
 *     covers a meaningfully bigger footprint when the halo-size cap
 *     saturates).
 *   - RGBA with identical RGB channels so `brightness = dot(rgb, luma)`
 *     reduces to the red channel value. pmndrs `EffectPass` requires
 *     RGBA sampling on some WebGL paths, so single-channel RED is
 *     out.
 *   - Center-weighted gaussian, σ = 20 px (~16 % of the texture
 *     extent) so the halo falls off to near-zero at the corners.
 */

const GLOW_SPRITE_SIZE = 128;
const GLOW_SIGMA = 20;
// Hard-zero the sprite outside this radius so `ClampToEdge` wrap on the
// halo sampler returns exact-zero when `glow_tc` overflows [0, 1]. Without
// this cutoff, the gaussian tail at r=64 (the sprite's half-width) is
// ~0.006 — tiny, but multiplied by the halo accumulation across N=8
// lights and replicated infinitely along the H/V axes by edge clamping,
// it reads as faint 4-ray cross-spikes coming out of every bright star.
// The cutoff kills those rays without touching the halo disc inside the
// radius (σ=20 is ≈16 % of the extent, so the gaussian is already
// essentially zero at r=48 — rounding the 48→62 band to 0 costs nothing).
// See `lightGlowSprite.test.ts` for the pinned border-zero assertion.
const GLOW_SPRITE_ZERO_RADIUS = GLOW_SPRITE_SIZE / 2 - 2;

let glowSpriteCache: THREE.DataTexture | null = null;

function bakeGlowSprite(): THREE.DataTexture {
  const size = GLOW_SPRITE_SIZE;
  const sigma = GLOW_SIGMA;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const twoSigmaSq = 2 * sigma * sigma;
  const zeroRadiusSq = GLOW_SPRITE_ZERO_RADIUS * GLOW_SPRITE_ZERO_RADIUS;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const r2 = dx * dx + dy * dy;
      const g = r2 >= zeroRadiusSq ? 0 : Math.exp(-r2 / twoSigmaSq);
      const value = Math.round(g * 255);
      const idx = (y * size + x) * 4;
      data[idx + 0] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Process-wide singleton glow sprite texture. Created lazily on first
 * LightGlow effect mount.
 */
export function getLightGlowSprite(): THREE.DataTexture {
  if (!glowSpriteCache) {
    glowSpriteCache = bakeGlowSprite();
  }
  return glowSpriteCache;
}

/**
 * Exposed for tests: size + sigma pins of the baked sprite. Keeps the
 * asset-geometry contract with the shader discoverable.
 */
export const LIGHT_GLOW_SPRITE_SIZE = GLOW_SPRITE_SIZE;
export const LIGHT_GLOW_SPRITE_SIGMA = GLOW_SIGMA;
export const LIGHT_GLOW_SPRITE_ZERO_RADIUS = GLOW_SPRITE_ZERO_RADIUS;
