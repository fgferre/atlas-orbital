/**
 * HYG v4.2 starfield renderer.
 *
 * Consumes the compact binary catalog produced by `scripts/build-hyg-binary.js`
 * (parsed into `HygCatalogData` by `src/utils/hygBinary.ts`) and renders it
 * as a single `Points` primitive with a custom shader.
 *
 *   • Real B-V colour (blue/white/yellow/orange/red) derived per star
 *     instead of a single Sun-like default.
 *   • NASA Eyes–style log-compressed transfer curve: Pogson flux →
 *     `2·log(1 + flux·250)` brightness → sprite size and alpha with
 *     NASA's own clamp structure. See `./shaders/nasaStarShaders.ts`
 *     for the reference implementation this port mirrors. The 250 here
 *     collapses NASA's absMag + inverse-square pipeline for a solar-
 *     system-local observer — the equivalence is not exact when the
 *     camera sits >1000 AU from the Sun (tasks/lessons.md L17), but
 *     the deviation stays under ~2 % across the practical zoom range.
 *   • Proper motion: pmra / pmdec are converted on parse into a 3D
 *     velocity vector (parsecs/year); the vertex shader displaces the
 *     star by `velocity * yearsSinceJ2000` so the sky drifts with the
 *     simulation time — visible when exploring decades or centuries.
 *
 * Star positions are equatorial J2000 parsecs. The scene is ecliptic,
 * so the Points node is tilted by the J2000 obliquity (~23.4°) to keep
 * constellations in their expected places.
 */

import * as THREE from "three";
import { useCallback, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useStore } from "../../store";
import { simulationClock } from "../../lib/simulationClock";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../lib/starfield";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { useStarfieldCatalog } from "./useStarfieldCatalog";
import { useStarfieldParticleSize } from "./useStarfieldParticleSize";

// 1 parsec expressed in the scene's unit system (matches the legacy
// tycho2 path and NASA starfield; keeps the relative scale of the sky
// consistent between presets).
const DISTANCE_SCALE = 206_265_000.0;

// Convert 1 milliarcsecond to radians. Used to turn the stored pmra/pmdec
// (integer mas/yr) into the tangential proper motion component.
const MAS_TO_RAD = 4.848136811e-9;

// Milliseconds per Julian year (365.25 days). J2000 epoch in UT ms is
// `Date.parse("2000-01-01T12:00:00Z")`.
const J2000_EPOCH_MS = Date.parse("2000-01-01T12:00:00Z");
const MS_PER_JULIAN_YEAR = 365.25 * 86400 * 1000;

const vertexShader = /* glsl */ `
  attribute vec3 velocity;
  attribute float mag;
  attribute float ci;

  // particleSize already bakes devicePixelRatio in (set by useFrame
  // to sqrt(max(w,h) * DPR) / 60, matching NASA Eyes' own derivation).
  // Do NOT multiply by a separate pixelRatio uniform — that caused a
  // double-DPR bug on retina displays.
  uniform float particleSize;
  uniform float yearsSinceJ2000;
  // R1 #1B (Wave α Commit 2): HDR-linear multiplier baked into vColor
  // so bright catalogue stars cross the selective-bloom threshold
  // (1.0 after the §1.1 pipeline contract). Tier defaults live on
  // qualityProfile.vfxHdrGain. Declared in the vertex stage only —
  // multiplied into the per-star varying below so the fragment shader
  // stays uniform-free.
  uniform float vfxHdrGain;

  varying vec3 vColor;
  varying float vBrightness;

  // B-V colour index → RGB, a piecewise-linear approximation of the
  // blackbody locus. Matches the reference implementation in
  // src/utils/astronomy.ts so existing visual identity is preserved.
  vec3 bvToRGB(float bv) {
    float t = clamp((bv + 0.4) / (2.0 + 0.4), 0.0, 1.0);
    if (t < 0.25) {
      // Blue to white (O / B / A stars)
      float r = 0.6 + t * 1.6;
      float g = 0.6 + t * 1.6;
      return vec3(r, g, 1.0);
    } else if (t < 0.5) {
      // White to yellow (F / G stars — the Sun sits here, t ~ 0.44)
      return vec3(1.0, 1.0 - (t - 0.25) * 0.8, 1.0 - (t - 0.25) * 1.6);
    } else {
      // Yellow to red (K / M stars)
      return vec3(1.0, 0.8 - (t - 0.5) * 1.2, 0.2 - (t - 0.5) * 0.4);
    }
  }

  void main() {
    // Proper motion: displace by (velocity pc/yr) × years. yearsSinceJ2000
    // crosses zero at the J2000 epoch and grows/shrinks with simulation
    // time, so dragging the timeline visibly moves high-proper-motion stars
    // (Barnard's, Kapteyn's, 61 Cyg) while typical stars stay put.
    vec3 animatedPos = position + velocity * yearsSinceJ2000;

    vec4 viewPosition = modelViewMatrix * vec4(animatedPos, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    // NASA Eyes–style transfer curve. We run the SAME post-log-
    // compression pipeline as nasaStarShaders.ts, just driving the
    // flux from HYG's apparent magnitude instead of NASA's absMag +
    // inverse-square (mathematically equivalent for a solar-system
    // observer because the distance term cancels: apparent magnitude
    // IS flux-at-Earth in magnitudes). The 250 multiplier collapses
    // NASA's absMag·1e4 pipeline to an apparent-mag equivalent.
    //
    // Both the size and alpha formulas mirror NASA exactly, including
    // the [5, 50] size clamp AFTER the particleSize multiplication
    // (so the clamps are on the final-pixel range, not on a
    // pre-viewport quantity) and alpha = brightness * particleSize
    // (not a separate 0.08 coefficient — that was the mistake that
    // crushed mid-faint stars in the previous calibration).
    float flux = pow(10.0, -mag * 0.4);
    float brightness = 2.0 * log(1.0 + flux * 250.0);

    gl_PointSize = clamp(brightness * 4.0 * particleSize, 5.0, 50.0);
    vBrightness = clamp(brightness * particleSize, 0.05, 1.0);
    // Bake vfxHdrGain into vColor (post-B-V). For gain > 1 the
    // per-channel value can exceed 1.0 and, combined with additive
    // blending (src.rgb * src.a + dst.rgb), the brightest stars cross
    // the 1.0 threshold the Bloom luminanceThreshold=1.0 pass watches.
    // Faint stars with small vBrightness stay below.
    vColor = bvToRGB(ci) * vfxHdrGain;
  }
`;

// Gaia Sky star.group.quad.fragment.glsl (3.7.x) kernel port. The
// fragment structure is:
//   - `u_starTex.r` delivers a baked radial-gaussian halo profile.
//   - `core` is a razor-thin additive white pinpoint, UV radius
//     [0.0, 0.04] around sprite center, added to RGB (NOT to alpha).
//   - alpha = vBrightness × profile (Gaia Sky: v_col.a × profile).
//   - RGB output is pre-multiplied by alpha INSIDE the fragment so
//     the material can use true One/One additive (see material
//     setup below). That matches Gaia Sky's blend setup
//     (`BlendMode.ADDITIVE = GL_ONE, GL_ONE` in
//     `core/src/gaiasky/render/BlendMode.java`) exactly, both on
//     RGB and on the framebuffer alpha-channel accumulation. The
//     only intentional divergence left is Gaia Sky's final
//     `saturate()` clamp on the fragment output — we skip it so
//     the Wave α HDR pipeline can pass `alpha * (rgb + core*2) > 1`
//     into Bloom's luminanceThreshold = 1 bright pass; AgX tone-maps
//     back into display range at the end of the composer. That is a
//     pipeline/render-space mismatch (R1 step-5 classification #2),
//     not a structural one.
const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D u_starTex;

  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    vec2 uv = gl_PointCoord;
    float profile = texture2D(u_starTex, uv).r;
    if (profile <= 0.0) discard;

    float r = length(uv - vec2(0.5)) * 2.0;
    float core = clamp(1.0 - smoothstep(0.0, 0.04, r), 0.0, 1.0);

    float alpha = vBrightness * profile;
    vec3 rgb = (vColor + vec3(core * 2.0)) * alpha;
    gl_FragColor = vec4(rgb, alpha);
  }
`;

// Baked radial-gaussian texture that plays the role of Gaia Sky's
// `tex/base/star-tex-NN.{jpg,png}` asset-bundle halo. Generated once
// per process on first material construction so the bundle does not
// grow and the gaussian parameters stay tweakable in one place.
// R8 (THREE.RedFormat) matches the shader's `.r` sample; LinearFilter
// min/mag matches Gaia Sky's `Texture.TextureFilter.Linear` pair.
//
// σ = 10 in a 64×64 texture gives, in UV-space radius terms:
//   - 100 % at centre,
//   -  ~29 % at r_uv = 0.25 (half sprite width),
//   -  ~0.7 % at r_uv = 0.5 (sprite edge),
//   - essentially zero past the edge.
// That is materially wider than the pre-port `pow(d, 5)` ball (~3 %
// at half radius), matching Gaia Sky's softer halo aesthetic, without
// collapsing the starfield into the uniform haze a broader σ (14+)
// produced on a first visual pass. Narrower σ (≤ 6) would reproduce
// the NASA-Eyes footprint and lose the Gaia-Sky-specific character.
const STAR_SPRITE_TEXTURE_SIZE = 64;
const STAR_SPRITE_GAUSSIAN_SIGMA = 10;

let starSpriteTextureCache: THREE.DataTexture | null = null;

function buildStarSpriteTexture(): THREE.DataTexture {
  const size = STAR_SPRITE_TEXTURE_SIZE;
  const sigma = STAR_SPRITE_GAUSSIAN_SIGMA;
  const data = new Uint8Array(size * size);
  const center = (size - 1) / 2;
  const twoSigmaSq = 2 * sigma * sigma;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const r2 = dx * dx + dy * dy;
      data[y * size + x] = Math.round(Math.exp(-r2 / twoSigmaSq) * 255);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function getStarSpriteTexture(): THREE.DataTexture {
  if (!starSpriteTextureCache) {
    starSpriteTextureCache = buildStarSpriteTexture();
  }
  return starSpriteTextureCache;
}

/**
 * Convert the catalog's pmra / pmdec (int16 mas/yr, stored on the HYG
 * record) into a 3D velocity in parsecs/year aligned with the catalog's
 * own J2000 equatorial frame. The shader then needs only a scalar
 * "years elapsed" uniform to animate the sky.
 *
 * Formula (small-angle tangent-plane approximation):
 *   east  = (−sinα, cosα, 0)
 *   north = (−sinδ·cosα, −sinδ·sinα, cosδ)
 *   v = (pmRA · east + pmDec · north) · mas_to_rad · dist
 *
 * HYG's `pmra` convention already includes cos(δ), so we do not multiply
 * again here. This is consistent with the formula used by Hipparcos,
 * Gaia and every other modern all-sky catalog.
 */
function buildVelocityAttribute(catalog: HygCatalogData): Float32Array {
  const { positions, pmRA, pmDec } = catalog;
  const count = catalog.header.count;
  const velocities = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const px = positions[i * 3 + 0];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];

    const dist = Math.sqrt(px * px + py * py + pz * pz);
    if (dist <= 0) continue; // should not happen after filter; leave zeros

    const decRad = Math.asin(pz / dist);
    const raRad = Math.atan2(py, px);
    const cosRA = Math.cos(raRad);
    const sinRA = Math.sin(raRad);
    const cosDec = Math.cos(decRad);
    const sinDec = Math.sin(decRad);

    const pmRaPcPerYr = pmRA[i] * MAS_TO_RAD * dist;
    const pmDecPcPerYr = pmDec[i] * MAS_TO_RAD * dist;

    velocities[i * 3 + 0] =
      -sinRA * pmRaPcPerYr + -sinDec * cosRA * pmDecPcPerYr;
    velocities[i * 3 + 1] =
      cosRA * pmRaPcPerYr + -sinDec * sinRA * pmDecPcPerYr;
    velocities[i * 3 + 2] = cosDec * pmDecPcPerYr;
  }

  return velocities;
}

export const Starfield = () => {
  // Proper motion tracks the simulation clock directly inside useFrame
  // (see `years` computation below). No React subscription on datetime
  // is needed — that keeps this component out of the 60 Hz re-render
  // path and avoids rebuilding geometry/material when time advances.
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const pointsRef = useRef<THREE.Points>(null);

  // Build the ShaderMaterial once and pass it as an instance to the
  // <points> element. An earlier iteration used `<shaderMaterial
  // uniforms={{...}}>` as a JSX child, but each render created a new
  // `uniforms` object that R3F assigned onto the material, replacing
  // the uniform map the compiled WebGLProgram was bound to. Per-frame
  // mutations then wrote into an object the GPU no longer read from
  // (tasks/lessons.md L15). Keep the useMemo'd material reference
  // stable so per-frame uniform mutations land on the slots the GPU
  // actually samples.
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        particleSize: { value: 1.0 },
        yearsSinceJ2000: { value: 0.0 },
        // Seeded from the current tier in useFrame below — this initial
        // value is a safe default (1.0 = no HDR lift) until the first
        // frame writes the tier-keyed gain.
        vfxHdrGain: { value: 1.0 },
        // Lazily-generated radial-gaussian halo profile. The texture
        // is process-wide cached so React remounts reuse it, matching
        // Gaia Sky's asset-loaded star-tex-NN.* lifetime.
        u_starTex: { value: getStarSpriteTexture() },
      },
      transparent: true,
      depthWrite: false,
      // True premultiplied additive: matches Gaia Sky's
      // `BlendMode.ADDITIVE = GL_ONE, GL_ONE` exactly. The fragment
      // shader pre-multiplies `rgb` by `alpha` so the blend-time
      // factors stay One/One. THREE.AdditiveBlending (which is
      // SrcAlpha/One) would produce identical RGB in the scene here
      // — alpha² on the framebuffer vs. alpha — but keeping the
      // factors One/One removes that last wrinkle of structural
      // divergence from Gaia Sky.
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
  }, []);

  // Memoise the tier-bound loader / cache getter so
  // `useStarfieldCatalog`'s effect only re-runs when the device tier
  // actually changes (e.g. user toggling quality mode in the settings).
  const loadCatalogForTier = useCallback(() => loadHygCatalog(tier), [tier]);
  const getCachedCatalogForTier = useCallback(
    () => getCachedHygCatalog(tier),
    [tier]
  );

  const catalog = useStarfieldCatalog<HygCatalogData>({
    source: "hyg",
    loadCatalog: loadCatalogForTier,
    getCachedCatalog: getCachedCatalogForTier,
  });

  const geometry = useMemo(() => {
    if (!catalog) return null;

    const { positions, magnitudes, colorIndices } = catalog;
    const count = catalog.header.count;

    // Scale parsec positions into the scene's unit system once on the CPU.
    // Using a dedicated scaled copy rather than a shader uniform keeps the
    // number of per-frame multiplications at zero.
    const scaledPositions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      scaledPositions[i] = positions[i] * DISTANCE_SCALE;
    }

    // Convert proper motion to a pre-scaled 3D velocity so the shader can
    // displace positions with a single yearsSinceJ2000 uniform.
    const velocities = buildVelocityAttribute(catalog);
    for (let i = 0; i < velocities.length; i++) {
      velocities[i] *= DISTANCE_SCALE;
    }

    // Magnitudes pass through unmodified: the starfield reads the same in
    // didactic and realistic scale modes. An earlier version biased mag
    // down by 0.9 in didactic to mimic the legacy tycho2 preset's larger
    // dots, but the user explicitly wanted the sky to stay visually
    // consistent while the solar-system scale changes.
    const magArray = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      magArray[i] = magnitudes[i];
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(scaledPositions, 3)
    );
    geom.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute("mag", new THREE.BufferAttribute(magArray, 1));
    geom.setAttribute("ci", new THREE.BufferAttribute(colorIndices, 1));

    return geom;
  }, [catalog]);

  // Viewport-adaptive sizing so a window resize does not change the
  // visual density of the sky. yearsSinceJ2000 is the simulation-time
  // offset in Julian years the shader uses to animate proper motion.
  // Both live on the memoised material's uniforms map — mutating those
  // values is the intended per-frame path (see the memo comment above).
  // `getViewportScale` is a getter invoked per-frame so DPR changes
  // driven by `<Canvas dpr>` land immediately; see
  // `useStarfieldParticleSize` for the full reasoning.
  const getViewportScale = useStarfieldParticleSize();
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    const matUniforms = material.uniforms;
    matUniforms.particleSize.value = getViewportScale();

    const years =
      (simulationClock.getNow().getTime() - J2000_EPOCH_MS) /
      MS_PER_JULIAN_YEAR;
    matUniforms.yearsSinceJ2000.value = years;

    // R1 #1B — tier-keyed HDR gain, routed through the memoised
    // material's uniforms map (L15 literal: if we re-created the
    // uniforms object every render via `<shaderMaterial uniforms={...}>`,
    // the compiled WebGLProgram would stay bound to the original map
    // and per-frame writes would miss the GPU).
    matUniforms.vfxHdrGain.value = qualityProfile.vfxHdrGain;
  });
  /* eslint-enable react-hooks/immutability */

  if (!geometry) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      material={material}
      rotation={[(23.4 * Math.PI) / 180, 0, 0]}
      raycast={() => null}
      renderOrder={-2}
    />
  );
};
