/**
 * HYG v4.2 starfield renderer.
 *
 * Consumes the compact binary catalog produced by `scripts/build-hyg-binary.js`
 * (parsed into `HygCatalogData` by `src/utils/hygBinary.ts`) and renders it
 * as a single instanced billboard-quad mesh with a custom shader.
 *
 *   • Gaia Sky B-V colour path (Ballesteros → xyY → XYZ → gamma RGB
 *     plus default HSV saturation) derived per star instead of a
 *     single Sun-like default.
 *   • **θ.1b (2026-04-20, revised 2026-04-21):** Gaia-Sky-style
 *     solid-angle vertex math, replacing the NASA-Eyes log-compressed
 *     curve + hard floors. Per-star `a_size` is a Gaia-Sky-style
 *     **pseudo-size** derived from apparent-magnitude → absolute-
 *     magnitude → sqrt(pseudoL) × 0.15 pc (NOT a physical radius —
 *     see src/lib/starPhysics.ts for source-verified semantics).
 *     `solidAngle = a_size / dist` drives opacity (via `lint_smoothstep`)
 *     and world-space billboard size. Faint distant stars fade to
 *     invisibility like Gaia Sky does; there is no `[5, 50]` size floor
 *     or `0.05` alpha floor in this path.
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
 * Star positions are equatorial J2000 parsecs. The scene is the
 * three.js Y-up remap of ecliptic J2000, so both the position and the
 * velocity buffers are converted once at build time via
 * `lib/starfield/hygFrame.ts` (equatorial→ecliptic followed by
 * `ecliptic2ThreeJs`). The mesh itself carries no rotation — see that
 * module for why the previous bare `R_x(23.4°)` mesh tilt left the sky
 * 136.8° off the scene frame.
 */

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { simulationClock } from "../../lib/simulationClock";
import {
  buildFadeAlphaAttribute,
  buildFocusMaskAttribute,
} from "./starfieldFadeAlpha";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../lib/starfield";
import { transformHygEquatorialTripletsInPlace } from "../../lib/starfield/hygFrame";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { useStarfieldCatalog } from "./useStarfieldCatalog";
import {
  pseudoSizeFromApparentMag,
  STAR_SIZE_FACTOR,
} from "../../lib/starPhysics";
import {
  computeMinQuadSolidAngle,
  computeViewportHeightScalar,
  gaiaBvToRgb,
  LEN0,
  saturateStarRgb,
  U_BRIGHTNESS_POWER_DEFAULT,
  U_MIN_QUAD_SOLID_ANGLE,
  U_OPACITY_LIMITS,
  U_SOLID_ANGLE_MAP,
  U_STAR_BRIGHTNESS_DEFAULT,
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
//   6. Builds a screen-facing view-space billboard quad with world
//      size `solidAngle × dist × sizeFactor`, matching Gaia Sky's
//      instanced-quad path and avoiding driver `gl_PointSize` caps.
const vertexShader = /* glsl */ `
  #define PI 3.14159265359
  #define TO_DEG12 (180.0e12 / PI)
  #define TO_RAD12 (PI / 180.0e12)

  attribute vec3 starPosition;
  attribute vec3 velocity;
  attribute float a_size;
  attribute vec3 starColor;

  // M3 — per-instance cross-fade attribute. Replaces T6.0's binary
  // 'a_skipMask' (0/1 hard suppression) with a continuous [0..1]
  // ramp. HygStellarMesh writes the ramp value for the focused
  // star K each frame; sprite alpha is multiplied by
  // (1 - a_fadeAlpha) so the sprite fades OUT smoothly as the
  // mesh's uVisibility ramps 0->1 in lockstep
  // (feedback_no_effect_stacking.md still holds - invariant:
  // (focused-sprite alpha + mesh visibility) ~= 1 throughout
  // the cross-fade, no over-render).
  attribute float a_fadeAlpha;
  // T6.4 post-audit P1 follow-up - focus identity SEPARATE from
  // the cross-fade ramp. HygStellarMesh sets a_focusMask=1 on the
  // focused slot the moment the user picks a star (BEFORE the
  // ramp gate fires), and 0 on cleanup. The vertex shader uses
  // this to bypass the legacy LEN0 kill for the focused star
  // throughout its entire focus lifetime - not just during the
  // 0->1 ramp. Without this, the LEN0 kill (~134k wu) extinguishes
  // the sprite ~17x before mesh ENTER (~7.7k wu) for typical HYG
  // sizes, leaving a band where neither sprite nor mesh renders.
  attribute float a_focusMask;

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

  // Boundary fade control (θ.7 hero-star approach takes over inside LEN0).
  uniform float u_LEN0;

  // Gaia Sky u_alphaSizeBr.z star-brightness multiplier.
  uniform float u_starBrightness;

  varying vec3 vColor;
  varying float vBrightness;
  varying vec2 vUv;

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
    vec3 animatedPos = starPosition + velocity * yearsSinceJ2000;
    vec4 viewPosition = modelViewMatrix * vec4(animatedPos, 1.0);

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

    // 4. Boundary fade (near-camera). M3-fix (T6.4 post-audit) -
    //    the focused star is identified by 'a_focusMask > 0.5',
    //    NOT by 'a_fadeAlpha > 0'. The first round of this fix
    //    (commit a4eb7a5) gated the bypass on fadeAlpha, but
    //    HygStellarMesh only ramps fadeAlpha up after the mesh
    //    gate (sa > ENTER_RAD) crosses, which happens at much
    //    closer distance than LEN0. Result: during the band
    //    LEN0 -> ENTER_RAD, fadeAlpha stayed 0 and the bypass
    //    never fired. Separating focus identity (a_focusMask, set
    //    on starIndex change) from the ramp value (a_fadeAlpha,
    //    set per-frame by the mesh gate) closes the band: the
    //    sprite is alive at full opacity until the mesh starts
    //    fading it out via (1 - a_fadeAlpha).
    bool isFocused = a_focusMask > 0.5;
    float boundaryFade = isFocused
      ? 1.0
      : smoothstep(u_LEN0, u_LEN0 * 1000.0, dist);
    float alpha = clamp(opacity * u_alphaFactor * boundaryFade, 0.0, 1.0);

    // 5. Cross-fade with the procedural mesh (M3). When
    //    HygStellarMesh ramps a_fadeAlpha[K] from 0->1 for the
    //    focused star, the sprite's alpha attenuates smoothly to
    //    zero in lockstep with the mesh's uVisibility rising
    //    from 0->1. At fadeAlpha=0 the sprite renders normally;
    //    at fadeAlpha=1 it's fully suppressed.
    alpha *= clamp(1.0 - a_fadeAlpha, 0.0, 1.0);

    // 6. Quad nulling for invisible / near stars (source perf trick
    //    from star.group.quad.vertex.glsl:121). After the M3
    //    multiply above, the focused star's sprite naturally lands
    //    in the alpha <= 1e-3 branch when the cross-fade completes.
    //    The 'dist < u_LEN0' kill only applies to NON-focused stars
    //    so the focused-star ramp can finish smoothly.
    if (alpha <= 1e-3 || (!isFocused && dist < u_LEN0)) {
      alpha = 0.0;
      solidAngle = 0.0;
    }

    // 6. Gaia-style billboard quad. The base geometry position.xy
    // is [-0.5, 0.5], so quadSize is the full billboard width in
    // view/world units. Projected pixels are then determined by the
    // camera projection, without the WebGL GL_POINTS size cap.
    float quadSize = solidAngle * dist * u_sizeFactor;
    viewPosition.xy += position.xy * quadSize;
    gl_Position = projectionMatrix * viewPosition;

    // vBrightness feeds the fragment's alpha multiplication.
    vBrightness = alpha;
    // vColor mirrors Gaia Sky's a_color.rgb * u_alphaSizeBr.z.
    // B-V conversion + default saturation are done CPU-side like Gaia.
    vColor = starColor * u_starBrightness;
    vUv = uv;
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
  varying vec2 vUv;

  void main() {
    if (vBrightness <= 0.0) discard;

    vec2 uv = vUv;
    float profile = texture2D(u_starTex, uv).r;
    if (profile <= 0.0) discard;

    float r = length(uv - vec2(0.5)) * 2.0;
    float core = clamp(1.0 - smoothstep(0.0, 0.04, r), 0.0, 1.0);

    float alpha = vBrightness * profile;
    gl_FragColor = clamp(alpha * vec4(vColor + vec3(core * 2.0), 1.0), 0.0, 1.0);
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
 *
 * Output stays in the catalog's equatorial frame; the caller runs it
 * through `transformHygEquatorialTripletsInPlace` alongside the
 * positions so both attributes reach the shader in the scene frame.
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

function buildColorAttribute(catalog: HygCatalogData): Float32Array {
  const { colorIndices } = catalog;
  const count = catalog.header.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const rgb = saturateStarRgb(gaiaBvToRgb(colorIndices[i]));
    colors[i * 3 + 0] = rgb[0];
    colors[i * 3 + 1] = rgb[1];
    colors[i * 3 + 2] = rgb[2];
  }
  return colors;
}

export const Starfield = () => {
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const meshRef = useRef<THREE.Mesh>(null);

  // Viewport + DPR read once per frame inside useFrame below. The
  // pre-θ.1b `useStarfieldParticleSize` helper baked `sqrt(max(w,h) *
  // DPR) / 60` which was a NASA-Eyes-specific viewport scalar. θ.1b
  // no longer uses that for star sizing; we still read raw backbuffer
  // height to mirror Gaia Sky's resolution-adaptive `u_minQuadSolidAngle`.
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
        // Gaia Sky default `u_alphaSizeBr.z` star-brightness multiplier.
        u_starBrightness: { value: U_STAR_BRIGHTNESS_DEFAULT },
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

    const { positions } = catalog;
    const count = catalog.header.count;

    // Positions AND proper-motion velocities are baked from the
    // catalog's equatorial J2000 frame into the scene frame here, once
    // per catalog load — a single O(N) pass with no per-star
    // allocation. The mesh therefore carries no rotation prop: what the
    // buffer holds is already world space, which is what
    // `hygFocusResolver` / `StarHoverPicker` resolve against.
    // Velocities are transformed by the same linear map (the shader
    // adds `velocity × years` to `starPosition`, so both must live in
    // the same frame or proper motion drifts sideways).
    const scaledPositions = new Float32Array(count * 3);
    scaledPositions.set(positions.subarray(0, count * 3));
    transformHygEquatorialTripletsInPlace(scaledPositions, DISTANCE_SCALE);

    const velocities = buildVelocityAttribute(catalog);
    transformHygEquatorialTripletsInPlace(velocities, DISTANCE_SCALE);

    // `a_size` carries the Gaia-Sky-style pseudo-size (scene units ×
    // STAR_SIZE_FACTOR). The NASA-Eyes-era `mag` attribute was retired
    // in the Codex θ.1b follow-up — the solid-angle path reads
    // `a_size + starColor + position` only.
    const sizeArray = buildSizeAttribute(catalog);
    const colorArray = buildColorAttribute(catalog);

    const geom = new THREE.InstancedBufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array([
          -0.5, -0.5, 0.0, 0.5, -0.5, 0.0, -0.5, 0.5, 0.0, 0.5, 0.5, 0.0,
        ]),
        3
      )
    );
    geom.setAttribute(
      "uv",
      new THREE.BufferAttribute(
        new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0]),
        2
      )
    );
    geom.setIndex([0, 1, 2, 2, 1, 3]);
    geom.instanceCount = count;
    geom.setAttribute(
      "starPosition",
      new THREE.InstancedBufferAttribute(scaledPositions, 3)
    );
    geom.setAttribute(
      "velocity",
      new THREE.InstancedBufferAttribute(velocities, 3)
    );
    geom.setAttribute(
      "starColor",
      new THREE.InstancedBufferAttribute(colorArray, 3)
    );
    geom.setAttribute(
      "a_size",
      new THREE.InstancedBufferAttribute(sizeArray, 1)
    );
    // M3 — `a_fadeAlpha` zero-filled by default (every star
    // renders normally). `HygStellarMesh` retrieves the attribute
    // via `meshRef.current.geometry.getAttribute("a_fadeAlpha")`
    // and writes a per-frame ramp [0..1] for the focused star K,
    // cross-fading with the procedural mesh's `uVisibility`.
    geom.setAttribute(
      "a_fadeAlpha",
      new THREE.InstancedBufferAttribute(buildFadeAlphaAttribute(count), 1)
    );
    // T6.4 post-audit P1 follow-up — `a_focusMask` zero-filled by
    // default. HygStellarMesh writes `1` to the focused star's slot
    // on starIndex change (BEFORE the mesh ramp gate fires) so the
    // vertex-shader bypass for the LEN0 kill is active across the
    // entire focus lifetime, closing the LEN0→ENTER_RAD distance
    // band where the prior fadeAlpha-only bypass missed.
    geom.setAttribute(
      "a_focusMask",
      new THREE.InstancedBufferAttribute(buildFocusMaskAttribute(count), 1)
    );

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
    // Resolution-adaptive `u_minQuadSolidAngle` — mirrors
    // `StarSetQuadComponent.java:68` (validation finding 2026-04-20).
    // Floors faint stars at ~2-3 px regardless of backbuffer size;
    // keeps blue A-type dwarfs visible instead of fading to sub-pixel.
    matUniforms.u_minQuadSolidAngle.value = computeMinQuadSolidAngle(vHeight);
  });
  /* eslint-enable react-hooks/immutability */

  // Own the GPU lifecycle of the memoised geometry + material. These are
  // the heaviest objects in the scene (~109k-instance buffer); R3F only
  // auto-disposes objects it instantiates from JSX, NOT ones created in
  // useMemo and attached via prop (mirrors ProceduralSun3D / GridRecursive).
  //
  // Geometry rebuilds on quality-tier / catalog change — dispose the
  // PREVIOUS one when it changes and on unmount.
  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);
  // Material is memoised once (deps []), stable across geometry rebuilds.
  // Disposing it on a geometry change would free a material the freshly
  // re-mounted <mesh> still references, forcing a shader recompile —
  // dispose only on unmount.
  useEffect(() => {
    return () => {
      material?.dispose();
    };
  }, [material]);

  if (!geometry) return null;

  return (
    <mesh
      ref={meshRef}
      // T6.3-β: named so HygStellarMesh can find the geometry via
      // scene.getObjectByName and mutate `a_fadeAlpha` (M3 attribute,
      // continuous [0..1] cross-fade) when a focused HYG star
      // spawns its procedural mesh.
      name="atlas-starfield"
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={-2}
    />
  );
};
