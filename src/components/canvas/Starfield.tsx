/**
 * HYG v4.2 starfield renderer.
 *
 * Consumes the compact binary catalog produced by `scripts/build-hyg-binary.js`
 * (parsed into `HygCatalogData` by `src/utils/hygBinary.ts`) and renders it
 * as a single `Points` primitive with a custom shader.
 *
 *   • Real B-V colour (blue/white/yellow/orange/red) derived per star
 *     instead of a single Sun-like default.
 *   • **θ.1b (2026-04-20, revised 2026-04-21):** Gaia-Sky-style
 *     solid-angle vertex math, replacing the NASA-Eyes log-compressed
 *     curve + hard floors. Per-star `a_size` is a Gaia-Sky-style
 *     **pseudo-size** derived from apparent-magnitude → absolute-
 *     magnitude → sqrt(pseudoL) × 0.15 pc (NOT a physical radius —
 *     see src/lib/starPhysics.ts for source-verified semantics).
 *     `solidAngle = a_size / dist` drives both opacity (via
 *     `lint_smoothstep` mapping) and pixel size (scaled by projection
 *     × viewport). Faint distant stars fade to invisibility like
 *     Gaia Sky does; there is no `[5, 50]` size floor or `0.05`
 *     alpha floor in this path.
 *   • **θ.1 (2026-04-20):** Gaia-Sky-style fragment kernel — baked
 *     radial-gaussian halo texture (`u_starTex`) + razor-thin
 *     additive white core via `smoothstep(0.0, 0.04, r)`. See
 *     `src/lib/starfieldShaderMath.ts` for the executable mirror and
 *     `tasks/phase-gaia-sky.md §5 θ.1/θ.1b` for the port plan.
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
import { useFrame, useThree } from "@react-three/fiber";
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
import {
  pseudoSizeFromApparentMag,
  STAR_SIZE_FACTOR,
} from "../../lib/starPhysics";
import {
  computeMinQuadSolidAngle,
  computeViewportHeightScalar,
  LEN0,
  U_BRIGHTNESS_POWER_DEFAULT,
  U_MIN_QUAD_SOLID_ANGLE,
  U_OPACITY_LIMITS,
  U_SOLID_ANGLE_MAP,
} from "../../lib/starfieldShaderMath";

// 1 parsec expressed in the scene's unit system (matches the legacy
// tycho2 path; keeps the relative scale of the sky consistent between
// presets). `a_size` = Gaia-Sky pseudo-size (parsecs) × DISTANCE_SCALE
// × STAR_SIZE_FACTOR, which puts `size / dist` directly in the Gaia
// Sky `u_solidAngleMap` range for typical HYG stars at typical
// distances (verified Sirius ≈ 3e-8 rad clamp ceiling; mag-5 G-dwarf
// at 20 pc ≈ 1.1e-9 rad in the opacity-lint band).
const DISTANCE_SCALE = 206_265_000.0;

// Convert 1 milliarcsecond to radians. Used to turn the stored pmra/pmdec
// (integer mas/yr) into the tangential proper motion component.
const MAS_TO_RAD = 4.848136811e-9;

// Milliseconds per Julian year (365.25 days). J2000 epoch in UT ms is
// `Date.parse("2000-01-01T12:00:00Z")`.
const J2000_EPOCH_MS = Date.parse("2000-01-01T12:00:00Z");
const MS_PER_JULIAN_YEAR = 365.25 * 86400 * 1000;

// Gaia Sky `star.group.quad.vertex.glsl` port (θ.1b). The vertex:
//   1. Applies proper motion via `yearsSinceJ2000`.
//   2. Computes `solidAngle = a_size / dist` (radians).
//   3. Maps solidAngle → opacity through `lint_smoothstep` using
//      `u_solidAngleMap` and `u_opacityLimits` (source-authoritative
//      endpoints: faint-small stars saturate to opacityLimits.x, close-
//      large stars to opacityLimits.y).
//   4. Wraps pow(solidAngle, brightnessPower) in `degrees12/radians12`
//      to preserve fp32 precision on values in the 1e-10 band.
//   5. Smoothstep-fades stars inside `LEN0` (θ.7 hero-star billboard
//      takeover zone) and nulls the quad when alpha collapses.
//   6. Converts the world-space quad size to `gl_PointSize` via
//      `projectionMatrix[1][1] × u_viewportHeight / 2` (pixels per
//      radian at unit distance).
const vertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define TO_DEG12 (180.0e12 / PI)
  #define TO_RAD12 (PI / 180.0e12)

  attribute vec3 velocity;
  attribute float ci;
  attribute float a_size;

  uniform float yearsSinceJ2000;

  // Gaia Sky vertex uniforms (verified host defaults from
  // StarSetQuadComponent.java:46 + Constants.java:110-112).
  uniform vec2 u_solidAngleMap;      // vec2(1e-10, 2e-9)
  uniform vec2 u_opacityLimits;      // vec2(opacity[0], opacity[1])
  uniform float u_brightnessPower;   // 1.0, range [0.9, 1.1]
  uniform float u_minQuadSolidAngle; // 1e-10
  // Upper clamp is a literal 3.0e-8 in Gaia Sky's source
  // (star.group.quad.vertex.glsl:105). Inlining below matches source.

  // User-facing "Star Size" multiplier + global alpha scale.
  // Maps to Gaia Sky's u_alphaSizeBr.y / .x. Default 1.0.
  uniform float u_sizeFactor;
  uniform float u_alphaFactor;

  // Viewport height in pixels (× renderer DPR). Used with
  // projectionMatrix[1][1] to convert solidAngle → pixels.
  uniform float u_viewportHeight;

  // Boundary fade control (θ.7 hero-star approach takes over inside LEN0).
  uniform float u_LEN0;

  // R1 #1B (Wave α): HDR-linear multiplier baked into vColor so bright
  // catalogue stars cross the selective-bloom threshold (1.0 in
  // luminanceThreshold). Tier defaults via qualityProfile.vfxHdrGain.
  uniform float vfxHdrGain;

  varying vec3 vColor;
  varying float vBrightness;

  vec3 bvToRGB(float bv) {
    float t = clamp((bv + 0.4) / (2.0 + 0.4), 0.0, 1.0);
    if (t < 0.25) {
      float r = 0.6 + t * 1.6;
      float g = 0.6 + t * 1.6;
      return vec3(r, g, 1.0);
    } else if (t < 0.5) {
      return vec3(1.0, 1.0 - (t - 0.25) * 0.8, 1.0 - (t - 0.25) * 1.6);
    } else {
      return vec3(1.0, 0.8 - (t - 0.5) * 1.2, 0.2 - (t - 0.5) * 0.4);
    }
  }

  // Gaia Sky lib/math.glsl lint() — SMOOTHSTEP-based, NOT linear.
  float lint_ss(float x, float x0, float x1, float y0, float y1) {
    if (x <= x0) return y0;
    if (x >= x1) return y1;
    return y0 + (y1 - y0) * smoothstep(x0, x1, x);
  }

  // Gaia Sky lib/angles.glsl precision wrappers around pow().
  float degrees12(float rad) { return rad * TO_DEG12; }
  float radians12(float deg) { return deg * TO_RAD12; }

  void main() {
    // Proper motion displacement (same as pre-θ.1b).
    vec3 animatedPos = position + velocity * yearsSinceJ2000;
    vec4 viewPosition = modelViewMatrix * vec4(animatedPos, 1.0);
    gl_Position = projectionMatrix * viewPosition;

    float dist = length(viewPosition.xyz);

    // 1. Raw solid angle (radians).
    float solidAngle = a_size / max(dist, 1e-20);

    // 2. Opacity via smoothstep lint (Gaia Sky lib/math.glsl lint).
    float opacity = lint_ss(solidAngle,
                            u_solidAngleMap.x, u_solidAngleMap.y,
                            u_opacityLimits.x, u_opacityLimits.y);

    // 3. Brightness-power boost wrapped in degrees12/radians12 for
    //    fp32 precision (verified Round 5 of θ-audit).
    solidAngle = clamp(
      radians12(pow(degrees12(solidAngle), u_brightnessPower)),
      u_minQuadSolidAngle,
      3.0e-8
    );

    // 4. Boundary fade (near-camera) — θ.7 hero-star billboard takes
    //    over inside u_LEN0.
    float boundaryFade = smoothstep(u_LEN0, u_LEN0 * 1000.0, dist);
    float alpha = clamp(opacity * u_alphaFactor * boundaryFade, 0.0, 1.0);

    // 5. Quad nulling for invisible / near stars (source perf trick
    //    from star.group.quad.vertex.glsl:121).
    if (alpha <= 1e-3 || dist < u_LEN0) {
      alpha = 0.0;
      solidAngle = 0.0;
    }

    // 6. World-space → screen-space size conversion.
    // pixelsPerRadian at unit projection = projectionMatrix[1][1] ×
    // viewportHeight / 2. At a given distance, a billboard of world
    // size quadSize = solidAngle × dist × sizeFactor subtends
    // solidAngle × sizeFactor radians from the camera, and
    // solidAngle × sizeFactor × pixelsPerRadian pixels on screen.
    float pixelsPerRadian = projectionMatrix[1][1] * u_viewportHeight * 0.5;
    gl_PointSize = solidAngle * u_sizeFactor * pixelsPerRadian;

    // vBrightness feeds the fragment's alpha multiplication.
    vBrightness = alpha;
    // vColor carries B-V tint × HDR lift (so bright stars cross the
    // Bloom luminanceThreshold = 1.0 pass — Wave α contract).
    vColor = bvToRGB(ci) * vfxHdrGain;
  }
`;

// Gaia Sky `star.group.quad.fragment.glsl` kernel port (θ.1 — unchanged
// from the 2026-04-20 ship). See `src/lib/starfieldShaderMath.ts` for
// the executable mirror (`starfieldCoreKernel`) and the commit message
// of `2662f08` / `13e501e` for the full derivation.
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

// Baked radial-gaussian halo texture (θ.1). Process-wide cached.
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
 * Convert HYG's pmra / pmdec (int16 mas/yr) into a 3D velocity in
 * parsecs/year aligned with the catalog's own J2000 equatorial frame.
 * The shader displaces by `velocity × yearsSinceJ2000`.
 *
 *   east  = (−sinα, cosα, 0)
 *   north = (−sinδ·cosα, −sinδ·sinα, cosδ)
 *   v = (pmRA · east + pmDec · north) · mas_to_rad · dist
 *
 * HYG's `pmra` convention already includes cos(δ), so no extra
 * multiplication.
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
    if (dist <= 0) continue;

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

/**
 * Per-star `a_size` attribute feeding Gaia Sky's
 * `solidAngle = a_size / dist` vertex math.
 *
 * **Not a physical radius** — see `src/lib/starPhysics.ts` module
 * docstring for the full story. In short: Gaia Sky's own
 * `AstroUtils.absoluteMagnitudeToPseudoSize` JavaDoc says pseudo-size
 * "has no physical meaning and has no relation to the actual physical
 * size of the star". It's a rendering-only scalar derived from
 * absolute magnitude:
 *   pseudoL = 10^(-0.4 · absMag)
 *   size    = sqrt(pseudoL) · 0.15  (parsecs, pre-render)
 *
 * Replaces the previous Stefan-Boltzmann port (2026-04-20) that pulled
 * real `R/R_sun` values and produced Betelgeuse ≈ 350 R_sun sprites —
 * bigger than the Sun on screen and visually wrong per Gaia Sky.
 * Opus audit (2026-04-21) cross-referenced the source and confirmed
 * the pseudo-size path is the source-authoritative one.
 *
 * The `STAR_SIZE_FACTOR = 1.31526e-6` multiplier mirrors Gaia Sky's
 * `StarSetInstancedRenderer.java:143` write:
 *   `a_size = particle.size() × Constants.STAR_SIZE_FACTOR × sizeFactor`
 * Where `sizeFactor` is the app-level tuning (we leave it as 1.0,
 * folded into `u_sizeFactor` on the shader side).
 */
function buildSizeAttribute(catalog: HygCatalogData): Float32Array {
  const { positions, magnitudes } = catalog;
  const count = catalog.header.count;
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const px = positions[i * 3 + 0];
    const py = positions[i * 3 + 1];
    const pz = positions[i * 3 + 2];
    const distPc = Math.sqrt(px * px + py * py + pz * pz);
    const pseudoSizePc = pseudoSizeFromApparentMag(magnitudes[i], distPc);
    sizes[i] = pseudoSizePc * DISTANCE_SCALE * STAR_SIZE_FACTOR;
  }
  return sizes;
}

export const Starfield = () => {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const pointsRef = useRef<THREE.Points>(null);

  // Viewport + DPR read once per frame inside useFrame below. The
  // pre-θ.1b `useStarfieldParticleSize` helper baked `sqrt(max(w,h) *
  // DPR) / 60` which was a NASA-Eyes-specific viewport scalar; θ.1b's
  // solid-angle math needs the raw viewport height in pixels instead
  // (the shader computes pixels-per-radian from projection ×
  // viewportHeight).
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        yearsSinceJ2000: { value: 0.0 },
        // Gaia Sky vertex uniforms (source-authoritative defaults).
        u_solidAngleMap: {
          value: new THREE.Vector2(U_SOLID_ANGLE_MAP[0], U_SOLID_ANGLE_MAP[1]),
        },
        u_opacityLimits: {
          value: new THREE.Vector2(U_OPACITY_LIMITS[0], U_OPACITY_LIMITS[1]),
        },
        u_brightnessPower: { value: U_BRIGHTNESS_POWER_DEFAULT },
        u_minQuadSolidAngle: { value: U_MIN_QUAD_SOLID_ANGLE },
        u_LEN0: { value: LEN0 },
        // `u_sizeFactor` is the atlas equivalent of Gaia Sky's
        // `u_alphaSizeBr.y = starPointSize × 1e6 × pointScale`
        // (`StarSetQuadComponent.java:96`). Exact default derivation:
        //   config.yaml `pointSize = 3.0`
        //   → `updateStarPointSize(ps)`: `starPointSize = ps × 0.4 = 1.2`
        //   → `updateSizeAggregate()`: `alphaSizeBr[1] = 1.2 × 1e6 × 1.0 = 1.2e6`
        // The 2026-04-20 validation fix set this to `1e6` (close but
        // off by 20 %); Opus audit (2026-04-21) flagged the miss and
        // it's corrected here. With pseudo-size (not physical radius)
        // driving `a_size`, `1.2e6` puts bright hot dwarfs like Sirius
        // at the ~3e-8 clamp ceiling and lets the full HYG magnitude
        // distribution render at visible pixel counts.
        u_sizeFactor: { value: 1.2e6 },
        u_alphaFactor: { value: 1.0 },
        // Seeded below each frame.
        u_viewportHeight: { value: 1.0 },
        // Wave α HDR lift (kept: bright stars still need `vColor >
        // 1` to trip the Bloom threshold in the composer).
        vfxHdrGain: { value: 1.0 },
        // θ.1 fragment halo texture — process-wide cached.
        u_starTex: { value: getStarSpriteTexture() },
      },
      transparent: true,
      depthWrite: false,
      // True premultiplied additive: matches Gaia Sky's
      // `BlendMode.ADDITIVE = GL_ONE, GL_ONE`. Fragment pre-multiplies
      // rgb by alpha so blend factors stay One/One (θ.1 follow-up
      // `13e501e`).
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
  }, []);

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

    const { positions, colorIndices } = catalog;
    const count = catalog.header.count;

    const scaledPositions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) {
      scaledPositions[i] = positions[i] * DISTANCE_SCALE;
    }

    const velocities = buildVelocityAttribute(catalog);
    for (let i = 0; i < velocities.length; i++) {
      velocities[i] *= DISTANCE_SCALE;
    }

    // `a_size` carries the Gaia-Sky-style pseudo-size (scene units ×
    // STAR_SIZE_FACTOR). The NASA-Eyes-era `mag` attribute was retired
    // in the Codex θ.1b follow-up — the solid-angle path reads
    // `a_size + ci + position` only.
    const sizeArray = buildSizeAttribute(catalog);

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(scaledPositions, 3)
    );
    geom.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute("ci", new THREE.BufferAttribute(colorIndices, 1));
    geom.setAttribute("a_size", new THREE.BufferAttribute(sizeArray, 1));

    return geom;
  }, [catalog]);

  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    const matUniforms = material.uniforms;

    const years =
      (simulationClock.getNow().getTime() - J2000_EPOCH_MS) /
      MS_PER_JULIAN_YEAR;
    matUniforms.yearsSinceJ2000.value = years;

    // Viewport height × effective DPR. `gl.getPixelRatio()` returns the
    // renderer's clamped DPR (honors `qualityProfile.dprMax`), so this
    // is the right value for pixels-per-radian. Extracted to
    // `computeViewportHeightScalar` so the host-side DPR feed is
    // unit-testable (Codex θ.1b review finding #4).
    const vHeight = computeViewportHeightScalar(
      size.height,
      gl.getPixelRatio()
    );
    matUniforms.u_viewportHeight.value = vHeight;

    // Resolution-adaptive `u_minQuadSolidAngle` — mirrors
    // `StarSetQuadComponent.java:68` (validation finding 2026-04-20).
    // Floors faint stars at ~2-3 px regardless of backbuffer size;
    // keeps blue A-type dwarfs visible instead of fading to sub-pixel.
    matUniforms.u_minQuadSolidAngle.value = computeMinQuadSolidAngle(vHeight);

    // Tier-keyed HDR gain (Wave α R1 #1B). L15 literal: routed through
    // the memoised uniforms map.
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
