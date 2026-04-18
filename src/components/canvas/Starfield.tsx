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
  // styleMix: 0 = photometric (Pogson-accurate), 1 = cinematic (compresses
  // the faint tail, enlarges sprites, sharpens the fragment falloff so dim
  // stars stop flickering on camera motion at the cost of strict photometric
  // ordering). Interpolated linearly so intermediate values stay valid.
  uniform float styleMix;

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

    // Pogson-style size: flux ratio relative to the naked-eye limit
    // (mag 6.5). Each 5 magnitudes brighter = 100× flux = ~2.5× apparent
    // area on screen. Square-root the flux so rendered glow *area*, not
    // diameter, scales with brightness — this matches how stars visibly
    // pile up around the bright end of the sky.
    //
    // A bare Pogson curve with a 1.5 px / 0.08 α floor is fotometrically
    // honest but visually conservative: stars at mag ≥ 7 collapse onto
    // the floor as sparse sub-pixel-ish dots, and the naked-eye-to-
    // binocular band (the mass of balanced/high tiers) loses presence.
    // Adding a *hard* floor (e.g. 2.5 px / 0.20 α globally) fixes that
    // by flattening magnitude ordering across most of the catalogue,
    // which is worse — mag 12 survey stars end up at the same size as
    // mag 7 binocular stars, and the full tier turns into a haze.
    //
    // Instead we add a graduated smoothstep "lift" concentrated on the
    // naked-eye→binocular window (≈ mag 6→9 in shader space), fading
    // back to zero by mag ~12 so the telescopic tail of the full tier
    // stays ghostly. Bright stars (mag < 6) are untouched;
    // faint-mid stars get up to +1 px / +0.12 α; very faint stars go
    // back to the raw floor. This preserves ordering end-to-end while
    // adding real presence where the eye expects it.
    // Cinematic magnitude compression: pull the faint tail toward the
    // naked-eye anchor. Monotonic by construction — bright end (mag < 6)
    // passes through unchanged; each unit of mag above 6 shrinks by the
    // factor mix(1.0, 0.4, styleMix), so mag 20 lands at shader-mag 11.6
    // under full cinematic. Ordering is preserved, but the Pogson curve
    // now sees a tighter range and gives meaningful flux to stars the
    // eye would otherwise lose.
    float compressedMag = mag < 6.0
      ? mag
      : 6.0 + (mag - 6.0) * mix(1.0, 0.4, styleMix);

    // Pogson-style size on the (possibly compressed) magnitude. Bright
    // stars (mag < 6) are invariant under styleMix for the flux
    // calculation; compression is gated off in that range.
    float fluxRatio = pow(10.0, (6.5 - compressedMag) * 0.4);
    float sqrtFlux = sqrt(fluxRatio);

    // Graduated smoothstep lift: adds presence to the naked-eye→binocular
    // window without flattening the rest of the catalogue. The lift MUST
    // be driven by the raw (uncompressed) mag, not the compressed value —
    // otherwise cinematic's compression shifts the window so that deep
    // telescopic stars (raw mag ~12) land at the lift's peak while
    // binocular stars (raw mag ~7.5) only see the ramp. That inverts
    // magnitude ordering in the vBrightness output, which is exactly the
    // "haze of faint stars brighter than mid-faint stars" bug that the
    // perceptual design is supposed to avoid.
    float faintLift = smoothstep(6.0, 7.5, mag) *
                      (1.0 - smoothstep(9.5, 12.0, mag));

    // Sprite enlargement in cinematic mode. Applied globally to every
    // star, not only the faint tail: even bright stars jitter slightly
    // at small screen sizes during slow pans, and a larger sprite kills
    // that. Honestly: this does lift bright-star screen energy by
    // roughly 25–35% in additive blend, even after the sharper fragment
    // falloff compensates part of the enlargement. That is an
    // intentional perceptual gain — "cinematic" is a visible feature,
    // not a photometric-invariant re-skin. Photometric mode
    // (styleMix = 0) keeps the original sprite exactly.
    float sizeBoost = mix(1.0, 1.8, styleMix);

    float baseSize = clamp(sqrtFlux * 2.5 + faintLift * 1.0, 1.5, 60.0);
    gl_PointSize = baseSize * sizeBoost * particleSize * pixelRatio;

    // Base alpha rides the Pogson curve with a small lift in the faint
    // window. Cinematic mode adds a tiny flat floor bump (≈ +0.03 α) so
    // the dimmest stars are visible during slow pans; the bright-end
    // alpha rises by the same 0.03 (intentional, see sizeBoost note).
    vBrightness = clamp(
      sqrtFlux * 0.08 + faintLift * 0.12 + styleMix * 0.03,
      0.08,
      1.0
    );
    vColor = bvToRGB(ci);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float styleMix;

  varying vec3 vColor;
  varying float vBrightness;

  void main() {
    // Soft glow: radial falloff inside the point sprite. In cinematic
    // mode the falloff exponent rises from 5 → 9, sharpening the core
    // so the enlarged sprite still reads as a point of light rather
    // than a diffuse disc. Combined with the vertex-stage sizeBoost
    // this gives a "crisp core + halo" look without a second draw pass.
    float d = clamp(1.0 - 2.0 * length(gl_PointCoord - vec2(0.5)), 0.0, 1.0);
    float falloffPow = mix(5.0, 9.0, styleMix);
    float alpha = pow(d, falloffPow);
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
  const starfieldStyle = useStore((state) => state.starfieldStyle);
  const qualityProfile = useQualityProfile(qualityMode);
  const tier = hygTierForQuality(qualityProfile.name);

  const { gl, size } = useThree();
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const pointsRef = useRef<THREE.Points>(null);

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

  useFrame(() => {
    if (!materialRef.current) return;

    // Viewport-adaptive sizing (same curve as NASA renderer) so a window
    // resize does not change the visual density of the sky.
    const viewportScale =
      Math.sqrt(Math.max(size.width, size.height) * window.devicePixelRatio) /
      60;
    materialRef.current.uniforms.particleSize.value = viewportScale;

    // yearsSinceJ2000 is the simulation-time offset in Julian years. The
    // value is typically −100..+100 for normal exploration; the shader
    // uses it as a scalar multiplier of each star's proper-motion vector.
    const years = (datetime.getTime() - J2000_EPOCH_MS) / MS_PER_JULIAN_YEAR;
    materialRef.current.uniforms.yearsSinceJ2000.value = years;

    // styleMix is driven by the user's Photometric/Cinematic choice in
    // Settings. Assigning here (not just at mount) means flipping the
    // toggle updates the rendered sky instantly without re-creating the
    // material.
    materialRef.current.uniforms.styleMix.value =
      starfieldStyle === "cinematic" ? 1 : 0;
  });

  if (!geometry) return null;

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      rotation={[(23.4 * Math.PI) / 180, 0, 0]}
      raycast={() => null}
      renderOrder={-2}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={{
          pixelRatio: { value: gl.getPixelRatio() },
          particleSize: { value: 1.0 },
          yearsSinceJ2000: { value: 0.0 },
          styleMix: { value: starfieldStyle === "cinematic" ? 1 : 0 },
        }}
        transparent={true}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
