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
 * Until the local placeholder setup runs the public path 404s, so every
 * fresh clone and every CI runner renders without these three files.
 * That path has to be neutral by construction — see `NEUTRAL_LEVEL`.
 *
 * **It was not.** This docstring used to claim a missing dirt/starburst
 * pair "just yields a clean flare with no grit, which is harmless
 * visually". Three's fallback for a texture with no image is a 1×1
 * transparent BLACK, and black is the correct neutral for exactly one
 * of the three slots:
 *
 *   - `dirt` feeds `dirt * 3.0 + starburst`. Black → adds no grime.
 *     Correct by accident.
 *   - `starburst` feeds `s1 * s2`. Black → the product is 0, so
 *     `clamp(0 + (1 - smoothstep(0, 0.3, d)), 0, 1)` is all that
 *     survives — a mask anchored to the SCREEN centre, unrelated to
 *     the light. The whole flare collapsed into a centre blob.
 *   - `lensColor` feeds `result *= texture2D(...)` in
 *     `PseudoLensFlareEffect`. Black → multiplies the accumulated
 *     ghosts by zero and the PSEUDO flare renders nothing at all.
 *
 * Each texture now carries its own neutral 1×1 stand-in from the first
 * frame, replaced in place once the real image decodes. A 404 leaves
 * the neutral in the sampler, which is what the old claim described.
 */

const BASE_URL = import.meta.env.BASE_URL || "/";
const LENS_TEXTURE_BASE = `${BASE_URL}textures/lens/`;

// Filenames preserved byte-for-byte from Gaia's `tex/base/` so a
// future integrity audit can pin each placeholder by sha256 without
// a rename step (ROADMAP §T2.3a fingerprint block).
export const LENS_COLOR_TEXTURE_URL = `${LENS_TEXTURE_BASE}lenscolor.png`;
export const LENS_DIRT_TEXTURE_URL = `${LENS_TEXTURE_BASE}lensdirt-low.jpg`;
export const LENS_STARBURST_TEXTURE_URL = `${LENS_TEXTURE_BASE}lensstarburst.jpg`;

const loader = new THREE.ImageLoader();

/**
 * Per-slot 8-bit grey level that makes the shader behave as if the
 * texture were not there at all, rather than as if it were black.
 *
 * `dirt` is additive through `× 3.0`, so its no-op is 0. `starburst`
 * and `lensColor` are multiplicative, so theirs is full white. With
 * `dirt = 0` and `starburst = 1` the composite modulation
 * `dirt * 3.0 + starburst` evaluates to exactly 1 — pinned in
 * `lensFlareSprites.test.ts`, because the whole point of these numbers
 * is that a missing asset changes nothing.
 */
export const NEUTRAL_LEVEL = {
  color: 255,
  dirt: 0,
  starburst: 255,
} as const;

/**
 * 1×1 canvas at a flat grey level. Returns null where no 2D context
 * exists (jsdom without the `canvas` package) — the texture then keeps
 * three's own empty-image fallback, which is the pre-existing
 * behaviour and only ever reached in unit tests, never in a browser.
 */
const neutralImage = (level: number): HTMLCanvasElement | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = `rgb(${level}, ${level}, ${level})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas;
};

/**
 * Loads `url` into a texture that samples `neutralLevel` until (and
 * unless) the real image arrives.
 *
 * Deliberately `ImageLoader` rather than `TextureLoader`: the latter
 * owns the Texture it returns and assigns `.image` itself, which leaves
 * no seam to pre-seed. Here the Texture is ours, starts on the neutral
 * canvas, and the decoded `HTMLImageElement` replaces `.image` in
 * place — same object identity, so the `Uniform` handed to the Effect
 * at construction never has to be swapped. Both a canvas and an image
 * upload through three's DOM-source path, so the substitution is
 * invisible to `WebGLTextures`.
 *
 * On error nothing happens, by design: the neutral stays.
 */
const loadWithNeutralFallback = (
  url: string,
  neutralLevel: number
): THREE.Texture => {
  const texture = new THREE.Texture();
  const neutral = neutralImage(neutralLevel);
  if (neutral) {
    texture.image = neutral;
    texture.needsUpdate = true;
  }

  loader.load(url, (image) => {
    texture.image = image;
    texture.needsUpdate = true;
  });

  return texture;
};

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
  // `needsUpdate` is owned by `loadWithNeutralFallback` — set once for
  // the neutral 1×1 and again when the decoded image replaces it. It
  // must never be set while `.image` is empty: that triggers a spurious
  // "Texture marked for update but no image data found" on the first
  // WebGLRenderer frame (2026-04-22 codex audit).
}

function loadLensColorSprite(): THREE.Texture {
  const tex = loadWithNeutralFallback(
    LENS_COLOR_TEXTURE_URL,
    NEUTRAL_LEVEL.color
  );
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
  const tex = loadWithNeutralFallback(
    LENS_DIRT_TEXTURE_URL,
    NEUTRAL_LEVEL.dirt
  );
  applyLensFilter(tex);
  // `lensdirt.frag.glsl:23` samples scene UV directly — clamp-to-edge
  // matches the Gaia default (libGDX `Texture.Wrap.ClampToEdge`).
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function loadLensStarburstSprite(): THREE.Texture {
  const tex = loadWithNeutralFallback(
    LENS_STARBURST_TEXTURE_URL,
    NEUTRAL_LEVEL.starburst
  );
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
