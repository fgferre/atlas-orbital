import {
  ECLIPSE_DIFFRACTION_END_RATIO,
  ECLIPSE_DIFFRACTION_INTENSITY_SCALE,
  ECLIPSE_DIFFRACTION_SPECTRUM_HIGH,
  ECLIPSE_DIFFRACTION_SPECTRUM_LOW,
  ECLIPSE_DIFFRACTION_SPECTRUM_SCALE,
  ECLIPSE_DIFFRACTION_START_RATIO,
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
  ECLIPSE_PENUMBRA_RADIUS_RATIO,
  ECLIPSE_UMBRA_CORE_RADIUS_RATIO,
} from "./eclipseMath";

/**
 * T3.3 eclipse shader patches for `usePlanetMaterials`. Ports
 * `/tmp/gaiasky/assets/shader/lib/eclipses.glsl` + the
 * `dist_segment_point` helper from
 * `/tmp/gaiasky/assets/shader/lib/math.glsl` as GLSL template
 * strings the Earth and eclipse-only planet material branches can
 * compose into their `onBeforeCompile` shader patches.
 *
 * The patches assume the receiving material ALREADY declares (in
 * vertex and fragment):
 *   - `varying vec3 vWorldPos;`
 *   - `varying vec3 vWorldNormal;`
 * with the vertex shader writing world-space position + normal into
 * them. Earth's existing day/night branch already does this (see
 * `usePlanetMaterials.ts:301-317`); the eclipse-only branch must
 * replicate the pattern via `ECLIPSE_VERTEX_WORLD_VARYINGS_DECL` +
 * `ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN`.
 *
 * A shared `uniform vec3 uSunPositionWorld;` is also assumed — Earth
 * already has it (sun at origin, per the comment at
 * `usePlanetMaterials.ts:295`). Both branches share the convention.
 *
 * Eclipse-specific uniforms (declared via
 * `ECLIPSE_FRAGMENT_UNIFORMS`):
 *   - `uEclipsingBodyPos`      — world-space position of the
 *     eclipsing body (km), updated per-frame in `Planet.tsx`.
 *   - `uEclipsingBodyRadius`   — world-space radius (km).
 *   - `uEclipsingVrScale`      — ray length multiplier for
 *     `dist_segment_point`. Per-frame set to `distance(planet,
 *     sun) × 2.0` so the segment always reaches past the
 *     eclipsing body. Gaia uses a scene-scale `DISTANCE_SCALE_FACTOR`
 *     for this (`AbstractRenderSystem.java:169`) but the driver
 *     logic collapses to the same requirement: the segment length
 *     must exceed fragment-to-eclipsing-body distance.
 *   - `uEclipsingActive`       — enable flag (0 = skip eclipse
 *     math entirely, 1 = run it). Flipped to 0 by the driver when
 *     `scene.getObjectByName(eclipsingBodyId)` fails so atlas
 *     doesn't pay the shader cost on the frames between load
 *     events.
 */

/** Vertex-shader declarations for the world-space varyings the eclipse patch consumes. */
export const ECLIPSE_VERTEX_WORLD_VARYINGS_DECL = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
`;

/** Vertex-shader code that writes world-space position + normal; inject inside `main()` after `#include <begin_vertex>`. */
export const ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN = /* glsl */ `
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vWorldNormal = normalize(mat3(transpose(inverse(modelMatrix))) * normal);
`;

/**
 * Fragment-shader uniform + varying declarations — eclipse-specific
 * subset only. For branches that already declare
 * `uSunPositionWorld`, `vWorldPos`, `vWorldNormal` (e.g. Earth's
 * day/night branch).
 */
export const ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY = /* glsl */ `
  uniform vec3 uEclipsingBodyPos;
  uniform float uEclipsingBodyRadius;
  uniform float uEclipsingVrScale;
  uniform float uEclipsingActive;
`;

/**
 * Full eclipse fragment-shader declarations for branches that DON'T
 * otherwise need world-space lighting (e.g. Moon's eclipse-only
 * branch). Includes `uSunPositionWorld` and the world-space
 * varyings on top of the eclipse-specific uniforms.
 */
export const ECLIPSE_FRAGMENT_UNIFORMS = /* glsl */ `
  uniform vec3 uSunPositionWorld;
  ${ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY}
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
`;

/**
 * Fragment-shader helper functions: `dist_segment_point`,
 * `getDiffractionSpectrum`, `computeEclipseShading`, `eclipseBlend`
 * — all named with `gs_` prefixes to avoid collisions with
 * Three.js's own shader chunk includes.
 *
 * Literal constants interpolate directly from the JS-side
 * `eclipseMath.ts` exports so a drift in one file is a drift in
 * both — compile-time guarantee of math-JS ↔ GLSL parity.
 */
export const ECLIPSE_FRAGMENT_HELPERS = /* glsl */ `
  // math.glsl port: dist_segment_point.
  float gs_distSegmentPoint(vec3 v, vec3 w, vec3 p) {
    vec3 aux3 = p - v;
    vec3 aux4 = w - v;
    vec3 vw = v - w;
    float l2 = dot(vw, vw);
    if (l2 == 0.0) {
      return distance(p, v);
    }
    float t = dot(aux3, aux4) / l2;
    if (t < 0.0) {
      return distance(p, v);
    } else if (t > 1.0) {
      return distance(p, w);
    }
    vec3 projection = v + aux4 * t;
    return distance(p, projection);
  }

  // eclipses.glsl:23-29 getDiffractionSpectrum.
  vec3 gs_getDiffractionSpectrum(float pos) {
    return mix(
      vec3(${ECLIPSE_DIFFRACTION_SPECTRUM_LOW[0]}, ${ECLIPSE_DIFFRACTION_SPECTRUM_LOW[1]}, ${ECLIPSE_DIFFRACTION_SPECTRUM_LOW[2]}),
      vec3(${ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[0]}, ${ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[1]}, ${ECLIPSE_DIFFRACTION_SPECTRUM_HIGH[2]}),
      pos
    );
  }

  // eclipses.glsl:33-94 eclipseColor (shadow + tint outputs only;
  // atlas skips the #ifdef eclipseOutlines branch — that's a Gaia
  // wireframe debug mode).
  void gs_computeEclipseShading(
    vec3 fragPosWorld,
    vec3 normalVector,
    vec3 lightDirection,
    vec3 eclipsingBodyPos,
    float eclipsingBodyRadius,
    float vrScale,
    out float shdw,
    out vec3 diffractionTint
  ) {
    shdw = 1.0;
    diffractionTint = vec3(0.0);
    vec3 f = fragPosWorld;
    vec3 m = eclipsingBodyPos;
    vec3 l = lightDirection * vrScale;
    vec3 fl = f + l;
    float dist = gs_distSegmentPoint(f, fl, m);
    float dot_NM = dot(normalize(normalVector), normalize(m - f));
    float dot_NL = dot(normalize(normalVector), normalize(lightDirection));
    float edgeFade = smoothstep(${ECLIPSE_EDGE_FADE_LO}, ${ECLIPSE_EDGE_FADE_HI}, dot_NL);

    if (dot_NM > ${ECLIPSE_NEAR_SIDE_DOT_THRESHOLD}) {
      float penumbraRadius = eclipsingBodyRadius * ${ECLIPSE_PENUMBRA_RADIUS_RATIO};
      if (dist < penumbraRadius) {
        shdw = dist / penumbraRadius;

        float diffractionStart = eclipsingBodyRadius * ${ECLIPSE_DIFFRACTION_START_RATIO};
        float diffractionEnd = eclipsingBodyRadius * ${ECLIPSE_DIFFRACTION_END_RATIO};
        float diffractionRange = diffractionEnd - diffractionStart;

        if (dist > diffractionStart && dist < diffractionEnd) {
          float x = (dist - diffractionStart) / diffractionRange;
          float diffractionIntensity = 4.0 * x * (1.0 - x);
          diffractionIntensity *= ${ECLIPSE_DIFFRACTION_INTENSITY_SCALE};
          diffractionIntensity *= edgeFade;
          vec3 spectrumColor = gs_getDiffractionSpectrum(x) * ${ECLIPSE_DIFFRACTION_SPECTRUM_SCALE};
          diffractionTint = spectrumColor * diffractionIntensity;
        }

        shdw = mix(1.0, shdw, edgeFade);
        if (dist < eclipsingBodyRadius * ${ECLIPSE_UMBRA_CORE_RADIUS_RATIO}) {
          shdw = 0.0;
        }
      }
    }
  }

  // eclipses.glsl:102-104 eclipseBlendWeightedMix — the default
  // blend used by Gaia's eclipseBlend (line 118-120). shadow=1
  // leaves base untouched; shadow=0 returns pure tint.
  vec3 gs_eclipseBlend(vec3 base, vec3 tint, float shadow) {
    return mix(base, tint, 1.0 - shadow);
  }
`;

/**
 * Fragment-shader code to inject BEFORE `#include <output_fragment>`
 * so the eclipse blend multiplies the pre-tonemap outgoingLight.
 *
 * Three.js's `<output_fragment>` chunk emits
 * `gl_FragColor = vec4( outgoingLight, diffuseColor.a );` — we
 * intercept by modifying `outgoingLight` before that runs. Matches
 * Gaia's post-lighting call site at `pbr.fragment.glsl:676`:
 * `fragColor.rgb = eclipseBlend(fragColor.rgb, diffractionTint, eclshdw);`.
 */
export const ECLIPSE_FRAGMENT_OUTPUT_PATCH = /* glsl */ `
  if (uEclipsingActive > 0.5) {
    vec3 lightDir = normalize(uSunPositionWorld - vWorldPos);
    float eclipseShadow;
    vec3 eclipseTint;
    gs_computeEclipseShading(
      vWorldPos,
      vWorldNormal,
      lightDir,
      uEclipsingBodyPos,
      uEclipsingBodyRadius,
      uEclipsingVrScale,
      eclipseShadow,
      eclipseTint
    );
    outgoingLight = gs_eclipseBlend(outgoingLight, eclipseTint, eclipseShadow);
  }
`;
