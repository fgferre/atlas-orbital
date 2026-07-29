/**
 * HYG v4.2 starfield renderer (θ.2, 2026-07-28).
 *
 * Consumes the compact binary catalog produced by `scripts/build-hyg-binary.js`
 * (parsed into `HygCatalogData` by `src/utils/hygBinary.ts`) and renders it as a
 * single instanced billboard-quad mesh.
 *
 * The physics and the calibration live in `src/lib/starfieldShaderMath.ts`,
 * including why θ.2 replaced the Gaia-Sky solid-angle port. In short, three
 * things drive this file:
 *
 *   • **Photometry is Pogson, not a transfer curve.** Each instance carries a
 *     luminosity proxy `10^(-0.4·M)`; the vertex divides by the LIVE squared
 *     distance. Flying toward a star brightens it as the inverse square because
 *     that is the arithmetic, not because a curve was fitted to look right.
 *
 *   • **The PSF is integrated over the fragment, not sampled at its centre.**
 *     A separable Gaussian integrates to a product of two `erf` differences, so
 *     the splat conserves energy exactly and its per-pixel value is a smooth
 *     function of the star's sub-pixel position. That is what removes the
 *     shimmer the baked 64×64 sprite had (measured 106 % peak swing across
 *     sub-pixel phases, plus a 0-to-white core spike on 1.8 % of them).
 *
 *   • **Magnitude is carried by SIZE.** The graded pipeline has a linear black
 *     point around 0.165 and therefore only ~2 magnitudes of usable grey range,
 *     so once the core clips to display white the surplus flux moves into a
 *     bounded `r⁻³` glare lobe whose visible radius is closed-form. Bright stars
 *     get visibly bigger; that is the hierarchy the previous renderer lacked,
 *     where 97.5 % of stars sat on the same 3.75 px quad floor.
 *
 * Colour reaches the GPU in LINEAR sRGB primaries and the fragment applies
 * exactly one OETF through `#include <colorspace_fragment>` — identity when
 * drawing into the composer's linear target, the sRGB transfer when the
 * constrained tier's `DirectRenderPass` renders straight to the canvas. Before
 * θ.2 the attribute was display-referred and the composer encoded it a second
 * time, so the same star was a different colour on different tiers.
 *
 * Star positions are equatorial J2000 parsecs. The scene is the three.js Y-up
 * remap of ecliptic J2000, so position and proper-motion velocity are both
 * converted once at build time via `lib/starfield/hygFrame.ts`. The mesh itself
 * carries no rotation — see that module for why the previous bare `R_x(23.4°)`
 * mesh tilt left the sky 136.8° off the scene frame.
 */

import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import { yearsSinceJ2000 } from "../../lib/simulationClock";
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
import {
  hygProperMotionEquatorial,
  transformHygEquatorialTripletsInPlace,
} from "../../lib/starfield/hygFrame";
import {
  parseHygFocusId,
  resolveHygWorldPosition,
} from "../../lib/focus/hygFocusResolver";
import { cameraRelativeVector3 } from "../../lib/math/cameraRelative";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { useEffectiveGraphics } from "../../hooks/useEffectiveGraphics";
import { useStarfieldCatalog } from "./useStarfieldCatalog";
import { apparentToAbsMag } from "../../lib/starPhysics";
import { HYG_CI_OFFSET, HYG_CI_STEP } from "../../utils/hygBinary";
import {
  ATLAS_SCENE_UNITS_PER_PC,
  buildBvLinearRgbLut,
  CORE_TRUNCATION_NORMALISATION,
  LEN0,
  luminosityProxyFromAbsMag,
  STAR_DISPLAY_BLACK_POINT,
  STAR_GLARE_CORE_PX,
  STAR_GLARE_FRACTION,
  STAR_OPTICS_PARAMS,
  STAR_PSF_QUAD_SIGMAS,
  STAR_PSF_SIGMA_PX,
  STAR_QUAD_CUTOFF_FRACTION,
  STAR_QUAD_EDGE_WINDOW,
  maxFluxScreenForViewport,
  starExposure,
} from "../../lib/starfieldShaderMath";

/** 1 parsec in scene units. Shared with `starfieldShaderMath`. */
const DISTANCE_SCALE = ATLAS_SCENE_UNITS_PER_PC;

const vertexShader = /* glsl */ `
  #define PI 3.14159265359

  attribute vec3 starPosition;
  attribute vec3 velocity;
  // Luminosity proxy 10^(-0.4 * absoluteMagnitude). Distance is applied
  // live below, so this attribute is epoch- and camera-invariant.
  attribute float a_lum;
  // LINEAR sRGB primaries, max channel normalised to 1. Brightness is
  // never carried here — only chromaticity.
  attribute vec3 starColor;

  // M3 — per-instance cross-fade ramp. HygStellarMesh writes the ramp
  // for the focused star each frame; the sprite's flux is multiplied by
  // (1 - a_fadeAlpha) so it fades OUT in lockstep with the procedural
  // mesh's uVisibility ramping 0->1. Invariant: sprite + mesh ~= 1
  // throughout, no over-render.
  attribute float a_fadeAlpha;
  // Focus IDENTITY, separate from the ramp value. Set to 1 the moment
  // the user picks a star — BEFORE the mesh gate fires — so the LEN0
  // kill is bypassed across the whole focus lifetime. Gating the bypass
  // on a_fadeAlpha instead leaves the LEN0 -> mesh-ENTER band (~17x in
  // distance) with neither sprite nor mesh drawn.
  attribute float a_focusMask;

  uniform float yearsSinceJ2000;

  // The focused star's position RELATIVE TO THE CAMERA, subtracted on
  // the CPU in float64 (via cameraRelativeVector3) and uploaded small.
  //
  // starPosition is an absolute world coordinate; at 165 pc that is
  // ~3.4e10 wu, where one float32 step is 2048 wu. Feeding it through
  // modelViewMatrix * vec4(absolute, 1.0) cancels two ~3.4e10 numbers
  // in float32 to recover a ~10^3 wu view offset, so the sprite lands
  // thousands of wu from where the procedural mesh (which reaches the
  // GPU through a float64-composed, already-camera-relative matrix)
  // draws it. The form that works is neither of the two the earlier
  // analysis compared: subtract BEFORE anything is rounded.
  //
  // Only the focused star gets this. Everything else is a point at
  // parsec distance where a float32 step is angularly invisible.
  uniform vec3 u_focusedCamRel;

  uniform vec2 u_resolution;     // drawing buffer, PHYSICAL pixels
  uniform float u_scenePerPc;
  uniform float u_exposure;
  uniform float u_sigmaPx;
  uniform float u_coreQuadPx;    // STAR_PSF_QUAD_SIGMAS * sigma (floor)
  uniform float u_quadCutoff;    // fraction of the black point to cut at
  uniform float u_glareFraction;
  uniform float u_glareCorePx;
  uniform float u_blackPoint;
  uniform float u_maxFluxScreen;
  uniform float u_spikeCount;
  uniform float u_spikeGain;
  uniform float u_LEN0;

  varying vec3 vColor;
  varying vec2 vCenterPx;
  varying float vCoreFlux;
  varying float vHaloFlux;
  varying float vQuadHalfPx;

  void main() {
    vec3 animatedPos = starPosition + velocity * yearsSinceJ2000;

    bool isFocused = a_focusMask > 0.5;
    vec4 viewPosition = isFocused
      ? vec4(mat3(modelViewMatrix) * u_focusedCamRel, 1.0)
      : modelViewMatrix * vec4(animatedPos, 1.0);

    float dist = length(viewPosition.xyz);
    float distPc = max(dist / u_scenePerPc, 1.0e-6);

    // Pogson + inverse square: 10^(-0.4 m) = 10^(-0.4 M) * (10 pc / d)^2.
    float flux = a_lum * 100.0 / (distPc * distPc);

    // Near-camera handoff to the procedural mesh, and the M3 cross-fade.
    float boundaryFade = isFocused
      ? 1.0
      : smoothstep(u_LEN0, u_LEN0 * 1000.0, dist);
    float atten = boundaryFade * clamp(1.0 - a_fadeAlpha, 0.0, 1.0);

    // NEAR-FIELD CEILING. The inverse square is unbounded, and the
    // camera can fly to a star: at LEN0 the flux is ~2e8x its value at
    // 10 pc, which drove the glare radius (~flux^(1/3)) past the whole
    // viewport. The first θ.2 build did exactly that — the sprite
    // swelled until the screen went white, then popped as the mesh
    // cross-fade completed, revealing a small procedural star. The Gaia
    // port this replaced was implicitly bounded by its 3e-8 solid-angle
    // ceiling; dropping that clamp without replacing it was the bug.
    //
    // The ceiling is expressed where it is meaningful — as the largest
    // angular footprint a star may occupy — and inverted back into a
    // flux, so the sprite converges to a bounded size and hands over to
    // the procedural mesh without a jump. Physically this is a display
    // saturating, which is also what a real camera does.
    float fluxScreen = min(flux * u_exposure * atten, u_maxFluxScreen);
    float corePeak = fluxScreen / (2.0 * PI * u_sigmaPx * u_sigmaPx);

    // Glare carries everything the clipped core can no longer express.
    // The smoothstep gate opens exactly when the core reaches display
    // white, so faint stars pay nothing and there is no tuned cut.
    float haloFlux = fluxScreen * u_glareFraction
                   * smoothstep(1.0, 4.0, corePeak);

    // Closed-form radius at which the r^-3 lobe drops to the display
    // black point: solve haloFlux * r0 / (2*PI*(r^2+r0^2)^1.5) = black.
    float scaled = haloFlux * u_glareCorePx / (2.0 * PI * u_blackPoint);
    float rr = pow(max(scaled, 0.0), 2.0 / 3.0)
             - u_glareCorePx * u_glareCorePx;
    float haloRadius = rr > 0.0 ? sqrt(rr) : 0.0;

    // Spikes fall as r^-2 rather than the halo's r^-3, so they stay
    // visible three to four times further out. Solving their own
    // cutoff rather than scaling the halo's by a guessed factor is what
    // keeps them from being clipped square at the quad edge.
    if (u_spikeCount > 0.5) {
      float spikeScaled = haloFlux * u_spikeGain
                        / (2.0 * PI * u_blackPoint);
      haloRadius = max(haloRadius,
                       u_glareCorePx * sqrt(max(spikeScaled, 0.0)));
    }

    vec4 clip = projectionMatrix * viewPosition;

    // Cull behind-camera and sub-visible instances by collapsing the
    // quad off-screen — cheaper than letting the rasteriser find out,
    // and it is what keeps the faint tail of the catalog free.
    if (clip.w <= 0.0 || corePeak <= 1.0e-4
        || (!isFocused && dist < u_LEN0)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      vColor = vec3(0.0);
      vCenterPx = vec2(0.0);
      vCoreFlux = 0.0;
      vHaloFlux = 0.0;
      vQuadHalfPx = 0.0;
      return;
    }

    // Screen-space centre in physical pixels, taken BEFORE the quad is
    // expanded. The fragment differences gl_FragCoord against it to get
    // an exact per-pixel offset, which is what makes the integration
    // below independent of how the quad happens to be rasterised.
    vCenterPx = (clip.xy / clip.w * 0.5 + 0.5) * u_resolution;

    // The core needs a quad sized by BRIGHTNESS, not a fixed multiple of
    // sigma. A Gaussian truncated at 2.8 sigma still carries 2% of its
    // peak there, which for a bright star is far above display white --
    // that is a hard bright SQUARE at the quad edge, and it is exactly
    // what the first θ.2 build shipped. Solving
    // peak * exp(-r^2/2 sigma^2) = cutoff grows only as sqrt(log peak),
    // so even the brightest star in the sky needs about 5.3 sigma.
    float cutoff = u_blackPoint * u_quadCutoff;
    float coreRadius = u_coreQuadPx;
    if (corePeak > cutoff) {
      coreRadius = max(coreRadius,
                       u_sigmaPx * sqrt(2.0 * log(corePeak / cutoff)));
    }

    // Size the quad in PIXELS: position.xy is [-0.5, 0.5], so this spans
    // +/- quadHalf px, converted to NDC (2/resolution per pixel) and
    // back to clip space.
    float quadHalf = max(coreRadius, haloRadius);
    clip.xy += position.xy * (2.0 * quadHalf) * (2.0 / u_resolution) * clip.w;
    gl_Position = clip;

    vColor = starColor;
    vCoreFlux = fluxScreen - haloFlux;
    vHaloFlux = haloFlux;
    vQuadHalfPx = quadHalf;
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  #define PI 3.14159265359

  uniform float u_sigmaPx;
  uniform float u_coreNorm;
  uniform float u_glareCorePx;
  uniform float u_spikeCount;
  uniform float u_spikeSharpness;
  uniform float u_spikeGain;
  uniform float u_edgeWindow;

  varying vec3 vColor;
  varying vec2 vCenterPx;
  varying float vCoreFlux;
  varying float vHaloFlux;
  varying float vQuadHalfPx;

  // Abramowitz & Stegun 7.1.26 — one exp, no branching, |eps| < 1.5e-7.
  // Mirrored bit-for-bit by erfApprox() in starfieldShaderMath.ts.
  float erfApprox(float x) {
    float s = sign(x);
    float a = abs(x);
    float t = 1.0 / (1.0 + 0.3275911 * a);
    float y = 1.0 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t
                     - 0.284496736) * t + 0.254829592) * t) * exp(-a * a);
    return s * y;
  }

  void main() {
    if (vCoreFlux <= 0.0 && vHaloFlux <= 0.0) discard;

    // Offset of THIS fragment's centre from the star centre, in pixels.
    vec2 q = gl_FragCoord.xy - vCenterPx;

    // Exact area sampling of the PSF over this fragment. A separable
    // Gaussian integrates to a product of two erf differences, so the
    // splat conserves energy at any sigma and its value is C-infinity
    // in the star's sub-pixel position. Point-sampling a profile — what
    // the retired baked sprite did — makes the result depend on where
    // the pixel grid falls, which is the shimmer.
    float k = 0.70710678 / u_sigmaPx;
    float cx = 0.5 * (erfApprox((q.x + 0.5) * k) - erfApprox((q.x - 0.5) * k));
    float cy = 0.5 * (erfApprox((q.y + 0.5) * k) - erfApprox((q.y - 0.5) * k));
    float core = vCoreFlux * cx * cy * u_coreNorm;

    float halo = 0.0;
    if (vHaloFlux > 0.0) {
      float d = dot(q, q) + u_glareCorePx * u_glareCorePx;
      // Normalised r^-3 lobe: r0 / (2*PI*(r^2+r0^2)^1.5).
      float profile = u_glareCorePx / (2.0 * PI * d * sqrt(d));

      if (u_spikeCount > 0.5) {
        // |cos(n*phi/2)| has exactly n evenly spaced lobes, which is the
        // real relation between support-vane count and spike count. The
        // angle is screen-fixed, never per-star: spikes belong to the
        // instrument, and rotating them per star reads as fake instantly.
        float phi = atan(q.y, q.x);
        float lobe = pow(abs(cos(0.5 * u_spikeCount * phi)),
                         u_spikeSharpness);
        // Far-field diffraction falls as r^-2 along the spike, slower
        // than the halo, which is why real spikes reach well past the
        // glow.
        profile += u_spikeGain * lobe * u_glareCorePx * u_glareCorePx
                 / (2.0 * PI * d);
      }

      halo = vHaloFlux * profile;
    }

    // Sizing a quad to where a profile "becomes invisible" still leaves
    // a step of exactly that size at the boundary, and whether it reads
    // as a square depends on the tier's grade — not something to leave
    // to chance. One smoothstep that reaches zero AT the edge removes
    // the discontinuity outright, for every lobe and every tier. The
    // energy it takes sits in the outermost 15% of an already-generous
    // quad.
    float lum = (core + halo)
              * (1.0 - smoothstep(u_edgeWindow, 1.0,
                                  length(q) / max(vQuadHalfPx, 1e-4)));
    // Guard the HalfFloat target: fp16 saturates at 65504 and an Inf
    // here would rasterise as a black or white square rather than a star.
    gl_FragColor = vec4(min(vColor * lum, vec3(6.0e4)), clamp(lum, 0.0, 1.0));

    #include <colorspace_fragment>
  }
`;

/**
 * Pack the whole catalog's proper-motion velocities (parsec/year, catalog
 * equatorial J2000) into an instance attribute. The shader displaces by
 * `velocity × yearsSinceJ2000`.
 *
 * The per-star math lives in `hygProperMotionEquatorial` so the CPU
 * consumers of the same displacement — fly-to target, stellar mesh
 * placement — cannot drift away from what this buffer makes the GPU draw.
 *
 * Output stays in the catalog's equatorial frame; the caller runs it
 * through `transformHygEquatorialTripletsInPlace` alongside the
 * positions so both attributes reach the shader in the scene frame.
 */
function buildVelocityAttribute(catalog: HygCatalogData): Float32Array {
  const { positions, pmRA, pmDec } = catalog;
  const count = catalog.header.count;
  const velocities = new Float32Array(count * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    hygProperMotionEquatorial(positions, pmRA, pmDec, i, v);
    velocities[i * 3 + 0] = v.x;
    velocities[i * 3 + 1] = v.y;
    velocities[i * 3 + 2] = v.z;
  }

  return velocities;
}

/**
 * Per-star luminosity proxy `10^(-0.4·M)`.
 *
 * Prefers the catalog's own `absmag` column (v2+); falls back to the
 * distance modulus on the apparent magnitude when it is NaN, which is
 * the same relation HYG used to derive the column in the first place.
 * Distance is deliberately NOT applied here — the vertex applies the
 * live one, so approaching a star brightens it.
 */
function buildLuminosityAttribute(catalog: HygCatalogData): Float32Array {
  const { positions, magnitudes, absmag } = catalog;
  const count = catalog.header.count;
  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let absoluteMag = absmag[i];
    if (!Number.isFinite(absoluteMag)) {
      const px = positions[i * 3 + 0];
      const py = positions[i * 3 + 1];
      const pz = positions[i * 3 + 2];
      absoluteMag = apparentToAbsMag(
        magnitudes[i],
        Math.sqrt(px * px + py * py + pz * pz)
      );
    }
    out[i] = luminosityProxyFromAbsMag(absoluteMag);
  }
  return out;
}

/**
 * Linear star colour per instance, through a 256-entry lookup.
 *
 * B−V is quantised to a `uint8` on disk, so the whole colour pipeline
 * has 256 possible answers regardless of catalog size. Evaluating it
 * per star cost ~63 ms and ~328 000 short-lived arrays at the full tier
 * for no additional information.
 */
function buildColorAttribute(catalog: HygCatalogData): Float32Array {
  const { colorIndices } = catalog;
  const count = catalog.header.count;
  const lut = buildBvLinearRgbLut(HYG_CI_OFFSET, HYG_CI_STEP);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const q = Math.min(
      255,
      Math.max(0, Math.round((colorIndices[i] - HYG_CI_OFFSET) / HYG_CI_STEP))
    );
    colors[i * 3 + 0] = lut[q * 3 + 0];
    colors[i * 3 + 1] = lut[q * 3 + 1];
    colors[i * 3 + 2] = lut[q * 3 + 2];
  }
  return colors;
}

/** Scratch — the focused star's world position, refilled each frame. */
const TMP_FOCUSED_WORLD = new THREE.Vector3();
/** Scratch — drawing-buffer size, refilled each frame. */
const TMP_DRAWING_BUFFER = new THREE.Vector2();

export const Starfield = () => {
  const qualityMode = useStore((state) => state.qualityMode);
  const focusId = useStore((state) => state.focusId);
  const camera = useThree((state) => state.camera);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);
  const starOptics = useEffectiveGraphics().starOptics;

  const meshRef = useRef<THREE.Mesh>(null);
  const gl = useThree((state) => state.gl);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        yearsSinceJ2000: { value: 0.0 },
        u_focusedCamRel: { value: new THREE.Vector3() },
        u_resolution: { value: new THREE.Vector2(1, 1) },
        u_scenePerPc: { value: DISTANCE_SCALE },
        u_exposure: { value: starExposure() },
        u_sigmaPx: { value: STAR_PSF_SIGMA_PX },
        u_coreQuadPx: { value: STAR_PSF_QUAD_SIGMAS * STAR_PSF_SIGMA_PX },
        u_quadCutoff: { value: STAR_QUAD_CUTOFF_FRACTION },
        u_coreNorm: { value: CORE_TRUNCATION_NORMALISATION },
        u_edgeWindow: { value: STAR_QUAD_EDGE_WINDOW },
        u_glareFraction: { value: STAR_GLARE_FRACTION },
        u_glareCorePx: { value: STAR_GLARE_CORE_PX },
        u_blackPoint: { value: STAR_DISPLAY_BLACK_POINT },
        u_maxFluxScreen: { value: maxFluxScreenForViewport(1080) },
        u_LEN0: { value: LEN0 },
        u_spikeCount: { value: 0 },
        u_spikeSharpness: { value: 0 },
        u_spikeGain: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      // True premultiplied additive (GL_ONE, GL_ONE). The fragment emits
      // radiance already weighted by the PSF's pixel coverage, so there
      // is no separate alpha to pre-multiply by.
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

    // Positions AND proper-motion velocities are baked from the catalog's
    // equatorial J2000 frame into the scene frame here, once per catalog
    // load — a single O(N) pass with no per-star allocation. The mesh
    // therefore carries no rotation prop: what the buffer holds is already
    // world space, which is what `hygFocusResolver` / `StarHoverPicker`
    // resolve against. Velocities take the same linear map, or proper
    // motion would drift sideways relative to position.
    const scaledPositions = new Float32Array(count * 3);
    scaledPositions.set(positions.subarray(0, count * 3));
    transformHygEquatorialTripletsInPlace(scaledPositions, DISTANCE_SCALE);

    const velocities = buildVelocityAttribute(catalog);
    transformHygEquatorialTripletsInPlace(velocities, DISTANCE_SCALE);

    const lumArray = buildLuminosityAttribute(catalog);
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
    geom.setAttribute("a_lum", new THREE.InstancedBufferAttribute(lumArray, 1));
    // `a_fadeAlpha` zero-filled by default (every star renders normally).
    // `HygStellarMesh` retrieves it via
    // `scene.getObjectByName("atlas-starfield").geometry.getAttribute(...)`
    // and writes a per-frame [0..1] ramp for the focused star.
    geom.setAttribute(
      "a_fadeAlpha",
      new THREE.InstancedBufferAttribute(buildFadeAlphaAttribute(count), 1)
    );
    // `a_focusMask` zero-filled by default; HygStellarMesh writes 1 to the
    // focused slot on starIndex change so the LEN0 bypass is active for
    // the whole focus lifetime, not just during the ramp.
    geom.setAttribute(
      "a_focusMask",
      new THREE.InstancedBufferAttribute(buildFocusMaskAttribute(count), 1)
    );

    return geom;
  }, [catalog]);

  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    const matUniforms = material.uniforms;

    matUniforms.yearsSinceJ2000.value = yearsSinceJ2000();

    // The focused star's camera-relative position, resolved in float64 by
    // the SAME function `HygStellarMesh` and `CameraController` use, so
    // sprite, mesh and camera aim cannot disagree. One star per frame:
    // two allocation-free helper calls, no attribute re-upload.
    const focusedIndex = parseHygFocusId(focusId);
    if (
      focusedIndex !== null &&
      catalog &&
      resolveHygWorldPosition(focusedIndex, catalog, TMP_FOCUSED_WORLD)
    ) {
      cameraRelativeVector3(
        TMP_FOCUSED_WORLD,
        camera.position,
        matUniforms.u_focusedCamRel.value as THREE.Vector3
      );
    }

    // Physical pixels, because gl_FragCoord is in physical pixels and the
    // PSF's band limit belongs on the device grid, not the CSS grid.
    gl.getDrawingBufferSize(TMP_DRAWING_BUFFER);
    (matUniforms.u_resolution.value as THREE.Vector2).copy(TMP_DRAWING_BUFFER);
    matUniforms.u_maxFluxScreen.value = maxFluxScreenForViewport(
      Math.min(TMP_DRAWING_BUFFER.x, TMP_DRAWING_BUFFER.y)
    );

    // Optics profile is a user-visible honesty setting, not a look knob:
    // spikes are an instrument artefact and the default is the unaided
    // eye. Written here rather than in an effect so a material rebuild
    // cannot leave the uniforms describing an aperture the user is not
    // looking through.
    const optics = STAR_OPTICS_PARAMS[starOptics] ?? STAR_OPTICS_PARAMS.none;
    matUniforms.u_spikeCount.value = optics.spikeCount;
    matUniforms.u_spikeSharpness.value = optics.sharpness;
    matUniforms.u_spikeGain.value = optics.gain;
  });
  /* eslint-enable react-hooks/immutability */

  // Own the GPU lifecycle of the memoised geometry + material. These are
  // the heaviest objects in the scene (~109k-instance buffers); R3F only
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
      // Named so HygStellarMesh can find the geometry via
      // scene.getObjectByName and mutate `a_fadeAlpha` / `a_focusMask`
      // when a focused HYG star spawns its procedural mesh.
      name="atlas-starfield"
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => null}
      renderOrder={-2}
    />
  );
};
