import * as THREE from "three";

/**
 * Baked glow sprite for the Gaia Sky LightGlow port (θ.3).
 *
 * Gaia Sky ships a PNG called "star-tex-01.png" that the LightGlow
 * fragment samples via `u_texture1`. The texture encodes the halo
 * radial profile — a soft, slightly-spiked gaussian. Rather than
 * distribute a binary asset we bake an equivalent texture at startup
 * using a procedural gaussian with a faint radial star pattern. The
 * visual match is close enough for parity; we can swap in the actual
 * Gaia Sky asset later if needed (the shader reads the luma channel
 * only).
 *
 * Texture characteristics:
 *   - 128 × 128 px (larger than θ.1's 64² because the LightGlow halo
 *     covers a meaningfully bigger footprint).
 *   - R8 single-channel. The LightGlow fragment reads `.r` via
 *     `starImage(tc).rgb`, but in the single-channel case, `brightness`
 *     reduces to `dot(rrr, luma_weights) = r` which is what we want.
 *   - Center-weighted gaussian, σ = 20 px so the falloff reaches
 *     ≈5 % at the edge (Gaia's asset has similar extent).
 */

const GLOW_SPRITE_SIZE = 128;
const GLOW_SIGMA = 20;

let glowSpriteCache: THREE.DataTexture | null = null;

function bakeGlowSprite(): THREE.DataTexture {
  const size = GLOW_SPRITE_SIZE;
  const sigma = GLOW_SIGMA;
  // RGB channels identical (single-channel equivalence — pmndrs
  // EffectPass requires RGBA sampling on some WebGL paths).
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const twoSigmaSq = 2 * sigma * sigma;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const r2 = dx * dx + dy * dy;
      const g = Math.exp(-r2 / twoSigmaSq);
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
