import {
  ECLIPSE_EDGE_FADE_HI,
  ECLIPSE_EDGE_FADE_LO,
  ECLIPSE_LUNAR_REFRACTION_COLOR,
  ECLIPSE_LUNAR_REFRACTION_FLOOR,
  ECLIPSE_NEAR_SIDE_DOT_THRESHOLD,
} from "./eclipseMath";

/**
 * W7 eclipse shader patches for `usePlanetMaterials`.
 *
 * The shader receives a **similarity-transformed cone configuration** from
 * the driver in `Planet.tsx`: the synthetic eclipser position and the real
 * umbra/penumbra radii, all mapped into render world units anchored at the
 * receiver's centre by `resolveEclipseRenderConfig` in
 * `src/lib/eclipseGeometry.ts`. That transform preserves every angular
 * relationship per fragment, which is what lets this per-fragment
 * segment-distance machinery stay valid in BOTH scale modes — in realistic
 * mode the transform is the identity, so "realistic is scale-faithful"
 * holds by construction.
 *
 * All quantities are three.js **world units** (1 wu = AU / 1000), not km.
 *
 * The patches assume the receiving material ALREADY declares (in vertex and
 * fragment):
 *   - `varying vec3 vWorldPos;`
 *   - `varying vec3 vWorldNormal;`
 * with the vertex shader writing world-space position + normal into them.
 * Earth's day/night branch already does; the eclipse-only branch replicates
 * the pattern via `ECLIPSE_VERTEX_WORLD_VARYINGS_DECL` +
 * `ECLIPSE_VERTEX_WORLD_VARYINGS_ASSIGN`. A shared
 * `uniform vec3 uSunPositionWorld;` is also assumed.
 *
 * Eclipse uniforms (declared via `ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY`,
 * written per-frame by the driver):
 *   - `uEclipsingBodyPos`        — synthetic eclipser position (wu).
 *   - `uEclipsingSunPos`         — synthetic Sun position (wu): the ray's
 *     target, `receiverWorld − s·R`. The world origin exactly in realistic
 *     mode. Aiming the ray at the RENDER Sun instead is wrong in didactic
 *     mode — the synthetic eclipser lands near the render Sun's distance
 *     and the per-fragment offset collapses ~300×, dimming the whole disc
 *     instead of sweeping a spot (post-ship adversarial review finding,
 *     reproduced numerically).
 *   - `uEclipsingUmbraRadius`    — umbra radius at the receiver (wu, ≥ 0).
 *   - `uEclipsingPenumbraRadius` — penumbra radius at the receiver (wu).
 *   - `uEclipsingMinShadow`      — on-axis light floor: 0 for a total
 *     configuration, `1 − (θ_e/θ_s)²` in the antumbra so annular eclipses
 *     render annular. Derived by `resolveEclipseConeGeometry`, never tuned.
 *   - `uEclipsingVrScale`        — ray-segment length; the driver
 *     guarantees it reaches past the eclipser (2.5 × eclipser distance).
 *   - `uEclipsingActive`         — predicate flag, keyed off the cone
 *     geometry alone (Earth's shadow exists whether or not Earth's mesh is
 *     mounted).
 *
 * Standing law 2 note: net +3 uniforms over the pre-W7 patch, across four
 * declaration sites (three JS, one GLSL). The wave's exit criteria
 * sanctioned +2 (umbra + penumbra replacing one radius, plus the derived
 * annular floor); `uEclipsingSunPos` is the third, added when the
 * adversarial review proved the similarity transform needs all THREE
 * bodies mapped — no built-in can supply a synthetic Sun, so the uniform
 * is justified in writing here as that law requires.
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
 * Fragment-shader uniform declarations — eclipse-specific subset only. For
 * branches that already declare `uSunPositionWorld`, `vWorldPos`,
 * `vWorldNormal` (e.g. Earth's day/night branch).
 */
export const ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY = /* glsl */ `
  uniform vec3 uEclipsingBodyPos;
  uniform vec3 uEclipsingSunPos;
  uniform float uEclipsingUmbraRadius;
  uniform float uEclipsingPenumbraRadius;
  uniform float uEclipsingMinShadow;
  uniform float uEclipsingVrScale;
  uniform float uEclipsingActive;
`;

/**
 * Full eclipse fragment-shader declarations for branches that DON'T
 * otherwise need world-space lighting (the eclipse-only branch: the Moon
 * and the giant-planet moons). Includes `uSunPositionWorld` and the
 * world-space varyings on top of the eclipse-specific uniforms.
 */
export const ECLIPSE_FRAGMENT_UNIFORMS = /* glsl */ `
  uniform vec3 uSunPositionWorld;
  ${ECLIPSE_FRAGMENT_ECLIPSE_UNIFORMS_ONLY}
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
`;

/**
 * Fragment-shader helpers, `gs_`-prefixed to avoid collisions with
 * three.js's own chunk includes.
 *
 * `gs_distSegmentPoint` measures the perpendicular distance from the
 * eclipser to the fragment→sun ray segment; against the similarity-
 * transformed configuration that distance compares directly with the
 * umbra/penumbra radii. The shadow is then a linear ramp between them,
 * floored at `uEclipsingMinShadow`:
 *
 *   dist ≤ umbra                    → minShadow (0 = total, > 0 = annular)
 *   umbra < dist < penumbra         → linear ramp up to 1
 *   dist ≥ penumbra                 → 1 (unshadowed)
 *
 * The linear penumbra profile ignores solar limb darkening — sub-pixel at
 * every reachable zoom (disclosed in `eclipseGeometry.ts` with the other
 * omissions).
 */
export const ECLIPSE_FRAGMENT_HELPERS = /* glsl */ `
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

  // coneLightDirection aims at the SYNTHETIC Sun (uEclipsingSunPos) — the
  // third body of the similarity transform. renderLightDirection aims at
  // the render Sun and drives only the terminator fade, which is a
  // screen-side anti-artefact ramp and must track the terminator the
  // lighting actually draws. The two coincide in realistic mode.
  float gs_computeEclipseShadow(
    vec3 fragPosWorld,
    vec3 normalVector,
    vec3 coneLightDirection,
    vec3 renderLightDirection
  ) {
    vec3 fl = fragPosWorld + coneLightDirection * uEclipsingVrScale;
    float dist = gs_distSegmentPoint(fragPosWorld, fl, uEclipsingBodyPos);
    vec3 n = normalize(normalVector);
    float dot_NM = dot(n, normalize(uEclipsingBodyPos - fragPosWorld));
    if (dot_NM <= ${ECLIPSE_NEAR_SIDE_DOT_THRESHOLD}) {
      return 1.0;
    }
    float dot_NL = dot(n, renderLightDirection);
    float edgeFade = smoothstep(${ECLIPSE_EDGE_FADE_LO}, ${ECLIPSE_EDGE_FADE_HI}, dot_NL);
    float ramp = clamp(
      (dist - uEclipsingUmbraRadius) /
        max(uEclipsingPenumbraRadius - uEclipsingUmbraRadius, 1e-9),
      0.0,
      1.0
    );
    float shdw = mix(uEclipsingMinShadow, 1.0, ramp);
    return mix(1.0, shdw, edgeFade);
  }
`;

const outputPatchBody = (shadowMultiplier: string): string => /* glsl */ `
  if (uEclipsingActive > 0.5) {
    vec3 eclipseConeDir = normalize(uEclipsingSunPos - vWorldPos);
    vec3 eclipseRenderDir = normalize(uSunPositionWorld - vWorldPos);
    float eclipseShadow = gs_computeEclipseShadow(
      vWorldPos,
      vWorldNormal,
      eclipseConeDir,
      eclipseRenderDir
    );
    outgoingLight *= ${shadowMultiplier};
  }
`;

/**
 * Fragment code to inject BEFORE `#include <opaque_fragment>` so the
 * eclipse term multiplies the pre-tonemap `outgoingLight`.
 *
 * Neutral shading for solar receivers — seen from space, penumbral shading
 * is neutral; the Gaia-era orange diffraction band was an uncited artistic
 * inheritance and is deleted, not ported.
 */
export const ECLIPSE_FRAGMENT_OUTPUT_PATCH = outputPatchBody(
  "vec3(eclipseShadow)"
);

/**
 * Variant for receivers whose eclipser is Earth (the Moon): floors the
 * umbral multiplier at the refracted copper term, so totality renders a
 * Danjon L2–L3 blood moon instead of black. Constants and the honesty
 * disclosure live in `eclipseMath.ts`. Compile-time choice — the eclipser
 * is known when the material is built, so no uniform is spent on it.
 */
export const ECLIPSE_FRAGMENT_OUTPUT_PATCH_REFRACTION = outputPatchBody(
  `max(
      vec3(eclipseShadow),
      vec3(${ECLIPSE_LUNAR_REFRACTION_COLOR[0]}, ${ECLIPSE_LUNAR_REFRACTION_COLOR[1]}, ${ECLIPSE_LUNAR_REFRACTION_COLOR[2]}) *
        ${ECLIPSE_LUNAR_REFRACTION_FLOOR}
    )`
);
