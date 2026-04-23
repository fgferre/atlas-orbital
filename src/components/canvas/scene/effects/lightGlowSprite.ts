import * as THREE from "three";

/**
 * Glow sprite for the Gaia Sky LightGlow port (θ.3).
 *
 * **Asset source.** Gaia Sky's `u_texture1` for LightGlow comes from
 * `Settings.scene.star.getGlowTexture()` →
 * `getStarTexture(textureIndexLens)` →
 * `$GS_DATA/tex/base/star-tex-{XX}-*`. `config.yaml:171` ships
 * `textureIndexLens: 3` — the "horizontal + vertical spikes" asset
 * credited to Andreas Ressl and Georg Hammerschmid
 * (`references/gaia-sky-source/star-tex-01-credit.txt`,
 * originally sourced from Seed of Andromeda's procedural star
 * rendering article). Same T2.3a placeholder pattern the lens-flare
 * sprites use: the `-low` binary lives as a gitignored placeholder
 * at `public/textures/stars/star-tex-03.jpg` during calibration;
 * a CC-BY-4.0 reconstruction replaces it in a later ship and that
 * replacement IS committed (ship analogous to T2.3b, tracked as
 * T4.4f / LightGlow asset swap).
 *
 * **Why the swap matters.** The pre-d6165c6 pure-gaussian procedural
 * substitute gave a soft round halo with no spikes — missing Gaia's
 * signature 4-ray cross-spike look. A first attempt at baking
 * procedural spikes (`σ_long = 34` anisotropic gaussian) produced
 * "visible hard cartesian lines radiating from every bright star"
 * — too strong. The border-zero fix that followed
 * (`LIGHT_GLOW_SPRITE_ZERO_RADIUS` in the prior iteration) killed
 * the ClampToEdge leakage but still left atlas with a plain radial
 * halo that diverged from Gaia. Shipping the real asset resolves
 * both: the intended spike pattern is present AND the border is
 * genuinely black, so no ClampToEdge leakage either.
 *
 * **Shader sampling contract** (mirrors Gaia's libGDX pipeline):
 *   - `LinearFilter` min + mag — Gaia uses the default smooth sampler.
 *   - `ClampToEdgeWrapping` on both axes — out-of-halo UVs return
 *     the vendored asset's zero border (no leakage).
 *   - `NoColorSpace` — Gaia samples raw bytes without sRGB decode.
 *   - No mipmaps — the LightGlow halo never needs minified samples
 *     (halo size is driven by `u_textureScale`, not dependency on
 *     screen resolution via a mip chain).
 */

const BASE_URL = import.meta.env.BASE_URL || "/";
const STAR_TEXTURE_BASE = `${BASE_URL}textures/stars/`;

export const LIGHT_GLOW_SPRITE_URL = `${STAR_TEXTURE_BASE}star-tex-03.jpg`;

const loader = new THREE.TextureLoader();

let glowSpriteCache: THREE.Texture | null = null;

function applyGlowFilter(tex: THREE.Texture) {
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  // DO NOT set `needsUpdate = true` here — `TextureLoader.load()`
  // returns a Texture whose image is still decoding. The loader's
  // own `onLoad` callback flips `needsUpdate` once the Image is
  // ready. Same guardrail as `lensFlareSprites.ts:59-65` (codex
  // audit 2026-04-22).
}

function loadGlowSprite(): THREE.Texture {
  const tex = loader.load(LIGHT_GLOW_SPRITE_URL);
  applyGlowFilter(tex);
  return tex;
}

/**
 * Process-wide singleton glow sprite texture. Created lazily on first
 * LightGlow effect mount. Returns immediately with an empty image that
 * the loader fills in on decode — subsequent frames sample the real
 * pixels. If the asset is absent (the placeholder never got copied,
 * or a production build ships without it) the halo renders black,
 * which is a documented degraded state mirrored from `lensFlareSprites`.
 */
export function getLightGlowSprite(): THREE.Texture {
  if (!glowSpriteCache) {
    glowSpriteCache = loadGlowSprite();
  }
  return glowSpriteCache;
}
