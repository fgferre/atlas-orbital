import * as THREE from "three";

/**
 * Sun billboard sprite for the Gaia Sky T4.9a' port.
 *
 * **Asset source.** Gaia Sky's star-billboard pipeline samples
 * `Settings.scene.star.getStarTexture()` →
 * `getStarTexture(textureIndex)` → `$GS_DATA/tex/base/star-tex-{XX}-*`.
 * `config.yaml:169` ships `textureIndex: 4` — `star-tex-04-*.png`,
 * the soft-halo sprite Gaia uses for star billboards (vs
 * `textureIndexLens: 3` → `star-tex-03-*` which T3 LightGlow already
 * vendored at `a9f9bd5`).
 *
 * **Placeholder strategy** (T4.9a' decision 2026-04-23, mirror of
 * T2.3a's lens-flare workflow). The real `star-tex-04-low.jpg` is in
 * Gaia's `default-data` pack which atlas does not vendor; until that
 * asset is acquired or a CC-BY-4.0 reconstruction lands, the
 * placeholder file at `public/textures/stars/star-tex-04-low.jpg` is
 * a byte-identical copy of `star-tex-03.jpg`. Visually that means
 * the Sun billboard inherits star-tex-03's 4-ray cross-spike pattern
 * (instead of star-tex-04's smoother radial halo) — a tolerable
 * visual approximation that matches the LightGlow look already
 * shipped, and only fires at stellar distances where the post-
 * process LightGlow halo barely contributes (distance falloff).
 * The placeholder gets swapped during the final asset-licensing
 * wave alongside T2.3b.
 *
 * **Shader sampling contract** (mirrors Gaia's libGDX pipeline +
 * the established `lightGlowSprite.ts` pattern):
 *   - `LinearFilter` min + mag — Gaia's default smooth sampler.
 *   - `ClampToEdgeWrapping` on both axes — out-of-sprite UVs return
 *     the placeholder's near-zero border (no leakage).
 *   - `NoColorSpace` — Gaia samples raw bytes without sRGB decode.
 *   - No mipmaps — billboard renders at one screen size; mip chain
 *     is dead overhead.
 */

const BASE_URL = import.meta.env.BASE_URL || "/";
const STAR_TEXTURE_BASE = `${BASE_URL}textures/stars/`;

export const SUN_BILLBOARD_TEXTURE_URL = `${STAR_TEXTURE_BASE}star-tex-04-low.jpg`;

const loader = new THREE.TextureLoader();

let sunBillboardSpriteCache: THREE.Texture | null = null;

function applySunBillboardFilter(tex: THREE.Texture) {
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  // DO NOT set `needsUpdate = true` here — the loader callback
  // flips it once the Image decode completes (same guardrail as
  // `lightGlowSprite.ts:59-65`).
}

function loadSunBillboardSprite(): THREE.Texture {
  const tex = loader.load(SUN_BILLBOARD_TEXTURE_URL);
  applySunBillboardFilter(tex);
  return tex;
}

/**
 * Process-wide singleton sun-billboard sprite texture. Created
 * lazily on first SunBillboard mount. Returns immediately with an
 * empty image that the loader fills in on decode; subsequent frames
 * sample the real pixels. If the placeholder asset is absent (e.g.,
 * a fresh clone where the gitignored file was never copied) the
 * sprite renders black, which is a documented degraded state
 * mirrored from `lightGlowSprite.ts` / `lensFlareSprites.ts`.
 */
export function getSunBillboardSprite(): THREE.Texture {
  if (!sunBillboardSpriteCache) {
    sunBillboardSpriteCache = loadSunBillboardSprite();
  }
  return sunBillboardSpriteCache;
}

export const __testing = {
  resetCache() {
    sunBillboardSpriteCache?.dispose();
    sunBillboardSpriteCache = null;
  },
  applySunBillboardFilter,
};
