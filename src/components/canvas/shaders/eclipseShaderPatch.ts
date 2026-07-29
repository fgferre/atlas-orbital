import {
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_LUNAR_REFRACTION_TINT,
  ECLIPSE_LUNAR_UMBRA_FLOOR,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
} from "./eclipseMath";

/**
 * W7 eclipse shader patches for `usePlanetMaterials`. Ports the shape of
 * Gaia Sky's `/tmp/gaiasky/assets/shader/lib/eclipses.glsl` +
 * `dist_segment_point` (`math.glsl`), but the shadow-cone math itself is
 * no longer Gaia's fixed `UMBRA0`/`PENUMBRA0` ratios — see
 * `../../../lib/eclipseGeometry.ts` for the real similar-triangles
 * construction this patch now consumes.
 *
 * ## What changed from the pre-W7 version, and why
 *
 * The needle this patch injects at (`#include <opaque_fragment>`) was
 * silently dead on three r181 for some time before this wave — see
 * `usePlanetMaterials.ts`'s needle-fix commit for the full story. Because
 * of that, W7 could rewrite the algorithm itself rather than being bound
 * to preserve an already-inert shape:
 *
 *  - `uEclipsingBodyRadius` is replaced by two uniforms,
 *    `u_eclipsingUmbraRadius` / `u_eclipsingPenumbraRadius` — the real
 *    (render-space, similarity-transformed) cone radii the CPU driver
 *    computes every frame via `eclipseGeometry.ts`, not a fixed multiple
 *    of the eclipser's own radius. `u_eclipsingMinShadow` is a third new
 *    uniform: the annular floor (`1 − (θ_eclipser/θ_sun)²`), needed
 *    because a physically-correct cone can go NEGATIVE (antumbral /
 *    annular — the eclipser's angular size is smaller than the Sun's, so
 *    a ring of direct sunlight always survives even at perfect
 *    alignment). Net new uniform NAMES: +2, matching the "+2 eclipse-cone
 *    uniforms" standing law 2 sanctions for this wave. All three follow
 *    the `u_` naming/audit/cache-key convention the lighting wave
 *    established (66ab30f) — the OLDER `uEclipsingBodyPos` /
 *    `uEclipsingVrScale` / `uEclipsingActive` / `uSunPositionWorld` names
 *    are untouched (not new, renaming them is not this wave's job).
 *  - The pre-W7 diffraction "band" (a fixed 0.2–1.6×-eclipser-radius
 *    pulse with a warm-orange gradient) had no physical grounding for a
 *    SOLAR receiver — third-round arbitration: "seen from space,
 *    penumbral shading is neutral" — and is deleted. What replaces it is
 *    a single continuous `mix(coreFloor, 1.0, dist/penumbraRadius)` ramp,
 *    where `coreFloor` is baked PER MATERIAL (not a uniform — the
 *    eclipser a given material can ever face never changes at runtime) to
 *    either `0.0` (airless eclipser: true black at the umbra centre) or
 *    `ECLIPSE_LUNAR_UMBRA_FLOOR` + `ECLIPSE_LUNAR_REFRACTION_TINT`
 *    (eclipser has an atmosphere: the Danjon refraction floor/tint) —
 *    see {@link buildEclipseFragmentHelpers}. Earth's material (eclipser
 *    = Moon, airless) always bakes the neutral floor; the Moon's material
 *    (eclipser = Earth, has `atmosphereScattering`) always bakes the
 *    Danjon one. A future eclipser with an atmosphere (e.g. a Titan
 *    system body) gets the tint for free from the same rule.
 *
 * The patches assume the receiving material ALREADY declares (in
 * vertex and fragment):
 *   - `varying vec3 vWorldPos;`
 *   - `varying vec3 vWorldNormal;`
 * with the vertex shader writing world-space position + normal into
 * them. Earth's existing day/night branch already does this (see
 * `usePlanetMaterials.ts`); the eclipse-only branch replicates the
 * pattern via `ECLIPSE_VERTEX_WORLD_VARYINGS_DECL` +
 * `ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN`.
 *
 * A shared `uniform vec3 uSunPositionWorld;` is also assumed — Earth
 * already has it (sun at origin). Both branches share the convention.
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
 *
 * `u_eclipsingUmbraRadius` / `u_eclipsingPenumbraRadius` /
 * `u_eclipsingMinShadow` are render-space (world units), already
 * similarity-transformed by the CPU driver — see `Planet.tsx` and
 * `eclipseGeometry.ts`'s `scaleEclipseRadiiToRenderUnits`.
 */
export const ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY = /* glsl */ `
  uniform vec3 uEclipsingBodyPos;
  uniform float u_eclipsingUmbraRadius;
  uniform float u_eclipsingPenumbraRadius;
  uniform float u_eclipsingMinShadow;
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
 * Fragment-shader helper functions: `gs_distSegmentPoint`,
 * `gs_computeEclipseShading`, `gs_eclipseBlend` — named with `gs_`
 * prefixes to avoid collisions with Three.js's own shader chunk includes.
 *
 * `lunarRefraction` bakes the umbral floor/tint literal for THIS
 * material's eclipser (see this file's header) — it is a compile-time
 * choice, not a uniform, because a given material's eclipser identity
 * never changes at runtime (a body's `eclipsingBodyId` is a `useMemo` dep
 * in `usePlanetMaterials.ts`, so the material rebuilds if it ever did).
 */
export const buildEclipseFragmentHelpers = ({
  lunarRefraction,
}: {
  lunarRefraction: boolean;
}): string => {
  const coreFloorLiteral = lunarRefraction
    ? ECLIPSE_LUNAR_UMBRA_FLOOR.toString()
    : "0.0";
  const tintLiteral = lunarRefraction
    ? `vec3(${ECLIPSE_LUNAR_REFRACTION_TINT[0]}, ${ECLIPSE_LUNAR_REFRACTION_TINT[1]}, ${ECLIPSE_LUNAR_REFRACTION_TINT[2]})`
    : "vec3(0.0)";

  return /* glsl */ `
  // math.glsl port: dist_segment_point. Still needed per-fragment — this
  // is the perpendicular distance from THIS surface point's ray toward
  // the Sun to the eclipser's centre, which no body-level predicate can
  // precompute.
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

  // W7 rewrite — real cone radii from the CPU (u_eclipsingUmbraRadius /
  // u_eclipsingPenumbraRadius / u_eclipsingMinShadow), not fixed ratios
  // of the eclipser's own radius. One continuous ramp from coreFloor
  // (baked below) at dist=0 to fully lit at the penumbra edge — replaces
  // the pre-W7 two-stage "hard floor inside UMBRA0, separate diffraction
  // pulse in a mid-band" shape. See this file's header for why.
  void gs_computeEclipseShading(
    vec3 fragPosWorld,
    vec3 normalVector,
    vec3 lightDirection,
    vec3 eclipsingBodyPos,
    float umbraRadius,
    float penumbraRadius,
    float minShadow,
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

    if (dot_NM > ${ECLIPSE_NEAR_SIDE_DOT_THRESHOLD} && penumbraRadius > 0.0) {
      // Negative umbraRadius = antumbral (annular) — the true umbra
      // never reaches this receiver at this instant, so the core floor
      // is the annular brightness rather than true black or the Danjon
      // refraction floor (that floor is a lunar-eclipse-only physical
      // effect and never applies to an annular solar eclipse).
      float coreFloor = umbraRadius < 0.0 ? minShadow : ${coreFloorLiteral};
      float t = clamp(dist / penumbraRadius, 0.0, 1.0);
      shdw = mix(coreFloor, 1.0, t);
      shdw = mix(1.0, shdw, edgeFade);
      diffractionTint = ${tintLiteral} * (1.0 - t) * edgeFade;
    }
  }

  // Matches Gaia's eclipseBlend (WeightedMix): shadow=1 leaves base
  // untouched; shadow=0 returns pure tint.
  vec3 gs_eclipseBlend(vec3 base, vec3 tint, float shadow) {
    return mix(base, tint, 1.0 - shadow);
  }
`;
};

/**
 * Fragment-shader code to inject BEFORE `#include <opaque_fragment>`
 * so the eclipse blend multiplies the pre-tonemap outgoingLight.
 *
 * Three.js's `<opaque_fragment>` chunk emits
 * `gl_FragColor = vec4( outgoingLight, diffuseColor.a );` — we
 * intercept by modifying `outgoingLight` before that runs. Matches
 * Gaia's post-lighting call site at `pbr.fragment.glsl:676`:
 * `fragColor.rgb = eclipseBlend(fragColor.rgb, diffractionTint, eclshdw);`.
 *
 * `#include <opaque_fragment>` is the r152+ name for the chunk atlas's
 * three@0.181.2 ships (`output_fragment` was the pre-r152 name, and is
 * the needle three renamed out from under this patch — see
 * `usePlanetMaterials.ts`'s needle-fix commit).
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
      u_eclipsingUmbraRadius,
      u_eclipsingPenumbraRadius,
      u_eclipsingMinShadow,
      uEclipsingVrScale,
      eclipseShadow,
      eclipseTint
    );
    outgoingLight = gs_eclipseBlend(outgoingLight, eclipseTint, eclipseShadow);
  }
`;
