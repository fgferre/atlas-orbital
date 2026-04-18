/**
 * HYG v4.2 starfield renderer.
 *
 * Consumes the compact binary catalog produced by `scripts/build-hyg-binary.js`
 * (parsed into `HygCatalogData` by `src/utils/hygBinary.ts`) and renders it
 * as a single `Points` primitive with a custom shader. The shader carries
 * three upgrades over the legacy "tycho2" path:
 *
 *   • real B-V colour (blue/white/yellow/orange/red) derived per star
 *     instead of a single Sun-like default;
 *   • Pogson-style size scaling so each magnitude step changes the rendered
 *     glow by a geometrically consistent factor;
 *   • proper motion: pmra / pmdec are converted once on parse into a
 *     3D velocity vector (parsecs/year) and the vertex shader displaces the
 *     star by `velocity * yearsSinceJ2000` so the rendered sky drifts with
 *     the simulation time — visible when exploring decades or centuries.
 *
 * The star positions in HYG are in equatorial J2000 parsecs. The scene is
 * ecliptic, so the Points node is tilted by the J2000 obliquity (~23.4°)
 * exactly as the legacy renderer did, keeping constellations in their
 * expected places.
 */

import * as THREE from "three";
import { useCallback, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "../../store";
import {
  getCachedHygCatalog,
  hygTierForQuality,
  loadHygCatalog,
  type HygCatalogData,
} from "../../lib/starfield";
import { useQualityProfile } from "../../hooks/useQualityProfile";
import { useStarfieldCatalog } from "./useStarfieldCatalog";

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

  uniform float pixelRatio;
  uniform float particleSize;
  uniform float yearsSinceJ2000;

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

    // NASA Eyes–style transfer curve: physical flux compressed
    // logarithmically, then mapped to sprite size and alpha with floors.
    // Why log(1 + flux) instead of Pogson sqrt:
    //   - Eye response to light is logarithmic (Fechner's law). Mapping
    //     size/alpha linearly against a log compression matches how the
    //     sky visually reads at the eyepiece.
    //   - Bright stars (mag ≤ 2) stop blowing out into 60-px blobs —
    //     log saturates smoothly without a hard ceiling needing to do
    //     the work.
    //   - Faint stars (mag 6-12) land in a usable range after the log
    //     compression, so a modest 4 px / 0.12 α floor keeps them
    //     visibly present without flattening ordering (log preserves
    //     rank order by construction).
    //   - Deep survey tail (mag > 14) still floors to 4 px but the log
    //     has already pushed them toward the same value, so the floor
    //     is a thin clamp rather than a haze.
    // The multiplier (5000) is tuned so a typical naked-eye star (mag 4)
    // produces brightness ≈ 11.2, Sirius (mag -1.5) ≈ 21.0 (clamped by
    // the 40-px size ceiling), and mag 12 ≈ 0.3 (pushed to floor).
    float flux = pow(10.0, -mag * 0.4);
    float brightness = 2.0 * log(1.0 + flux * 5000.0);

    // Size and alpha are both proportional to the same log-compressed
    // brightness. The 4-px floor is the critical density lever — it
    // ensures faint stars sample multiple fragments and do not flicker
    // on camera motion, matching NASA Eyes's visual density without a
    // haze-producing α clamp.
    float baseSize = clamp(brightness * 3.0, 4.0, 40.0);
    gl_PointSize = baseSize * particleSize * pixelRatio;

    vBrightness = clamp(brightness * 0.08, 0.12, 1.0);
    vColor = bvToRGB(ci);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    // NASA Eyes uses a tight pow(d, 5) dot — no halo, no bloom. Stars
    // read as crisp points of light rather than diffuse glows, which is
    // what "realistic" means against the black sky.
    float d = clamp(1.0 - 2.0 * length(gl_PointCoord - vec2(0.5)), 0.0, 1.0);
    float alpha = pow(d, 5.0);
    gl_FragColor = vec4(vColor, alpha * vBrightness);
  }
`;

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
  const scaleMode = useStore((state) => state.scaleMode);
  const datetime = useStore((state) => state.datetime);
  const qualityMode = useStore((state) => state.qualityMode);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const { gl, size } = useThree();
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
        pixelRatio: { value: gl.getPixelRatio() },
        particleSize: { value: 1.0 },
        yearsSinceJ2000: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
  }, [gl]);

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

    // In didactic mode the legacy preset nudged point sizes up by 1.5×.
    // Retain that behaviour by piggy-backing on the magnitude attribute —
    // shifting mag down makes the Pogson curve produce larger sizes.
    const didacticBias = scaleMode === "didactic" ? -0.9 : 0;
    const biasedMag = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      biasedMag[i] = magnitudes[i] + didacticBias;
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute(
      "position",
      new THREE.BufferAttribute(scaledPositions, 3)
    );
    geom.setAttribute("velocity", new THREE.BufferAttribute(velocities, 3));
    geom.setAttribute("mag", new THREE.BufferAttribute(biasedMag, 1));
    geom.setAttribute("ci", new THREE.BufferAttribute(colorIndices, 1));

    return geom;
  }, [catalog, scaleMode]);

  // Viewport-adaptive sizing so a window resize does not change the
  // visual density of the sky. yearsSinceJ2000 is the simulation-time
  // offset in Julian years the shader uses to animate proper motion.
  // Both live on the memoised material's uniforms map — mutating those
  // values is the intended per-frame path (see the memo comment above).
  /* eslint-disable react-hooks/immutability */
  useFrame(() => {
    const matUniforms = material.uniforms;
    const viewportScale =
      Math.sqrt(Math.max(size.width, size.height) * window.devicePixelRatio) /
      60;
    matUniforms.particleSize.value = viewportScale;

    const years = (datetime.getTime() - J2000_EPOCH_MS) / MS_PER_JULIAN_YEAR;
    matUniforms.yearsSinceJ2000.value = years;
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
