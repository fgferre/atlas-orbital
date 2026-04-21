import * as THREE from "three";

/**
 * Procedural lens-flare asset substitutes for the θ.4 pseudo-lens-flare
 * + lensdirt port.
 *
 * Gaia Sky ships three PNGs under `$GS_DATA/default-data/tex/base/`:
 *   - `lenscolor.png` (`texLensColor`)     → pseudo-lens ghost CA gradient
 *   - `lensdirt.jpg`  (`texLensDirt`)      → lensdirt composite dirt mask
 *   - `lensstarburst.jpg` (`texLensStarburst`) → 1D starburst spike profile
 *
 * The binary assets live in a separate `$GS_DATA` licence bundle and
 * are NOT vendored here. Per the memory rule in
 * `feedback_codex_verified_claims_can_still_drift.md`, procedural
 * substitutes must be CONSERVATIVE (match the shader contract without
 * inventing aggressive visual features). What matters to the shaders:
 *
 *   - `lenscolor` is sampled radially (`d / length(vec2(0.5))`) — the
 *     pseudo-lens fragment does `result *= texture(lensColor, 1D)`.
 *     So it's effectively a 1D radial gradient. Bake as 256×1 RGB.
 *   - `lensdirt` is sampled per-fragment UV in `lensdirt.frag.glsl`:
 *     `dirt = texture(u_texture1, texCoords)`. A full 2D pattern.
 *     512×512 is large enough to avoid visible tiling, small enough
 *     to bake at startup.
 *   - `lensstarburst` is sampled twice as a 1D strip via
 *     `vec2(mod(abs(radial ± offset), 1), 0)` — the product-of-two
 *     samples creates mirror-symmetric spikes. 256×1 gives enough
 *     resolution for sharp peaks.
 */

// ---------------------------------------------------------------
// lensColor — 1D chromatic gradient (256×1 RGB)
// ---------------------------------------------------------------

/**
 * Subtle radial chromatic gradient. Center (radial=0) is neutral
 * cream; periphery (radial=1) tints slightly toward blue-red. Used
 * by `pseudolensflare.frag.glsl` line 48:
 *   `result *= texture(u_texture1, vec2(length(vec2(0.5) - texcoord) / length(vec2(0.5))))`
 * The Gaia asset `lenscolor.png` encodes a similar characteristic
 * falloff — our procedural is a linear interpolation of warm/cool
 * hues across the strip. Conservative (no invented features) but
 * gives the pseudo-lens its characteristic chromatic rim.
 */
const LENS_COLOR_SIZE = 256;

let lensColorCache: THREE.DataTexture | null = null;

function bakeLensColorSprite(): THREE.DataTexture {
  const size = LENS_COLOR_SIZE;
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    // Warm-to-cool chromatic falloff. Near centre (t → 0): warm
    // cream (R≈1, G≈0.9, B≈0.7). Edge (t → 1): cool teal tint.
    const r = 1.0 - t * 0.25;
    const g = 0.9 - t * 0.15;
    const b = 0.7 + t * 0.25;
    data[i * 4 + 0] = Math.round(Math.min(1, Math.max(0, r)) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
    data[i * 4 + 2] = Math.round(Math.min(1, Math.max(0, b)) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data,
    size,
    1,
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

export function getLensColorSprite(): THREE.DataTexture {
  if (!lensColorCache) lensColorCache = bakeLensColorSprite();
  return lensColorCache;
}

// ---------------------------------------------------------------
// lensDirt — 2D dirt/smudge mask (512×512 RGB)
// ---------------------------------------------------------------

/**
 * Subtle noisy dirt pattern. Sampled per-fragment at scene UV in
 * `lensdirt.frag.glsl:23`:
 *   `vec4 dirt = texture(u_texture1, texCoords)`
 * Final composite multiplies `base * (dirt * 3.0 + starburst)` —
 * so the dirt texture's average brightness directly modulates
 * fragment output. A low-mean noise map (≈0.25 mean, ≈0.15 std)
 * gives the characteristic "dirty lens" overlay without crushing
 * the base scene.
 *
 * Procedural pattern: overlapping low-frequency noise (2-3
 * octaves of value noise). Deterministic seed so builds are stable
 * across runs.
 */
const LENS_DIRT_SIZE = 512;

let lensDirtCache: THREE.DataTexture | null = null;

// Simple deterministic hash-based value noise in [0, 1].
function hash2D(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.1) * 43758.5453;
  return s - Math.floor(s);
}

function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  // Smoothstep
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2D(ix, iy, seed);
  const b = hash2D(ix + 1, iy, seed);
  const c = hash2D(ix, iy + 1, seed);
  const d = hash2D(ix + 1, iy + 1, seed);
  return (
    a * (1 - ux) * (1 - uy) +
    b * ux * (1 - uy) +
    c * (1 - ux) * uy +
    d * ux * uy
  );
}

function bakeLensDirtSprite(): THREE.DataTexture {
  const size = LENS_DIRT_SIZE;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Three octaves of value noise. Low amplitude so the dirt
      // stays subtle — mean value ≈ 0.25, peaks ≈ 0.5.
      let n = 0;
      n += smoothNoise(u * 8, v * 8, 1) * 0.5;
      n += smoothNoise(u * 16, v * 16, 2) * 0.3;
      n += smoothNoise(u * 32, v * 32, 3) * 0.2;
      // Scale to [0.1, 0.45] so `dirt * 3` lands at [0.3, 1.35]
      // — subtle overlay, not dominant.
      const gray = 0.1 + 0.35 * Math.min(1, Math.max(0, n));
      const v255 = Math.round(gray * 255);
      const idx = (y * size + x) * 4;
      data[idx + 0] = v255;
      data[idx + 1] = v255;
      data[idx + 2] = v255;
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

export function getLensDirtSprite(): THREE.DataTexture {
  if (!lensDirtCache) lensDirtCache = bakeLensDirtSprite();
  return lensDirtCache;
}

// ---------------------------------------------------------------
// lensStarburst — 1D spike profile (256×1 R channel)
// ---------------------------------------------------------------

/**
 * 1D strip with periodic sharp spike peaks. Sampled twice in
 * `lensdirt.frag.glsl:24-26`:
 *   `starburst = tex(u, mod(abs(radial - offset), 1)) *
 *                tex(u, mod(abs(-radial + offset), 1))`
 * where `radial = centerVec.x / d` (horizontal component of the
 * unit vector from screen center). As the azimuthal angle θ around
 * centre varies from 0 to 2π, radial = cos(θ). The two samples
 * (at |cos(θ) ± offset|) product-combine to form diffraction
 * spikes.
 *
 * Baked profile: 4 sharp gaussian peaks evenly spaced across
 * [0, 1]. The product-of-two-samples trick with mod symmetry
 * yields visible spikes at the camera-relative angles where both
 * samples align — practically a 4-to-8-way cross diffraction
 * pattern when `starburstOffset` is near 0, drifting with the
 * camera-direction component sum.
 */
const LENS_STARBURST_SIZE = 256;

let lensStarburstCache: THREE.DataTexture | null = null;

function bakeLensStarburstSprite(): THREE.DataTexture {
  const size = LENS_STARBURST_SIZE;
  const data = new Uint8Array(size * 4);
  // 4 peak centres spaced across [0, 1].
  const peaks: readonly number[] = [0.0, 0.25, 0.5, 0.75];
  const sigma = 0.008; // Sharp peaks — σ ≈ 2 texels.
  const twoSigmaSq = 2 * sigma * sigma;
  const baseBackground = 0.05;
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let peakValue = 0;
    for (const p of peaks) {
      // Circular distance on [0, 1].
      const d = Math.min(Math.abs(t - p), 1 - Math.abs(t - p));
      peakValue = Math.max(peakValue, Math.exp(-(d * d) / twoSigmaSq));
    }
    const v = Math.min(1, baseBackground + peakValue);
    const v255 = Math.round(v * 255);
    data[i * 4 + 0] = v255;
    data[i * 4 + 1] = v255;
    data[i * 4 + 2] = v255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(
    data,
    size,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType
  );
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  // RepeatWrapping so the `mod(abs(...), 1)` lookup wraps naturally.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function getLensStarburstSprite(): THREE.DataTexture {
  if (!lensStarburstCache) lensStarburstCache = bakeLensStarburstSprite();
  return lensStarburstCache;
}

/**
 * Exposed for tests: size pins of the baked sprites so a future
 * regression that changes the texture footprint without updating the
 * shader uniforms is caught.
 */
export const LENS_COLOR_SPRITE_SIZE = LENS_COLOR_SIZE;
export const LENS_DIRT_SPRITE_SIZE = LENS_DIRT_SIZE;
export const LENS_STARBURST_SPRITE_SIZE = LENS_STARBURST_SIZE;
