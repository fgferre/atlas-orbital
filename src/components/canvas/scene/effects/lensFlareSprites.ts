import * as THREE from "three";

/**
 * Lens-flare asset loaders for the θ.4 pseudo-lens-flare + lensdirt
 * port.
 *
 * Gaia Sky ships three textures at
 * `$GS_DATA/default-data/tex/base/`:
 *   - `lenscolor.png`        → pseudo-lens ghost CA gradient
 *     (sampled 1D in `pseudolensflare.frag.glsl:48`).
 *   - `lensdirt-low.jpg`     → 2D dirty-lens overlay
 *     (sampled 2D UV in `lensdirt.frag.glsl:23`).
 *   - `lensstarburst.jpg`    → diffraction-spike strip
 *     (sampled twice as 1D with `mod(abs(..), 1)` in
 *     `lensdirt.frag.glsl:24-26`).
 *
 * T2.3a workflow (see `tasks/ROADMAP.md §T2.3a`): the three binaries
 * live at `public/textures/lens/` as **license-ambiguous Gaia
 * originals** during the calibration phase — gitignored via
 * `public/textures/lens/*.{png,jpg}`. T2.3b replaces them with
 * CC-BY-4.0 reconstructions and removes the ignore rule.
 *
 * Until the local placeholder setup runs, the public path 404s and
 * three's TextureLoader leaves the material sampling a blank texture
 * (no crash, no console throw, only lens flare renders empty). This
 * degradation is acceptable: the upstream post-process composes
 * `bias → ghosts → CA → halo → dirt × starburst`, and a missing dirt
 * × starburst just yields a clean flare with no grit, which is
 * harmless visually and fully debuggable via the Network panel.
 */

const BASE_URL = import.meta.env.BASE_URL || "/";
const LENS_TEXTURE_BASE = `${BASE_URL}textures/lens/`;

// Filenames preserved byte-for-byte from Gaia's `tex/base/` so a
// future integrity audit can pin each placeholder by sha256 without
// a rename step (ROADMAP §T2.3a fingerprint block).
export const LENS_COLOR_TEXTURE_URL = `${LENS_TEXTURE_BASE}lenscolor.png`;
export const LENS_DIRT_TEXTURE_URL = `${LENS_TEXTURE_BASE}lensdirt-low.jpg`;
export const LENS_STARBURST_TEXTURE_URL = `${LENS_TEXTURE_BASE}lensstarburst.jpg`;

const loader = new THREE.TextureLoader();

let lensColorCache: THREE.Texture | null = null;
let lensDirtCache: THREE.Texture | null = null;
let lensStarburstCache: THREE.Texture | null = null;

// Contract preserved across T2.3a / T2.3b: the shader samples each
// texture linearly, without mipmaps, and in raw color space (no
// sRGB→linear decode) — Gaia reads via libGDX's default pipeline,
// which likewise does not gamma-decode these `tex/base/` sprites
// before handing them to `lensdirt.frag.glsl` /
// `pseudolensflare.frag.glsl`.
function applyLensFilter(tex: THREE.Texture) {
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
}

function loadLensColorSprite(): THREE.Texture {
  const tex = loader.load(LENS_COLOR_TEXTURE_URL);
  applyLensFilter(tex);
  // `pseudolensflare.frag.glsl:48` samples with
  // `vec2(length(vec2(0.5) - texcoord) / length(vec2(0.5)))`.
  // The argument is always in [0, ~1.41/1.41] ≈ [0, 1], so clamp
  // wrapping avoids artifacts at the corners where the ratio can
  // exceed 1 due to floating-point rounding.
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function loadLensDirtSprite(): THREE.Texture {
  const tex = loader.load(LENS_DIRT_TEXTURE_URL);
  applyLensFilter(tex);
  // `lensdirt.frag.glsl:23` samples scene UV directly — clamp-to-edge
  // matches the Gaia default (libGDX `Texture.Wrap.ClampToEdge`).
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function loadLensStarburstSprite(): THREE.Texture {
  const tex = loader.load(LENS_STARBURST_TEXTURE_URL);
  applyLensFilter(tex);
  // `lensdirt.frag.glsl:24-26` does
  //   `tex(starburst, mod(abs(radial ± offset), 1))`.
  // The `mod(_, 1)` output can reach exactly 1.0 at the wrap seam;
  // RepeatWrapping is required so the sample at 1.0 aliases to the
  // sample at 0.0 without a clamped plateau. wrapT stays clamp —
  // the real asset is 2D (502×60 for the current Gaia placeholder)
  // but `PSEUDO_LENS_STARBURST_SAMPLE_Y_COORD = 0.0` pins the
  // y-sample to row 0.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function getLensColorSprite(): THREE.Texture {
  if (!lensColorCache) lensColorCache = loadLensColorSprite();
  return lensColorCache;
}

export function getLensDirtSprite(): THREE.Texture {
  if (!lensDirtCache) lensDirtCache = loadLensDirtSprite();
  return lensDirtCache;
}

export function getLensStarburstSprite(): THREE.Texture {
  if (!lensStarburstCache) lensStarburstCache = loadLensStarburstSprite();
  return lensStarburstCache;
}
